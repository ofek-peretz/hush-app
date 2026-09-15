// @ts-nocheck
// 
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TimeStage, DistanceStage, clockOf, distanceOf } from '@/screens/session/ItemStage';
import { initI18n, tg } from '@/i18n';

/**
 * ════ THE STAGE RUNS EVERY SHAPE ════
 *
 * "Any goal" was a claim until the stage could run something that is not a weight for a number of
 * reps. These are the three that were missing, and the line every one of them carries.
 *
 * The instruction (`say`) gets its own assertions because it is the element most likely to be
 * deleted by someone applying the app's own law — *a label that explains a control steals its job*
 * — to a line that is not explaining a control. "Take this to a rep short of failure" cannot be
 * inferred from anything on screen; it is the coaching.
 */

beforeAll(async () => { await initI18n(); });
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { while (mounted.length) mounted.pop()!.unmount(); }); });

function draw(node: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = renderer.create(node); });
  mounted.push(r);
  return r;
}

function textOf(r: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    (n as { children?: unknown[] } | null)?.children?.forEach(walk);
  };
  walk(r.toJSON());
  return out.join(' ');
}

function press(r: ReactTestRenderer, label: string): void {
  const btn = r.root.findAll((n) => n.props?.accessibilityLabel === label)[0];
  act(() => { btn.props.onPress(); });
}

describe('a held duration', () => {
  const item = { kind: 'time', ex: 'plank', seconds: 45, say: 'Ribs down, breathe.' } as const;

  it('shows the duration as a clock and does not start on its own', () => {
    const r = draw(<TimeStage item={item} name="Plank" onDone={jest.fn()} />);
    expect(textOf(r)).toContain('0:45');
    // A plank timer that begins while she is still walking to the mat has measured the walk.
    act(() => { jest.advanceTimersByTime(5000); });
    expect(textOf(r)).toContain('0:45');
  });

  it('counts down once she starts it', () => {
    const r = draw(<TimeStage item={item} name="Plank" onDone={jest.fn()} />);
    press(r, tg('workout.itemStart'));
    act(() => { jest.advanceTimersByTime(5000); });
    expect(textOf(r)).toContain('0:40');
  });

  it('ends itself at zero with the full duration — nothing to confirm at the end of a plank', () => {
    const onDone = jest.fn();
    const r = draw(<TimeStage item={item} name="Plank" onDone={onDone} />);
    press(r, tg('workout.itemStart'));
    act(() => { jest.advanceTimersByTime(45000); });
    expect(onDone).toHaveBeenCalledWith(45);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('reports what she ACTUALLY held when she stops early — that is the measurement', () => {
    const onDone = jest.fn();
    const r = draw(<TimeStage item={item} name="Plank" onDone={onDone} />);
    press(r, tg('workout.itemStart'));
    act(() => { jest.advanceTimersByTime(20000); });
    press(r, tg('workout.itemStop'));
    expect(onDone).toHaveBeenCalledWith(20);
  });

  it('never reports twice, however the item ends', () => {
    const onDone = jest.fn();
    const r = draw(<TimeStage item={item} name="Plank" onDone={onDone} />);
    press(r, tg('workout.itemStart'));
    act(() => { jest.advanceTimersByTime(20000); });
    press(r, tg('workout.itemStop'));
    act(() => { jest.advanceTimersByTime(60000); }); // the clock would have hit zero
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('says the coach\'s instruction', () => {
    const r = draw(<TimeStage item={item} name="Plank" onDone={jest.fn()} />);
    expect(textOf(r)).toContain('Ribs down, breathe.');
  });
});

describe('a distance to cover', () => {
  it('states the figure in the unit she would say out loud', () => {
    const carry = { kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24 } as const;
    const r = draw(<DistanceStage item={carry} name="Farmer’s Carry" onDone={jest.fn()} />);
    // The name rides in the chrome's Legend, which draws it uppercased — compare on the words.
    const read = textOf(r).toUpperCase();
    expect(read).toContain('40');
    expect(read).toContain('M');
    expect(read).toContain('FARMER’S CARRY');
  });

  it('names the load she is carrying, because nothing else on the stage does', () => {
    const carry = { kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24 } as const;
    expect(textOf(draw(<DistanceStage item={carry} name="Carry" onDone={jest.fn()} />))).toContain('24');
  });

  it('shows no load row at all when there is nothing to carry', () => {
    const sprint = { kind: 'distance', ex: 'sprint', metres: 30 } as const;
    const read = textOf(draw(<DistanceStage item={sprint} name="Sprint" onDone={jest.fn()} />)).toUpperCase();
    // Not a row reading "Carrying — kg": the row is absent entirely when there is nothing to carry.
    expect(read).not.toContain(tg('workout.itemCarrying', { load: 24 }).split('{')[0].trim().toUpperCase());
    expect(read).toContain('30');
  });

  it('hands over on her word — there is nothing for the phone to measure', () => {
    const onDone = jest.fn();
    const sprint = { kind: 'distance', ex: 'sprint', metres: 30 } as const;
    const r = draw(<DistanceStage item={sprint} name="Sprint" onDone={onDone} />);
    press(r, tg('workout.itemDone'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

/*
 * ⛔ `OpenStage` IS DELETED, AND SO ARE THE TWO TESTS THAT MOUNTED IT (founder, 2026-08-12).
 *
 * They proved the stage gave the coach's instruction the whole screen and invented no figure —
 * which it did, faithfully, for a shape the product could not do anything else with. **An item the
 * app cannot measure is an item it cannot coach**, and a law is not a reason to keep one.
 */
describe('the readings', () => {
  it('reads a clock the same way the rest ring does', () => {
    expect([0, 5, 45, 60, 90, 600, 3599].map(clockOf)).toEqual(
      ['0:00', '0:05', '0:45', '1:00', '1:30', '10:00', '59:59'],
    );
    expect(clockOf(-5)).toBe('0:00'); // never a negative clock
  });

  it('reads a distance in the unit the athlete would say', () => {
    /*
     * ⛔ THE UNITS WERE LATIN LITERALS AND THIS TEST PINNED THEM (2026-08-28). It asserted
     * `unit: 'm'` and `unit: 'km'` — the English strings `distanceOf` returned without ever asking
     * the locale — so a Hebrew athlete read `40 m` on the carry stage while every other surface in
     * the app said `מ׳`. The law was doing its real job (the RECORD is metres always; only the
     * READING changes) through literals that also froze the language.
     *
     * It asks the product for the words now, so what it pins is the RULE: under a kilometre the
     * reading is metres, at or above it kilometres, and the figure is exact when it can be.
     */
    const m = tg('cardio.metresUnit');
    const km = tg('cardio.km');
    expect(m).not.toBe(km); // the guard on the guard — two units, or this proves nothing
    expect(distanceOf(30, tg)).toEqual({ figure: '30', unit: m });
    expect(distanceOf(400, tg)).toEqual({ figure: '400', unit: m });
    expect(distanceOf(1000, tg)).toEqual({ figure: '1', unit: km });
    expect(distanceOf(5000, tg)).toEqual({ figure: '5', unit: km });
    expect(distanceOf(18000, tg)).toEqual({ figure: '18', unit: km });
    expect(distanceOf(2500, tg)).toEqual({ figure: '2.5', unit: km });
  });
});
