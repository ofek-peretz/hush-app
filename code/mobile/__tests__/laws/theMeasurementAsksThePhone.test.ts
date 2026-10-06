/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT A DESK CANNOT KNOW IS ASKED OF THE PHONE — ONCE, IN ORDER, AND NEVER BUILT ON A GUESS
 *
 * Founder, 2026-10-06, after the earbuds' microphone and a "live" duck were built into the workout in
 * one afternoon without a search:
 *   > *"אתה לא יכול לבדוק את זה באינטרנט או בכלי חיפוש כלשהו אם זה אמור או יכול לעבוד והאם יש תקדים
 *   > לזה שהצליחו? אנחנו ממש צריכים לבדוק את זה במקום שכל פעם ישר תקפוץ ותעבוד בשעה ובסוף יש פתרון
 *   > אלגנטי ונכון בהרבה יותר משאתה עושה. אני לא רוצה שישר תתחיל לעשות מבלי לתכנן לפני … אנחנו בונים
 *   > פה סטארטאפ לא צעצוע."*
 *
 * The search took minutes and contradicted both (Apple: a duck "begins when you activate your app's
 * audio session and ends when you deactivate the session"; and nothing says a recorder may be
 * restarted on a new route from a locked phone). Both left the workout. What no page settles is
 * asked of his phone by `platform/voice/voiceMeasure`.
 *
 * This law holds three things:
 *   1 · THE WORKOUT IS WHAT BUILD 76 PROVED. Neither guess is reachable from a workout: the option
 *       is off natively, the conductor moves no microphone, and the measurement's native calls are
 *       named in exactly two files.
 *   2 · THE MEASUREMENT ALWAYS ENDS AND LEAVES THE PHONE AS IT FOUND IT — walked here over a phone
 *       that refuses each step in turn. A measurement that hangs in his pocket, or leaves his music
 *       lowered, costs a TestFlight round and answers nothing.
 *   3 · IT ASKS WHAT THE PLAN SAYS IT ASKS, in the order his ears are asked — the spoken number of a
 *       question is the number on the screen he answers it on.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* The real phone's seams, filled in by the walks at the bottom (`the real phone under it`). Read through
   getters: the mocks are hoisted above these lines, and a value captured then would be undefined. */
const mockAudio: Record<string, any> = {};
const mockEar: Record<string, any> = {};
const mockMouth: Record<string, any> = {};
const mockNatural: Record<string, any> = {};
jest.mock('@/platform/voice/audioSession', () => ({ get audioSession() { return mockAudio; } }));
jest.mock('@/platform/voice/cloudEar', () => ({ get cloudEar() { return mockEar; } }));
jest.mock('@/platform/voice/coachVoice', () => ({ get coachVoice() { return mockMouth; } }));
jest.mock('@/platform/voice/neuralVoice', () => ({ get neuralVoice() { return mockNatural; } }));
jest.mock('@/platform/voice/voiceCapture', () => ({ recognizerLang: (l: string) => `${l}-IL` }));

// eslint-disable-next-line import/first
import { AppState } from 'react-native';
// eslint-disable-next-line import/first
import type { SessionReport } from '@/platform/voice/audioSession';
// eslint-disable-next-line import/first
import { factLine, fixedLines, measurePhone, musicQuality, runMeasure, GLASS_MS, LOCK_MS, type MeasureFact, type MeasureLines, type MeasurePhone } from '@/platform/voice/voiceMeasure';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const LINES: MeasureLines = {
  lock: 'LOCK',
  q1: 'Q1',
  number: 'NUMBER',
  heard: (text) => `HEARD ${text}`,
  nothing: 'NOTHING',
  q2: 'Q2',
  q3: 'Q3',
  numberEarbuds: 'NUMBER-EARBUDS',
  half: 'HALF',
  lockAgain: 'LOCK-AGAIN',
  q4: 'Q4',
  q5: 'Q5',
  q6: 'Q6',
  q7: 'Q7',
  numberAgain: 'NUMBER-AGAIN',
  done: 'DONE',
};

/** A phone, and what it will refuse. Everything the flow does to it is written in `log`. */
function aPhone(refuses: Partial<{
  microphone: boolean;
  /** The held microphone is gone by the time the phone is in the pocket. */
  micLostInPocket: boolean;
  earbudsMove: boolean;
  theWayBack: boolean;
  /** He never takes the phone out between the halves. */
  openingThePhone: boolean;
  voiceProcessing: boolean;
  /** Voice processing took the earbuds' call profile, and asking for the phone's microphone… */
  musicProfile: 'kept' | 'back after phone mic' | 'back after restate' | 'never';
  ios17: boolean;
  naturalVoice: boolean;
  hearing: boolean;
  /** A native call that throws instead of answering. */
  listenThrows: boolean;
}> = {}) {
  const log: string[] = [];
  const facts: MeasureFact[] = [];
  const w = {
    glass: true,
    held: 0,
    ear: false,
    onEarbudsMic: false,
    liveDuck: false,
    ducked: false,
    processed: false,
    processedRoute: (refuses.musicProfile ?? 'kept') === 'kept' ? 'full' : 'call',
    duckLevel: null as number | null,
    violations: [] as string[],
  };
  const report = (): SessionReport => {
    const call = w.processed ? w.processedRoute === 'call' : w.onEarbudsMic;
    return {
      inputs: [call ? 'BluetoothHFP' : 'MicrophoneBuiltIn'],
      outputs: [call ? 'BluetoothHFP' : 'BluetoothA2DPOutput'],
      outputNames: ['WF-1000XM5'],
      category: 'AVAudioSessionCategoryPlayAndRecord',
      mode: w.processed ? 'AVAudioSessionModeVoiceChat' : 'AVAudioSessionModeDefault',
      rate: call ? 16_000 : 48_000,
      hfpAllowed: w.processed || w.onEarbudsMic,
      a2dpAllowed: true,
      ducking: w.ear && w.liveDuck && w.ducked,
      otherAudio: true,
    };
  };
  const heard = async () => {
    if (refuses.listenThrows) throw new Error('the bridge is gone');
    return refuses.hearing ? { peakDb: -40, floorDb: -42, text: null, why: null } : { peakDb: -24, floorDb: -51, text: 'שבע', why: null };
  };
  const phone: MeasurePhone = {
    wait: async (ms) => {
      // Told to lock and pocket it, he does.
      if (ms === LOCK_MS) {
        w.glass = false;
        if (refuses.micLostInPocket) w.ear = false;
      }
    },
    onGlass: () => w.glass,
    untilOnGlass: async (ms) => {
      log.push(`wait for glass ${ms / 1000}s`);
      if (refuses.openingThePhone) return false;
      w.glass = true;
      return true;
    },
    report,
    prepare: async (lines) => (refuses.naturalVoice ? 0 : lines.length),
    hold: async () => void (w.held += 1),
    release: async () => void (w.held -= 1),
    open: async () => {
      if (!w.glass) w.violations.push('the microphone was opened off glass');
      if (refuses.microphone) return 'microphone input is busy';
      w.ear = true;
      log.push('ear open');
      return null;
    },
    close: async () => {
      if (w.ear) log.push('ear closed');
      w.ear = false;
      w.onEarbudsMic = false;
    },
    alive: () => w.ear,
    say: async (line) => void log.push(`say ${line}`),
    speak: async (line) => void log.push(`speak ${line}${w.ear && w.liveDuck && w.ducked ? ' (option on)' : ''}`),
    listen: async () => {
      if (!w.ear) w.violations.push('listened with no microphone');
      log.push(`listen on ${w.onEarbudsMic ? 'earbuds' : 'phone'}`);
      return heard();
    },
    liveDuck: (on) => {
      if (w.liveDuck !== on) log.push(`live duck ${on ? 'on' : 'off'}`);
      w.liveDuck = on;
    },
    duck: async () => void (w.ducked = true),
    unduck: async () => void (w.ducked = false),
    reroute: async (to) => {
      if (!w.ear) return 'ear not running';
      if (w.glass) w.violations.push('the move was not tried from the pocket');
      if (to === 'headset' ? refuses.earbudsMove : refuses.theWayBack) {
        w.ear = false; // iOS would not restart the engine: the microphone is lost
        log.push(`reroute ${to} REFUSED`);
        return 'cannotStartRecording';
      }
      w.onEarbudsMic = to === 'headset';
      log.push(`reroute ${to}`);
      return null;
    },
    processedOpen: async () => {
      if (!w.glass) w.violations.push('voice processing was opened off glass');
      if (w.ear) w.violations.push('voice processing was opened over the workout\'s ear');
      if (refuses.voiceProcessing) return 'voice processing unavailable';
      w.processed = true;
      log.push('processed open');
      return null;
    },
    processedClose: async () => {
      if (w.processed) log.push('processed closed');
      w.processed = false;
    },
    processedAlive: () => w.processed,
    processedDuck: (level, advanced) => {
      if (!w.processed) return 'not open';
      if (refuses.ios17) return 'needs iOS 17';
      w.duckLevel = level;
      log.push(`level ${level}${advanced ? ' by voice' : ''}`);
      return 'ok';
    },
    processedSay: async (line) => {
      if (!w.processed) w.violations.push('a processed line with no processed ear');
      if (refuses.naturalVoice) return false;
      log.push(`processed say ${line} @${w.duckLevel}`);
      return true;
    },
    processedListen: async () => {
      log.push('listen processed');
      return heard();
    },
    preferPhoneMic: () => {
      log.push('ask phone mic');
      if (refuses.musicProfile === 'back after phone mic') w.processedRoute = 'full';
      return 'ok';
    },
    restate: () => {
      log.push('restate');
      if (refuses.musicProfile === 'back after restate') w.processedRoute = 'full';
      return 'ok';
    },
  };
  return { phone, log, facts, w, note: (f: MeasureFact) => void facts.push(f) };
}

const said = (log: string[]) => log.filter((l) => /^(say|speak|processed say) /.test(l)).map((l) => l.replace(/^(say|speak|processed say) /, '').replace(/ (@.*|\(option on\))$/, ''));
const step = (facts: MeasureFact[], name: string) => facts.filter((f) => f.step === name);

/** Whatever happened: nothing held, nothing lowered, no ear of either kind left open. */
function leftAsFound(p: ReturnType<typeof aPhone>) {
  expect(p.w.violations).toEqual([]);
  expect(p.w.held).toBe(0);
  expect(p.w.ear).toBe(false);
  expect(p.w.processed).toBe(false);
  expect(p.w.liveDuck).toBe(false);
}

describe('⛔ the measurement, walked over a phone that allows everything', () => {
  it('asks every question the plan names, in the order his ears are asked — and leaves the phone as it found it', async () => {
    const p = aPhone();
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome).toEqual({ ended: 'done', asked: ['q1', 'q2', 'q3', 'earbuds', 'q4', 'q5', 'q6', 'q7'] });
    expect(said(p.log)).toEqual([
      'LOCK', 'Q1', 'NUMBER', 'HEARD שבע', 'Q2', 'Q3', 'NUMBER-EARBUDS', 'HEARD שבע', 'HALF',
      'LOCK-AGAIN', 'Q4', 'Q5', 'Q6', 'Q7', 'NUMBER-AGAIN', 'HEARD שבע', 'DONE',
    ]);
    leftAsFound(p);
  });

  it('half one is the workout\'s own ear: his voice on the phone\'s microphone, the option on for ONE line, the earbuds\' microphone and back', async () => {
    const p = aPhone();
    await runMeasure(p.phone, LINES, p.note);
    const half = p.log.slice(0, p.log.indexOf('say HALF'));
    expect(half).toEqual([
      'ear open',
      'say LOCK',
      'say Q1',
      'say NUMBER',
      'listen on phone',
      'say HEARD שבע',
      'live duck on',
      'speak Q2 (option on)', // the one line said with `.duckOthers` on the live session
      'live duck off',
      'speak Q3', // …and the line that asks whether the music came back is said with it off
      'reroute headset',
      'say NUMBER-EARBUDS',
      'listen on earbuds',
      'reroute phone', // back BEFORE what was heard is said: his music is at call quality for the answer only
      'say HEARD שבע',
    ]);
    expect(step(p.facts, 'phone mic')[0]).toMatchObject({ over: 27, voice: -24, room: -51, heard: 'שבע' });
    expect(step(p.facts, 'earbuds mic')[0]).toMatchObject({ over: 27, heard: 'שבע' });
    expect(step(p.facts, 'live duck on')[0]).toMatchObject({ option: true, alive: true });
    expect(step(p.facts, 'live duck off')[0]).toMatchObject({ option: false, alive: true });
    expect(step(p.facts, 'to earbuds mic')[0]).toMatchObject({ ok: true, in: 'earbuds CALL', out: 'earbuds CALL', music: 'call' });
    expect(step(p.facts, 'back to phone mic')[0]).toMatchObject({ ok: true, in: 'phone mic', out: 'earbuds MUSIC', music: 'full' });
  });

  it('half two opens voice processing ON GLASS, with the workout\'s ear closed — the most lowering for one line, the least before and after', async () => {
    const p = aPhone();
    await runMeasure(p.phone, LINES, p.note);
    const half = p.log.slice(p.log.indexOf('say HALF') + 1);
    expect(half).toEqual([
      `wait for glass ${GLASS_MS / 1000}s`,
      'ear closed',
      'processed open',
      'level 10',
      'processed say LOCK-AGAIN @10',
      'processed say Q4 @10', // her music before anything is lowered on purpose
      'level 30',
      'processed say Q5 @30',
      'level 10',
      'processed say Q6 @10',
      'level 30 by voice',
      'processed say Q7 @30',
      'level 10',
      'processed say NUMBER-AGAIN @10',
      'listen processed',
      'processed say HEARD שבע @10',
      'processed say DONE @10',
      'processed closed',
    ]);
    expect(step(p.facts, 'processed route')[0]).toMatchObject({ in: 'phone mic', out: 'earbuds MUSIC', khz: 48, mode: 'VoiceChat', music: 'full', alive: true });
    // The music profile was kept: nothing more is asked of the session.
    expect(p.log).not.toContain('ask phone mic');
    expect(p.log).not.toContain('restate');
  });
});

describe('⛔ the measurement, walked over a phone that refuses', () => {
  it('no microphone: nothing is asked, and nothing is left held', async () => {
    const p = aPhone({ microphone: true });
    expect(await runMeasure(p.phone, LINES, p.note)).toEqual({ ended: 'no microphone', asked: [] });
    expect(said(p.log)).toEqual([]);
    expect(step(p.facts, 'microphone')[0]).toMatchObject({ held: false, error: 'microphone input is busy' });
    leftAsFound(p);
  });

  it('the microphone is gone in the pocket: the two moves that need it are skipped, the second half still runs', async () => {
    const p = aPhone({ micLostInPocket: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('done');
    expect(outcome.asked).toEqual(['q1', 'q4', 'q5', 'q6', 'q7']);
    expect(p.log.some((l) => l.startsWith('reroute') || l.startsWith('live duck on'))).toBe(false);
    leftAsFound(p);
  });

  it('iOS will not move the engine to the earbuds from a pocket: said once in the facts, never tried again, and the second half still runs', async () => {
    const p = aPhone({ earbudsMove: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('done');
    expect(outcome.asked).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']); // no question about an answer that was never taken there
    expect(p.log.filter((l) => l.startsWith('reroute'))).toEqual(['reroute headset REFUSED']);
    expect(step(p.facts, 'to earbuds mic')[0]).toMatchObject({ ok: false, error: 'cannotStartRecording', alive: false });
    expect(step(p.facts, 'half one over')[0]).toMatchObject({ alive: false });
    expect(p.log).toContain('processed open'); // opened on glass, on a new engine
    leftAsFound(p);
  });

  it('…or will not move it back: the answer is still said back, and the second half still runs', async () => {
    const p = aPhone({ theWayBack: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('done');
    expect(step(p.facts, 'back to phone mic')[0]).toMatchObject({ ok: false, error: 'cannotStartRecording' });
    expect(said(p.log)).toContain('HALF');
    leftAsFound(p);
  });

  it('he never takes the phone out: the second half is not run from a pocket — voice processing opens on glass or not at all', async () => {
    const p = aPhone({ openingThePhone: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome).toEqual({ ended: 'phone not opened', asked: ['q1', 'q2', 'q3', 'earbuds'] });
    expect(p.log).not.toContain('processed open');
    expect(step(p.facts, 'phone not opened')).toHaveLength(1);
    leftAsFound(p);
  });

  it('voice processing will not open: said, the first half\'s answers stand, and he is told it is over', async () => {
    const p = aPhone({ voiceProcessing: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome).toEqual({ ended: 'no voice processing', asked: ['q1', 'q2', 'q3', 'earbuds'] });
    expect(step(p.facts, 'voice processing')[0]).toMatchObject({ open: false, error: 'voice processing unavailable' });
    expect(said(p.log).slice(-2)).toEqual(['HALF', 'DONE']);
    leftAsFound(p);
  });

  it('voice processing takes the earbuds\' call profile: the phone\'s microphone is asked for — and nothing more when that gives the music back', async () => {
    const p = aPhone({ musicProfile: 'back after phone mic' });
    await runMeasure(p.phone, LINES, p.note);
    expect(step(p.facts, 'processed route')[0]).toMatchObject({ out: 'earbuds CALL', khz: 16, music: 'call' });
    expect(step(p.facts, 'asked for phone mic')[0]).toMatchObject({ out: 'earbuds MUSIC', music: 'full', result: 'ok' });
    expect(p.log).not.toContain('restate');
    leftAsFound(p);
  });

  it('…then the category is restated, only if that did not', async () => {
    const p = aPhone({ musicProfile: 'back after restate' });
    await runMeasure(p.phone, LINES, p.note);
    expect(step(p.facts, 'asked for phone mic')[0]).toMatchObject({ music: 'call' });
    expect(step(p.facts, 'category restated')[0]).toMatchObject({ music: 'full', result: 'ok' });
    expect(p.log.filter((l) => l === 'ask phone mic' || l === 'restate')).toEqual(['ask phone mic', 'restate']);
    leftAsFound(p);
  });

  it('…and when nothing gives it back, the rest is still measured — at call quality, which the facts say', async () => {
    const p = aPhone({ musicProfile: 'never' });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('done');
    expect(step(p.facts, 'category restated')[0]).toMatchObject({ music: 'call' });
    expect(step(p.facts, 'music under processing')[0]).toMatchObject({ music: 'call' });
    expect(outcome.asked).toEqual(['q1', 'q2', 'q3', 'earbuds', 'q4', 'q5', 'q6', 'q7']);
    leftAsFound(p);
  });

  it('an iPhone before iOS 17 has no level to set: the three questions about it are not asked, the rest are', async () => {
    const p = aPhone({ ios17: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome).toEqual({ ended: 'done', asked: ['q1', 'q2', 'q3', 'earbuds', 'q4'] });
    expect(step(p.facts, 'lowering set to least')[0]).toMatchObject({ result: 'needs iOS 17' });
    expect(said(p.log).filter((l) => /^Q[567]$/.test(l))).toEqual([]);
    expect(p.log).toContain('listen processed');
    leftAsFound(p);
  });

  it('no natural voice on the phone: the second half\'s lines are said by the plain voice — every one of them, and it is said once that they were', async () => {
    const p = aPhone({ naturalVoice: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('done');
    expect(step(p.facts, 'natural voice')[0]).toMatchObject({ ready: 0, of: fixedLines(LINES).length });
    expect(step(p.facts, 'line not through processing')).toHaveLength(1);
    expect(said(p.log).slice(-8)).toEqual(['LOCK-AGAIN', 'Q4', 'Q5', 'Q6', 'Q7', 'NUMBER-AGAIN', 'HEARD שבע', 'DONE']);
    leftAsFound(p);
  });

  it('nothing is heard: it says so, and goes on', async () => {
    const p = aPhone({ hearing: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('done');
    expect(said(p.log).filter((l) => l === 'NOTHING')).toHaveLength(3);
    expect(step(p.facts, 'phone mic')[0]).toMatchObject({ over: 2, heard: null });
    leftAsFound(p);
  });

  it('a native call throws in his pocket: the measurement ends there, says what threw — and still leaves the phone as it found it', async () => {
    const p = aPhone({ listenThrows: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome).toEqual({ ended: 'threw', asked: ['q1'] });
    expect(step(p.facts, 'threw')[0]).toMatchObject({ error: 'the bridge is gone' });
    leftAsFound(p);
  });
});

describe('what the facts say', () => {
  const route = (over: Partial<SessionReport>): SessionReport => ({
    inputs: ['MicrophoneBuiltIn'], outputs: ['BluetoothA2DPOutput'], outputNames: ['x'], category: 'c', mode: 'AVAudioSessionModeDefault',
    rate: 48_000, hfpAllowed: false, a2dpAllowed: true, ducking: false, otherAudio: true, ...over,
  });

  it('her music\'s quality is read off the route — the call profile is the thing this measurement is about', () => {
    expect(musicQuality(route({}))).toBe('full');
    expect(musicQuality(route({ outputs: ['BluetoothHFP'], rate: 16_000 }))).toBe('call');
    expect(musicQuality(route({ outputs: ['Speaker'] }))).toBe('speaker'); // the coach talking out of the phone
    expect(musicQuality(route({ outputs: ['Receiver'] }))).toBe('speaker');
    expect(musicQuality(route({ outputs: ['Headphones'] }))).toBe('full');
    expect(musicQuality(route({ outputs: ['BluetoothLE'], rate: 48_000 }))).toBe('full');
    expect(musicQuality(route({ outputs: ['BluetoothLE'], rate: 16_000 }))).toBe('call');
    expect(musicQuality(route({ outputs: [] }))).toBe('unknown');
    expect(musicQuality(null)).toBe('unknown');
  });

  it('a fact is one short line, and an empty cell is not printed', () => {
    expect(factLine({ step: 'phone mic', over: 27, voice: -24, room: -51, heard: 'שבע', why: null })).toBe('phone mic · over=27 voice=-24 room=-51 heard=שבע');
    expect(factLine({ step: 'pocket', glass: false, alive: true })).toBe('pocket · glass=no alive=yes');
    expect(factLine({ step: 'half one over' })).toBe('half one over');
  });
});

describe('⛔ the workout is what build 76 proved — neither guess is reachable from it', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e: { name: string; isDirectory(): boolean }) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : [],
    );

  it('the measurement\'s native calls are named in exactly two files: the seam, and the measurement', () => {
    const CALLS = /\b(setDuckUnderEar|earReroute|processedOpen|processedDuck|processedSay|processedKeep|processedClip|processedPreferPhoneMic|processedRestate)\(/;
    const callers = walk('src').filter((f) => CALLS.test(read(f)));
    expect(callers.sort()).toEqual(['src/platform/voice/audioSession.ts', 'src/platform/voice/voiceMeasure.ts']);
    // …and the measurement itself is started from one place: the profile.
    const starters = walk('src').filter((f) => /\brunMeasure\(/.test(read(f)) && !f.endsWith('voiceMeasure.ts'));
    expect(starters).toEqual(['src/screens/profile/ProfileSheet.tsx']);
  });

  it('the conductor moves no microphone, and the hook reads no microphone choice', () => {
    expect(read('src/platform/voice/voiceConductor.ts')).not.toMatch(/answerMic/i);
    const hook = read('src/platform/voice/useVoiceCoach.ts');
    expect(hook).not.toMatch(/profile\?\.voiceMic|profile\?\.voiceDuck|answerMic|setDuckUnderEar/);
    // The profile offers neither choice.
    const sheet = read('src/screens/profile/ProfileSheet.tsx');
    expect(sheet).not.toMatch(/voiceMic|voiceDuck/);
    for (const locale of ['he', 'en']) {
      const copy = JSON.parse(read(`src/i18n/locales/${locale}.json`)).profile;
      expect(Object.keys(copy).filter((k) => /^voice(Mic|Duck|Probe)/.test(k))).toEqual([]);
    }
  });

  it('the Swift: the option is OFF unless the measurement turns it on, and a held microphone of either kind is never deactivated under', () => {
    const module = read('modules/hush-voice-audio/ios/HushVoiceAudioModule.swift');
    expect(module).toContain('private var duckUnderEar = false');
    expect(module).toMatch(/private var earRunning: Bool \{\s*return \(ear\?\.running \?\? false\) \|\| \(processedEar\?\.running \?\? false\)/);
    const apply = module.slice(module.indexOf('private func applySession(duck: Bool) throws {'), module.indexOf('private static func setPlayback'));
    expect(apply).not.toContain('setActive(false');
    // Voice processing shapes its own session; `applySession` only keeps it active.
    const processedBranch = apply.slice(apply.indexOf('if let processed = self.processedEar'), apply.indexOf('try Self.setPlayback(duck: duck)'));
    expect(processedBranch.length).toBeGreaterThan(40);
    expect(processedBranch).toContain('setActive(true)');
    expect(processedBranch).not.toContain('setCategory');
    // A workout's microphone always wins over a measurement left open.
    const open = module.slice(module.indexOf('AsyncFunction("earOpen")'), module.indexOf('AsyncFunction("earClose")'));
    expect(open).toMatch(/self\.processedEar = nil\s*processed\.close\(\)/);
    // …and the measurement never opens over a workout's.
    expect(module).toMatch(/AsyncFunction\("earProcessedOpen"\)[\s\S]{0,120}ear\.running \{ return "the workout holds the microphone" \}/);
  });

  it('the measurement\'s ear: voice processing on its own engine, the level behind iOS 17, and never a deactivation', () => {
    const ear = read('modules/hush-voice-audio/ios/HushProcessedEar.swift');
    expect(ear).toContain('try engine.inputNode.setVoiceProcessingEnabled(true)');
    expect(ear).toContain('let engine = AVAudioEngine()'); // a new engine every run — not the workout's
    expect(ear).toMatch(/guard #available\(iOS 17\.0, \*\) else \{ return "needs iOS 17" \}[\s\S]*voiceProcessingOtherAudioDuckingConfiguration/);
    expect(ear).not.toContain('setActive(false');
    // A player started on a stopped engine raises an exception no Swift `catch` sees: checked last.
    expect(ear).toMatch(/guard engine\.isRunning else \{ return ending\.fire\(false\) \}\s*mouth\.play\(\)/);
    // The session is asked for exactly as the workout's ear asks — what changes after is iOS's doing.
    expect(ear).toContain('HushEar.sessionOptions(.phone, duck: false)');
    // The other two steps live on the workout's ear, and do not deactivate either.
    const hushEar = read('modules/hush-voice-audio/ios/HushEar.swift');
    const reroute = hushEar.slice(hushEar.indexOf('func reroute(to next: Source'), hushEar.indexOf('/// The microphone is really running.'));
    expect(reroute).toContain('settle(tries:');
    expect(reroute).not.toContain('setActive(false');
  });

  it('CI type-checks the measurement\'s ear beside the workout\'s, at the app\'s own floor', () => {
    const ci = read('../../.github/workflows/ci.yml');
    expect(ci).toMatch(/swiftc -typecheck -parse-as-library -target arm64-apple-ios15\.1 code\/mobile\/modules\/hush-voice-audio\/ios\/HushEar\.swift code\/mobile\/modules\/hush-voice-audio\/ios\/HushProcessedEar\.swift/);
  });
});

describe('the questions: the number he hears is the number he answers', () => {
  const he = JSON.parse(read('src/i18n/locales/he.json')).profile as Record<string, string>;
  const en = JSON.parse(read('src/i18n/locales/en.json')).profile as Record<string, string>;
  const NUMBERS: [string, string][] = [['אחת', 'one'], ['שתיים', 'two'], ['שלוש', 'three'], ['ארבע', 'four'], ['חמש', 'five'], ['שש', 'six'], ['שבע', 'seven']];

  it('each spoken question names its number, and the screen\'s question carries the same one', () => {
    NUMBERS.forEach(([heWord, enWord], i) => {
      const n = i + 1;
      expect(he[`measureSay${n}`]).toMatch(new RegExp(`^שאלה ${heWord}\\. `));
      expect(en[`measureSay${n}`]).toMatch(new RegExp(`^Question ${enWord}\\. `));
      expect(he[`measureAsk${n}`]).toMatch(new RegExp(`^${n} · `));
      expect(en[`measureAsk${n}`]).toMatch(new RegExp(`^${n} · `));
    });
  });

  it('every line the profile hands the measurement exists in both languages — and a Hebrew line that tells him to do something has her form too', () => {
    const sheet = read('src/screens/profile/ProfileSheet.tsx');
    const keys = [...sheet.matchAll(/'profile\.(measure\w+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(40);
    for (const k of new Set(keys)) {
      expect(typeof he[k]).toBe('string');
      expect(typeof en[k]).toBe('string');
    }
    for (const k of ['measureLock', 'measureSay1', 'measureNumber', 'measureNumberEarbuds', 'measureHalf', 'measureLockAgain', 'measureNumberAgain', 'measureDone', 'measureShot', 'measureNoHeadset', 'measureNoMusic', 'measureNoMic', 'measureInWorkout']) {
      expect(typeof he[`${k}_female`]).toBe('string');
      expect(he[`${k}_female`]).not.toBe(he[k]);
    }
  });
});

/*
 * ════ THE REAL PHONE UNDER IT ════
 * `measurePhone` is the only part of the measurement that touches the phone, and a desk cannot run
 * it. What a desk CAN hold: a native call that never answers is not waited on for ever (the phone
 * is in his pocket — a hung step is a measurement that never tells him to take it out), a window
 * keeps and reads its own audio and no other's, and the wait for glass ends both ways.
 */
describe('the real phone under it', () => {
  let calls: string[] = [];
  let appState = 'active';
  let listeners: ((s: string) => void)[] = [];
  const never = () => new Promise<never>(() => {});

  beforeEach(() => {
    jest.useFakeTimers();
    calls = [];
    appState = 'active';
    listeners = [];
    for (const m of [mockAudio, mockEar, mockMouth, mockNatural]) for (const k of Object.keys(m)) delete m[k];
    Object.assign(mockAudio, {
      duck: async () => void calls.push('duck'),
      unduck: async () => void calls.push('unduck'),
      earListen: async (lang: string, token: number) => (calls.push(`listen ${lang} #${token}`), null),
      earClip: async (token: number, seconds: number) => (calls.push(`clip #${token} ${seconds}s`), { wav: 'UklGRg==', seconds, peakDb: -20, floorDb: -50 }),
      earStopListening: async () => void calls.push('stop listening'),
      earReroute: async (to: string) => (calls.push(`reroute ${to}`), null),
      processedSay: async (file: string) => (calls.push(`processed say ${file}`), true),
      processedKeep: () => void calls.push('keep'),
      processedClip: async () => (calls.push('processed clip'), { wav: 'UklGRg==', seconds: 6, peakDb: -18, floorDb: -60 }),
    });
    Object.assign(mockEar, { hearNow: async (_clip: unknown, expect: string, locale: string) => (calls.push(`hear ${expect} ${locale}`), { text: 'שבע', why: null }) });
    Object.assign(mockMouth, { say: async (line: string) => void calls.push(`say ${line}`) });
    Object.assign(mockNatural, { enabled: () => true, clip: async (line: string) => `file:///clips/${line}.wav` });
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, cb: (s: string) => void) => {
      listeners.push(cb);
      return { remove: () => void (listeners = listeners.filter((l) => l !== cb)) };
    }) as never);
    Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => appState });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('a line is said as the workout says it: duck, the line, unduck', async () => {
    await measurePhone('he').say('שלום');
    expect(calls).toEqual(['duck', 'say שלום', 'unduck']);
  });

  it('a window keeps its own audio and reads its own: listen, the wait, the clip of THAT window, stop, and the strong ear — a new number each time', async () => {
    const phone = measurePhone('he');
    const first = phone.listen(6_000);
    await jest.advanceTimersByTimeAsync(5_900);
    expect(calls).toEqual(['listen he-IL #900001']); // still listening
    await jest.advanceTimersByTimeAsync(200);
    expect(await first).toEqual({ peakDb: -20, floorDb: -50, text: 'שבע', why: null });
    expect(calls).toEqual(['listen he-IL #900001', 'clip #900001 6s', 'stop listening', 'hear reps he']);
    const second = phone.listen(6_000);
    await jest.advanceTimersByTimeAsync(6_100);
    await second;
    expect(calls[4]).toBe('listen he-IL #900002');
  });

  it('a microphone that will not listen says why, and nothing is waited for or sent', async () => {
    mockAudio.earListen = async () => 'ear not running';
    expect(await measurePhone('he').listen(6_000)).toEqual({ peakDb: null, floorDb: null, text: null, why: 'ear not running' });
    expect(calls).toEqual([]);
  });

  it('a window that kept nothing says so, and nothing is sent', async () => {
    mockAudio.processedClip = async () => null;
    const heard = measurePhone('he').processedListen(6_000);
    await jest.advanceTimersByTimeAsync(6_100);
    expect(await heard).toEqual({ peakDb: null, floorDb: null, text: null, why: 'no audio kept' });
    expect(calls).toEqual(['keep']);
  });

  it('⛔ a native call that never answers is not waited on for ever: the move, the two opens, a processed line', async () => {
    Object.assign(mockAudio, { earReroute: never, earOpen: never, processedOpen: never, processedSay: never });
    const phone = measurePhone('he');
    const results: unknown[] = [];
    void phone.open().then((r) => results.push(r));
    void phone.processedOpen().then((r) => results.push(r));
    void phone.reroute('headset').then((r) => results.push(r));
    void phone.processedSay('שורה').then((r) => results.push(r));
    await jest.advanceTimersByTimeAsync(7_900);
    expect(results).toEqual([]);
    await jest.advanceTimersByTimeAsync(2_200);
    expect(results).toEqual(['timed out', 'timed out', 'timed out']); // 8 s, 8 s, 10 s
    await jest.advanceTimersByTimeAsync(30_000);
    expect(results).toEqual(['timed out', 'timed out', 'timed out', false]);
  });

  it('a processed line with no file on the phone is not sent to the engine at all', async () => {
    mockNatural.clip = async () => null;
    expect(await measurePhone('he').processedSay('שורה')).toBe(false);
    expect(calls).toEqual([]);
  });

  it('the lines are fetched before the first is needed — and none is, when the natural voice is off', async () => {
    const asked: string[] = [];
    mockNatural.clip = async (line: string) => (asked.push(line), line === 'ג' ? null : `file:///${line}`);
    expect(await measurePhone('he').prepare(['א', 'ב', 'ג', 'ד'])).toBe(3);
    expect(asked).toEqual(['א', 'ב', 'ג', 'ד']);
    mockNatural.enabled = () => false;
    expect(await measurePhone('he').prepare(['א'])).toBe(0);
  });

  it('the wait for glass: at once when it is on glass; when he unlocks; and not for ever', async () => {
    const phone = measurePhone('he');
    expect(await phone.untilOnGlass(GLASS_MS)).toBe(true);
    expect(listeners).toHaveLength(0);

    appState = 'background';
    let answer: boolean | null = null;
    void phone.untilOnGlass(GLASS_MS).then((r) => (answer = r));
    await jest.advanceTimersByTimeAsync(30_000);
    expect(answer).toBeNull();
    listeners.forEach((l) => l('inactive')); // the lock screen lighting up is not the app on glass
    await jest.advanceTimersByTimeAsync(10);
    expect(answer).toBeNull();
    appState = 'active';
    listeners.forEach((l) => l('active'));
    await jest.advanceTimersByTimeAsync(10);
    expect(answer).toBe(true);
    expect(listeners).toHaveLength(0);

    appState = 'background';
    let late: boolean | null = null;
    void phone.untilOnGlass(GLASS_MS).then((r) => (late = r));
    await jest.advanceTimersByTimeAsync(GLASS_MS + 10);
    expect(late).toBe(false);
    expect(listeners).toHaveLength(0);
  });
});
