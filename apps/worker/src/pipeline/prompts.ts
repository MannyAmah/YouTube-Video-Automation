import type { ContentBrief, MedicationEvidence, Script } from '@yva/shared';
import { EVIDENCE_MARKER, SCRIPT_MARKER } from '@yva/providers';

/**
 * Prompt construction for the medication-education channel.
 *
 * Editorial identity: break down complex medication science to a level a
 * five-year-old could follow, visually, with warmth and zero condescension.
 * Factual discipline: every claim must trace to the FDA/NIH evidence bundle.
 */

export const CHANNEL_VOICE = `You write scripts for "MedExplained", a YouTube channel created by a nurse.
The channel explains medications to complete beginners — patients and
caregivers — at a level a five-year-old could follow, WITHOUT talking down
to anyone. Think: a kind, patient nurse explaining to a worried family member
using simple pictures and everyday metaphors (locks and keys, traffic lights,
sponges, thermostats, delivery trucks).

Voice rules:
- Warm, calm, empathetic. Never alarmist, never salesy, never robotic.
- Short sentences. Everyday words. If a medical term is unavoidable, say it,
  then immediately explain it with a metaphor ("...that's just a fancy word for...").
- Acknowledge feelings ("it can feel scary to read that list of side effects").
- Encourage medication adherence and talking to one's own doctor/pharmacist.
- NEVER give personal medical advice, dosages to follow, or tell viewers to
  start/stop/change medication.
- Never promise safety or results. No "completely safe", no "guaranteed".`;

export const SCRIPT_SCHEMA_DESCRIPTION = `Script JSON:
{
  "title": string (5-100 chars, curiosity-driven but honest, no clickbait lies),
  "description": string (YouTube description, 10-4500 chars),
  "tags": string[] (max 30),
  "hook": string (first 15 seconds of narration — why this matters to the viewer),
  "sections": [
    {
      "id": string (e.g. "sec_1"),
      "heading": string,
      "narration": string (the exact words spoken, conversational),
      "claims": [ { "text": string, "sourceIds": string[] } ],
      "visualIdea": string (one sentence describing the visual metaphor)
    }
  ] (at least 4 sections),
  "outro": string (closing narration),
  "disclaimer": string (must mention: education only, talk to your doctor and pharmacist),
  "estimatedDurationSec": integer
}`;

export function buildScriptPrompt(
  brief: ContentBrief,
  evidence: MedicationEvidence,
  priorFailures: string[],
): { system: string; user: string } {
  const system = `${CHANNEL_VOICE}

FACTUAL DISCIPLINE — this is non-negotiable:
- You are given an evidence bundle from FDA and NIH sources. It is the ONLY
  permitted source of facts. Do not use outside knowledge for any factual claim.
- Every factual statement in the narration (what the drug treats, how it
  works, side effects, interactions, manufacturers, statistics) must appear
  in "claims" with the sourceIds of the evidence entries that support it.
- Use ONLY source ids that exist in the evidence bundle.
- If the evidence does not support something, leave it out of the script.
- Do not invent numbers. Only use a statistic if it appears verbatim in an
  evidence excerpt, and cite it.`;

  const angleInstruction: Record<string, string> = {
    complete_guide:
      'Full guide covering: what it is and treats, the story of how this kind of medicine works in the body (mechanism, explained with a metaphor), how people typically take it, common and serious side effects, what it interacts with, and who makes it.',
    how_it_works: 'Deep, visual walk-through of the mechanism of action.',
    side_effects_explained: 'Honest, calming walk-through of side effects and what they mean.',
    how_to_take_safely: 'How this medication is typically taken and adherence tips.',
    interactions: 'What this medication does not mix well with, and why.',
    history_and_development: 'How this medication came to exist and reaches patients.',
  };

  const user = `Write the video script.

Medication: ${evidence.genericName}
Angle: ${brief.angle} — ${angleInstruction[brief.angle] ?? angleInstruction.complete_guide}
Target length: about ${Math.round(brief.targetDurationSec / 60)} minutes of narration (~${Math.round((brief.targetDurationSec / 60) * 140)} words).
Audience: ${brief.audienceNote}
${
  priorFailures.length > 0
    ? `\nYour previous draft failed editorial review. Fix ALL of these issues:\n${priorFailures.map((f) => `- ${f}`).join('\n')}\n`
    : ''
}
Evidence bundle (the only permitted source of facts — cite by source "id"):
<${EVIDENCE_MARKER}>
${JSON.stringify(evidence)}
</${EVIDENCE_MARKER}>`;

  return { system, user };
}

export const STORYBOARD_SCHEMA_DESCRIPTION = `Storyboard JSON:
{
  "scenes": [
    {
      "id": string (e.g. "scene_1"),
      "sectionId": string (the script section this scene belongs to),
      "narration": string (exact narration spoken during this scene — together the scenes must cover the section narrations word-for-word),
      "imagePrompt": string (a complete prompt for an image model, in the channel style),
      "caption": string (max 80 chars on-screen text, may be empty)
    }
  ] (at least 6 scenes),
  "styleGuide": string,
  "thumbnailPrompt": string,
  "thumbnailTitleText": string (max 40 chars)
}`;

export const VISUAL_STYLE = `Soft, friendly flat illustration. Warm pastel palette with one accent color.
Rounded shapes, simple characters with kind faces, generous negative space.
Medical concepts as everyday metaphors (locks & keys, gates, sponges,
traffic lights). Absolutely no text, letters, or numbers inside the image.
No gore, no scary imagery, no photorealistic organs.`;

export function buildStoryboardPrompt(script: Script): { system: string; user: string } {
  const system = `${CHANNEL_VOICE}

You are now the visual director. Split the script into scenes (one clear idea
per scene, roughly every 2-3 narration sentences). Scene narration must cover
the script's hook, every section narration, and outro word-for-word, in order
— do not rewrite, summarize, or skip narration text.

Image prompt style for every scene:
${VISUAL_STYLE}`;

  const user = `Create the storyboard for this script.

<${SCRIPT_MARKER}>
${JSON.stringify(script)}
</${SCRIPT_MARKER}>`;

  return { system, user };
}

/** YouTube description with a real citation ledger appended. */
export function buildVideoDescription(script: Script, evidence: MedicationEvidence): string {
  const uniqueUrls = new Map<string, string>();
  for (const source of evidence.sources) {
    if (!uniqueUrls.has(source.url)) uniqueUrls.set(source.url, source.title);
  }
  const citations = [...uniqueUrls.entries()]
    .slice(0, 10)
    .map(([url, title]) => `• ${title}: ${url}`)
    .join('\n');

  return `${script.description}

——— Sources (FDA / NIH) ———
${citations}

——— Important ———
${script.disclaimer}`.slice(0, 4900);
}
