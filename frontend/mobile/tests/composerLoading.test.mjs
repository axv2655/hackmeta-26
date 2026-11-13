import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { loadParts, canApplyDraft } from '../lib/composerLoading.ts';

test('a slow draft does not hold friends or places behind it', async () => {
  let finishDraft;
  const updates = [];
  const result = loadParts({
    draft: () => new Promise((resolve) => { finishDraft = resolve; }),
    friends: async () => ['friend'], places: async () => ['cafe'],
  }, (key, value) => updates.push([key, value]), () => {});
  await delay(0);
  assert.deepEqual(updates.map(([key]) => key).sort(), ['friends', 'places']);
  finishDraft('coffee');
  assert.deepEqual(await result, { draft: 'coffee', friends: ['friend'], places: ['cafe'] });
});

test('an optional list failing does not discard or stop successful parts', async () => {
  const updates = [];
  const settled = [];
  await assert.rejects(loadParts({
    crews: async () => { throw new Error('offline'); },
    friends: async () => { await delay(5); return ['friend']; },
  }, (key) => updates.push(key), (key) => settled.push(key)), /offline/);
  assert.deepEqual(updates, ['friends']);
  assert.deepEqual(settled.sort(), ['crews', 'friends']);
});

test('timed-out requests cannot publish late results', async () => {
  let resolve;
  const updates = [];
  await assert.rejects(loadParts({ draft: () => new Promise((r) => { resolve = r; }) },
    (key) => updates.push(key), () => {}, 5), /Taking too long/);
  resolve('late');
  await delay(0);
  assert.deepEqual(updates, []);
});

test('late draft cannot overwrite typing, a changed place, or a newer model draft', () => {
  assert.equal(canApplyDraft({ text: true, place: false }, null, null, false, true), false);
  assert.equal(canApplyDraft({ text: false, place: true }, 'gym', 'cafe', false, true), false);
  assert.equal(canApplyDraft({ text: false, place: false }, 'cafe', 'cafe', true, false), false);
  assert.equal(canApplyDraft({ text: false, place: true }, 'cafe', 'cafe', false, true), true);
});
