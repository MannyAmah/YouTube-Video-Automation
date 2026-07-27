/** Test setup: load repo-root .env into process.env (no overrides). */
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const raw = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]!] === undefined) {
      process.env[match[1]!] = match[2]!;
    }
  }
} catch {
  // No .env — rely on the ambient environment (CI).
}
