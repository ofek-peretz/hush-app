/**
 * ✦ THE NUMBER ARRIVES BY COUNTING (design audit, 2026-09-29) — `ds/CountUp`, mounted for real.
 *
 * What it promises, and what this holds it to:
 *   · with no layout (a snapshot, this renderer) it reads the TRUE value — never a zero;
 *   · once laid out it starts from zero, padded to the final width so a centred hero never slides;
 *   · it lands exactly on the final string, and says so once (`onLanded`, where a haptic hangs);
 *   · VoiceOver is told the final value throughout.
 */
// @ts-nocheck

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { CountUp } from '@/components/ds/CountUp';

const FIGURE_SPACE = ' ';

function flat(children): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(flat).join('');
  return children.props ? flat(children.props.children) : '';
}
const shown = (r) => flat(r.root.findAllByType(Text)[0].props.children);

beforeEach(() => {
  jest.useFakeTimers();
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('✦ the number arrives by counting', () => {
  it('reads the true value before it is ever laid out', () => {
    let r;
    act(() => {
      r = renderer.create(<CountUp value="62.5" />);
    });
    expect(shown(r)).toBe('62.5');
    expect(r.root.findAllByType(Text)[0].props.accessibilityLabel).toBe('62.5');
  });

  it('counts from zero at the final width, lands on the final string, and says so once', () => {
    const landed = jest.fn();
    let r;
    act(() => {
      r = renderer.create(<CountUp value="142.5" durationMs={600} onLanded={landed} />);
    });
    const text = r.root.findAllByType(Text)[0];
    act(() => {
      text.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 40 } } });
    });
    // the first frame: zero, padded with figure spaces to "142.5"'s five characters
    expect(shown(r)).toBe(`${FIGURE_SPACE}${FIGURE_SPACE}0.0`);
    expect(shown(r)).toHaveLength('142.5'.length);
    // halfway there it is a number between, still at the final width, never past the target
    act(() => {
      jest.advanceTimersByTime(300);
    });
    const mid = Number(shown(r).replace(new RegExp(FIGURE_SPACE, 'g'), ''));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(142.5);
    expect(shown(r)).toHaveLength(5);
    // and it lands
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(shown(r)).toBe('142.5');
    expect(landed).toHaveBeenCalledTimes(1);
    // a second layout (a rotation, a font arriving) does not count it again
    act(() => {
      text.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 40 } } });
      jest.advanceTimersByTime(700);
    });
    expect(shown(r)).toBe('142.5');
    expect(landed).toHaveBeenCalledTimes(1);
  });

  it('a value that is not a plain number is drawn as it is, and never counted', () => {
    let r;
    act(() => {
      r = renderer.create(<CountUp value="3/3" />);
    });
    act(() => {
      r.root.findAllByType(Text)[0].props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 1, height: 1 } } });
      jest.advanceTimersByTime(1000);
    });
    expect(shown(r)).toBe('3/3');
  });
});
