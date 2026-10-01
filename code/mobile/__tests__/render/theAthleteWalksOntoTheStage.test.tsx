/**
 * ✦ THE ATHLETE WALKS ONTO THE STAGE (2026-09-30) — `components/FigureFlight`, choreographed for real.
 *
 * What it promises, and what this holds it to:
 *   · Begin lifts a still of the first lift off Today's box and it appears there, over everything;
 *   · the stage's own athlete is held back (invisible) while the traveller is in the air, and only
 *     for the lift the traveller is bound for;
 *   · when the stage reports its box, the traveller flies there, lands, fades, and hands over;
 *   · a stage that never reports is not waited on — the traveller fades where it is;
 *   · with no source registered (a resumed workout, another door) nothing happens at all.
 */
// @ts-nocheck

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated, Text } from 'react-native';
import {
  FigureFlightHost,
  landFigureFlight,
  launchFigureFlight,
  registerFlightSource,
  useFlightHold,
} from '@/components/FigureFlight';

const box = (x, y, width, height) => ({ measureInWindow: (cb) => cb(x, y, width, height) });

function Probe({ id }) {
  return <Text>{useFlightHold(id) ? 'held' : 'free'}</Text>;
}

let timing;
beforeEach(() => {
  jest.useFakeTimers();
  // Animated.timing completes on the next tick — the choreography, not the easing, is under test.
  timing = jest.spyOn(Animated, 'timing').mockImplementation((v, cfg) => ({
    start: (cb) => {
      v.setValue(cfg.toValue);
      setTimeout(() => cb && cb({ finished: true }), 0);
    },
    stop: () => {},
  }));
});
afterEach(() => {
  timing.mockRestore();
  registerFlightSource(null);
  jest.useRealTimers();
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    jest.runOnlyPendingTimers();
  });
};

describe('✦ the athlete walks onto the stage', () => {
  it('lifts off, holds the stage’s own figure, lands on the reported box, and hands over', async () => {
    let r;
    act(() => {
      r = renderer.create(
        <>
          <FigureFlightHost />
          <Probe id="bb_bench_press" />
          <Probe id="bb_back_squat" />
        </>,
      );
    });
    registerFlightSource(box(20, 180, 300, 210));
    await act(async () => {
      await launchFigureFlight('bb_bench_press', 'male');
    });
    const texts = () => r.root.findAllByType(Text).map((t) => t.props.children);
    // in the air: the bench's stage figure waits; another lift's would not
    expect(texts()).toEqual(['held', 'free']);
    // the traveller is drawn — a layer with an SVG in it, over everything
    expect(r.root.findAll((n) => n.props?.pointerEvents === 'none').length).toBeGreaterThan(0);

    act(() => landFigureFlight('bb_bench_press', { x: 24, y: 260, width: 340, height: 260 }));
    await flush();
    await flush();
    // landed and handed over: the stage's own athlete is free, the layer is gone
    expect(texts()).toEqual(['free', 'free']);
  });

  it('a stage that never reports is not waited on', async () => {
    let r;
    act(() => {
      r = renderer.create(
        <>
          <FigureFlightHost />
          <Probe id="bb_deadlift" />
        </>,
      );
    });
    registerFlightSource(box(20, 180, 300, 210));
    await act(async () => {
      await launchFigureFlight('bb_deadlift', 'female');
    });
    expect(r.root.findByType(Text).props.children).toBe('held');
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await flush();
    expect(r.root.findByType(Text).props.children).toBe('free');
  });

  it('with no source on screen, Begin simply opens the stage', async () => {
    let r;
    act(() => {
      r = renderer.create(
        <>
          <FigureFlightHost />
          <Probe id="bb_deadlift" />
        </>,
      );
    });
    await act(async () => {
      await launchFigureFlight('bb_deadlift', 'male');
    });
    expect(r.root.findByType(Text).props.children).toBe('free');
    // …nor for a lift with no rig
    registerFlightSource(box(0, 0, 100, 100));
    await act(async () => {
      await launchFigureFlight('not_a_lift', 'male');
    });
    expect(r.root.findByType(Text).props.children).toBe('free');
  });
});
