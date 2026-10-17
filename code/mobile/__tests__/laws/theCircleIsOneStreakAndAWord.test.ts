/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CIRCLE IS ONE STREAK AND A WORD — the circle tab, wired (founder, 2026-09-29).
 *
 * *"תשאיר את זה כך שיהיה רצף"* and *"אני לא רוצה שיהיה משהו שמזכיר gym bro או שכונה"* — for the
 * everyday lifter who trains three to five times a week for the routine. This law holds:
 *
 *   1 · the tab reads THIS week: a friend's row reported before the week opened counts zero done,
 *       "today" is her calendar day, and her own row is found even on a worker without the flag;
 *   2 · the invite is a link on the brand's domain that the site answers and the app claims —
 *       `/k/` and `/k?` only, never a bare `/k` prefix;
 *   3 · what reaches people: a cheer carries a first name, an invite and a reminder are HER messages
 *       from HER WhatsApp, and the poster she photographs for stories counts friends, never names them;
 *   4 · the tone is calm and adult — no gym-floor slang anywhere in the circle's copy.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';
import { circleCodeFromUrl, circleInviteLink, circleMembersView, latestCheer, type CircleState } from '@/domain/circle';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const readRepo = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', rel), 'utf8');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('1 · the tab reads this week, on her calendar', () => {
  const weekOpen = new Date(2026, 8, 26, 20, 30).getTime(); // a Saturday, 20:30 local
  const now = new Date(2026, 8, 29, 18, 0).getTime(); // the Tuesday after, 18:00 local
  const state: CircleState = {
    code: 'K7M2QX',
    members: [
      { name: 'Dana', done: 2, planned: 3, at: now - HOUR, id: 'a', last: new Date(2026, 8, 29, 7, 0).getTime() },
      { name: 'Ron', done: 4, planned: 4, at: weekOpen - DAY, id: 'b', last: new Date(2026, 8, 24, 19, 0).getTime() },
      { name: 'Noa', done: 1, planned: 3, at: now - 2 * HOUR, id: 'c' },
    ],
  };

  it('last week’s numbers are last week’s — a row reported before the week opened counts zero', () => {
    const v = circleMembersView(state, { nowMs: now, weekOpenMs: weekOpen, myName: 'Noa Levi' });
    expect(v.map((m) => m.done)).toEqual([2, 0, 1]);
  });

  it('"today" is her calendar day, not "within 24 hours"; unknown stays unknown', () => {
    const v = circleMembersView(state, { nowMs: now, weekOpenMs: weekOpen, myName: 'Noa' });
    expect(v.map((m) => m.lastDays)).toEqual([0, 5, null]);
  });

  it('her own row is found by the flag, and by her first name on a worker without one', () => {
    expect(circleMembersView(state, { nowMs: now, weekOpenMs: weekOpen, myName: 'Noa Levi' }).map((m) => m.me)).toEqual([false, false, true]);
    const flagged = { ...state, members: state.members.map((m) => ({ ...m, me: m.name === 'Ron' })) };
    expect(circleMembersView(flagged, { nowMs: now, weekOpenMs: weekOpen, myName: 'Noa' }).map((m) => m.me)).toEqual([false, true, false]);
  });

  it('the newest cheer is the one she sees', () => {
    expect(latestCheer({ ...state, cheers: [{ from: 'Ron', at: 5 }, { from: 'Dana', at: 9 }, { from: 'Noa', at: 7 }] })?.from).toBe('Dana');
    expect(latestCheer(null)).toBeNull();
  });
});

describe('2 · the invite is a link the site answers and the app claims', () => {
  it('both spellings of the link, and nothing that merely starts with /k', () => {
    expect(circleCodeFromUrl('https://getferrox.com/k/K7M2QX')).toBe('K7M2QX');
    expect(circleCodeFromUrl('https://getferrox.com/k?c=k7m2qx')).toBe('K7M2QX');
    expect(circleCodeFromUrl('hush://circle?c=K7M2QX')).toBe('K7M2QX');
    expect(circleCodeFromUrl('https://getferrox.com/kids/K7M2QX')).toBeNull();
    expect(circleCodeFromUrl('https://getferrox.com/k/K7M2')).toBeNull();
    expect(circleCodeFromUrl('hush://pair?c=K7M2QX')).toBeNull();
    expect(circleCodeFromUrl('https://getferrox.com/c/K7M2QX')).toBeNull();
    expect(circleCodeFromUrl(circleInviteLink('K7M2QX'))).toBe('K7M2QX');
  });

  it('getferrox.com answers /k and hands /k/* to the app — never a bare /k*', () => {
    const site = readRepo('brand/landing/worker.js');
    expect(site).toContain("{ '/': '/k/*' }, { '/': '/k' }");
    expect(site).not.toContain("'/k*'");
    expect(site).toContain("url.pathname === '/k' || url.pathname.startsWith('/k/')");
    expect(site).toContain("invitePage(safeCode(raw), CIRCLE_COPY[lang], lang, 'circle')");
  });

  it('the link that opened the app lands on the circle tab, and the code is spent there once', () => {
    const root = read('src/app/Root.tsx');
    expect(root).toContain('const circleCode = circleCodeFromUrl(url);');
    expect(root).toContain("navigateMain('HomeTabs', { screen: 'Crew' });");
    expect(read('src/screens/crew/CrewScreen.tsx')).toContain('const pending = takePendingCircleCode();');
  });
});

describe('3 · what reaches people', () => {
  const screen = read('src/screens/crew/CrewScreen.tsx');
  const worker = readRepo('server/hush-identity/src/index.ts');

  it('invites and reminders are HER messages, from HER WhatsApp — the app messages nobody itself', () => {
    expect(screen).toContain("shareViaWhatsApp(t('crew.inviteMessage'");
    expect(screen).toContain("shareViaWhatsApp(t('crew.nudgeMessage'");
    expect(worker).not.toMatch(/api\.whatsapp|graph\.facebook|twilio/i);
  });

  it('a cheer is addressed by the circle handle and keeps a first name and a moment — no workout', () => {
    expect(worker).toContain("path === '/circle/cheer'");
    expect(worker).toMatch(/list\.push\(\{ fromId: myId, from, at: now \}\)/);
    expect(worker).toContain('async function memberId(code: string, sub: string)');
  });

  it('the Well Done poster counts the circle and never names it', () => {
    const he = JSON.parse(read('src/i18n/locales/he.json'));
    for (const k of ['weekClosedCrew', 'weekClosedCrewAll_one', 'weekClosedCrewAll_two', 'weekClosedCrewAll_other']) {
      expect({ k, named: /\{\{name\}\}/.test(he.complete[k]) }).toEqual({ k, named: false });
    }
  });
});

describe('4 · calm and adult — the routine, not the gym floor', () => {
  it('no slang in any of the circle’s copy, in either language', () => {
    const he = JSON.parse(read('src/i18n/locales/he.json'));
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    const heCopy = JSON.stringify(he.crew) + JSON.stringify(he.complete.weekClosedCrew);
    for (const word of ['יאללה', 'אחי', "חבר'ה", 'גבר', 'וואלה', 'אחלה', 'תותח', 'מלך']) {
      expect({ word, present: heCopy.includes(word) }).toEqual({ word, present: false });
    }
    const enCopy = JSON.stringify(en.crew).toLowerCase();
    for (const word of ['bro', 'crew', 'beast', 'crush', 'grind', 'no excuses']) {
      expect({ word, present: enCopy.includes(word) }).toEqual({ word, present: false });
    }
  });
});
