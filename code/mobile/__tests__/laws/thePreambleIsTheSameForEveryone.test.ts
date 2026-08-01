import { preamble, coachRequest, COACH_PROMPT_VERSION } from '@/domain/coachPrompt';
import { coachFacts } from '@/domain/coachFacts';
import { COACH_PLAN_SCHEMA } from '@/domain/coachPlan';
import type { Profile, Program, Session, SetLog } from '@/data/local/models';

/**
 * ════ THE PREAMBLE IS THE SAME FOR EVERYONE ════
 *
 * Prompt caching is a PREFIX MATCH. A cache entry is keyed on the exact bytes up to the breakpoint,
 * and one changed byte anywhere before it invalidates everything after — for every athlete, not
 * just the one whose data leaked in.
 *
 * That makes this the quietest expensive bug available to us: put a name, a bodyweight, a
 * timestamp, or a per-athlete count into the stable half, and nothing breaks, no test fails, no
 * screen looks wrong. The cache simply never hits again, and the bill arrives a month later.
 *
 * `preamble()` takes no arguments, which is the first line of defence — a function that cannot be
 * handed an athlete cannot leak one. This is the second: build the whole request for two athletes
 * who share nothing, and prove the cached half is identical to the byte.
 */

const dana: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle',
  daysPerWeek: 4, repBand: '8-10', workoutMinutes: 55, healthConnected: false, name: 'Dana Levi',
};
const yossi: Profile = {
  sex: 'male', weightKg: 95, units: 'lb', goal: 'get_stronger',
  daysPerWeek: 2, repBand: '6-8', workoutMinutes: 90, healthConnected: true, name: 'Yossi Cohen',
};

function set(exerciseId: string, i: number, w: number, r: number): SetLog {
  return {
    exerciseId, setIndex: i, recommendedWeight: w, recommendedReps: 8,
    actualWeight: w, actualReps: r, edited: false, restBeforeS: 120,
    persistedAt: new Date(Date.UTC(2026, 6, 26, 17, i * 4)).toISOString(),
  };
}
const session: Session = {
  id: 's1', programDayId: 'd1', programDayName: 'Upper A',
  startedAt: '2026-07-26T17:00:00.000Z', state: 'SAVED', earlyFinish: false, trained: true,
  sets: [set('bb_bench_press', 0, 30, 12), set('bb_bench_press', 1, 30, 10)],
};
const program: Program = { id: 'p', frequency: 4, days: [] };

const forDana = () =>
  coachRequest({
    facts: coachFacts({
      profile: dana, plan: null , history: [session], justFinished: session,
      brief: 'Plays 5-a-side Thursdays. Right hamstring tweaked twice, both sprinting cold.',
      decided: [{ at: 't1', ex: 'bb_bench_press', say: 'Up to 32.5 — you cleared 12 twice.' }],
    }),
    ask: { kind: 'after_session' },
    cache: true,
  });

const forYossi = () =>
  coachRequest({
    facts: coachFacts({ profile: yossi, plan: null, history: [] }),
    ask: { kind: 'chat', turns: [{ from: 'her', text: 'Can I swap the squat for a leg press this week?' }] },
    cache: true,
  });

describe('the preamble is the same for everyone', () => {
  it('is byte-identical across two athletes who share nothing', () => {
    // Different sex, bodyweight, units, days, band, minutes, brief, history, and a different ask.
    expect(forDana().blocks[0].text).toBe(forYossi().blocks[0].text);
    expect(forDana().blocks[0].text).toBe(preamble());
  });

  it('is stable across calls — nothing in it is generated per request', () => {
    // A timestamp, a random id, or an unsorted map anywhere in here would pass every other test in
    // this file and quietly cost 10x on every call.
    expect(preamble()).toBe(preamble());
  });

  it('carries no athlete anywhere in it', () => {
    const text = preamble();
    for (const leak of ['Dana', 'Levi', 'Yossi', 'Cohen', '62', '95', 'Thursdays', 'hamstring']) {
      expect({ leak, present: text.includes(leak) }).toEqual({ leak, present: false });
    }
  });

  it('marks the breakpoint on the stable block and nowhere else', () => {
    const { blocks } = forDana();
    expect(blocks.map((b) => b.cache === true)).toEqual([true, false, false]);
    // A breakpoint below the first block would key the cache to that athlete's own record — one
    // entry per athlete, written once, read never.
    expect(blocks.slice(1).every((b) => b.cache === undefined)).toBe(true);
  });

  it('does not mark a breakpoint at all when caching is off', () => {
    const r = coachRequest({
      facts: coachFacts({ profile: dana, plan: null , history: [] }),
      ask: { kind: 'after_session' },
    });
    // Default is OFF: a cache written and never read costs 1.25x and returns nothing, which is the
    // shape of the post-session call until there are enough athletes to keep the entry warm.
    expect(r.blocks.every((b) => b.cache === undefined)).toBe(true);
  });
});

describe('everything that varies is below the breakpoint', () => {
  it('puts her record after the stable half, never inside it', () => {
    const { blocks } = forDana();
    expect(blocks[1].text.startsWith('HER RECORD:')).toBe(true);
    expect(blocks[1].text).toContain('Thursdays'); // her brief travels, in the volatile half
  });

  it('puts the ask last, after the record', () => {
    // The record is stable across the messages of one chat sitting; the message is not. Message
    // last means a second message in the same sitting reuses everything above it.
    const { blocks } = forYossi();
    expect(blocks.at(-1)!.text).toContain('Can I swap the squat');
    expect(blocks[1].text.startsWith('HER RECORD:')).toBe(true);
  });

  it('tells the intake that there is no record yet, rather than sending an empty one silently', () => {
    const r = coachRequest({
      facts: coachFacts({ profile: dana, plan: null, history: [] }),
      ask: { kind: 'intake', turns: [{ from: 'her', text: 'I want to be able to run a half marathon.' }] },
    });
    const last = r.blocks.at(-1)!.text;
    expect(last).toContain('intake');
    expect(last).toContain('half marathon');
  });
});

describe('the stable half is worth caching at all', () => {
  const tok = (s: string) => Math.round(s.length / 3.5);

  it('clears the minimum cacheable prefix with room to spare', () => {
    // Under ~1,024 tokens a prefix silently will not cache — no error, no warning, just a
    // permanent miss. Ours is several times that; the bound exists so a future trim of the
    // catalogue cannot disable caching without failing here first.
    expect(tok(preamble())).toBeGreaterThan(1500);
  });

  it('is not so large that a cold write is a problem', () => {
    // It is paid in full on every cache write, and on every call when caching is off.
    expect(tok(preamble())).toBeLessThan(8000);
  });

  it('states the schema from the schema, so prose cannot describe an older one', () => {
    expect(preamble()).toContain(JSON.stringify(COACH_PLAN_SCHEMA));
  });

  it('names every shape and both id lists the coach is allowed to draw from', () => {
    const text = preamble();
    for (const needle of ['"reps"', '"time"', '"distance"', '"open"', 'bb_bench_press', 'run_outdoor']) {
      expect({ needle, present: text.includes(needle) }).toEqual({ needle, present: true });
    }
  });
});

describe('the catalogue is sent once', () => {
  const tok = (s: string) => Math.round(s.length / 3.5);

  it('does not repeat the catalogue below the breakpoint', () => {
    const { blocks } = forDana();
    // It is stated in the stable half. Sending it again in her sheet is the same ~3,100 tokens paid
    // a second time on every call — in the half that never caches.
    expect(blocks[0].text).toContain('bb_bench_press');
    expect(blocks[1].text).not.toContain('"catalogue"');
    expect(blocks[1].text).not.toContain('"movements"');
    // A lift SHE DID still appears in her record — that is her work, not the catalogue. The tell is
    // the lift nobody in this test has ever performed: it exists only in the catalogue.
    expect(blocks[1].text).not.toContain('run_outdoor');
    expect(blocks[1].text).not.toContain('goblet_squat');
    expect(blocks[1].text).toContain('bb_bench_press'); // hers — she lifted it
  });

  it('keeps everything about HER in her half', () => {
    const [, sheet] = forDana().blocks;
    for (const needle of ['Thursdays', 'weightKg', 'performed', 'equipment', 'decided']) {
      expect({ needle, present: sheet.text.includes(needle) }).toEqual({ needle, present: true });
    }
  });

  it('leaves the per-athlete half small — it is paid in full on every call', () => {
    // Measured before the fix: 3,667 tokens for an athlete with NO history at all, 46% of it the
    // duplicated catalogue. The bound is what stops that coming back.
    const noHistory = coachRequest({
      facts: coachFacts({ profile: dana, plan: null, history: [] }),
      ask: { kind: 'after_session' },
    });
    expect(tok(noHistory.blocks[1].text)).toBeLessThan(900);
  });
});

describe('who the coach is', () => {
  it('states the laws this app already holds, so the coach does not contradict its own screens', () => {
    const text = preamble();
    // Each of these is a founder ruling that binds every other surface. A coach that praised, or
    // invented a figure, or explained a control would read as a different product.
    expect(text).toContain('First person');
    expect(text).toContain('no emoji');
    expect(text.toLowerCase()).toContain('comes from her record');
  });

  it('answers a harmful request rather than refusing it', () => {
    // The stance, written down: say what it costs, say what you would do instead, build the safe
    // version. A coach that just declines is not doing the job.
    expect(preamble()).toContain('That is the job, not a refusal');
  });

  it('bumps its version when the text changes — a changed preamble is a cold cache for everyone', () => {
    expect(COACH_PROMPT_VERSION).toBeGreaterThanOrEqual(1);
    expect(forDana().v).toBe(COACH_PROMPT_VERSION);
  });
});
