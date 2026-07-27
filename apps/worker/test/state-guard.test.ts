import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma, runStateTransition, StaleRunStateError, disconnectPrisma } from '@yva/db';

/**
 * Integration tests for the race-safe state transition against real
 * Postgres — the mechanism that makes duplicate/stale jobs no-ops and
 * prevents two workers from double-processing a run.
 */
const prisma = getPrisma();
let runId: string;

beforeAll(async () => {
  const channel = await prisma.channel.findFirstOrThrow();
  const brief = await prisma.contentBrief.create({
    data: {
      channelId: channel.id,
      medicationQuery: 'state-guard-test',
      status: 'abandoned',
      audienceNote: 'test',
    },
  });
  const run = await prisma.productionRun.create({
    data: { channelId: channel.id, briefId: brief.id, state: 'RESEARCHING' },
  });
  runId = run.id;
});

afterAll(async () => {
  await prisma.productionRun.deleteMany({ where: { id: runId } });
  await prisma.contentBrief.deleteMany({ where: { medicationQuery: 'state-guard-test' } });
  await disconnectPrisma();
});

describe('runStateTransition', () => {
  it('applies a valid transition exactly once', async () => {
    await runStateTransition(prisma, runId, 'RESEARCHING', 'SCRIPTING');
    const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.state).toBe('SCRIPTING');
  });

  it('a duplicate of the same transition throws StaleRunStateError', async () => {
    await expect(runStateTransition(prisma, runId, 'RESEARCHING', 'SCRIPTING')).rejects.toThrow(
      StaleRunStateError,
    );
  });

  it('rejects transitions the state machine forbids, before touching the DB', async () => {
    await expect(runStateTransition(prisma, runId, 'SCRIPTING', 'PUBLISHED')).rejects.toThrow(
      /Invalid run state transition/,
    );
  });

  it('only one of two concurrent identical transitions wins', async () => {
    const results = await Promise.allSettled([
      runStateTransition(prisma, runId, 'SCRIPTING', 'SCRIPT_REVIEW'),
      runStateTransition(prisma, runId, 'SCRIPTING', 'SCRIPT_REVIEW'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const run = await prisma.productionRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.state).toBe('SCRIPT_REVIEW');
  });
});
