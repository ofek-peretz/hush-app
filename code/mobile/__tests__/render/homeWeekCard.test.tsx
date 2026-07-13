/**
 * HOME, AFTER THE 2026-07-13 BATCH — mounted for real.
 *
 * The founder's three findings about Home were all findings about what an athlete can SEE, and a
 * typecheck cannot see anything. So this file mounts the actual screen with real props and asks
 * the questions he asked:
 *
 *   · does the app say what it does?      → Hush's sentence is on the page, in the first person
 *   · is the programme still swallowed?   → the week is a card, and its workouts are on it
 *   · is "done" green?                    → the trained workout wears the sage check, never ink
 *
 * …and the SECOND pass (2026-07-13), where three surfaces for one purpose became one:
 *
 *   · the chips ARE the chooser          → one tap queues a workout, a second tap opens its plan
 *   · the sheet and This-week are gone   → nothing on Home opens a second list of the same week
 *   · cardio has the secondary button    → the run is one tap from Home again
 *   · the update states the COUNT first  → "3 changes this week", then the sentence, then the why
 *   · the name is spoken                 → on a finished week, Hush addresses the athlete
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { HomeView, type HomeViewProps } from '@/screens/home/HomeView';
import { initI18n, tg } from '@/i18n';
import { bidi } from '@/i18n/bidi';
import { up, signal, ink } from '@/design/tokens';

beforeAll(async () => {
  await initI18n();
});

/** The screen reads the safe-area insets, so it is mounted inside a real provider. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  return r;
}

type Json = { type: string; props: Record<string, unknown>; children: Json[] | null } | string | null;

/** Every string the athlete actually reads on the rendered screen. */
function texts(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (n: Json | Json[]): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n.children) n.children.forEach(walk);
  };
  walk(r.toJSON() as unknown as Json);
  return out;
}

/**
 * The node carrying this accessibility label. A Pressable is a COMPOSITE that renders a host View:
 * the label reaches the host, but `onPress` stays on the composite — so a host-only search finds
 * the thing the screen reader sees and nothing the finger can press. Take the first match that can
 * actually be pressed, and fall back to the host node for pure read assertions (colours, text).
 */
function byLabel(r: ReactTestRenderer, label: string): ReactTestInstance | null {
  const hits = r.root.findAll((n) => n.props?.accessibilityLabel === label, { deep: true });
  return hits.find((n) => typeof n.props.onPress === 'function') ?? hits[0] ?? null;
}

/** Every colour anywhere in the rendered style tree (flattened; arrays and nesting included). */
function colors(node: ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (s: unknown): void => {
    if (Array.isArray(s)) return void s.forEach(walk);
    if (s && typeof s === 'object') {
      for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
        if (typeof v === 'string' && /color/i.test(k)) out.push(v);
      }
    }
  };
  const visit = (n: ReactTestInstance): void => {
    walk(n.props.style);
    if (typeof n.props.color === 'string') out.push(n.props.color);
    n.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(node);
  return out;
}

const WORKOUTS = [
  { id: 'day_1', name: 'Push A', muscles: 'Chest · Shoulders', done: true },
  { id: 'day_2', name: 'Pull A', muscles: 'Back · Biceps' },
  { id: 'day_3', name: 'Legs A', muscles: 'Quads · Glutes' },
];

function props(over: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    resting: false,
    name: 'Ofek',
    dayName: 'Pull A',
    muscles: 'Back · Biceps',
    trainedThisWeek: 1,
    startError: false,
    weekNumber: 3,
    exerciseCount: 6,
    workouts: WORKOUTS,
    brief: [{ key: 'home.briefRaisedOne', params: { lift: 'Bench Press', load: '62.5', unit: 'kg' } }],
    briefCount: 3,
    briefUnseen: true,
    onStart: () => {},
    onChooseWorkout: () => {},
    onWeeklyUpdate: () => {},
    onOpenWorkout: () => {},
    onHistory: () => {},
    onSettings: () => {},
    onProgress: () => {},
    onCardio: () => {},
    ...over,
  };
}

describe('the app says what it does', () => {
  it('prints Hush\'s own sentence about the week — the decision, not a slogan', () => {
    const r = mount(<HomeView {...props()} />);
    const said = texts(r).join(' ');
    expect(said).toContain('I raised your Bench Press to 62.5 kg.');
    expect(said).toContain(tg('home.briefOpen')); // …and the way into the WHY
  });

  it('the sentence is a door: it opens the Weekly Update', () => {
    let opened = 0;
    const r = mount(<HomeView {...props({ onWeeklyUpdate: () => void opened++ })} />);
    act(() => {
      byLabel(r, tg('home.briefOpen'))!.props.onPress();
    });
    expect(opened).toBe(1);
  });

  it('an unread update wears the ochre mark; a read one is quiet', () => {
    expect(texts(mount(<HomeView {...props({ briefUnseen: true })} />)).join(' ')).toContain(
      tg('home.briefNew').toUpperCase(),
    );
    expect(texts(mount(<HomeView {...props({ briefUnseen: false })} />)).join(' ')).not.toContain(
      tg('home.briefNew').toUpperCase(),
    );
  });

  it('states HOW MANY lifts changed before it says anything else — or that none did', () => {
    expect(texts(mount(<HomeView {...props({ briefCount: 3 })} />)).join(' ')).toContain(
      tg('home.briefChanges', { count: 3 }),
    );
    const steady = texts(
      mount(<HomeView {...props({ briefCount: 0, brief: [{ key: 'home.briefSteady' }] })} />),
    ).join(' ');
    expect(steady).toContain(tg('home.briefNoChanges'));
    expect(steady).toContain(tg('home.briefOpen')); // …and the why is still one tap away
  });

  it('says NOTHING rather than something invented when the engine record cannot be read', () => {
    const r = mount(<HomeView {...props({ brief: null })} />);
    expect(texts(r).join(' ')).not.toContain(tg('home.briefOpen'));
  });
});

describe('the week is on the page, and it is a door', () => {
  it('every workout of the week is a chip', () => {
    const said = texts(mount(<HomeView {...props()} />)).join(' ');
    for (const w of WORKOUTS) expect(said).toContain(w.name);
  });

  it('a chip QUEUES that workout — choosing never leaves Home (the sheet is gone)', () => {
    const chosen: string[] = [];
    const opened: string[] = [];
    const r = mount(
      <HomeView {...props({ onChooseWorkout: (id) => void chosen.push(id), onOpenWorkout: (id) => void opened.push(id) })} />,
    );
    act(() => {
      byLabel(r, 'Legs A')!.props.onPress(); // not the queued one → it becomes the queued one
    });
    expect(chosen).toEqual(['day_3']);
    expect(opened).toEqual([]); // …and nothing was pushed on top of Home
  });

  it('a second tap on the QUEUED chip opens its plan — swap, pin and the form clip', () => {
    const opened: string[] = [];
    const r = mount(<HomeView {...props({ onOpenWorkout: (id) => void opened.push(id) })} />);
    act(() => {
      byLabel(r, 'Pull A')!.props.onPress(); // Pull A === dayName, i.e. already queued
    });
    expect(opened).toEqual(['day_2']);
  });

  it('a finished workout is a record: its chip opens the plan, and never re-queues it', () => {
    const chosen: string[] = [];
    const opened: string[] = [];
    const r = mount(
      <HomeView {...props({ onChooseWorkout: (id) => void chosen.push(id), onOpenWorkout: (id) => void opened.push(id) })} />,
    );
    act(() => {
      byLabel(r, 'Push A')!.props.onPress(); // done: true
    });
    expect(chosen).toEqual([]);
    expect(opened).toEqual(['day_1']);
  });

  it('the athlete is told what a tap does — the chips carry two acts now', () => {
    expect(texts(mount(<HomeView {...props()} />)).join(' ')).toContain(tg('home.chipsHint'));
  });

  it('a chip knows itself by ID, never by name — two workouts may be called the same thing', () => {
    // Both are "Upper". Matching on the NAME would light both chips as "queued" and turn a tap
    // meant to QUEUE the second one into a tap that opens the first one's plan.
    const twins = [
      { id: 'day_1', name: 'Upper', muscles: 'Chest' },
      { id: 'day_2', name: 'Upper', muscles: 'Back' },
    ];
    const chosen: string[] = [];
    const opened: string[] = [];
    const r = mount(
      <HomeView
        {...props({
          workouts: twins,
          dayName: 'Upper',
          dayId: 'day_1',
          onChooseWorkout: (id) => void chosen.push(id),
          onOpenWorkout: (id) => void opened.push(id),
        })}
      />,
    );
    const chips = r.root.findAll((n) => n.props?.accessibilityLabel === 'Upper' && typeof n.props.onPress === 'function');
    act(() => chips[1].props.onPress()); // the one that is NOT queued
    expect(chosen).toEqual(['day_2']);
    expect(opened).toEqual([]);
    act(() => chips[0].props.onPress()); // the queued one
    expect(opened).toEqual(['day_1']);
  });

  it('an interrupted workout owns the CTA — a chip cannot queue behind its back', () => {
    // The button says "Continue Pull A". Queueing Legs would light a chip that the CTA disagrees
    // with, so while a session is waiting to be resumed a chip is a door to the plan and nothing else.
    const chosen: string[] = [];
    const opened: string[] = [];
    const r = mount(
      <HomeView
        {...props({
          resumable: { workoutName: 'Pull A' },
          onChooseWorkout: (id) => void chosen.push(id),
          onOpenWorkout: (id) => void opened.push(id),
        })}
      />,
    );
    act(() => {
      byLabel(r, 'Legs A')!.props.onPress();
    });
    expect(chosen).toEqual([]);
    expect(opened).toEqual(['day_3']);
    expect(texts(r).join(' ')).not.toContain(tg('home.chipsHint')); // …and it does not claim otherwise
  });

  it('a trained workout is SAGE, and the queued one is OCHRE — the two marks never trade places', () => {
    const r = mount(<HomeView {...props()} />);
    // Done: the sage check + the sage wash behind it. (Its LABEL is ink, as all legible copy is —
    // it is the MARK that carries the verdict, and the mark is green.)
    const doneChip = colors(byLabel(r, 'Push A')!);
    expect(doneChip).toContain(up[0]);
    expect(doneChip).not.toContain(signal[0]); // never the "you are here" mark
    // Queued: the ochre index dot, and no check anywhere near it (a check means DONE, and nothing else).
    const queuedChip = colors(byLabel(r, 'Pull A')!);
    expect(queuedChip).toContain(signal[0]);
    expect(queuedChip).not.toContain(up[0]);
  });
});

describe('cardio has Home\'s second button', () => {
  it('a run is one tap from Home — the button the chooser sheet used to occupy', () => {
    let ran = 0;
    const r = mount(<HomeView {...props({ onCardio: () => void ran++ })} />);
    act(() => {
      byLabel(r, tg('home.cardioCta'))!.props.onPress();
    });
    expect(ran).toBe(1);
  });

  it('it never competes with the workout: the primary action is still Begin', () => {
    const said = texts(mount(<HomeView {...props()} />)).join(' ');
    expect(said).toContain(tg('home.begin', { name: bidi('Pull A') })); // the name rides a BiDi isolate
  });

  it('and on a RECOVERY day it is the day\'s act — its card is back', () => {
    const r = mount(<HomeView {...props({ resting: true, dayName: null })} />);
    expect(byLabel(r, tg('cardio.title'))).not.toBeNull();
  });
});

describe('the name', () => {
  it('is spoken when the week is closed — and the copy still reads without one', () => {
    const named = texts(mount(<HomeView {...props({ resting: true, dayName: null })} />)).join(' ');
    expect(named).toContain('Ofek');
    const anonymous = texts(
      mount(<HomeView {...props({ resting: true, dayName: null, name: undefined })} />),
    ).join(' ');
    expect(anonymous).toContain(tg('home.restSub'));
    expect(anonymous).not.toContain('undefined');
  });
});
