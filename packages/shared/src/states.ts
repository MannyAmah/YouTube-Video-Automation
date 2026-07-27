/**
 * Production run state machine.
 *
 * Every state change in the system MUST go through `assertTransition`.
 * Transitions are enforced again at the database layer inside a transaction
 * (see @yva/db runStateTransition) so two workers can never race a run into
 * an invalid state.
 */

export const RUN_STATES = [
  'DRAFT',
  'RESEARCHING',
  'SCRIPTING',
  'SCRIPT_REVIEW',
  'STORYBOARDING',
  'GENERATING_ASSETS',
  'RENDERING',
  'QUALITY_CHECK',
  'AWAITING_APPROVAL',
  'APPROVED',
  'UPLOADING_PRIVATE',
  'UPLOADED_PRIVATE',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED',
  'CANCELLED',
] as const;

export type RunState = (typeof RUN_STATES)[number];

/** States in which the pipeline is actively doing work. */
export const ACTIVE_STATES: readonly RunState[] = [
  'RESEARCHING',
  'SCRIPTING',
  'STORYBOARDING',
  'GENERATING_ASSETS',
  'RENDERING',
  'QUALITY_CHECK',
  'UPLOADING_PRIVATE',
];

/** Terminal states — nothing may follow. */
export const TERMINAL_STATES: readonly RunState[] = ['PUBLISHED', 'CANCELLED'];

const TRANSITIONS: Record<RunState, readonly RunState[]> = {
  DRAFT: ['RESEARCHING', 'CANCELLED'],
  RESEARCHING: ['SCRIPTING', 'FAILED', 'CANCELLED'],
  SCRIPTING: ['SCRIPT_REVIEW', 'FAILED', 'CANCELLED'],
  // SCRIPT_REVIEW passes automatically in autonomous mode when the citation
  // policy is satisfied; in supervised mode it waits for a human.
  SCRIPT_REVIEW: ['STORYBOARDING', 'SCRIPTING', 'FAILED', 'CANCELLED'],
  STORYBOARDING: ['GENERATING_ASSETS', 'FAILED', 'CANCELLED'],
  GENERATING_ASSETS: ['RENDERING', 'FAILED', 'CANCELLED'],
  RENDERING: ['QUALITY_CHECK', 'FAILED', 'CANCELLED'],
  QUALITY_CHECK: ['AWAITING_APPROVAL', 'FAILED', 'CANCELLED'],
  // AWAITING_APPROVAL resolves automatically in autonomous mode when the QC
  // report passes; in supervised mode it waits for a human decision.
  AWAITING_APPROVAL: ['APPROVED', 'SCRIPTING', 'FAILED', 'CANCELLED'],
  APPROVED: ['UPLOADING_PRIVATE', 'CANCELLED'],
  UPLOADING_PRIVATE: ['UPLOADED_PRIVATE', 'FAILED', 'CANCELLED'],
  UPLOADED_PRIVATE: ['SCHEDULED', 'PUBLISHED', 'CANCELLED'],
  SCHEDULED: ['PUBLISHED', 'UPLOADED_PRIVATE', 'FAILED', 'CANCELLED'],
  PUBLISHED: [],
  // FAILED runs may be retried into the state they failed from; the retry
  // target is recorded on the run (retryTargetState) and validated here.
  FAILED: [
    'RESEARCHING',
    'SCRIPTING',
    'STORYBOARDING',
    'GENERATING_ASSETS',
    'RENDERING',
    'QUALITY_CHECK',
    'UPLOADING_PRIVATE',
    'SCHEDULED',
    'CANCELLED',
  ],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: RunState,
    public readonly to: RunState,
  ) {
    super(`Invalid run state transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: RunState, to: RunState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: RunState, to: RunState): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isRunState(value: string): value is RunState {
  return (RUN_STATES as readonly string[]).includes(value);
}

/** Pipeline step names — used as queue job names and JobEvent step keys. */
export const PIPELINE_STEPS = [
  'research',
  'script',
  'script_review',
  'storyboard',
  'assets',
  'render',
  'quality_check',
  'approval',
  'upload',
  'publish',
  'analytics_sync',
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/** The state a run must be in for each step to execute. */
export const STEP_ENTRY_STATE: Record<PipelineStep, RunState> = {
  research: 'RESEARCHING',
  script: 'SCRIPTING',
  script_review: 'SCRIPT_REVIEW',
  storyboard: 'STORYBOARDING',
  assets: 'GENERATING_ASSETS',
  render: 'RENDERING',
  quality_check: 'QUALITY_CHECK',
  approval: 'AWAITING_APPROVAL',
  upload: 'APPROVED',
  publish: 'SCHEDULED',
  analytics_sync: 'PUBLISHED',
};
