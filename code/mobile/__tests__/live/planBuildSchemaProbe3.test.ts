// @ts-nocheck — hand-run only: does REQUIRING the field make the upstream accept it (2026-09-07)?
import fs from 'fs';
import path from 'path';
const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const { buildWeekRequest, BUILD_WEEK_SCHEMA } = require('@/domain/buildPrompt');
jest.setTimeout(180_000);
async function call(schema, label) {
  const req = buildWeekRequest({ daysPerWeek: 2, sex: 'male', ask: 'שחקן כדורגל', locale: 'he', cache: false });
  const r = await fetch(process.env.EXPO_PUBLIC_COACH_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hush-token': process.env.EXPO_PUBLIC_COACH_TOKEN, 'x-hush-install': 'probe' }, body: JSON.stringify({ blocks: req.blocks, schema, think: 'low' }) });
  const text = await r.text();
  // eslint-disable-next-line no-console
  console.log(label, 'STATUS', r.status, text.replace(/\s+/g, ' ').slice(0, 220));
}
function shape(field, required) {
  const s = JSON.parse(JSON.stringify(BUILD_WEEK_SCHEMA));
  const lift = s.properties.days.items.properties.lifts.items;
  lift.properties.reps = field;
  lift.required = required;
  return s;
}
it('probes required shapes', async () => {
  await call(shape({ type: 'array', items: { type: 'integer' }, description: 'The rep range for this exercise as [low, high]. Use [0, 0] to leave the athlete’s default range.' }, ['ex', 'sets', 'reps']), 'J:array-required');
  await call(shape({ type: 'string', description: 'The rep range for this exercise, like 8-12. Empty for the athlete’s default range.' }, ['ex', 'sets', 'reps']), 'L:string-required');
  const k = JSON.parse(JSON.stringify(BUILD_WEEK_SCHEMA));
  const lift = k.properties.days.items.properties.lifts.items;
  lift.properties.repsLow = { type: 'integer' }; lift.properties.repsHigh = { type: 'integer' };
  lift.required = ['ex', 'sets', 'repsLow', 'repsHigh'];
  await call(k, 'K:two-integers-required');
});
