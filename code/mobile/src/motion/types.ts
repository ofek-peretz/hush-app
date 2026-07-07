/**
 * Hush Motion System — core types.
 *
 * The whole system is pure data + pure functions (NO react-native imports in this file or any
 * sibling except `render/`). That is deliberate: the exact same geometry that the app renders
 * (`render/MotionFigure`) is executed headless by the CI validator (`formspec.validate`) and by
 * the review harness (`tools/motion-harness`). One source of truth, three consumers, zero drift.
 *
 * See `docs/canonical/MOTION_FORM_STANDARD_V1.md` for the normative definitions these types encode.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** A pose is the position of every named joint at one instant, plus the head radius. */
export interface Pose {
  j: Record<string, Vec2>;
  headR: number;
}

/** Token-keyed colors so RN (design tokens) and the harness (inlined hex) stay identical. */
export type ColorToken =
  | 'ink0' | 'ink1' | 'ink2' | 'ink3' | 'ink4'
  | 'paper0' | 'paper1' | 'paper2' | 'paper3'
  | 'line0' | 'line1' | 'line2'
  | 'signal' | 'signalInk' | 'up';

/** One cubic-bezier segment of a `path` primitive. */
export interface CubicSeg {
  c1: Vec2;
  c2: Vec2;
  to: Vec2;
}

/** A resolution-independent drawing instruction. Both renderers consume these verbatim. */
export type Primitive =
  | { kind: 'line'; a: Vec2; b: Vec2; w: number; color: ColorToken; opacity?: number; cap?: 'round' | 'butt' }
  | { kind: 'polyline'; pts: Vec2[]; w: number; color: ColorToken; opacity?: number }
  | { kind: 'quad'; a: Vec2; c: Vec2; b: Vec2; w: number; color: ColorToken; opacity?: number }
  | { kind: 'circle'; c: Vec2; r: number; fill?: ColorToken; stroke?: ColorToken; w?: number; opacity?: number; fillOpacity?: number }
  | { kind: 'ellipse'; c: Vec2; rx: number; ry: number; fill: ColorToken; opacity?: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number; fill?: ColorToken; stroke?: ColorToken; w?: number }
  | { kind: 'dash'; a: Vec2; b: Vec2; w: number; color: ColorToken; dash: [number, number]; opacity?: number }
  /** Closed filled polygon — the tapered-limb segments. */
  | { kind: 'poly'; pts: Vec2[]; fill: ColorToken; opacity?: number }
  /** Smooth cubic-bezier path — the torso silhouette. */
  | { kind: 'path'; start: Vec2; segs: CubicSeg[]; closed?: boolean; fill?: ColorToken; stroke?: ColorToken; w?: number; opacity?: number };

/** Which joint chains the figure skin draws, per rig. Names index `Pose.j`. */
export interface FigureChains {
  torso: [string, string]; // hip → shoulder (the spine line the silhouette is built around)
  neck: [string, string]; // shoulder → head-center
  head: string; // head-center joint name
  /** Which side of the hip→shoulder vector is the athlete's front (+1 = rot90 of the spine). */
  facing?: 1 | -1;
  nearArm?: string[]; // e.g. ['shoulder','elbow','hand']
  farArm?: string[];
  nearLeg?: string[]; // e.g. ['hip','knee','ankle']
  farLeg?: string[];
  /** Feet drawn as planted wedges: [heel, toe]. */
  nearFoot?: [string, string];
  farFoot?: [string, string];
}

/** Per-phase durations (ms). One rep = top → eccentric → bottom → concentric. */
export interface Tempo {
  topHoldMs: number;
  eccentricMs: number;
  bottomHoldMs: number;
  concentricMs: number;
  /** Reps drawn per loop (canon: 2, identical). */
  reps: number;
  /** 'top' = the rep starts at rom 0 (bench); 'bottom' = starts at rom 1 (deadlift from floor). */
  startAt: 'top' | 'bottom';
}

// ── FormSpec predicates — every one is measurable on a Pose ────────────────────

export type PosePredicate =
  /** Interior angle at `joint` (between its two skeletal neighbors) within [min,max] degrees. */
  | { kind: 'jointAngle'; joint: string; neighbors: [string, string]; min?: number; max?: number; label?: string }
  /** `a.y` reaches `y` within `tol` — a canonical contact endpoint (bar to chest, bar to collarbone). */
  | { kind: 'contactY'; a: string; y: number; tol: number; label?: string }
  /** `a` is below `b` by at least `by` (screen y grows downward) — e.g. squat depth. */
  | { kind: 'jointBelow'; a: string; b: string; by: number; label?: string };

export type Invariant =
  /** `point` never moves more than `tol` from its start-of-rep position, across the whole rep. */
  | { kind: 'pointFixed'; point: string; tol: number; label?: string }
  /** The angle of segment `a`→`b` stays within `tolDeg` of its start value, across the whole rep. */
  | { kind: 'segmentAngleFixed'; a: string; b: string; tolDeg: number; label?: string }
  /** The interior angle at `joint` never exceeds `aboveDeg` (no hyperextension). */
  | { kind: 'angleNever'; joint: string; neighbors: [string, string]; aboveDeg: number; label?: string };

export interface FormSpec {
  tempo: Tempo;
  /** Predicates asserted at the rep's start position (rom 0). */
  start: PosePredicate[];
  /** Predicates asserted at the working endpoint (rom 1). */
  end: PosePredicate[];
  /** The tracked path: which joint travels, and its constraint. */
  path: { track: string; kind: 'vertical' | 'horizontal' | 'arc'; tol: number };
  /** Held for the entire rep, sampled every frame. */
  invariants: Invariant[];
}

/** Split decoration so equipment can sit behind AND in front of the figure. */
export interface Decor {
  back: Primitive[];
  front: Primitive[];
}

/**
 * A rig turns a range-of-motion fraction into geometry. `rom` is 0 at the rep's canonical start
 * and 1 at its working endpoint; the timeline maps time → rom via the FormSpec tempo.
 */
export interface Rig {
  id: string;
  chains: FigureChains;
  formspec: FormSpec;
  /** The full skeleton at a given rom ∈ [0,1]. */
  poseAt(rom: number): Pose;
  /** Equipment + bar-path + range ticks at a given rom, split around the figure. */
  decorAt(rom: number): Decor;
  /** The static side-view scene (floor line) — drawn behind everything. */
  scene: Primitive[];
}
