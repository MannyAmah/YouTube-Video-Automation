import { getRunChecked, runStateTransition } from '@yva/db';
import {
  ContentBriefSchema,
  MAX_SCRIPT_REVISIONS,
  MedicationEvidence,
  MedicationEvidenceSchema,
  reviewScript,
  Script,
  ScriptSchema,
  Storyboard,
  StoryboardSchema,
  StoryboardScene,
} from '@yva/shared';
import { getTextProvider } from '@yva/providers';
import { gatherEvidence } from '@yva/research';
import { readFile } from 'fs/promises';
import type { StepContext } from './context';
import {
  buildScriptPrompt,
  buildStoryboardPrompt,
  SCRIPT_SCHEMA_DESCRIPTION,
  STORYBOARD_SCHEMA_DESCRIPTION,
  VISUAL_STYLE,
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
  await ctx.prisma.script.create({
    data: { runId, version, content: script as object },
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

  const result = reviewScript(script, evidence);
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
  await getRunChecked(ctx.prisma, runId);
  const { script, version } = await loadLatestScript(ctx, runId);

  const provider = getTextProvider(ctx.env);
  const prompt = buildStoryboardPrompt(script);
  const { data: generated, usage } = await provider.generateStructured<Storyboard>({
    system: prompt.system,
    user: prompt.user,
    schema: StoryboardSchema,
    schemaDescription: STORYBOARD_SCHEMA_DESCRIPTION,
    maxOutputTokens: 10_000,
  });

  // Deterministic guarantees regardless of model behaviour: the hook opens,
  // the outro + spoken disclaimer close. These are appended in code so a
  // model omission can never drop the medical disclaimer.
  const scenes: StoryboardScene[] = [...generated.scenes];
  const hookCovered = scenes.some((s) => s.narration.includes(script.hook.slice(0, 40)));
  if (!hookCovered) {
    scenes.unshift({
      id: 'scene_hook',
      sectionId: 'hook',
      narration: script.hook,
      imagePrompt: `Opening scene: a curious, hopeful person holding a pill bottle with a big friendly question mark above. ${VISUAL_STYLE}`,
      caption: '',
    });
  }
  const outroCovered = scenes.some((s) => s.narration.includes(script.outro.slice(0, 40)));
  if (!outroCovered) {
    scenes.push({
      id: 'scene_outro',
      sectionId: 'outro',
      narration: script.outro,
      imagePrompt: `Closing scene: the same friendly character feeling confident and reassured, warm sunrise colors. ${VISUAL_STYLE}`,
      caption: '',
    });
  }
  scenes.push({
    id: 'scene_disclaimer',
    sectionId: 'disclaimer',
    narration: script.disclaimer,
    imagePrompt: `A kind nurse character and a doctor character side by side with a heart symbol between them, calm and trustworthy. ${VISUAL_STYLE}`,
    caption: 'Education only — talk to your doctor',
  });

  const storyboard = StoryboardSchema.parse({ ...generated, scenes });

  await ctx.prisma.storyboard.create({
    data: { runId, version, content: storyboard as object },
  });
  await ctx.store.saveJson(
    runId,
    'storyboard_json',
    `storyboard_v${version}.json`,
    storyboard,
    provider.name,
    { version, usage, sceneCount: storyboard.scenes.length },
  );

  await runStateTransition(ctx.prisma, runId, 'STORYBOARDING', 'GENERATING_ASSETS');
  await enqueueStep(ctx.queue, runId, 'assets', epoch);
}

export async function loadLatestStoryboard(ctx: StepContext, runId: string): Promise<Storyboard> {
  const row = await ctx.prisma.storyboard.findFirst({
    where: { runId },
    orderBy: { version: 'desc' },
  });
  if (!row) throw new Error(`Run ${runId} has no storyboard`);
  return StoryboardSchema.parse(row.content);
}
