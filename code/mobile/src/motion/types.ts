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

// 


export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Which of the two Duotone Athletes performs the demonstration. Both share ONE skeleton
 * (`anthro.ATHLETE`) — same segment lengths, same poses, same FormSpecs — and differ only in the
 * skin: silhouette profiles, limb thickness, and hair. 'male' is the default everywhere so every
 * existing surface renders byte-identical output unless a caller asks for her.
 */
export type FigureSex = 'male' | 'female';

/** A point in the athlete's own space: x across, y down the screen, z TOWARD the camera. */
export interface Vec3 extends Vec2 {
  z: number;
}

/** A pose is the position of every named joint at one instant, plus the head radius. */
export interface Pose {
  j: Record<string, Vec2>;
  /**
   * DEPTH, per joint, and entirely optional — the one addition that makes the system
   * three-dimensional without rewriting a single rig that does not want to be.
   *
   * `j` has always held the joint as the camera sees it. Rigs that leave `z` undefined keep
   * exactly that meaning and render byte-identically forever: the projection is the identity at
   * `z = 0`. A rig that DOES fill `z` is instead stating where the joint is in the athlete's own
   * space, and hands three things to the renderer that it previously had to fake:
   *
   *   · **Foreshortening for free.** A bone turned toward the lens projects short because it IS
   *     short in projection — no per-rig fudge, and no formula that can hairpin when the projected
   *     span passes through zero (which is exactly how the fly family broke).
   *   · **A real far side.** 28 of 40 library files build the far limb as `far(p, +6, +1)` — the
   *     near limb copied and shifted a few pixels. With `z` it is the same joint at a different
   *     depth, and the duotone reads which side is nearer instead of being told.
   *   · **A camera.** Depth is what an azimuth needs to rotate around; see `camera.ts`.
   */
  z?: Record<string, number>;
  headR: number;
  /** Spinal flexion for crunch patterns: bows the trunk silhouette toward its front (units). */
  trunkBow?: number;
  /**
   * Fist radius override (defaults to LIMB_W.handR). The perspective license (§3.4 Amendment 7)
   * draws depth as scale: a fist pressing toward the camera grows with its stroke.
   */
  fistR?: number;
}

/** Token-keyed colors so RN (design tokens) and the harness (inlined hex) stay identical. */
export type ColorToken =
  | 'ink0' | 'ink1' | 'ink2' | 'ink3' | 'ink4'
  | 'paper0' | 'paper1' | 'paper2' | 'paper3'
  | 'line0' | 'line1' | 'line2'
  // NO OCHRE. `signal`/`signalInk` were removed 2026-07-17 (founder: "the ochre in the videos —
  // take it off"), and they are gone from the TYPE rather than merely unused, so a future clip
  // cannot reach for them: the accent hue is now a compile error here, not a convention. The range
  // statement they used to draw is ink + a dash — see `kit.barPathTicks` for the full reasoning.
  | 'up';

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
  /** 'front' renders the symmetric frontal trunk; limbs are then left/right, both near-ink. */
  view?: 'side' | 'front';
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
  /**
   * PARTIAL REPS — the rom sub-range each drawn rep covers, one entry per rep.
   *
   * Omitted (the canon) means every rep runs the whole range, which is what all but one exercise
   * in the catalogue does. `bb_curl_21` is the one that does not: "21s" IS seven bottom-half reps,
   * seven top-half, seven full, and with every rep identical the clip rendered byte-for-byte the
   * same picture as `bb_curl` — four ids in this family shared one drawing. A rep scheme that
   * cannot be drawn is a rep scheme the demonstration cannot teach.
   *
   * The FormSpec is unaffected: it samples rom 0 to 1 directly, so the exercise's start and its
   * working endpoint are still asserted over the FULL range. This only says which slice of that
   * range each drawn rep actually travels.
   */
  repRanges?: ReadonlyArray<readonly [number, number]>;
  /** 'top' = the rep starts at rom 0 (bench); 'bottom' = starts at rom 1 (deadlift from floor). */
  startAt: 'top' | 'bottom';
  /**
   * TRUE when travelling rom 0 → rom 1 is the CONCENTRIC — the muscle shortening.
   *
   * `eccentricMs` and `concentricMs` name PHASES, not durations of a fixed order, and the timeline
   * used to assume the first timed phase was always the eccentric. That is right for a bench press
   * (rom 1 is the chest) and wrong for most of the catalogue: a curl's rom 1 is the SQUEEZE, a
   * row's is the ribs, a pulldown's is the collarbone, a calf raise's is the top of the toes. Every
   * one of those clips was giving 2.0s to the concentric and 1.1s to the lowering — the exact
   * inverse of the tempo `DEFAULT_TEMPO` documents itself as.
   *
   * Neither the FormSpec nor the auditor could see it. Both sample in `rom`; neither has an opinion
   * about time.
   */
  endpointIsConcentric?: boolean;
}

// ── FormSpec predicates — every one is measurable on a Pose ────────────────────

export type PosePredicate =
  /** Interior angle at `joint` (between its two skeletal neighbors) within [min,max] degrees. */
  | { kind: 'jointAngle'; joint: string; neighbors: [string, string]; min?: number; max?: number; label?: string }
  /** `a.y` reaches `y` within `tol` — a canonical contact endpoint (bar to chest, bar to collarbone). */
  | { kind: 'contactY'; a: string; y: number; tol: number; label?: string }
  /** `a.x` reaches `x` within `tol` — a horizontal contact endpoint (fly hands meeting center). */
  | { kind: 'contactX'; a: string; x: number; tol: number; label?: string }
  /** `a` is below `b` by at least `by` (screen y grows downward) — e.g. squat depth. */
  | { kind: 'jointBelow'; a: string; b: string; by: number; label?: string }
  /**
   * `a` is at least `by` further out along +x than `b`.
   *
   * For facts that are about one joint being OUTBOARD of another rather than about either being at
   * a coordinate — a sumo's knees outside its grip, a snatch grip outside the shoulders. Written as
   * a relation because coordinates go stale the moment a joint stops being hand-placed: sumo's knee
   * predicate pinned x = 208 and broke the day the knee started being solved from the ankle, even
   * though the thing it was there to protect had never been truer.
   */
  | { kind: 'jointRightOf'; a: string; b: string; by: number; label?: string };

export type Invariant =
  /** `point` never moves more than `tol` from its start-of-rep position, across the whole rep. */
  | { kind: 'pointFixed'; point: string; tol: number; label?: string }
  /** The angle of segment `a`→`b` stays within `tolDeg` of its start value, across the whole rep. */
  | { kind: 'segmentAngleFixed'; a: string; b: string; tolDeg: number; label?: string }
  /** The interior angle at `joint` never exceeds `aboveDeg` (no hyperextension). */
  | { kind: 'angleNever'; joint: string; neighbors: [string, string]; aboveDeg: number; label?: string }
  /** a–b–c stay within `tolDeg` of a straight line (the push-up plank line, drawn as a rule). */
  | { kind: 'colinear'; a: string; b: string; c: string; tolDeg: number; label?: string }
  /**
   * `a`→`b` never spans more than `aboveUnits`. The projection-robust way to say "this limb never
   * reaches full extension" — i.e. never presses. An `angleNever` on the elbow says the same thing
   * only while the arm lies IN THE IMAGE PLANE: once it rotates to point at the camera its
   * projected angle opens to 180° no matter how bent the real elbow is, and the assertion becomes
   * a statement about the camera rather than about the athlete. A span cannot lie that way —
   * foreshortening only ever SHRINKS it, so a limb that never spans full length never extended.
   */
  | { kind: 'spanNever'; a: string; b: string; aboveUnits: number; label?: string }
  /**
   * `a`->`b` never changes length at all — a RIGID LINK, the equipment counterpart of a bone.
   *
   * `spanNever` says a limb never reaches full extension; this says a distance is a fact of the
   * scene. It exists because `t_bar_row` drew a landmine bar whose length grew 157.9 -> 173.8 units
   * across the rep: the handle was authored on a straight vertical while the far end stayed pinned
   * to the floor, so the lever stretched 10 % every rep. Nothing caught it — the auditor's
   * bone-length law only knows about the athlete, and a path constraint only knows about the axis
   * it was told to expect. A lever, a chain and a machine's press arm are all rigid, and this is
   * how a rig says so.
   */
  | { kind: 'spanFixed'; a: string; b: string; tol: number; label?: string };

export interface FormSpec {
  tempo: Tempo;
  /** Predicates asserted at the rep's start position (rom 0). */
  start: PosePredicate[];
  /** Predicates asserted at the working endpoint (rom 1). */
  end: PosePredicate[];
  /**
   * The tracked path: which joint travels, and its constraint. 'line' constrains to the declared
   * axis `dir` (a machine rail); 'arc' declares a joint-pivot arc — its constraint is the pivot
   * invariant (pointFixed), not an axis.
   */
  path: { track: string; kind: 'vertical' | 'horizontal' | 'line' | 'arc'; tol: number; dir?: Vec2 };
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
  /**
   * Where the camera stands. Omitted means `camera.FLAT` — the authored view, the identity
   * projection, and the path every rig took before depth existed. A rig that sets an azimuth is
   * also taking responsibility for projecting its own `decorAt` primitives, because equipment
   * depth is scene knowledge only the rig has.
   */
  camera?: import('./camera').Camera;
  formspec: FormSpec;
  /** The full skeleton at a given rom ∈ [0,1]. */
  poseAt(rom: number): Pose;
  /**
   * Equipment + bar-path + range ticks at a given rom, split around the figure.
   *
   * `j` is the FLATTENED joint map the figure is about to be drawn from — the same points, already
   * through the camera. A flat rig ignores it and reads `poseAt` itself, exactly as before. A rig
   * that orbits must use it, because anything anchored to a hand (a dumbbell, the end of a cable)
   * has to land on the hand the viewer can actually see, not on the one in the athlete's own space.
   */
  decorAt(rom: number, j?: Record<string, Vec2>): Decor;
  /** The static side-view scene (floor line) — drawn behind everything. */
  scene: Primitive[];
}
