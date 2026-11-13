import assert from 'node:assert/strict';
import test from 'node:test';
import { localTitleFor, sourceNames, toBusyBlocks, toLocalEvents } from '../lib/calendarBlocks.ts';

const NOW = Date.parse('2026-11-13T14:00:00Z');
const at = (hhmm, day = 13) => `2026-11-${day}T${hhmm}:00.000Z`;
const ev = (title, start, end, extra = {}) => ({ title, startDate: start, endDate: end, ...extra });

test('busy blocks carry start and end only, never titles', () => {
  const blocks = toBusyBlocks([ev('Therapy', at('15:00'), at('16:00'))], NOW);
  assert.deepEqual(blocks, [{ start: at('15:00'), end: at('16:00') }]);
  assert.ok(!JSON.stringify(blocks).includes('Therapy'));
});

test('overlapping and touching events merge into one block', () => {
  const blocks = toBusyBlocks(
    [ev('a', at('15:00'), at('15:30')), ev('b', at('15:30'), at('16:00')), ev('c', at('15:45'), at('16:30'))],
    NOW,
  );
  assert.deepEqual(blocks, [{ start: at('15:00'), end: at('16:30') }]);
});

test('all-day, free, cancelled and finished events do not block time', () => {
  const blocks = toBusyBlocks(
    [
      ev('Birthday', at('00:00'), at('00:00', 14), { allDay: true }),
      ev('Focus (free)', at('15:00'), at('16:00'), { availability: 'free' }),
      ev('Cancelled', at('17:00'), at('18:00'), { status: 'canceled' }),
      ev('Earlier', at('09:00'), at('10:00')),
      ev('Next week', at('09:00', 20), at('10:00', 20)),
    ],
    NOW,
  );
  assert.deepEqual(blocks, []);
});

test('an event in progress is kept', () => {
  const blocks = toBusyBlocks([ev('Standup', at('13:45'), at('14:15'))], NOW);
  assert.deepEqual(blocks, [{ start: at('13:45'), end: at('14:15') }]);
});

test('Date objects from the native module work too', () => {
  const blocks = toBusyBlocks([ev('x', new Date(at('15:00')), new Date(at('15:20')))], NOW);
  assert.equal(blocks.length, 1);
});

test('the phone labels a merged server block with its own titles', () => {
  const local = toLocalEvents([ev('Standup', at('15:00'), at('15:30')), ev('1:1', at('15:30'), at('16:00'))]);
  assert.equal(localTitleFor(local, at('15:00'), at('16:00')), 'Standup · 1:1');
  assert.equal(localTitleFor(local, at('17:00'), at('18:00')), null);
});

test('source names are deduplicated', () => {
  const cals = [{ source: { name: 'iCloud' } }, { source: { name: 'Gmail' } }, { source: { name: 'iCloud' } }];
  assert.deepEqual(sourceNames(cals), ['iCloud', 'Gmail']);
});
