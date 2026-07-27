import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, stat, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import type { PrismaClient } from '@prisma/client';
import type { ArtifactKind } from '@yva/shared';

/**
 * Artifact store. Files live under MEDIA_ROOT/runs/<runId>/; the database
 * records paths RELATIVE to MEDIA_ROOT so storage can move without data
 * migration. Absolute paths never enter the database.
 */

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolvePromise(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export class ArtifactStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly mediaRoot: string,
  ) {}

  runDir(runId: string): string {
    return join(this.mediaRoot, 'runs', runId);
  }

  absolutePath(relativePath: string): string {
    const abs = resolve(this.mediaRoot, relativePath);
    if (!abs.startsWith(resolve(this.mediaRoot) + sep)) {
      throw new Error(`Artifact path escapes media root: ${relativePath}`);
    }
    return abs;
  }

  relativePath(runId: string, ...parts: string[]): string {
    return join('runs', runId, ...parts);
  }

  async ensureRunDir(runId: string, sub?: string): Promise<string> {
    const dir = sub ? join(this.runDir(runId), sub) : this.runDir(runId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /** Write a JSON artifact file and record it. */
  async saveJson(
    runId: string,
    kind: ArtifactKind,
    fileName: string,
    data: unknown,
    producer: string,
    meta?: Record<string, unknown>,
  ): Promise<string> {
    await this.ensureRunDir(runId);
    const rel = this.relativePath(runId, fileName);
    const abs = this.absolutePath(rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, JSON.stringify(data, null, 2), 'utf8');
    await this.record(runId, kind, rel, 'application/json', producer, meta);
    return abs;
  }

  /** Record an already-written file as an artifact (checksums it). */
  async record(
    runId: string,
    kind: ArtifactKind,
    relativePath: string,
    mimeType: string,
    producer: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const abs = this.absolutePath(relativePath);
    const info = await stat(abs);
    if (!info.isFile() || info.size === 0) {
      throw new Error(`Refusing to record empty/missing artifact: ${relativePath}`);
    }
    const checksum = await sha256File(abs);
    await this.prisma.artifact.upsert({
      where: { runId_kind_relativePath: { runId, kind, relativePath } },
      create: {
        runId,
        kind,
        relativePath,
        mimeType,
        bytes: info.size,
        checksumSha256: checksum,
        producer,
        meta: (meta ?? {}) as object,
      },
      update: {
        bytes: info.size,
        checksumSha256: checksum,
        producer,
        meta: (meta ?? {}) as object,
      },
    });
  }

  async getArtifact(runId: string, kind: ArtifactKind) {
    return this.prisma.artifact.findFirst({
      where: { runId, kind },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Load and return a verified absolute path for an artifact of a run. */
  async requireArtifactPath(runId: string, kind: ArtifactKind): Promise<string> {
    const artifact = await this.getArtifact(runId, kind);
    if (!artifact) throw new Error(`Run ${runId} is missing required artifact: ${kind}`);
    const abs = this.absolutePath(artifact.relativePath);
    const info = await stat(abs).catch(() => null);
    if (!info || info.size !== artifact.bytes) {
      throw new Error(
        `Artifact ${kind} for run ${runId} is missing on disk or size-mismatched (${artifact.relativePath})`,
      );
    }
    return abs;
  }
}
