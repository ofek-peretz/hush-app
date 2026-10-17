/**
 * ═══ LIVE WIRE CHECK — plan review against the REAL Worker (founder ask, 2026-08-26). ═══
 *
 * NOT part of the standing suite's promise: it talks to the network, spends a real model call,
 * and needs `.env`. Run by hand:  npx jest coachPlanReviewLive
 * It seeds a real profile + a real template draft, runs the REAL `requestPlanReview`, and then
 * holds the reply to the id law: every exercise the coach names must exist in OUR catalogue.
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';

// .env → process.env BEFORE the client module is imported (it reads at import time).
const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const { db } = require('@/data/local/db');
const { requestPlanReview } = require('@/platform/coach/planReview');
const { PLAN_TEMPLATES, materializeTemplate } = require('@/domain/planTemplates');
const { exerciseById } = require('@/data/exercises');
const { initI18n, setLocale } = require('@/i18n');

jest.setTimeout(90_000);

describe('the live plan review', () => {
  it('answers, parses, and names only exercises we own', async () => {
    await initI18n();
    await setLocale('he'); // the founder's athlete speaks Hebrew — the review must too
    await db.clearAll();
    await db.saveProfile({
      id: 'live1', name: 'עופר', sex: 'male', units: 'kg', weightKg: 78,
      daysPerWeek: 3, bodyMap: {}, repBandByMuscle: {},
    });
    const draft = materializeTemplate(PLAN_TEMPLATES[0], (k) => k); // PPL
    const res = await requestPlanReview(draft);
    // eslint-disable-next-line no-console
    console.log('LIVE RESULT:', JSON.stringify(res, null, 2).slice(0, 2000));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(typeof res.review.say).toBe('string');
      expect(res.review.say.length).toBeGreaterThan(0);
      for (const s of res.review.suggestions) {
        expect(exerciseById(s.ex)).toBeTruthy();
        if (s.to) expect(exerciseById(s.to)).toBeTruthy();
      }
    }
  });
});
