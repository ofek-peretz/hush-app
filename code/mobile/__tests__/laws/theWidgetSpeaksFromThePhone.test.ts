/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WIDGET SPEAKS FROM THE PHONE — the home-screen Today widget (founder, 2026-08-23:
 * *"קח את האפליקציה שלנו לקצה בבקשה בכל תחום ותחום"* — deferred by name since the world-class
 * pass, shipped with the build cycle it was waiting for).
 *
 * The division this law holds is the one notifications settled: a widget process cannot run JS,
 * so EVERY word is baked on the phone (`platform/homeWidget`, through `tg()` — her language, her
 * gender) and the Swift side (`HushTodayWidget.swift`) draws strings and dots and decides nothing.
 *
 * And the widget is the product's FACE on her phone, so it obeys Home's own rulings:
 *   · never a trial meter, a paywall, or a countdown (A.14 took the countdown off Home itself);
 *   · a finished week states the fact, it does not exhort ("The week is behind you." — no
 *     "come back", no guilt: Decision 1's no-past-timeframes spirit, on the OS surface too);
 *   · no plan yet → NO snapshot, and the widget shows a quiet brand placeholder — never an
 *     invented workout.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';
import { composeWidgetSnapshot, updateHomeWidget } from '@/platform/homeWidget';
import { tg } from '@/i18n';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const W = (id: string, name: string, lifts = 5, minutes = 42) => ({ id, name, lifts, minutes });

describe('the snapshot is composed, finished, on the phone', () => {
  it('leads with the NEXT workout and its price, and the dots carry the week', () => {
    const snap = composeWidgetSnapshot(
      [W('coach_a', 'Upper A'), W('coach_b', 'Lower A', 6, 48), W('coach_c', 'Upper B')],
      ['coach_a'],
    );
    expect(snap).not.toBeNull();
    expect(snap!.title).toBe('Lower A');
    expect(snap!.sub).toBe(tg('program.dayMeta', { exercises: 6, min: 48 }));
    expect(snap!.weekLabel).toBe(tg('widget.week', { done: 1, total: 3 }));
    expect(snap!.dots).toEqual([true, false, false]);
    expect(snap!.done).toBe(false);
  });

  it('a finished week states the fact — full dots, no exhortation', () => {
    const snap = composeWidgetSnapshot([W('coach_a', 'Upper A')], ['coach_a']);
    expect(snap!.done).toBe(true);
    expect(snap!.title).toBe(tg('widget.weekDone'));
    expect(snap!.dots).toEqual([true]);
    expect(snap!.sub).toBe('');
  });

  it('no plan → null — the widget keeps its placeholder rather than inventing a workout', () => {
    expect(composeWidgetSnapshot([], [])).toBeNull();
  });

  it('…and off-device the writer resolves quietly (this jest runtime has no bridge)', async () => {
    await expect(updateHomeWidget()).resolves.toBeUndefined();
  });
});

describe('the Swift side draws and decides nothing', () => {
  const swift = read('targets/widget/HushTodayWidget.swift');

  it('reads exactly the suite and key the bridge writes', () => {
    const bridge = read('modules/hush-home-widget/ios/HushHomeWidgetModule.swift');
    for (const src of [swift, bridge]) {
      expect(src).toContain('group.com.hushfitness.app');
      expect(src).toContain('hush.widget.today');
    }
  });

  it('carries no trial, no paywall, no countdown — the face obeys Home’s rulings', () => {
    // CODE only — the file's own header states this rule in prose, which is not a violation of it.
    const code = swift
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    expect(code).not.toMatch(/trial|paywall|remaining/i);
  });

  it('is in the bundle', () => {
    expect(read('targets/widget/HushWidgetBundle.swift')).toContain('HushTodayWidget()');
  });
});

describe('the build carries the App Group — or says exactly why it does not yet', () => {
  /* ⛔ PARKED FOR BUILD 58 (see `IOS_CAPABILITIES_PENDING.md` and the twin note in
     `theAccountIsHerAppleId`): the App Group must exist on both App IDs before Xcode will sign
     it. Declared, or documented — never silently dropped. */
  const GROUP = 'group.com.hushfitness.app';

  it('app.json: the app’s entitlements AND the widget extension’s — or the pending doc', () => {
    const app = JSON.parse(read('app.json'));
    const ent = app.expo.ios.entitlements['com.apple.security.application-groups'];
    if (ent) {
      expect(ent).toEqual([GROUP]);
      const ext = app.expo.extra.eas.build.experimental.ios.appExtensions.find(
        (x: { bundleIdentifier: string }) => x.bundleIdentifier === 'com.hushfitness.app.widget',
      );
      expect(ext.entitlements['com.apple.security.application-groups']).toEqual([GROUP]);
      return;
    }
    const pending = read('IOS_CAPABILITIES_PENDING.md');
    expect(pending).toContain(GROUP);
    expect(pending).toContain('App Groups');
  });

  it('…and the target config carries it, declared or written out in its own note', () => {
    expect(read('targets/widget/expo-target.config.js')).toContain(`'com.apple.security.application-groups': ['${GROUP}']`);
  });
});

describe('the widget is told when the week moves', () => {
  it('boot and every completed session both reload it — fire-and-forget', () => {
    const app = read('src/state/stores/appStore.tsx');
    expect(app.split('void updateHomeWidget()').length - 1).toBe(2);
  });
});
