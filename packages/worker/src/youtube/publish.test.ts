// Fail-closed guard tests — no creds needed. Run: tsx --test src/youtube/publish.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublishAllowed } from './publish.js';

test('rejects empty disclaimer (fail-closed §6)', () => {
  assert.throws(() =>
    assertPublishAllowed({ disclaimer: '   ', visibility: 'unlisted', containsUnvalidatedAssets: false }),
  );
});

test('rejects PUBLIC when assets are placeholder/unvalidated (§5.2)', () => {
  assert.throws(() =>
    assertPublishAllowed({ disclaimer: 'Educational only.', visibility: 'public', containsUnvalidatedAssets: true }),
  );
});

test('allows UNLISTED with placeholder assets + a disclaimer', () => {
  assert.doesNotThrow(() =>
    assertPublishAllowed({ disclaimer: 'Educational only.', visibility: 'unlisted', containsUnvalidatedAssets: true }),
  );
});

test('allows PUBLIC only when assets are all validated', () => {
  assert.doesNotThrow(() =>
    assertPublishAllowed({ disclaimer: 'Educational only.', visibility: 'public', containsUnvalidatedAssets: false }),
  );
});
