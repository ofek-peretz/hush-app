/**
 * Hush design-system components (RN) — translated 1:1 from the Claude Design
 * "Design System" project (2026-06-21). Import from '@/components/ds'.
 *
 * ⚠️ THREE WERE BUILT FOR NOBODY AND ARE GONE (2026-08-18): `ListRow`, `ProgressMeter` and
 * `VolumeArea`. Not one of them was rendered anywhere in `src/` — no `<ListRow`, no
 * `<ProgressMeter`, no `<VolumeArea` — and `VolumeArea`'s own header claimed to be the weekly-volume
 * graph on Progress · Lifts, a graph that is not on that screen. A component that describes a screen
 * it does not appear on is worse than dead code: it is a false map of the product.
 *
 * ⚠️ `Card` AND `IconButton` ARE THE SAME KIND OF DEAD AND SURVIVED ANYWAY. Neither is rendered
 * either, but both are still NAMED in `screens/session/SessionFlow`'s import from this barrel, and
 * pulling the export out from under a live import line is a crash waiting for whoever renders it
 * next. They go when that import does.
 */

// 

export { Card } from './Card';
export { Arrive, ARRIVE_STAGGER } from './Arrive';
export { Badge } from './Badge';
export { Button } from './Button';
export { IconButton } from './IconButton';
export { Legend } from './Legend';
export { Stage } from './Stage';
export { Metric } from './Metric';
export { LoadDelta } from './LoadDelta';
export { RestRing } from './RestRing';
export { WheelPicker } from './WheelPicker';
export { NumberPad } from './NumberPad';
export { ToastProvider, useToast, type ToastAction } from './Toast';
export { Avatar } from './Avatar';
export { SegmentedControl } from './SegmentedControl';
export { Switch } from './Switch';
export { TextField } from './TextField';
export { Display, TitleL, Title, BodyL, Body, Caption } from './Type';
export { Sparkline } from './Sparkline';
export { FooterFade } from './FooterFade';
export { Climb } from './Climb';
export { GhostClimb } from './GhostClimb';
