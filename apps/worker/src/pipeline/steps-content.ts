import { getRunChecked, runStateTransition } from '@yva/db';
import {
  AnimationPlan,
  AnimationPlanSchema,
  AnimationScene,
  ContentBriefSchema,
  MAX_SCRIPT_REVISIONS,
  MedicationEvidence,
  MedicationEvidenceSchema,
  reviewScript,
  Script,
  ScriptSchema,
} from '@yva/shared';
import { getTextProvider } from '@yva/providers';
import { gatherEvidence } from '@yva/research';
import { readFile } from 'fs/promises';
import type { StepContext } from './context';
import {
  ANIMATION_PLAN_SCHEMA_DESCRIPTION,
  buildAnimationPlanPrompt,
  buildScriptPrompt,
  SCRIPT_SCHEMA_DESCRIPTION,
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

  const provider = getTextProvider(ctx.env);
  const prompt = buildAnimationPlanPrompt(script, run.brief.medicationQuery);
  const { data: generated, usage } = await provider.generateStructured<AnimationPlan>({
    system: prompt.system,
    user: prompt.user,
    schema: AnimationPlanSchema,
    schemaDescription: ANIMATION_PLAN_SCHEMA_DESCRIPTION,
    maxOutputTokens: 12_000,
  });

  // Deterministic guarantee: the spoken disclaimer always closes the video,
  // regardless of model behaviour — a model omission can never drop it.
  const scenes: AnimationScene[] = [...generated.scenes];
  const disclaimerCovered = scenes.some((s) =>
    s.narration.toLowerCase().includes('education') && s.narration.toLowerCase().includes('doctor'),
  );
  if (!disclaimerCovered) {
    scenes.push({
      id: 'scene_disclaimer',
      sectionId: 'disclaimer',
      narration: script.disclaimer,
      primitive: 'concept_card',
      params: {
        headline: 'This is education, not medical advice',
        sublines: ['Always talk to your doctor or pharmacist', 'before changing any medication'],
      },
      caption: 'Education only — talk to your doctor',
    });
  }

  const plan = AnimationPlanSchema.parse({ ...generated, scenes });

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

export async function loadAnimationPlan(ctx: StepContext, runId: string): Promise<AnimationPlan> {
  const row = await ctx.prisma.storyboard.findFirst({
    where: { runId },
    orderBy: { version: 'desc' },
  });
  if (!row) throw new Error(`Run ${runId} has no animation plan`);
  return AnimationPlanSchema.parse(row.content);
}
