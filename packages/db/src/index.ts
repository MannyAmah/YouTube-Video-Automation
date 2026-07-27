import { PrismaClient, Prisma } from '@prisma/client';
import { assertTransition, isRunState, RunState } from '@yva/shared';

export { PrismaClient, Prisma };
export { ArtifactStore } from './artifacts';
export type { ProductionRun, Channel, ContentBrief, Artifact, Publication } from '@prisma/client';

let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

export class StaleRunStateError extends Error {
  constructor(runId: string, expected: RunState, actual: string) {
    super(`Run ${runId} expected state ${expected} but is ${actual}`);
    this.name = 'StaleRunStateError';
  }
}

/**
 * Transactional, race-safe state transition.
 *
 * Verifies the run is in `from`, validates the transition against the state
 * machine, and applies the update with an optimistic WHERE on the current
 * state so concurrent workers cannot double-apply. Extra fields (e.g.
 * failureReason) may be set atomically with the transition.
 */
export async function runStateTransition(
  prisma: PrismaClient,
  runId: string,
  from: RunState,
  to: RunState,
  extra: Prisma.ProductionRunUpdateManyMutationInput = {},
): Promise<void> {
  assertTransition(from, to);
  const result = await prisma.productionRun.updateMany({
    where: { id: runId, state: from },
    data: { ...extra, state: to },
  });
  if (result.count !== 1) {
    const run = await prisma.productionRun.findUnique({ where: { id: runId } });
    throw new StaleRunStateError(runId, from, run?.state ?? 'MISSING');
  }
}

/** Read a run and assert its state field is a valid RunState. */
export async function getRunChecked(prisma: PrismaClient, runId: string) {
  const run = await prisma.productionRun.findUniqueOrThrow({
    where: { id: runId },
    include: { brief: true, channel: true },
  });
  if (!isRunState(run.state)) {
    throw new Error(`Run ${runId} has corrupt state "${run.state}"`);
  }
  return { ...run, state: run.state as RunState };
}
