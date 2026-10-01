/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE INVITE OPENS A DOOR, NOT A WIRE — and the trainee's screens keep the track's promises.
 * (the coach track, trainee screens — 2026-09-17)
 *
 *   · A coach's link (`hush://coach?c=`, `…/c/CODE`) opens the invite and FETCHES NOTHING. The join
 *     is hers to press; on a phone with no profile the code waits for About you.
 *   · Before one datum leaves the phone she sees what crosses and what never does, and both consent
 *     switches start OFF.
 *   · A trainee linked in the intake SKIPS the plan-build step — the coach writes the week.
 *   · The first week is not an "update": the join clears the card it would otherwise raise.
 *   · Leaving is behind a confirmation that states its cost: the week stays, access closes at once,
 *     the data is deleted from the server after 30 days (law 6).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initI18n, tg } from '@/i18n';
import { CoachJoinView } from '@/screens/trainee/CoachJoin';
import { MyCoachView } from '@/screens/trainee/MyCoach';
import { joinErrorKey } from '@/domain/coachTrackAthlete';
import { peekPendingCoachInvite, setPendingCoachInvite, takePendingCoachInvite } from '@/state/pendingCoachInvite';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeAll(async () => {
  await initI18n();
});

const textsOf = (r) => r.root.findAllByType(Text).map((n) => [].concat(n.props.children).filter((x) => typeof x === 'string').join(''));

describe('⛔ the link opens the invite and fetches nothing', () => {
  it('Root matches the invite before the pair, routes it, and holds it for About you when there is no profile', () => {
    const root = read('src/app/Root.tsx');
    const invite = root.indexOf('const invite = inviteCodeFromUrl(url);');
    expect(invite).toBeGreaterThan(0);
    expect(invite).toBeLessThan(root.indexOf('const pairCode = /[?&]c=([^&]+)/.exec(url)?.[1];'));
    const branch = root.slice(invite, root.indexOf('const pairCode'));
    expect(branch).toMatch(/if \(!enrolledRef\.current\) \{\s*setPendingCoachInvite\(invite\);\s*return;\s*\}\s*navigateMain\('CoachJoin', \{ code: invite \}\);/);
    expect(branch).not.toMatch(/coachJoin|\.join\(|fetch\(/);
    expect(root).toContain('<OnboardingStack.Screen name="CoachJoin" component={CoachJoin} />');
    expect(root).toContain('<MainStack.Screen name="CoachJoin" component={CoachJoin} />');
    expect(root).toContain('<MainStack.Screen name="MyCoach" component={MyCoach} />');
  });

  it('the invite is spent once, and About you carries it to the join', () => {
    setPendingCoachInvite('ABC234');
    expect(peekPendingCoachInvite()).toBe('ABC234');
    expect(takePendingCoachInvite()).toBe('ABC234');
    expect(takePendingCoachInvite()).toBeNull();
    const about = read('src/screens/onboarding/AboutYou.tsx');
    expect(about).toMatch(/const invite = takePendingCoachInvite\(\);\s*if \(invite\) \{\s*navigation\.navigate\('CoachJoin'/);
  });

  it('the screen calls the wire in exactly one place — the press — and consent starts OFF', () => {
    const join = read('src/screens/trainee/CoachJoin.tsx');
    expect(join.split('coach.join(').length - 1).toBe(1);
    expect(join.indexOf('coach.join(')).toBeGreaterThan(join.indexOf('const join = useCallback(async () => {'));
    expect(join).toContain('const [bodyweight, setBodyweight] = useState(false);');
    expect(join).toContain('const [cardio, setCardio] = useState(false);');
    // the first week is not an update card
    expect(join).toMatch(/if \(!r\.ok\) \{[\s\S]*?\}\s*setNeedsAccount\(false\);[\s\S]*?await coach\.dismissUpdate\(\);/);
  });
});

describe('⛔ before one datum leaves the phone, she sees what crosses', () => {
  it('draws both lists, both switches OFF, and a refusal in words', () => {
    let r;
    act(() => {
      r = renderer.create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <CoachJoinView
            code="ABC234" onCode={() => {}} bodyweight={false} onBodyweight={() => {}} cardio={false} onCardio={() => {}}
            busy={false} errorKey={joinErrorKey('seats_full')} needsAccount={false} onJoin={() => {}} onBack={() => {}} intake={false}
          />
        </SafeAreaProvider>,
      );
    });
    const all = textsOf(r);
    for (const k of ['sees1', 'sees2', 'sees3', 'sees4', 'notSees1', 'notSees2', 'notSees3', 'errSeatsFull', 'joinFoot']) {
      expect(all).toContain(tg(`coachTrack.athlete.${k}`));
    }
    const switches = r.root.findAll((n) => n.props?.accessibilityRole === 'switch' && n.props?.accessibilityState);
    expect(switches.length).toBeGreaterThanOrEqual(2);
    for (const s of switches) expect(s.props.accessibilityState.checked).toBe(false);
    act(() => r.unmount());
  });
});

describe('⛔ a coach’s trainee skips the plan-build step', () => {
  it('the intake join goes to Connect Health marked `coach`, which finishes onboarding instead of opening the builder', () => {
    const join = read('src/screens/trainee/CoachJoin.tsx');
    // REPLACE: an invite left in the intake's history re-opens over Today when the navigators swap.
    expect(join).toMatch(/\.replace\('ConnectHealth', \{[\s\S]{0,160}coach: true,/);
    expect(join).not.toMatch(/navigate\('ConnectHealth'/);
    const health = read('src/screens/onboarding/ConnectHealth.tsx');
    const coachAt = health.indexOf('if (route.params?.coach && app) {');
    expect(coachAt).toBeGreaterThan(0);
    const branch = health.slice(coachAt, health.indexOf("navigation.navigate('PlanBuilder', { inputs });"));
    expect(branch).toContain('await app.completeOnboarding(');
    expect(branch).toMatch(/return;\s*\}\s*$/);
  });

  it('sign-in from the invite returns to the invite, which finishes the join itself', () => {
    const auth = read('src/screens/onboarding/Authentication.tsx');
    expect(auth.split('if (afterCoach && navigation.canGoBack()) {').length - 1).toBe(2);
    const join = read('src/screens/trainee/CoachJoin.tsx');
    expect(join).toContain("navigation.navigate('Authentication', { after: 'coach' });");
    expect(join).toMatch(/addListener\('focus'[\s\S]{0,300}joinOnReturn\.current = false;\s*void join\(\);/);
  });
});

describe('⛔ law 6 — leaving takes nothing, and says so before the press', () => {
  it('the row opens a confirmation; only the confirmation leaves', () => {
    const src = read('src/screens/trainee/MyCoach.tsx');
    expect(src).toMatch(/onLeave=\{\(\) => \{\s*setErrorKey\(null\);\s*setConfirming\(true\);\s*\}\}/);
    expect(src.split('coach.leave()').length - 1).toBe(1);
    expect(src.indexOf('coach.leave()')).toBeGreaterThan(src.indexOf('async function onConfirmLeave()'));
  });

  it('the confirmation states the cost — the week stays, 30 days — and the Pro line names the coach', () => {
    const base = {
      coachName: 'Dana', since: '02.09', weekNumber: 3, consent: { bodyweight: true, cardio: false }, saving: false, errorKey: null,
      leaving: false, onConsent: () => {}, onLeave: () => {}, onConfirmLeave: () => {}, onCancelLeave: () => {}, onBack: () => {},
    };
    let r;
    act(() => {
      r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}><MyCoachView {...base} confirming /></SafeAreaProvider>);
    });
    const all = textsOf(r);
    const cost = tg('coachTrack.athlete.leaveFoot', { coach: 'Dana' });
    expect(cost).toContain('30');
    expect(all.filter((x) => x.includes('30')).length).toBeGreaterThanOrEqual(1);
    expect(all.some((x) => x.includes(tg('coachTrack.athlete.leaveConfirmPro')))).toBe(true);
    expect(all.some((x) => x.includes('FERROX Pro') && x.includes('Dana'))).toBe(true);
    act(() => r.unmount());
  });
});
