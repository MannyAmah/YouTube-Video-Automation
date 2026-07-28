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

DEPTH — this is a REAL molecular-biology channel. Go deep on the mechanism:
- Name the REAL molecular target(s): the actual receptor, enzyme, ion channel,
  transporter, or signalling protein the drug binds (e.g. "HMG-CoA reductase",
  "ACE", "beta-1 receptor", "mitochondrial Complex I", "AMPK", "L-type calcium
  channel", "the H+/K+ ATPase proton pump"). Say the real name, then explain it
  with a five-year-old metaphor — never skip the real name.
- Tell the physical story: what the drug molecule IS, WHERE on the target it
  binds, WHEN/what happens on binding, the downstream biochemical cascade
  (name the real molecules — ATP, AMP, cAMP, substrate, product), WHY that
  produces the therapeutic effect, and HOW the key side/adverse effects arise
  biologically and why.
- Dedicate multiple sections to this molecular mechanism. Also cover how it's
  taken safely and its key interactions.

FACTUAL DISCIPLINE:
- For the MECHANISM of action at the molecular level (target names, binding,
  downstream molecules/cascade, why side effects arise) you MAY use established
  pharmacology — cite the "pharmacology" source id for these.
- For everything else — what it treats, efficacy, dosing, warnings, side-effect
  frequencies, interactions, manufacturers, and ANY statistic — use ONLY the
  FDA/NIH label evidence and cite those source ids. Never invent numbers.
- Every factual statement must appear in "claims" with the sourceIds that
  support it, using ONLY ids in the bundle.`;

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

LENGTH — the narration (hook + every section + outro) MUST total AT LEAST
${minWords} words. Produce 8-11 sections, each 130-190 narration words.

MECHANISM — this is the heart of the video and MUST be molecular, not vague.
Do NOT stop at "the liver makes less sugar." Dedicate 3-4 consecutive sections
to the real molecular story, and in them you MUST:
  (1) Name the drug's REAL molecular TARGET — the specific enzyme, receptor,
      ion channel, transporter, or protein it binds (cite "pharmacology").
  (2) Describe WHERE on/in the cell it binds and WHAT physically happens when
      it binds (the binding event and the immediate change).
  (3) Name the REAL downstream MOLECULES in the cascade (e.g. ATP, AMP, cAMP,
      a substrate and its product) and how they change.
  (4) Connect that cascade to WHY the therapeutic effect happens.
  (5) For at least one important side effect, explain the real biological
      REASON it develops.
Worked example of the required depth (different drug — do the equivalent for
this one): "Atorvastatin blocks an enzyme in the liver called HMG-CoA
reductase. That enzyme normally turns HMG-CoA into mevalonate, the first
building block of cholesterol. With the enzyme blocked, less mevalonate is
made, so the liver makes less cholesterol and pulls more LDL out of the blood."
Name the equivalent real target, substrate/product or second messengers, and
cascade for THIS medication. Still explain each with a simple metaphor after
naming it — but never omit the real names.

Also include sections for what it treats, how it's taken safely, common and
serious side effects, and key interactions.

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
      A meter moving between states — ONLY for a real measurable body metric
      (blood pressure, blood sugar, cholesterol, heart rate). Never for
      "dosage" or non-measurable ideas.
- journey          params: {title?, steps: ["pill","stomach","bloodstream","target",...]}
      Pharmacokinetics: the drug's path through the body.
- warning_vignette params: {title?, items: ["headache","nausea",...]}
      Side effects as friendly signposts.
- two_panel_compare params: {title?, leftTitle, rightTitle, leftNote?, rightNote?}
      Before/after or with/without comparison.
- molecular_binding params: {title?, drugName, targetLabel, targetType: "enzyme"|"receptor"|"channel"|"transporter", effect: "inhibits"|"blocks"|"activates"|"opens"}
      THE KEY MECHANISM SCENE. Renders the drug's REAL molecular structure
      docking into the named target's active site. Use the REAL target from
      the evidence (e.g. "HMG-CoA reductase", "ACE", "mitochondrial Complex I",
      "beta-1 receptor", "the proton pump", "L-type calcium channel"). Use this
      to show WHERE and WHEN the drug binds and WHAT happens.
- enzyme_reaction  params: {title?, enzymeLabel, substrateName, productName, drugName?, inhibited?: true|false}
      Renders REAL substrate and product molecular structures either side of
      the named enzyme; if the drug inhibits it, the drug docks and the product
      stops. Use REAL molecule names so the true structures are drawn
      (substrate/product/drug). Great for "why it works".
- signaling_cascade params: {title?, nodes: [{label, moleculeName?}, ...], effect?}
      A real cascade of named molecular players activating in sequence
      (e.g. ATP -> AMP -> AMPK -> less glucose). Give moleculeName for players
      that are real molecules (ATP, AMP, cAMP, glucose, pyruvate...) so their
      real structures are drawn.
- side_effect_mechanism params: {title?, effectLabel, causeSteps: ["real cause","real consequence","the symptom"]}
      Shows WHY an adverse effect develops as a real biological causal chain.
- drug_interactions params: {title?, drugLabel, interactsWith: ["warfarin","alcohol","grapefruit",...], note?}
      Shows the drug and things it clashes with as puzzle pieces that don't fit.
- how_to_take      params: {title?, timing: "once daily"|"twice daily"|"with meals"|..., withFood: true|false, tips: ["don't crush","same time each day",...]}
      A calendar + pill + food icon showing how to take it safely.
- concept_card     params: {headline, sublines?: [..]}   (LAST-RESORT fallback only)
- outro_card       params: {line1, line2}

Match the primitive to the biology. This is a REAL biological simulation
channel — for anything about HOW the drug works at the molecular level,
PREFER the real-molecule primitives that draw actual chemical structures:
  where/when the drug binds + what happens -> molecular_binding (REAL target name)
  a named enzyme turning a substrate into a product -> enzyme_reaction (REAL substrate/product/drug names)
  an intracellular signalling chain -> signaling_cascade (REAL molecule names like ATP/AMP/cAMP)
  WHY a side/adverse effect develops -> side_effect_mechanism (real causal chain)
  drug activates/inhibits a named receptor -> receptor_binding OR molecular_binding
  a calcium/sodium/potassium channel -> channel_transporter OR molecular_binding
  lowering a measurable number -> gauge
  an organ over/under-producing something -> organ_action
  what it does not mix with -> drug_interactions
  how to take it -> how_to_take
  side effects (list) -> warning_vignette
NEVER use concept_card for mechanism, binding, interactions, how-to-take, or
side-effect causes. Always pass the REAL molecular names from the evidence so
the true structures are drawn.`;

export const VISUAL_CHOICES_SCHEMA_DESCRIPTION = `VisualChoices JSON:
{
  "choices": [
    { "primitive": "<one primitive name>", "params": { ...fields... }, "caption": "<optional <=80 chars>" }
  ],
  "thumbnailPrompt": "<prompt for a bold, friendly thumbnail illustration>",
  "thumbnailTitleText": "<max 40 chars>"
}
The "choices" array MUST have EXACTLY one entry per numbered scene below, in
order. Do not add, drop, or reorder. You choose only the visual — the
narration is fixed.`;

export function buildVisualChoicesPrompt(
  chunks: { id: string; sectionId: string; narration: string }[],
  script: Script,
  medicationName: string,
): { system: string; user: string } {
  const system = `${CHANNEL_VOICE}

You are the visual director for a PROGRAMMATIC ANIMATION engine (3Blue1Brown
for medicine). The narration is ALREADY split into ${chunks.length} scenes. For
EACH scene, in order, choose the animation primitive that literally simulates
what that scene's narration says, and fill its params. You do NOT write or
change narration — you only pick the visual.

Rules:
- Return EXACTLY ${chunks.length} choices, one per numbered scene, in order.
- Pick the MOST SPECIFIC primitive for what the narration describes. Use
  concept_card ONLY when nothing else fits (aim for very few — ideally none
  outside the disclaimer). Even a general sentence about what the drug does
  can usually be a bloodstream_level, organ_action, gauge, or two_panel_compare.
- This is a REAL biological simulation channel. When the narration is about
  how the drug works at the molecular level, PREFER the real-molecule
  primitives that draw actual chemical structures: molecular_binding (where/
  when it binds + what happens), enzyme_reaction (substrate->enzyme->product),
  signaling_cascade (ATP/AMP/cAMP...), side_effect_mechanism (why an adverse
  effect develops). Pass the REAL molecule and target NAMES from the narration
  (drugName, targetLabel, substrateName, productName, moleculeName) so the true
  structures are rendered.
- The params' visible labels must match what the narration says, so the
  picture agrees with the spoken words.
- First scene: title_card. Put a molecule_intro (name "${medicationName}")
  on the earliest scene that introduces the drug. Last scene: outro_card.
  The disclaimer scene: concept_card.

${ANIMATION_PRIMITIVE_CATALOG}`;

  const numbered = chunks
    .map((c, i) => `Scene ${i + 1} [section: ${c.sectionId}]: ${c.narration}`)
    .join('\n');
  const user = `Choose one visual per scene for "${medicationName}". Return ${chunks.length} choices in order.\n\n${numbered}`;
  return { system, user };
}

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
- Reproduce the FULL script narration VERBATIM, split across scenes. The
  concatenation of all scene "narration" fields must equal the script's
  hook + every section (in order) + outro + disclaimer, word for word. Do
  NOT summarize, shorten, or drop sentences — dropping narration makes the
  video too short and is the #1 failure. Split long sections into 2-4 scenes
  so each scene simulates ONE idea, but keep every sentence.
- EVERY concept must be simulated by the MOST SPECIFIC primitive. Using
  concept_card for a mechanism, interaction, or how-to-take scene is a
  failure — pick receptor_binding / enzyme_inhibition / pathway_switch /
  channel_transporter / drug_interactions / how_to_take instead, and put the
  REAL named target from the script into its params.
- Open with title_card, put molecule_intro (name "${medicationName}") right
  after, and give the mechanism its own specific primitive(s) naming the real
  target. Close with outro_card.

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
