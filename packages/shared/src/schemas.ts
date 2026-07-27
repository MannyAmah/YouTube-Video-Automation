import { z } from 'zod';

/* ---------------------------------------------------------------------------
 * Evidence — every factual claim in a script must reference one of these.
 * Sources are restricted to FDA/NIH systems (channel policy: FDA/NIH only).
 * ------------------------------------------------------------------------- */

export const EVIDENCE_SOURCE_TYPES = [
  'openfda_label',
  'dailymed_spl',
  'medlineplus',
  'rxnorm',
  'openfda_faers',
] as const;

export const EvidenceSourceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(EVIDENCE_SOURCE_TYPES),
  title: z.string().min(1),
  url: z.string().url(),
  /** Verbatim excerpt from the source that supports claims citing it. */
  excerpt: z.string().min(1),
  /** Which label section this came from, e.g. "indications_and_usage". */
  section: z.string().optional(),
  retrievedAt: z.string().datetime(),
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const MedicationEvidenceSchema = z.object({
  genericName: z.string().min(1),
  brandNames: z.array(z.string()),
  rxcui: z.string().optional(),
  drugClass: z.string().optional(),
  manufacturers: z.array(z.string()),
  sources: z.array(EvidenceSourceSchema).min(1),
  /** Structured label sections keyed by openFDA field name. */
  labelSections: z.record(z.string(), z.string()),
});
export type MedicationEvidence = z.infer<typeof MedicationEvidenceSchema>;

/* ---------------------------------------------------------------------------
 * Content brief
 * ------------------------------------------------------------------------- */

export const VIDEO_FORMATS = ['longform_16x9'] as const;

export const ContentBriefSchema = z.object({
  medicationQuery: z.string().min(1),
  format: z.enum(VIDEO_FORMATS).default('longform_16x9'),
  targetDurationSec: z.number().int().min(300).max(660).default(420),
  /**
   * The angle for this video. "complete_guide" covers development, mechanism,
   * uses, side effects, interactions, and how to take it — the channel's
   * flagship format.
   */
  angle: z
    .enum([
      'complete_guide',
      'how_it_works',
      'side_effects_explained',
      'how_to_take_safely',
      'interactions',
      'history_and_development',
    ])
    .default('complete_guide'),
  audienceNote: z
    .string()
    .default(
      'Patients and caregivers with no medical background. Explain like the viewer is five years old, using visual metaphors, without being condescending.',
    ),
});
export type ContentBrief = z.infer<typeof ContentBriefSchema>;

/* ---------------------------------------------------------------------------
 * Script — structured, claim-by-claim cited
 * ------------------------------------------------------------------------- */

export const ScriptClaimSchema = z.object({
  /** The factual statement as it appears (or is paraphrased) in narration. */
  text: z.string().min(1),
  /** Evidence source ids that support this claim. Never empty. */
  sourceIds: z.array(z.string().min(1)).min(1),
});
export type ScriptClaim = z.infer<typeof ScriptClaimSchema>;

export const ScriptSectionSchema = z.object({
  id: z.string().min(1),
  heading: z.string().min(1),
  /** Spoken narration for this section — plain conversational sentences. */
  narration: z.string().min(1),
  /** Every factual claim made in `narration`, each mapped to sources. */
  claims: z.array(ScriptClaimSchema),
  /** One-sentence description of the visual metaphor for this section. */
  visualIdea: z.string().min(1),
});
export type ScriptSection = z.infer<typeof ScriptSectionSchema>;

export const ScriptSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(10).max(4500),
  tags: z.array(z.string()).max(30),
  hook: z.string().min(1),
  sections: z.array(ScriptSectionSchema).min(4),
  outro: z.string().min(1),
  /** Mandatory medical disclaimer, spoken and shown on screen. */
  disclaimer: z.string().min(20),
  estimatedDurationSec: z.number().int().positive(),
});
export type Script = z.infer<typeof ScriptSchema>;

/* ---------------------------------------------------------------------------
 * Storyboard
 * ------------------------------------------------------------------------- */

export const StoryboardSceneSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  /** Exact narration text spoken over this scene. */
  narration: z.string().min(1),
  /** Prompt for the image provider — style baked in by the storyboard step. */
  imagePrompt: z.string().min(1),
  /** Short on-screen caption (max ~8 words) reinforcing the key point. */
  caption: z.string().max(80),
});
export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;

export const StoryboardSchema = z.object({
  scenes: z.array(StoryboardSceneSchema).min(6),
  styleGuide: z.string().min(1),
  thumbnailPrompt: z.string().min(1),
  thumbnailTitleText: z.string().min(1).max(40),
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

/* ---------------------------------------------------------------------------
 * Animation plan — the storyboard for the programmatic animation engine.
 * Every script concept maps to an animated scene built from one primitive.
 * ------------------------------------------------------------------------- */

export const ANIMATION_PRIMITIVES = [
  'title_card',
  'bloodstream_level',
  'organ_action',
  'molecule_intro',
  'receptor_binding',
  'enzyme_inhibition',
  'channel_transporter',
  'pathway_switch',
  'cell_uptake',
  'gauge',
  'journey',
  'warning_vignette',
  'two_panel_compare',
  'concept_card',
  'outro_card',
] as const;
export type AnimationPrimitive = (typeof ANIMATION_PRIMITIVES)[number];

export const AnimationSceneSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  /** Exact narration spoken over this scene (drives its duration). */
  narration: z.string().min(1),
  /** The visual primitive that simulates this concept. */
  primitive: z.enum(ANIMATION_PRIMITIVES),
  /**
   * Primitive parameters. Loosely typed on purpose: the Python builders are
   * defensive and fall back on missing/odd fields. Common fields include
   * title, organ, action, substanceLabel, level, drugLabel, receptorLabel,
   * enzymeLabel, nodeLabel, state, downstreamEffect, metricLabel, from, to,
   * name, caption, steps[], items[], leftTitle/rightTitle, headline/sublines.
   */
  params: z.record(z.string(), z.any()).default({}),
  /** Short on-screen caption reinforcing the point (optional). */
  caption: z.string().max(80).default(''),
});
export type AnimationScene = z.infer<typeof AnimationSceneSchema>;

export const AnimationPlanSchema = z.object({
  scenes: z.array(AnimationSceneSchema).min(6),
  /** Prompt for the thumbnail base illustration (still image is fine here). */
  thumbnailPrompt: z.string().min(1),
  thumbnailTitleText: z.string().min(1).max(40),
});
export type AnimationPlan = z.infer<typeof AnimationPlanSchema>;

/* ---------------------------------------------------------------------------
 * Quality-control report
 * ------------------------------------------------------------------------- */

export const QcCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});

export const QcReportSchema = z.object({
  passed: z.boolean(),
  checks: z.array(QcCheckSchema).min(1),
  videoDurationSec: z.number().positive(),
  videoWidth: z.number().int().positive(),
  videoHeight: z.number().int().positive(),
  hasAudioStream: z.boolean(),
  fileBytes: z.number().int().positive(),
  checksumSha256: z.string().length(64),
});
export type QcReport = z.infer<typeof QcReportSchema>;

/* ---------------------------------------------------------------------------
 * Artifact metadata
 * ------------------------------------------------------------------------- */

export const ARTIFACT_KINDS = [
  'evidence_json',
  'script_json',
  'storyboard_json',
  'narration_audio',
  'scene_image',
  'thumbnail',
  'captions_srt',
  'video_mp4',
  'qc_report',
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/* ---------------------------------------------------------------------------
 * Publish policy
 * ------------------------------------------------------------------------- */

export const PublishPolicySchema = z.object({
  mode: z.enum(['autonomous', 'supervised']),
  emergencyPause: z.boolean(),
  maxPublishesPerDay: z.number().int().min(0).max(24),
  /** Category id 27 = Education. */
  youtubeCategoryId: z.string().default('27'),
  defaultPrivacyForUpload: z.literal('private').default('private'),
});
export type PublishPolicy = z.infer<typeof PublishPolicySchema>;
