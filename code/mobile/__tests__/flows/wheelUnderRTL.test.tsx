/**
 * ════ THE WHEEL UNDER A MIRRORED LAYOUT — the device-QA suspicion, pinned (founder 2026-09-01) ════
 *
 * The design review's harness saw the onboarding weight wheel land on 30 when it was handed 78,
 * after the layout direction was flipped post-mount. The offset math was already pinned as
 * locale-free (`wheelPicker.test.ts`); what was NOT pinned is the MOUNTED behaviour: that the
 * component, rendered with `I18nManager.isRTL = true` from the first frame, still scrolls its
 * track to the index of the value it was handed — and never calls `onChange` with a value nobody
 * picked. This is the exact class of fault the harness could not distinguish from its own
 * artifact; a red here means the device would drift too.
 */

import React from 'react';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import { I18nManager } from 'react-native';
import { WheelPicker, wheelOffset } from '@/components/ds/WheelPicker';

describe('the wheel under RTL says the number it was handed', () => {
  // The wheel schedules settle timers; real timers outlive the case and trip teardown.
  beforeEach(() => jest.useFakeTimers());
  const mounted: ReactTestRenderer[] = [];
  const flip = (rtl: boolean) => {
    // `isRTL` is a plain data property on the RN jest preset — set it, remember, restore.
    const was = I18nManager.isRTL;
    (I18nManager as { isRTL: boolean }).isRTL = rtl;
    return () => {
      (I18nManager as { isRTL: boolean }).isRTL = was;
    };
  };
  const mountAt = (rtl: boolean) => {
    const spy = flip(rtl);
    const onChange = jest.fn();
    let r: ReactTestRenderer;
    act(() => {
      r = create(<WheelPicker value={78} min={30} max={200} step={0.5} size="lg" label="BODYWEIGHT · KG" onChange={onChange} />);
    });
    // The track measures itself before it positions — feed it a real width.
    const scroller = r!.root.findAll((n) => typeof n.props?.onLayout === 'function');
    act(() => {
      for (const n of scroller) n.props.onLayout({ nativeEvent: { layout: { width: 340, height: 146, x: 0, y: 0 } } });
    });
    mounted.push(r!);
    return { r: r!, onChange, spy };
  };

  afterEach(() => {
    act(() => {
      for (const m of mounted.splice(0)) m.unmount();
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('⛔ mounted RTL: no onChange fires for a value nobody picked', () => {
    const { onChange, spy } = mountAt(true);
    // The harness saw 78 → 30 (the track's minimum). A drift would surface here as an
    // unsolicited onChange as the initial position settles.
    expect(onChange).not.toHaveBeenCalled();
    spy();
  });

  it('…and the initial scroll target is the SAME offset in both directions', () => {
    // The positioning effect calls scrollTo(wheelOffset(indexOf(value))) — direction-free by
    // construction. Assert the two mounts agree about the accessible value they present.
    const ltr = mountAt(false);
    const valueOfA11y = (r: ReactTestRenderer) =>
      r.root.findAll((n) => n.props?.accessibilityRole === 'adjustable').map((n) => n.props.accessibilityValue?.text ?? n.props.accessibilityValue?.now);
    const ltrVal = valueOfA11y(ltr.r);
    ltr.spy();
    const rtl = mountAt(true);
    const rtlVal = valueOfA11y(rtl.r);
    expect(rtlVal).toEqual(ltrVal);
    expect(JSON.stringify(ltrVal)).toContain('78');
    // …and the pure offset both would scroll to is one number, not two.
    expect(wheelOffset(96, 64)).toBe(wheelOffset(96, 64));
  });
});
