/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A LINKED TRAINEE IS NEVER ASKED TO PAY — and leaving hands the trial back exactly as it was.
 *
 * ⛔ RULING 1 OF THE COACH TRACK (founder, 2026-09-17): *"The coach pays."* A trainee linked to a
 * coach gets FERROX Pro for as long as the link lives. So:
 *
 *   · with a live link, every paywall door is open — the gate (`isTrainingGated`) reads the store's
 *     entitlement, and the store overlays the link on StoreKit's answer (`withCoachLink`);
 *   · the overlay is never WRITTEN: the cached entitlement stays StoreKit's truth, so the moment she
 *     leaves (law 6) the ordinary trial logic — the fourteen, the thirty days, her own purchase —
 *     is exactly where it was;
 *   · a paid entitlement is never replaced by the coach's.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppProvider, useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { FREE_SESSION_LIMIT, NO_ENTITLEMENT, isTrainingGated, withCoachLink } from '@/domain/entitlement';
import { forgetCoachLink, onCoachLinkChange, saveCoachLink } from '@/state/coachOutbox';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const LINK = { linkId: 'l1', coachName: 'Dana', since: '2026-09-01T00:00:00.000Z', consent: { bodyweight: false, cardio: false } };

describe('⛔ ruling 1 — the overlay, pure', () => {
  it('a live link opens Pro; no link leaves the entitlement exactly as StoreKit said', () => {
    const linked = withCoachLink(NO_ENTITLEMENT, true);
    expect(linked).toEqual({ active: true, productId: null, source: 'coach', expiresAt: null });
    expect(isTrainingGated(FREE_SESSION_LIMIT + 40, linked.active, '2025-01-01T00:00:00.000Z')).toBe(false);

    const unlinked = withCoachLink(NO_ENTITLEMENT, false);
    expect(unlinked).toBe(NO_ENTITLEMENT);
    expect(isTrainingGated(FREE_SESSION_LIMIT, unlinked.active)).toBe(true);
    expect(isTrainingGated(FREE_SESSION_LIMIT - 1, unlinked.active)).toBe(false);
  });

  it('a paid entitlement is never replaced by the coach’s', () => {
    const paid = { active: true, productId: 'ferrox.pro.annual', source: 'subscription', expiresAt: '2027-01-01T00:00:00.000Z' };
    expect(withCoachLink(paid, true)).toBe(paid);
    const lapsed = { active: false, productId: 'ferrox.pro.monthly', source: 'subscription', expiresAt: '2026-01-01T00:00:00.000Z' };
    expect(withCoachLink(lapsed, true).active).toBe(true);
    expect(withCoachLink(lapsed, false)).toBe(lapsed);
  });
});

function Probe({ hold }: { hold: (api: unknown) => void }) {
  hold(useApp());
  return null;
}
const settle = async () => {
  for (let i = 0; i < 30; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
};

describe('⛔ ruling 1 — through the real store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await db.saveProfile({ id: 'p1', sex: 'female', units: 'kg', weightKg: 62, daysPerWeek: 3, repBand: '8-10', memberSince: '2025-01-01T00:00:00.000Z' });
    // A spent trial: every one of the fourteen used, and months past the thirty days.
    await db.saveMode({ mode: 'ADAPTIVE', completedSessions: FREE_SESSION_LIMIT + 6, portrait: 'PORTRAIT_UNLOCKED' });
  });

  it('a spent trial is gated; the link opens it at once; leaving closes it again — the cache untouched', async () => {
    let api: any = null;
    let tree: any;
    await act(async () => {
      tree = renderer.create(React.createElement(AppProvider, null, React.createElement(Probe, { hold: (a) => { api = a; } })));
    });
    await settle();
    const gated = () => isTrainingGated(api.modeState.completedSessions, api.entitlement.active, api.profile?.memberSince);

    expect(api.entitlement.active).toBe(false);
    expect(gated()).toBe(true);

    await act(async () => { await saveCoachLink(LINK); });
    await settle();
    expect(api.entitlement).toMatchObject({ active: true, source: 'coach' });
    expect(gated()).toBe(false);
    // ⛔ never written: the cache is still StoreKit's answer
    expect((await db.loadEntitlement()) ?? NO_ENTITLEMENT).toMatchObject({ active: false });

    await act(async () => { await forgetCoachLink(); });
    await settle();
    expect(api.entitlement.active).toBe(false);
    expect(api.entitlement.source).not.toBe('coach');
    expect(gated()).toBe(true);

    await act(async () => { tree.unmount(); });
  });

  it('a link already on the disk at launch is Pro from the first render that knows', async () => {
    await saveCoachLink(LINK);
    let api: any = null;
    let tree: any;
    await act(async () => {
      tree = renderer.create(React.createElement(AppProvider, null, React.createElement(Probe, { hold: (a) => { api = a; } })));
    });
    await settle();
    expect(api.entitlement.active).toBe(true);
    await act(async () => { tree.unmount(); });
  });
});

describe('⛔ ruling 1 — every door asks the overlaid entitlement, and the paywall is never shown', () => {
  it('the link’s two writers announce, and the store listens', () => {
    const heard: boolean[] = [];
    const off = onCoachLinkChange((l) => heard.push(l));
    return saveCoachLink(LINK)
      .then(() => forgetCoachLink())
      .then(() => {
        off();
        expect(heard).toEqual([true, false]);
      });
  });

  it('the store exposes StoreKit’s answer with the link overlaid — and compares, caches and tracks the raw one', () => {
    const store = read('src/state/stores/appStore.tsx');
    /*
     * ⚠️ THE OVERLAY GAINED A SECOND HALF (2026-09-18, the coach side). Ruling 1 has always had two
     * clauses — the trainee's Pro comes from the LINK, the coach's own comes from his TIER — and the
     * store now applies both, link first (a person can be both, and "your coach covers you" is the
     * relationship he would name). The shape the law actually pins is unchanged: composed at the
     * seam, never written to the cache.
     */
    expect(store).toContain('entitlement: withCoachPlan(withCoachLink(state.entitlement, coachLinked), coachPlan),');
    expect(store).toContain('const off = onCoachLinkChange((linked) => setCoachLinked(linked));');
    expect(store).toMatch(/\}, \[state, coachLinked, coachPlan\]\);/);
    expect(store).not.toMatch(/saveEntitlement\(withCoachLink/);
    expect(store).not.toMatch(/saveEntitlement\(withCoachPlan/);
  });

  it('every gate and the paywall itself read `entitlement.active` off the store', () => {
    expect(read('src/screens/home/Home.tsx')).toContain('isTrainingGated(app.modeState.completedSessions, app.entitlement.active, app.profile?.memberSince)');
    expect(read('src/screens/home/Home.tsx')).toContain('trialLeft={app.entitlement.active ? null :');
    expect(read('src/screens/plan/PreWorkoutScreen.tsx')).toContain('isTrainingGated(app.modeState.completedSessions, app.entitlement.active, app.profile?.memberSince)');
    expect(read('src/state/stores/pairStore.tsx')).toContain('isTrainingGated(app.modeState.completedSessions, app.entitlement.active, app.profile?.memberSince)');
    expect(read('src/state/stores/sessionStore.tsx')).toContain('isTrainingGated(a.modeState.completedSessions, a.entitlement.active, a.profile?.memberSince)');
    // a linked trainee who reaches the paywall anyway is sent straight back from it
    expect(read('src/screens/subscription/Paywall.tsx')).toMatch(/if \(app\.entitlement\.active\) navigation\.goBack\(\);/);
    // …and her membership card sends her to her coach, never to a price
    expect(read('src/screens/profile/ProfileSheet.tsx')).toMatch(/if \(ent\.source === 'coach'\) \{\s*navigation\.navigate\('MyCoach'\);/);
  });
});
