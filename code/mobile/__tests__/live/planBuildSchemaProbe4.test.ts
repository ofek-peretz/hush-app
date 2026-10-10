// @ts-nocheck — hand-run only: is it the ARRAY BOUNDS that push the schema over Google's limit (2026-09-07)?
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
  console.log(label, 'STATUS', r.status, text.replace(/\s+/g, ' ').slice(0, 200));
}
function base() { return JSON.parse(JSON.stringify(BUILD_WEEK_SCHEMA)); }
it('probes bounds', async () => {
  const m = base(); // reps array (as-is) but NO array bounds anywhere
  delete m.properties.days.minItems; delete m.properties.days.maxItems;
  delete m.properties.days.items.properties.lifts.minItems; delete m.properties.days.items.properties.lifts.maxItems;
  delete m.properties.missing.maxItems;
  await call(m, 'M:reps-array-no-bounds');
  const n = base(); // reps array, only the days bounds kept
  delete n.properties.days.items.properties.lifts.minItems; delete n.properties.days.items.properties.lifts.maxItems;
  await call(n, 'N:reps-array-no-lift-bounds');
  const o = base(); // reps array, only lifts bounds kept
  delete o.properties.days.minItems; delete o.properties.days.maxItems;
  await call(o, 'O:reps-array-no-day-bounds');
});
