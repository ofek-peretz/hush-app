/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY GALLERY ENTRY ACTUALLY RENDERS — the smoke net, 2026-08-25.
 *
 * The visual sweep opened entry 4.2a and got a red "This screen threw" page. `ImportReview` is a
 * COMPONENT that `ImportPlan` renders inline with direct props; the fixture reached it through
 * `mount()`, which hands everything to `route.params`. Every prop arrived `undefined` and
 * `findings.length` threw on the first line of the body.
 *
 * ── WHY A LAW AND NOT A LESSON ──────────────────────────────────────────────────────────────────
 * That entry had been broken for as long as it had existed, and NOTHING could tell us: tsc is happy
 * (the file is `@ts-nocheck` by necessity — it mounts ~120 screens against partial fixtures), no
 * test rendered it, and the only way to find out was for a human to open that one hash in a browser.
 * The import report is a feature with no competitor equivalent, and in the one place a person
 * reviews screens it was an error page.
 *
 * A screen nobody can review is the screen that rots. So the crash class does not get to depend on
 * someone looking any more: every entry is rendered here, headless, on every commit.
 *
 * ⚠️ THIS IS A SMOKE NET, NOT A DESIGN REVIEW. It asserts one thing — the entry produces a tree
 * instead of an exception. It says nothing about whether the screen is right, which is still a job
 * for eyes. Its whole value is that it makes the eyes' time worth spending.
 *
 * ── ON THE BROWSER HARNESS, RECORDED HERE BECAUSE IT COST TWO SESSIONS ──────────────────────────
 * The expo-web gallery kept "dying" after 6–8 captures. It was never dying. Measured across twelve
 * navigations the page held flat — heap 27–31 MB, node count stable, viewport constant — while
 * `document.visibilityState` read **"hidden"**, `hasFocus` false and `window.outerWidth` **0**.
 * A hidden Chrome tab is throttled to zero `requestAnimationFrame` callbacks, so no frame is ever
 * committed, so `Page.captureScreenshot` waits its full 30 s and times out; `outerWidth: 0` is the
 * "viewport 0x0" error verbatim. **Keep the Chrome window in the foreground while capturing.**
 * Nothing in Hush was ever at fault, and no amount of restarting the server would have helped.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { initI18n } from '@/i18n';
import { GALLERY } from '@/screens/dev/gallery';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => {},
  useIsFocused: () => true,
  useNavigation: () => ({
    navigate: () => {},
    goBack: () => {},
    push: () => {},
    pop: () => {},
    replace: () => {},
    setOptions: () => {},
    addListener: () => () => {},
    canGoBack: () => true,
  }),
  useRoute: () => ({ key: 'k', name: 'n', params: {} }),
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
});

/** Entries a reviewer is meant to be able to open — `todo`/`cancelled` rows draw the Index card. */
const live = GALLERY.filter((g) => typeof g.render === 'function' && g.status !== 'todo' && g.status !== 'cancelled');

describe('every gallery entry actually renders', () => {
  it('the gallery still has a body worth sweeping', () => {
    expect(live.length).toBeGreaterThan(90);
  });

  it('⛔ not one entry throws when it is mounted', () => {
    const broken: string[] = [];
    for (const entry of live) {
      let tree: renderer.ReactTestRenderer | null = null;
      try {
        act(() => {
          tree = renderer.create(
            <SafeAreaProvider initialMetrics={METRICS}>{entry.render()}</SafeAreaProvider>,
          );
        });
      } catch (e) {
        broken.push(`${entry.id} (${entry.label}): ${(e as Error).message.split('\n')[0]}`);
      } finally {
        try {
          act(() => {
            tree?.unmount();
          });
        } catch {
          /* an unmount that throws is its own bug, but it is not THIS law's */
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
