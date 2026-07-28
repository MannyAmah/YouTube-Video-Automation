import { getRunChecked, runStateTransition } from '@yva/db';
import {
  AnimationPlan,
  AnimationPlanSchema,
  AnimationScene,
  chunkScript,
  ContentBriefSchema,
  MAX_SCRIPT_REVISIONS,
  MedicationEvidence,
  MedicationEvidenceSchema,
  reviewScript,
  Script,
  ScriptSchema,
  VisualChoices,
  VisualChoicesSchema,
} from '@yva/shared';
import { getTextProvider } from '@yva/providers';
import { gatherEvidence } from '@yva/research';
import { readFile } from 'fs/promises';
import type { StepContext } from './context';
import {
  buildScriptPrompt,
  buildVisualChoicesPrompt,
  bioFloorFor,
  REAL_BIOLOGY_PRIMITIVES,
  SCRIPT_SCHEMA_DESCRIPTION,
  VISUAL_CHOICES_SCHEMA_DESCRIPTION,
} from './prompts';
import { enqueueStep } from '../queues';

/* ------------------------------------------------------------------------- */
/* research                                                                  */
/* ------------------------------------------------------------------------- */

export async function stepResearch(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  const run = await getRunChecked(ctx.prisma, runId);
  const evidence = await gatherEvidence(run.brief.medicationQuery);
  await ctx.store.saveJson(runId, 'evidence_json', 'evidence.json', evidence, 'fda-nih-research', {
    sourceCount: evidence.sources.length,
    genericName: evidence.genericName,
  });
  await runStateTransition(ctx.prisma, runId, 'RESEARCHING', 'SCRIPTING');
  await enqueueStep(ctx.queue, runId, 'script', epoch);
}

export async function loadEvidence(ctx: StepContext, runId: string): Promise<MedicationEvidence> {
  const path = await ctx.store.requireArtifactPath(runId, 'evidence_json');
  return MedicationEvidenceSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

/* ------------------------------------------------------------------------- */
/* script                                                                    */
/* ------------------------------------------------------------------------- */

export async function stepScript(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  const run = await getRunChecked(ctx.prisma, runId);
  const evidence = await loadEvidence(ctx, runId);
  const brief = ContentBriefSchema.parse({
    medicationQuery: run.brief.medicationQuery,
    format: run.brief.format,
    angle: run.brief.angle,
    targetDurationSec: run.brief.targetDurationSec,
    audienceNote: run.brief.audienceNote,
  });

  // Feed prior review failures back into the prompt on revisions.
  const lastScript = await ctx.prisma.script.findFirst({
    where: { runId },
    orderBy: { version: 'desc' },
  });
  const priorFailures: string[] =
    lastScript?.review && typeof lastScript.review === 'object'
      ? ((lastScript.review as { failures?: string[] }).failures ?? [])
      : [];

  const provider = getTextProvider(ctx.env);
  const prompt = buildScriptPrompt(brief, evidence, priorFailures);
  const { data: script, usage } = await provider.generateStructured<Script>({
    system: prompt.system,
    user: prompt.user,
    schema: ScriptSchema,
    schemaDescription: SCRIPT_SCHEMA_DESCRIPTION,
    maxOutputTokens: 10_000,
  });

  const version = (lastScript?.version ?? 0) + 1;
  await ctx.prisma.script.upsert({
    where: { runId_version: { runId, version } },
    create: { runId, version, content: script as object },
    update: { content: script as object, review: undefined },
  });
  await ctx.store.saveJson(runId, 'script_json', `script_v${version}.json`, script, provider.name, {
    version,
    usage,
  });
  ctx.log.info({ runId, version, usage }, 'script generated');

  await runStateTransition(ctx.prisma, runId, 'SCRIPTING', 'SCRIPT_REVIEW');
  await enqueueStep(ctx.queue, runId, 'script_review', epoch);
}

export async function loadLatestScript(
  ctx: StepContext,
  runId: string,
): Promise<{ script: Script; version: number; id: string }> {
  const row = await ctx.prisma.script.findFirst({ where: { runId }, orderBy: { version: 'desc' } });
  if (!row) throw new Error(`Run ${runId} has no script`);
  return { script: ScriptSchema.parse(row.content), version: row.version, id: row.id };
}

/* ------------------------------------------------------------------------- */
/* script_review                                                             */
/* ------------------------------------------------------------------------- */

export async function stepScriptReview(
  ctx: StepContext,
  runId: string,
  epoch: number,
): Promise<void> {
  const run = await getRunChecked(ctx.prisma, runId);
  const evidence = await loadEvidence(ctx, runId);
  const { script, id: scriptId } = await loadLatestScript(ctx, runId);

  const result = reviewScript(script, evidence, run.brief.targetDurationSec);
  await ctx.prisma.script.update({ where: { id: scriptId }, data: { review: result as object } });

  if (!result.ok) {
    const revisions = run.scriptRevisions + 1;
    if (revisions >= MAX_SCRIPT_REVISIONS) {
      await runStateTransition(ctx.prisma, runId, 'SCRIPT_REVIEW', 'FAILED', {
        failureReason: `Script failed editorial policy after ${revisions} attempts:\n${result.failures.join('\n')}`,
        retryTargetState: 'SCRIPTING',
        scriptRevisions: revisions,
      });
      return;
    }
    ctx.log.warn({ runId, failures: result.failures }, 'script bounced back for revision');
    await runStateTransition(ctx.prisma, runId, 'SCRIPT_REVIEW', 'SCRIPTING', {
      scriptRevisions: revisions,
    });
    await enqueueStep(ctx.queue, runId, 'script', epoch + 1);
    return;
  }

  await ctx.prisma.approval.create({
    data: {
      runId,
      stage: 'script',
      decision: 'approved',
      actorType: 'policy',
      notes: `Automated editorial policy: ${script.sections.length} sections, all claims cited.`,
    },
  });

  if (run.channel.publishMode === 'supervised') {
    // Supervised channels wait here for a human decision via the API.
    ctx.log.info({ runId }, 'script passed policy; waiting for human review (supervised mode)');
    return;
  }
  await runStateTransition(ctx.prisma, runId, 'SCRIPT_REVIEW', 'STORYBOARDING');
  await enqueueStep(ctx.queue, runId, 'storyboard', epoch);
}

/* ------------------------------------------------------------------------- */
/* storyboard                                                                */
/* ------------------------------------------------------------------------- */

export async function stepStoryboard(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  const run = await getRunChecked(ctx.prisma, runId);
  const { script, version } = await loadLatestScript(ctx, runId);

  // 1. Deterministically split the script into scene-sized narration chunks.
  //    This GUARANTEES the video reproduces the full script word-for-word
  //    and that captions == spoken words == the scene (perfect alignment).
  const chunks = chunkScript(script);

  // 2. Ask the model ONLY to choose a visual primitive + params per chunk.
  //    Retry when too many scenes fall back to a generic concept_card — we
  //    want almost every scene to be a specific, illustrative primitive.
  const provider = getTextProvider(ctx.env);
  const prompt = buildVisualChoicesPrompt(chunks, script, run.brief.medicationQuery);
  const cardCap = Math.max(1, Math.floor(chunks.length * 0.12));
  const bioFloor = bioFloorFor(chunks.length);
  let choicesResult: VisualChoices | null = null;
  let usage = { inputTokens: 0, outputTokens: 0 };
  let user = prompt.user;
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await provider.generateStructured<VisualChoices>({
      system: prompt.system,
      user,
      schema: VisualChoicesSchema,
      schemaDescription: VISUAL_CHOICES_SCHEMA_DESCRIPTION,
      maxOutputTokens: 12_000,
    });
    usage = result.usage;
    // Keep the best attempt: maximize real-biology scenes, then minimize
    // generic concept_cards. (More real molecular simulation is the goal.)
    if (!choicesResult || scoreChoices(result.data) > scoreChoices(choicesResult)) {
      choicesResult = result.data;
    }
    // Count concept_card choices outside the final disclaimer scene.
    const cardIdx = result.data.choices
      .map((c, i) => (c.primitive === 'concept_card' ? i + 1 : 0))
      .filter((n) => n > 0 && n < chunks.length); // exclude disclaimer (last)
    const bioCount = bioCountOf(result.data);
    const cardsOk = cardIdx.length <= cardCap;
    const bioOk = bioCount >= bioFloor;
    if (cardsOk && bioOk) break;

    let escalation = `${prompt.user}\n\nRevise your choices. Keep the same ` +
      `narration order; change only which primitive each scene uses.`;
    if (!bioOk) {
      // Point the model at the exact scenes whose narration is mechanism/
      // biology and that are NOT yet a real-biology primitive — those are the
      // ones to convert, so it doesn't force biology onto how-to-take/intro.
      const eligible = chunks
        .map((c, i) => ({ n: i + 1, prim: result.data.choices[i]?.primitive, text: c.narration }))
        .filter((s) => !BIO_SET.has(s.prim ?? '') && isMechanismNarration(s.text))
        .map((s) => s.n);
      escalation +=
        `\n\nCRITICAL: only ${bioCount} of your choices were real-molecule ` +
        `biology primitives (cell_mechanism, molecular_binding, enzyme_reaction, ` +
        `signaling_cascade, side_effect_mechanism). This channel REQUIRES at ` +
        `least ${bioFloor}. ` +
        (eligible.length
          ? `These scenes describe the drug's biology but are NOT yet a ` +
            `real-biology primitive — convert enough of them to reach the ` +
            `minimum: scenes ${eligible.join(', ')}. `
          : `Re-examine every mechanism/side-effect scene. `) +
        `Give each the fitting real-biology primitive with the REAL target and ` +
        `molecule names from the narration (e.g. drugName, targetLabel, ` +
        `substrateName, productName, moleculeName). Simulate the mechanism ` +
        `across MULTIPLE scenes, not one.`;
    }
    if (!cardsOk) {
      escalation +=
        `\n\nYour choices used concept_card for scenes ${cardIdx.join(', ')}. ` +
        `Those are generic slop — replace EVERY one with a specific primitive ` +
        `that illustrates that scene's narration (a real-biology primitive if ` +
        `it is about the drug's biology, otherwise bloodstream_level, ` +
        `organ_action, gauge, two_panel_compare, journey, drug_interactions, ` +
        `how_to_take, or warning_vignette). ONLY the final disclaimer scene may ` +
        `be concept_card.`;
    }
    user = escalation;
  }
  if (!choicesResult) throw new Error('Visual choices generation produced nothing');

  // 3. Zip fixed narration with model visual choices. If the model returned
  //    the wrong count, pad/truncate defensively so we never crash.
  const choices = choicesResult.choices;
  const scenes: AnimationScene[] = chunks.map((chunk, i) => {
    const choice = choices[i] ?? choices[choices.length - 1];
    const isDisclaimer = chunk.sectionId === 'disclaimer';
    const isFirst = i === 0;
    const isLast = i === chunks.length - 1;
    let primitive = (choice?.primitive ?? 'concept_card') as AnimationScene['primitive'];
    let params = (choice?.params ?? {}) as Record<string, unknown>;
    // Deterministic anchors: title opens, outro closes, disclaimer is a card.
    if (isFirst && primitive !== 'title_card') {
      primitive = 'title_card';
      params = { title: script.title, subtitle: 'explained simply' };
    }
    if (isDisclaimer) {
      primitive = 'concept_card';
      params = {
        headline: 'This is education, not medical advice',
        sublines: ['Always talk to your doctor or pharmacist first'],
      };
    } else if (isLast && primitive === 'concept_card') {
      primitive = 'outro_card';
    }
    return {
      id: chunk.id,
      sectionId: chunk.sectionId,
      narration: chunk.narration,
      primitive,
      params,
      caption: choice?.caption ?? '',
    };
  });

  const plan = AnimationPlanSchema.parse({
    scenes,
    thumbnailPrompt: choicesResult.thumbnailPrompt,
    thumbnailTitleText: choicesResult.thumbnailTitleText,
  });

  const cardCount = scenes.filter((s) => s.primitive === 'concept_card').length;
  ctx.log.info(
    { runId, scenes: scenes.length, scriptWords: chunks.map((c) => c.narration).join(' ').split(/\s+/).length, concept_cards: cardCount },
    'animation plan built (full coverage guaranteed)',
  );

  await ctx.prisma.storyboard.upsert({
    where: { runId_version: { runId, version } },
    create: { runId, version, content: plan as object },
    update: { content: plan as object },
  });
  await ctx.store.saveJson(
    runId,
    'storyboard_json',
    `animation_plan_v${version}.json`,
    plan,
    provider.name,
    { version, usage, sceneCount: plan.scenes.length },
  );

  await runStateTransition(ctx.prisma, runId, 'STORYBOARDING', 'GENERATING_ASSETS');
  await enqueueStep(ctx.queue, runId, 'assets', epoch);
}

function cardCountOf(choices: VisualChoices): number {
  return choices.choices.filter((c) => c.primitive === 'concept_card').length;
}

const BIO_SET = new Set<string>(REAL_BIOLOGY_PRIMITIVES);
function bioCountOf(choices: VisualChoices): number {
  return choices.choices.filter((c) => BIO_SET.has(c.primitive)).length;
}

/**
 * Heuristic: does this narration chunk describe the drug's biology (mechanism,
 * binding, molecular action, or how/why a side effect develops)? Used only to
 * point the visual-director model at the right scenes to convert — never to
 * force a mismatched visual onto how-to-take/intro narration.
 */
const MECHANISM_RE =
  /\b(bind|binds|binding|receptor|enzyme|protein|molecul|mechanism|activat|inhibit|block|signal|cascade|pathway|cell|cellular|membrane|mitochondri|nucleus|transporter|channel|glucose|insulin|cholesterol|acid|hormone|neurotransmitter|dopamine|serotonin|reduces|lowers|raises|produce|convert|metaboli|works by|how it works|why it works|target|dna|gene)\b/i;
function isMechanismNarration(text: string): boolean {
  return MECHANISM_RE.test(text);
}

/**
 * Rank a visual-choices attempt: heavily reward real-biology scenes, then
 * penalize generic concept_cards. Higher is better.
 */
function scoreChoices(choices: VisualChoices): number {
  return bioCountOf(choices) * 10 - cardCountOf(choices);
}

export async function loadAnimationPlan(ctx: StepContext, runId: string): Promise<AnimationPlan> {
  const row = await ctx.prisma.storyboard.findFirst({
    where: { runId },
    orderBy: { version: 'desc' },
  });
  if (!row) throw new Error(`Run ${runId} has no animation plan`);
  return AnimationPlanSchema.parse(row.content);
}
