/**
 * 2.5 · WHAT THIS SESSION EARNED — mounted for real.
 *
 * The handoff draws FOUR kinds of news on this screen and the code drew three. Loop 3's decision —
 * "Chest earned a set · 3 → 4" — arrives inside `sessionEarned` like any other change but is keyed
 * by a MUSCLE and carries no load, so the ledger ran it through `exerciseDisplayName` and rendered
 * it as a lift that held at nothing: the muscle's raw name, the word "holds", and a blank where the
 * figure goes. The one decision on this screen that is about the shape of the WEEK read as a
 * rendering fault, and no typecheck could see it.
 *
 * So this mounts the beat and asks what the athlete actually reads.
 */
// @ts-nocheck

// 

import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SessionEarned, type EarnedLine, type VolumeMove } from '@/screens/session/WellDone';
import { initI18n, tg } from '@/i18n';

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
function draw(props: { decisions?: EarnedLine[]; volume?: VolumeMove[]; answered?: boolean }): string {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SessionEarned
        /* ⛔ THE POSTER — the facts this screen leads with (founder 2026-08-04). */
        poster={{
          hero: { kind: 'tonnes', value: 4.2 },
          minutes: 58,
          kcal: 412,
          tonnes: 4.2,
          sets: 19,
          lifts: [
          { exerciseId: 'bb_back_squat', load: 60, unit: 'kg', reps: [8, 7, 8, 7] },
          { exerciseId: 'bb_rdl', load: 50, unit: 'kg', reps: [9, 8, 8] },
          { exerciseId: 'leg_press', load: 120, unit: 'kg', reps: [11, 10, 10] },
          ],
        }}
        workoutName="Lower A"
        savedLegend="Upper A · Saved"
        partial={false}
        durationLabel="52"
        kcal={412}
        tonnes={11.7}
        answered={props.answered ?? true}
        decisions={props.decisions ?? []}
        volume={props.volume ?? []}
        onDone={() => {}}
        onRecord={() => {}}
      />,
    );
  });
  mounted.push(r);
  /*
   * ⛔ THE DECISIONS MOVED BEHIND A DOOR (founder 2026-08-05): *"underneath, a nicely framed box
   * saying X decisions were made based on this workout, and pressing it opens the screen of what
   * changed."*
   *
   * So this presses it. Every assertion below is about what the ROWS say, which is unchanged and is
   * what this suite exists for — the four kinds of news, each drawn as itself. What the poster does
   * with them before she asks is a different law (`aCountAndItsRowsAreOneDerivation`).
   */
  act(() => {
    for (const node of r.root.findAll((n) => typeof n.props?.accessibilityLabel === 'string')) {
      if (/decision/i.test(String(node.props.accessibilityLabel)) && typeof node.props.onPress === 'function') {
        node.props.onPress();
        break;
      }
    }
  });
  return r.root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
    })
    .join('\n');
}
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const RAISE: EarnedLine = {
  key: 'bb_bench_press',
  name: 'Barbell Bench Press',
  from: '34',
  to: '41',
  held: false,
  reason: { key: 'explain.progressLoad.text', params: { ex: 'Barbell Bench Press', delta: 7 } },
};

describe('2.5 says everything the workout decided', () => {
  it('names the lift, both loads, and the sentence that earned the change', () => {
    const out = draw({ decisions: [RAISE] });
    expect(out).toContain('34');
    expect(out).toContain('→ 41');
    expect(out).toContain('so I added 7 kg');
  });

  it("Loop 3's set is a sentence with a set count — never a lift holding at nothing", () => {
    const out = draw({ decisions: [RAISE], volume: [{ muscle: 'Chest', setsFrom: 3, setsTo: 4, reason: null }] });
    expect(out).toContain('Chest earned a set');
    expect(out).toContain('→ 4');
    // The exact bug: the muscle drawn as a held LIFT. "holds" may legitimately appear for a real
    // held lift, so this pins the shape that only the fault produces — the word with no figure after
    // it — and the raw muscle name standing alone as a row title.
    expect(out).not.toMatch(/^holds\s*$/m);
    expect(out.split('\n')).not.toContain('Chest');
  });

  it('a trimmed muscle is drawn too, in its own words', () => {
    const out = draw({ volume: [{ muscle: 'Quads', setsFrom: 5, setsTo: 4, reason: null }] });
    // "Quad", singular, was the ENGINE'S TOKEN: the English `muscle` block mapped every name to its
    // internal id (`"Quads": "quad"`), so this row — and the body map, the wrist, and Home's muscle
    // line — said "quad" to her. This asserted the fault. Her muscle is called Quads.
    expect(out).toContain('Quads gave a set back');
    expect(out).toContain('→ 4');
  });

  it('…and it SAYS WHY, like every other row — the engine’s own sentence', () => {
    // It shipped with the figures and no reason at all: the one decision on the screen that would
    // not answer the question the screen exists to answer (founder 2026-07-29).
    const out = draw({
      volume: [{ muscle: 'Chest', setsFrom: 3, setsTo: 4, reason: { key: 'explain.volumeUp.text', params: { muscle: 'chest' } } }],
    });
    expect(out).toContain('so I added a set for more');
  });

  it('a volume move ALONE is a decision — the screen must not claim everything held', () => {
    // `decisions` is empty here, which used to be the whole test for "nothing changed". A workout
    // that moved no load but grew a muscle's week changed something, and saying otherwise is a lie
    // sitting directly under the row that proves it.
    const out = draw({ volume: [{ muscle: 'Chest', setsFrom: 3, setsTo: 4, reason: null }] });
    expect(out).not.toContain('Nothing needed moving');
  });

  it('…and a workout that really decided nothing still says so', () => {
    expect(draw({})).toContain('Nothing needed moving');
  });

  it('⛔ AND THERE IS NO LONGER A "STILL READING" STATE TO WAIT FOR', () => {
    /*
     * ⛔ FOUNDER, 2026-08-12: *"כבר לא רלוונטי לדעתי כי זה היה כאשר היה את ה-AI. אפשר למחוק ולוודא
     * שכל הצינור הזה סגור."*
     *
     * `answered` was false for the ~15 s the post-session MODEL call took, and this pinned the one
     * thing that mattered about it: an empty ledger mid-flight is not a verdict. **The call is no
     * longer made** — `sessionStore` dropped `askAfterSession` the same day, because the engine owns
     * the programme after every session — so the prop, the branch and its copy are deleted.
     *
     * ⚠️ THE ENGINE ANSWERS IN A MILLISECOND, which is why this is a deletion and not a default:
     * there is no interval left in which the ledger could be read too early.
     */
    const flow = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src/screens/session/WellDone.tsx'),
      'utf8',
    );
    expect(flow).not.toContain('answered: boolean');
    expect(flow).not.toContain("t('complete.stillReading')");
    /*
     * ⚠️ ASSERTED ON THE IMPORT, NOT ON THE CALL. `sessionStore` still QUOTES the deleted line in
     * the comment that explains why it went — "This line was `void askAfterSession(saved)`" — so a
     * substring check on the call text passes only while nobody documents the deletion. The import
     * is the thing that cannot be present without the pipe being open.
     */
    expect(fs.readFileSync(path.join(__dirname, '..', '..', 'src/state/stores/sessionStore.tsx'), 'utf8'))
      .not.toMatch(/^import .*askAfterSession/m);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE SHEET IS THE SCREEN WHILE IT IS OPEN, AND THE NAME IS SAID ONCE.
 *
 * FOUNDER'S SCREENSHOT, 2026-08-18: the cream "Finish workout" button and the "View session record"
 * link were drawn **across the middle of the decision list**, with the fifth lift's "12 → 13"
 * continuing underneath them and the footer's hairline ruled through the sheet.
 *
 * `sheetWrap` is `StyleSheet.absoluteFillObject` and the footer is its next sibling, so the footer
 * simply painted above it — and stayed pressable, which is the half the screenshot cannot show: the
 * one control that ENDS the workout, live, over a list she had opened to read.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⛔ the decisions sheet is not shared with the footer', () => {
  /** Mount, open the sheet, and hand back the tree — `draw` above only returns text. */
  /** The same mount `draw` uses, held with the sheet already open. */
  function open(props: { decisions?: EarnedLine[] }): ReactTestRenderer {
    let r!: ReactTestRenderer;
    act(() => {
      r = renderer.create(
        <SessionEarned
          poster={{ hero: { kind: 'tonnes', value: 4.2 }, minutes: 58, kcal: 412, tonnes: 4.2, sets: 19, lifts: [] }}
          workoutName="Lower A"
          savedLegend="Upper A · Saved"
          partial={false}
          durationLabel="52"
          kcal={412}
          tonnes={11.7}
          answered
          decisions={props.decisions ?? []}
          volume={[]}
          onDone={() => {}}
          onRecord={() => {}}
          previewSheetOpen
        />,
      );
    });
    mounted.push(r);
    return r;
  }

  const pressableLabels = (r: ReactTestRenderer) =>
    r.root
      .findAll((n) => typeof n.props?.accessibilityLabel === 'string' && typeof n.props?.onPress === 'function')
      .map((n) => String(n.props.accessibilityLabel));

  it('the act that ENDS the workout is not reachable behind the open sheet', () => {
    expect(pressableLabels(open({ decisions: [RAISE] })).join(' ')).not.toContain(tg('complete.finishWorkout'));
  });

  it('⚠️ …nor is the story door, the footer’s one remaining quiet line (the record link is gone — the Log owns the table)', () => {
    expect(pressableLabels(open({ decisions: [RAISE] })).join(' ')).not.toContain(tg('complete.shareStory'));
  });
});

describe('⛔ a decision states its lift once, not twice in forty points', () => {
  it('the sentence under the name does not repeat the name', () => {
    /*
     * The row draws "Barbell Bench Press" as its heading with the figures beside it, and then read
     * *"Barbell Bench Press met its target on every set, so I added 2.5 kg."* — the name twice
     * inside forty points, four times down one screen. The screen's own law: a screen that states a
     * fact its own content already draws is spending its room on a caption.
     *
     * The sentence is the ENGINE's and is shared by three surfaces (this sheet, the weekly letter's
     * rows, the WHY sheet) — and every one of them already draws the lift's name above it, which is
     * why the fix belongs in the line rather than in one renderer.
     */
    const out = draw({ decisions: [RAISE] });
    expect(out).toContain('Barbell Bench Press'); // the heading
    expect(out.split('Barbell Bench Press').length - 1).toBe(1);
    expect(out).toContain('so I added 7 kg');
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE CLOSING SCREEN IS NOT BLANK WHILE THE DISK THINKS (found 2026-08-18).
 *
 * The legend, the facts, the partial line and the decisions box all sat inside `{poster ? … }`.
 * `poster` is built from the HISTORY read — so it is null on every render before that read lands,
 * and null FOR EVER if `db.loadHistory()` rejects, which the screen's own catch allows. What she got
 * for finishing a workout was a black page carrying "Finish workout" and nothing else; under Reduce
 * Motion the result is the FIRST beat, so that was the whole screen, every completion, until the
 * disk answered.
 *
 * Everything here is built from route params and props. Only the hero is a fact about her record.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⛔ what she is owed the moment the whistle goes', () => {
  /** The same beat with NO poster — the state every completion passes through. */
  function drawWithoutPoster(props: { decisionsKnown?: boolean } = {}): string {
    let r!: ReactTestRenderer;
    act(() => {
      r = renderer.create(
        <SessionEarned
          poster={null}
          workoutName="Lower A"
          savedLegend="Upper A · Saved"
          partial
          durationLabel="52"
          kcal={412}
          tonnes={11.7}
          decisions={[RAISE]}
          decisionsKnown={props.decisionsKnown}
          volume={[]}
          onDone={() => {}}
          onRecord={() => {}}
        />,
      );
    });
    mounted.push(r);
    return r.root
      .findAllByType(Text)
      .map((n) => {
        const c = n.props.children;
        return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
      })
      .join('\n');
  }

  it('the workout is named, the facts are stated and the decisions are reachable — with no poster at all', () => {
    const out = drawWithoutPoster();
    // The legend is drawn by `Legend`, which sets it in the product's own caps.
    expect(out.toUpperCase()).toContain('UPPER A · SAVED'); // what was saved
    expect(out).toContain('Lower A'); // …and the workout is named under the mark
    expect(out).toContain('52'); // the minutes she spent
    expect(out).toContain('412'); // …and the calories
    expect(out).toContain('1'); // the decisions box states its count
    expect(out).toContain(tg('complete.partialTitle')); // …and an early finish still says so
  });

  it('⛔ a verdict she has not been given is not drawn — an unread engine is not a workout that held', () => {
    /*
     * The read's own catch used to `setEarned([])`, and an empty list is drawn as "every lift held".
     * A storage error was therefore reported to her as the engine's verdict on her workout. The box
     * holds its tongue instead: a hold is a real result and is owed to her, but only when it is one.
     */
    let r!: ReactTestRenderer;
    act(() => {
      r = renderer.create(
        <SessionEarned
          poster={null}
          savedLegend="Upper A · Saved"
          partial={false}
          durationLabel="52"
          kcal={412}
          tonnes={11.7}
          decisions={[]}
          decisionsKnown={false}
          volume={[]}
          onDone={() => {}}
          onRecord={() => {}}
        />,
      );
    });
    mounted.push(r);
    const out = r.root
      .findAllByType(Text)
      .map((n) => String(n.props.children ?? ''))
      .join('\n');
    expect(out).not.toContain(tg('complete.everythingHeld'));
    // …and the facts she actually earned are still on the screen.
    expect(out).toContain('52');
  });
});

/**
 * ⛔ TWO FOLDS OVER ONE BLOB (found 2026-08-18) — asserted on the source, because the damage is not
 * visible on this screen at all.
 *
 * `sessionEarned` and `sessionForward` both run `foldEngine`: an unlocked load-mutate-save of
 * `hush.engine.v5` plus a read-modify-write of `hush.preferences`. Fired together, the second save
 * writes over whatever the first enacted — a graduation or a retirement simply gone, and the lift
 * the engine had just dropped back in her week the following Monday. Nothing is wrong on the closing
 * screen; it is wrong seven days later, which is why a law rather than a render test.
 */
describe('⛔ the two engine reads do not race each other', () => {
  const flow = fs.readFileSync(path.join(__dirname, '..', '..', 'src/screens/session/WellDone.tsx'), 'utf8');

  it('the second read starts after the first has finished', () => {
    expect(flow).toContain('await Promise.resolve(app.model.sessionEarned?.({ startedAtMs }))');
    expect(flow).toContain('await Promise.resolve(app.model.sessionForward?.({ startedAtMs }))');
    // …and neither is fired and forgotten alongside the other, which is what made them concurrent.
    expect(flow).not.toContain('void Promise.resolve(app.model.sessionForward');
    expect(flow).not.toContain('void Promise.resolve(app.model.sessionEarned');
  });
});
