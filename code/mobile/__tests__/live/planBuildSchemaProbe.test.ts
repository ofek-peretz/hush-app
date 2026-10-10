// @ts-nocheck — hand-run only: which schema shape the upstream accepts (2026-09-07, the `reps` field).
import fs from 'fs';
import path from 'path';
const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const { buildWeekRequest, BUILD_WEEK_SCHEMA } = require('@/domain/buildPrompt');
jest.setTimeout(120_000);
async function call(schema, label) {
  const req = buildWeekRequest({ daysPerWeek: 3, sex: 'male', ask: 'שחקן כדורגל', locale: 'he', cache: process.env.PROBE_CACHE !== '0' });
  const r = await fetch(process.env.EXPO_PUBLIC_COACH_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hush-token': process.env.EXPO_PUBLIC_COACH_TOKEN, 'x-hush-install': 'probe' }, body: JSON.stringify({ blocks: req.blocks, schema, think: 'low' }) });
  const text = await r.text();
  // eslint-disable-next-line no-console
  console.log(label, 'STATUS', r.status, text.slice(0, 300));
}
it('probes three schema shapes', async () => {
  const lift = BUILD_WEEK_SCHEMA.properties.days.items.properties.lifts.items;
  const without = JSON.parse(JSON.stringify(BUILD_WEEK_SCHEMA));
  delete without.properties.days.items.properties.lifts.items.properties.reps;
  await call(without, 'A:no-reps');
  await call(BUILD_WEEK_SCHEMA, 'B:as-is');
  const obj = JSON.parse(JSON.stringify(BUILD_WEEK_SCHEMA));
  obj.properties.days.items.properties.lifts.items.properties.reps = { type: 'object', additionalProperties: false, required: ['low', 'high'], properties: { low: { type: 'integer' }, high: { type: 'integer' } }, description: 'Optional. The rep range for this exercise, when the goal calls for something other than the athlete’s default range.' };
  await call(obj, 'C:object');
  const noDesc = JSON.parse(JSON.stringify(BUILD_WEEK_SCHEMA));
  delete noDesc.properties.days.items.properties.lifts.items.properties.reps.description;
  await call(noDesc, 'D:array-no-description');
});
