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

  const validIds = evidence.sources.map((s) => s.id);
  const minWords = Math.round((brief.targetDurationSec / 60) * 150);
  const user = `Write the video script.

Medication: ${evidence.genericName}
Angle: ${brief.angle} — ${angleInstruction[brief.angle] ?? angleInstruction.complete_guide}

LENGTH — the single most common failure. The narration (hook + every section
narration + outro) MUST total AT LEAST ${minWords} words. Count as you write.
Produce 7-9 sections, each 110-170 narration words. For every fact: state it
simply, give a metaphor a five-year-old would picture, add one everyday
example, then say what it means for the viewer. Do not be terse.

CITATIONS — claim.sourceIds must be chosen ONLY from this exact list of ids
(copy them verbatim, including the "label_" prefix):
${validIds.map((id) => `  - ${id}`).join('\n')}
Any other id (e.g. "clinical_pharmacology" without the prefix) is rejected.

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

/* -------------------------------------------------------------------------
 * Animation plan — maps every script concept to an animated scene.
 * ----------------------------------------------------------------------- */

export const ANIMATION_PLAN_SCHEMA_DESCRIPTION = `AnimationPlan JSON:
{
  "scenes": [
    {
      "id": "scene_1",
      "sectionId": "<the script section id this scene belongs to, or 'hook'/'outro'>",
      "narration": "<exact narration spoken during this scene>",
      "primitive": "<one primitive name from the catalog>",
      "params": { ... primitive-specific fields ... },
      "caption": "<optional short on-screen caption, max 80 chars>"
    }
  ],
  "thumbnailPrompt": "<prompt for a bold, friendly thumbnail illustration>",
  "thumbnailTitleText": "<max 40 chars>"
}`;

export const ANIMATION_PRIMITIVE_CATALOG = `PRIMITIVE CATALOG — choose the ONE that best simulates each concept, and
fill its params. Every scene must actually SHOW the process, not just label it.

- title_card       params: {title, subtitle}
- bloodstream_level params: {title?, substanceLabel, level: "high"|"normal"|"low", color?}
      Shows a blood vessel filling with particles at that level.
- organ_action     params: {title?, organ: "liver"|"kidney"|"heart"|"stomach"|"gut"|"pancreas"|"lung"|"brain"|"muscle"|"thyroid", action: "releases"|"absorbs"|"filters", substanceLabel, note?}
      An organ emitting/absorbing a substance to/from the blood.
- molecule_intro   params: {name, caption?}
      The REAL drug molecule (rendered from its true structure) glides in.
      Use the medication's generic name as "name".
- receptor_binding params: {title?, drugLabel, receptorLabel, effect: "activates"|"blocks"}
      Drug docks into a receptor (lock & key) and switches it on/off.
- enzyme_inhibition params: {title?, drugLabel, enzymeLabel, substrateLabel, productLabel}
      Drug blocks an enzyme so the product stops being made.
- channel_transporter params: {title?, channelLabel, ion, action: "block"|"open"}
      Drug blocks/opens an ion channel in a membrane.
- pathway_switch   params: {title?, panelTitle?, nodeLabel, nodeSubtitle?, state: "on"|"off", downstreamLabel, downstreamEffect: "down"|"up"}
      Inside a cell: a signaling node switches and dials a downstream process up/down.
- cell_uptake      params: {title?, cellLabel, substanceLabel}
      Cells pull a substance out of the blood (e.g. insulin sensitivity).
- gauge            params: {title?, metricLabel, from: "high"|"normal"|"low", to: "high"|"normal"|"low"}
      A meter moving between states (blood pressure, blood sugar, cholesterol...).
- journey          params: {title?, steps: ["pill","stomach","bloodstream","target",...]}
      Pharmacokinetics: the drug's path through the body.
- warning_vignette params: {title?, items: ["headache","nausea",...]}
      Side effects as friendly signposts.
- two_panel_compare params: {title?, leftTitle, rightTitle, leftNote?, rightNote?}
      Before/after or with/without comparison.
- concept_card     params: {headline, sublines?: [..]}   (generic fallback)
- outro_card       params: {line1, line2}

Match the primitive to the biology: mechanism that activates/inhibits a
receptor -> receptor_binding; blocks an enzyme -> enzyme_inhibition; a
calcium/sodium/potassium channel -> channel_transporter; an intracellular
signal like AMPK -> pathway_switch; lowering a measurable number -> gauge;
an organ over/under-producing something -> organ_action.`;

export function buildAnimationPlanPrompt(
  script: Script,
  medicationName: string,
): { system: string; user: string } {
  const system = `${CHANNEL_VOICE}

You are the visual director for a PROGRAMMATIC ANIMATION engine (think
3Blue1Brown for medicine). You do NOT write image prompts. Instead you break
the script into animated scenes, and for EACH scene you choose an animation
primitive that literally simulates the concept being narrated, then supply
its parameters.

Hard rules:
- Cover the script in order: the hook, EVERY section's narration, the outro,
  and finally the disclaimer. Split long sections into 2-3 scenes so each
  scene simulates ONE idea.
- Scene narration text, concatenated in order, must reproduce the script's
  narration faithfully (you may split sentences across scenes, not rewrite).
- EVERY concept mentioned must be simulated by an appropriate primitive —
  never use concept_card when a specific primitive fits.
- Open with title_card, close with outro_card. Include one molecule_intro
  for the drug near the start. Represent the mechanism of action with the
  most specific primitive(s) available.
- Use the real medication generic name "${medicationName}" for molecule_intro.

${ANIMATION_PRIMITIVE_CATALOG}`;

  const user = `Turn this script into an animation plan. Produce 8-14 scenes.

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
