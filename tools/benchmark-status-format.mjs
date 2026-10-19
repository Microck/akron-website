import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const options = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
const formatter = new Intl.DateTimeFormat('en-US', options);
const dates = Array.from({ length: 3000 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i % 365)));
const baseline = () => dates.map(date => new Intl.DateTimeFormat('en-US', options).format(date));
const reused = () => dates.map(date => formatter.format(date));
assert.deepEqual(reused(), baseline());
for (const [name, fn] of [['baseline', baseline], ['reused', reused]]) {
  const samples = [];
  for (let i = 0; i < 7; i++) { const start = performance.now(); fn(); samples.push(performance.now() - start); }
  samples.sort((a,b) => a-b);
  console.log(JSON.stringify({ name, dates: dates.length, medianMs: samples[3], samplesMs: samples }));
}
