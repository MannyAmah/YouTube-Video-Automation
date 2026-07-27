import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isRunState,
  PIPELINE_STEPS,
  RUN_STATES,
  STEP_ENTRY_STATE,
} from '../src/states';

describe('run state machine', () => {
  it('allows the happy path end to end', () => {
    const path = [
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
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!), `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it('rejects skipping the approval gate', () => {
    expect(canTransition('QUALITY_CHECK', 'UPLOADING_PRIVATE')).toBe(false);
    expect(canTransition('RENDERING', 'PUBLISHED')).toBe(false);
    expect(canTransition('AWAITING_APPROVAL', 'PUBLISHED')).toBe(false);
    expect(() => assertTransition('DRAFT', 'PUBLISHED')).toThrow(InvalidTransitionError);
  });

  it('treats PUBLISHED and CANCELLED as terminal', () => {
    for (const to of RUN_STATES) {
      expect(canTransition('PUBLISHED', to)).toBe(false);
      expect(canTransition('CANCELLED', to)).toBe(false);
    }
  });

  it('script review can bounce back to scripting', () => {
    expect(canTransition('SCRIPT_REVIEW', 'SCRIPTING')).toBe(true);
  });

  it('FAILED can re-enter any working state but not PUBLISHED directly', () => {
    expect(canTransition('FAILED', 'RENDERING')).toBe(true);
    expect(canTransition('FAILED', 'PUBLISHED')).toBe(false);
  });

  it('every step has a valid entry state', () => {
    for (const step of PIPELINE_STEPS) {
      expect(isRunState(STEP_ENTRY_STATE[step])).toBe(true);
    }
  });
});
