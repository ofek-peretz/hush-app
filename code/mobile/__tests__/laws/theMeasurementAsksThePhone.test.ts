/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT A DESK CANNOT KNOW IS ASKED OF THE PHONE — ONE ACT AT A TIME, AND NEVER BUILT ON A GUESS
 *
 * Founder, 2026-10-06, after two audio changes were built into the workout in one afternoon:
 *   > *"אתה לא יכול לבדוק את זה באינטרנט או בכלי חיפוש כלשהו אם זה אמור או יכול לעבוד והאם יש תקדים
 *   > לזה שהצליחו? … אני לא רוצה שישר תתחיל לעשות מבלי לתכנן לפני … אנחנו בונים פה סטארטאפ לא צעצוע."*
 *
 * The first measurement (build 77) answered more than it asked. From his phone — Spotify, Sony
 * WH-1000XM5, iOS 26.3.1:
 *   > *"לחצתי על בדיקת קול המוזיקה נחלשה."*                     (the coach, no microphone)
 *   > *"התחלתי אימון והמוזיקה נעצרה … איך שהמאמנת התחילה לדבר המוזיקה שוב נעצרה לגמרי."*  (held)
 * and from its own log: a locked phone refused both changes to its session, and Apple's voice
 * processing threw the sound out of the earbuds. So, approved by him on 2026-10-10:
 *
 *   1 · THE WORKOUT HOLDS NO MICROPHONE. The coach speaks, the music is lowered for the line, a set
 *       is marked on the lock screen or the wrist — and nothing is said about not hearing.
 *   2 · THE PHONE IS ASKED WHICH ACT STOPS THE MUSIC: ten ways of holding the session, each alone,
 *       the phone itself answering after each. Walked here over phones that behave every way — the
 *       measurement always ends, and always leaves the phone as it found it.
 *   3 · NOTHING OF THE MEASUREMENT IS REACHABLE FROM A WORKOUT, and what the phone refused in the
 *       first one is gone from the code, not parked in it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* The real phone's seams, filled in by the walks at the bottom (`the real phone under it`). Read
   through getters: the mocks are hoisted above these lines, and a value captured then is undefined. */
const mockAudio: Record<string, any> = {};
const mockMouth: Record<string, any> = {};
const mockNatural: Record<string, any> = {};
const mockAwake: string[] = [];
jest.mock('@/platform/voice/audioSession', () => ({ get audioSession() { return mockAudio; } }));
jest.mock('@/platform/voice/coachVoice', () => ({ get coachVoice() { return mockMouth; } }));
jest.mock('@/platform/voice/neuralVoice', () => ({ get neuralVoice() { return mockNatural; } }));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: async (tag: string) => void mockAwake.push(`awake ${tag}`),
  deactivateKeepAwake: async (tag: string) => void mockAwake.push(`asleep ${tag}`),
}));

// eslint-disable-next-line import/first
import { AppState } from 'react-native';
// eslint-disable-next-line import/first
import type { TrialFacts } from '@/platform/voice/audioSession';
// eslint-disable-next-line import/first
import { factLine, measurePhone, runMeasure, trialFact, HAND_MS, TRIALS, type MeasureFact, type MeasurePhone, type TrialName } from '@/platform/voice/voiceMeasure';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const LINES = { duckLine: 'THE LINE' };
const WITH_A_LINE_AND_A_MIC = TRIALS.filter((n) => n.startsWith('mic') && n !== 'mic only');

/** A phone, and how it behaves. Everything the flow does to it is written in `log`. */
function aPhone(behaves: Partial<{
  /** At which act of a trial her music stops — null when it never does. */
  stopsAt: (name: TrialName) => 'open' | 'restate' | 'sound' | null;
  /** After a trial lets go, her music comes back by itself. */
  resumes: boolean;
  /** Asked to press Play, she does. */
  pressesPlay: boolean;
  /** The app leaves the screen before this trial. */
  leavesBefore: TrialName;
  /** This trial answers with an error instead of facts. */
  refuses: TrialName;
  /** This trial's native call rejects. */
  throwsAt: TrialName;
  speakThrows: boolean;
  /** No music is playing when the measurement starts. */
  silentAtStart: boolean;
}> = {}) {
  const log: string[] = [];
  const facts: MeasureFact[] = [];
  const w = { music: !behaves.silentAtStart, glass: true, awake: false, held: 0, asking: false, ducked: false, asks: 0, waited: 0 };
  const phone: MeasurePhone = {
    wait: async (ms) => {
      w.waited += ms;
      // Shown that her music has to be started by hand, she starts it — or does not.
      if (w.asking && behaves.pressesPlay) w.music = true;
    },
    onGlass: () => w.glass,
    music: () => w.music,
    keepAwake: (on) => {
      w.awake = on;
      log.push(on ? 'screen kept on' : 'screen released');
    },
    askForMusic: (on) => {
      if (on && !w.asking) {
        w.asks += 1;
        log.push('asked to press Play');
      }
      w.asking = on;
    },
    prepare: async (line) => void log.push(`prepare ${line}`),
    trial: async (name) => {
      if (!w.music) log.push(`⚠ ${name} began with no music`);
      if (w.held > 0) log.push(`⚠ ${name} began under the silent loop`);
      log.push(`trial ${name}`);
      if (behaves.throwsAt === name) throw new Error('the bridge is gone');
      if (behaves.refuses === name) return { name, error: 'microphone input is busy', released: 'ok' };
      const at = behaves.stopsAt?.(name) ?? null;
      const t: TrialFacts = { name, before: w.music, open: at !== 'open', sound: at == null, in: 'MicrophoneBuiltIn', out: 'BluetoothA2DPOutput', rate: 48_000, mixing: true, played: 'ok', released: 'ok' };
      if (name === 'mic + restate + line') Object.assign(t, { restate: 'ok', restated: at !== 'open' && at !== 'restate' });
      if (name === 'playback') Object.assign(t, { in: undefined });
      if (at != null) w.music = false;
      // Letting go is what lets a music app iOS interrupted resume by itself.
      if (!w.music && behaves.resumes !== false) w.music = true;
      return t;
    },
    hold: async () => {
      w.held += 1;
      log.push('silent loop held');
    },
    release: async () => {
      w.held -= 1;
      log.push('silent loop released');
    },
    duck: async () => {
      w.ducked = true;
      log.push('duck');
    },
    unduck: async () => {
      w.ducked = false;
      log.push('unduck');
    },
    duckReport: () => ({ letGo: 'ok', taken: 'ok', option: true }),
    speak: async (line) => {
      if (behaves.speakThrows) throw new Error('no mouth');
      log.push(`speak ${line}${w.ducked ? ' (ducked)' : ''}`);
    },
  };
  // The app leaves the screen just before the named trial is reached.
  if (behaves.leavesBefore) {
    const trial = phone.trial;
    const onGlass = phone.onGlass;
    let done = 0;
    phone.trial = async (name) => {
      done += 1;
      return trial(name);
    };
    phone.onGlass = () => (TRIALS[done] === behaves.leavesBefore ? false : onGlass());
  }
  return { phone, log, facts, w, note: (f: MeasureFact) => void facts.push(f) };
}

const trials = (log: string[]) => log.filter((l) => l.startsWith('trial ')).map((l) => l.slice(6));
const step = (facts: MeasureFact[], name: string) => facts.filter((f) => f.step === name);

/** Whatever happened: the screen released, the silent loop let go, nothing still asked of her. */
function leftAsFound(p: ReturnType<typeof aPhone>) {
  expect(p.log.filter((l) => l.startsWith('⚠'))).toEqual([]);
  expect(p.w.awake).toBe(false);
  expect(p.w.held).toBe(0);
  expect(p.w.asking).toBe(false);
}

/** His phone, as he described it: a microphone and a sound together stop the music; it resumes on release. */
const hisPhone = () => aPhone({ stopsAt: (n) => (WITH_A_LINE_AND_A_MIC.includes(n) || n === 'voice processing + line' ? 'sound' : null) });

describe('⛔ the measurement, walked', () => {
  it('a phone like his: every trial is run alone and in order, the phone says which ones her music lived through — then the workout\'s own duck, and the phone is left as it was found', async () => {
    const p = hisPhone();
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('done');
    expect(trials(p.log)).toEqual([...TRIALS]);
    expect(outcome.lives).toEqual(['playback', 'mic only', 'record session, no mic + line']);
    expect(outcome.stops).toEqual([...WITH_A_LINE_AND_A_MIC, 'voice processing + line']);
    expect(step(p.facts, 'her music lives with')[0]).toMatchObject({ trials: 'playback | mic only | record session, no mic + line' });
    expect(step(p.facts, 'mic + restate + line')[0]).toMatchObject({ open: true, restated: true, sound: false, back: true, in: 'phone mic', out: 'earbuds MUSIC', khz: 48, mix: true });
    expect(outcome.asked).toEqual(['last', 'during', 'after']);
    expect(p.w.asks).toBe(0); // it came back by itself every time: she is asked for nothing
    leftAsFound(p);
  });

  it('the line is on the phone before the first trial; the control is first and voice processing last', async () => {
    const p = hisPhone();
    await runMeasure(p.phone, LINES, p.note);
    expect(p.log.slice(0, 3)).toEqual(['screen kept on', 'prepare THE LINE', 'trial playback']);
    expect(TRIALS[0]).toBe('playback'); // if her music does not survive THIS, the instrument is wrong
    expect(TRIALS[TRIALS.length - 1]).toBe('voice processing + line'); // the one tone she is asked about by ear
  });

  it('part two is the workout\'s own duck: the silent loop first, the line said UNDER the duck, the phone asked three times — and only after every trial is over', async () => {
    const p = hisPhone();
    await runMeasure(p.phone, LINES, p.note);
    expect(p.log.slice(p.log.indexOf('trial voice processing + line') + 1)).toEqual([
      'silent loop held',
      'duck',
      'speak THE LINE (ducked)',
      'unduck',
      'silent loop released',
      'screen released',
    ]);
    expect(step(p.facts, 'workout duck')[0]).toMatchObject({ letGo: 'ok', taken: 'ok', option: true, music: true });
    expect(step(p.facts, 'as the line ended')).toHaveLength(1);
    expect(step(p.facts, 'after the line')).toHaveLength(1);
  });

  it('a phone on which nothing stops her music: every trial lives', async () => {
    const p = aPhone();
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.lives).toEqual([...TRIALS]);
    expect(outcome.stops).toEqual([]);
    expect(step(p.facts, 'her music stops with')[0]).toMatchObject({ trials: 'none' });
    leftAsFound(p);
  });

  it('opening the microphone alone stops it: said as `open=NO`, and counted as a way that stops her music', async () => {
    const p = aPhone({ stopsAt: (n) => (n === 'playback' ? null : 'open') });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.lives).toEqual(['playback']);
    expect(factLine(step(p.facts, 'mic only')[0])).toContain('open=NO');
    leftAsFound(p);
  });

  it('her music does not come back by itself: she is asked to press Play — once each time — and the trials go on', async () => {
    const p = aPhone({ stopsAt: (n) => (n === 'mic + line' || n === 'mic fresh + line' ? 'sound' : null), resumes: false, pressesPlay: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('done');
    expect(trials(p.log)).toEqual([...TRIALS]);
    expect(p.w.asks).toBe(2);
    expect(step(p.facts, 'mic + line')[0]).toMatchObject({ sound: false, back: false });
    expect(step(p.facts, 'music started by hand')).toEqual([{ step: 'music started by hand', ok: true }, { step: 'music started by hand', ok: true }]);
    leftAsFound(p);
  });

  it('…and she does not: it ends there, having waited no longer than it said — no trial is run on silence, and no part two', async () => {
    const p = aPhone({ stopsAt: (n) => (n === 'mic + line' ? 'sound' : null), resumes: false, pressesPlay: false });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('no music');
    expect(trials(p.log)).toEqual(['playback', 'mic only', 'mic + line']);
    expect(p.log).not.toContain('silent loop held');
    expect(outcome.asked).toEqual([]);
    expect(p.w.waited).toBeLessThan(HAND_MS + 60_000);
    leftAsFound(p);
  });

  it('no music when it starts: she is asked before the first trial, not after a wasted one', async () => {
    const p = aPhone({ silentAtStart: true, pressesPlay: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('done');
    expect(p.log.indexOf('asked to press Play')).toBeLessThan(p.log.indexOf('trial playback'));
    leftAsFound(p);
  });

  it('the app leaves the screen: a locked phone refuses every change to its session, so nothing more is tried', async () => {
    const p = aPhone({ leavesBefore: 'mic + line through engine' });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('left the screen');
    expect(trials(p.log)).toEqual(['playback', 'mic only', 'mic + line', 'mic + restate + line']);
    expect(step(p.facts, 'stopped')[0]).toMatchObject({ before: 'mic + line through engine' });
    expect(p.log).not.toContain('silent loop held');
    leftAsFound(p);
  });

  it('a trial that answers with an error is written down, counted on neither side, and the next one runs', async () => {
    const p = aPhone({ refuses: 'mic + line through engine' });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('done');
    expect(step(p.facts, 'mic + line through engine')[0]).toMatchObject({ error: 'microphone input is busy' });
    expect([...outcome.lives, ...outcome.stops]).not.toContain('mic + line through engine');
    expect(trials(p.log)).toHaveLength(TRIALS.length);
    leftAsFound(p);
  });

  it('voice processing could not be tried: she is not asked about a tone that never sounded', async () => {
    const p = aPhone({ refuses: 'voice processing + line' });
    expect((await runMeasure(p.phone, LINES, p.note)).asked).toEqual(['during', 'after']);
    leftAsFound(p);
  });

  it('a native call throws: it ends there, says what threw — and still leaves the phone as it found it', async () => {
    const p = aPhone({ throwsAt: 'mic + line' });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('threw');
    expect(step(p.facts, 'threw')[0]).toMatchObject({ error: 'the bridge is gone' });
    leftAsFound(p);
  });

  it('…also when it throws under the silent loop, with her music lowered', async () => {
    const p = aPhone({ speakThrows: true });
    const outcome = await runMeasure(p.phone, LINES, p.note);
    expect(outcome.ended).toBe('threw');
    expect(p.log.slice(-2)).toEqual(['silent loop released', 'screen released']);
    leftAsFound(p);
  });
});

describe('what the facts say', () => {
  it('a trial is one short line; a "no" is printed loud, an "ok" is not printed at all', () => {
    const t: TrialFacts = { name: 'mic + line', before: true, open: true, sound: false, in: 'MicrophoneBuiltIn', out: 'BluetoothA2DPOutput', rate: 48_000, mixing: true, played: 'ok', released: 'ok' };
    expect(factLine(trialFact(t, true))).toBe('mic + line · open=yes sound=NO back=yes in=phone mic out=earbuds MUSIC khz=48 mix=yes');
    expect(factLine(trialFact({ name: 'mic only', open: true, sound: true, played: 'none', released: 'ok' }, true))).toBe('mic only · open=yes sound=yes back=yes');
    // What voice processing did by itself, and anything that was not "ok", is said.
    const vp = trialFact({ name: 'voice processing + line', first: 'Speaker', restate: 'ok', lowering: 'needs iOS 17', open: true, sound: true, out: 'BluetoothA2DPOutput', played: 'engine not running', released: 'busy' }, true);
    expect(vp).toMatchObject({ first: 'PHONE SPEAKER', lowering: 'needs iOS 17', played: 'engine not running', released: 'busy' });
    expect(vp.restate).toBeUndefined();
    expect(factLine({ step: 'threw', error: 'x' })).toBe('threw · error=x');
  });
});

describe('⛔ the workout holds no microphone, and nothing of the measurement is reachable from it', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e: { name: string; isDirectory(): boolean }) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : [],
    );

  it('the switch is off, and it is one function in one file', () => {
    const { workoutHoldsMicrophone } = jest.requireActual('@/platform/voice/workoutMicrophone');
    expect(workoutHoldsMicrophone()).toBe(false);
    // Asked by the hook (what opens), the Start (what is asked of her) and the profile (what is offered).
    const askers = walk('src').filter((f) => /workoutHoldsMicrophone\(\)/.test(read(f)) && !f.endsWith('workoutMicrophone.ts'));
    expect(askers.sort()).toEqual(['src/platform/voice/useVoiceCoach.ts', 'src/platform/voice/voiceCapture.ts', 'src/screens/profile/ProfileSheet.tsx']);
  });

  it('with it off: no road opens the microphone, the conductor\'s ear is down by design, and Start asks for no permission', () => {
    const hook = read('src/platform/voice/useVoiceCoach.ts');
    // Every road that opens the pocket ear goes through one function, and it ends on its first line.
    expect(hook).toMatch(/const openPocketEar = async \(\): Promise<void> => \{[\s\S]{0,700}?if \(!workoutHoldsMicrophone\(\)\) return;\s*if \(Platform\.OS !== 'ios' \|\| audioSession\.earRunning\(\)\) return;/);
    expect(hook.match(/audioSession\.earOpen\(/g)).toHaveLength(1);
    // The gate enables the coach without asking her for the microphone.
    const open = hook.slice(hook.indexOf('const open = () => {'), hook.indexOf('/** `leaving`: the stage is going'));
    expect(open.indexOf('if (!workoutHoldsMicrophone()) {')).toBeLessThan(open.indexOf('voiceCapture.ensurePermission()'));
    expect(hook).toContain('hearsHer: () => workoutHoldsMicrophone()');
    const capture = read('src/platform/voice/voiceCapture.ts');
    expect(capture).toMatch(/async askAtStart\(voiceOn: boolean\): Promise<void> \{[\s\S]{0,300}?if \(!workoutHoldsMicrophone\(\)\) return;/);
  });

  it('the trials are named in exactly two files, and the measurement is started from one', () => {
    const CALLS = /\bsessionTrial\(/;
    expect(walk('src').filter((f) => CALLS.test(read(f))).sort()).toEqual(['src/platform/voice/audioSession.ts', 'src/platform/voice/voiceMeasure.ts']);
    // The duck's own report is only READ — by the measurement, and by the journal row of every line
    // a workout says: her music in a POCKET is something only a workout can show.
    expect(walk('src').filter((f) => /\bduckReport\b/.test(read(f))).sort()).toEqual([
      'src/platform/voice/audioSession.ts',
      'src/platform/voice/useVoiceCoach.ts',
      'src/platform/voice/voiceMeasure.ts',
    ]);
    expect(read('src/platform/voice/useVoiceCoach.ts')).toMatch(/void track\('voice_said', \{[\s\S]{0,260}?glass: AppState\.currentState === 'active',\s*duck: duck \?/);
    expect(walk('src').filter((f) => /\brunMeasure\(/.test(read(f)) && !f.endsWith('voiceMeasure.ts'))).toEqual(['src/screens/profile/ProfileSheet.tsx']);
  });

  it('what the phone refused is GONE, not parked: no live duck, no move to the earbuds\' microphone, no choice of microphone', () => {
    const everything = [...walk('src').map(read), read('modules/hush-voice-audio/ios/HushVoiceAudioModule.swift'), read('modules/hush-voice-audio/ios/HushEar.swift')].join('\n');
    expect(everything).not.toMatch(/duckUnderEar|setDuckUnderEar|earReroute|answerMic|processedOpen|earProcessed|voiceDuck/);
    expect(read('modules/hush-voice-audio/ios/HushEar.swift')).not.toMatch(/func reroute|func settle/);
    expect(read('src/screens/profile/ProfileSheet.tsx')).not.toMatch(/voiceMic|voiceDuck/);
    for (const locale of ['he', 'en']) {
      const copy = JSON.parse(read(`src/i18n/locales/${locale}.json`)).profile;
      expect(Object.keys(copy).filter((k) => /^voice(Mic|Duck|Probe)|^measure(Say|Lock|Half|Number|Ask\d)/.test(k))).toEqual([]);
    }
  });

  it('the Swift under a workout: a held ear is never ducked under and never deactivated under — and `duck` only writes down what it did', () => {
    const module = read('modules/hush-voice-audio/ios/HushVoiceAudioModule.swift');
    const apply = module.slice(module.indexOf('private func applySession(duck: Bool) throws {'), module.indexOf('private static func setPlayback'));
    expect(apply).toContain('HushEar.sessionOptions(ear.source, duck: false)');
    expect(apply).not.toContain('setActive(false');
    const duck = module.slice(module.indexOf('AsyncFunction("duck")'), module.indexOf('AsyncFunction("unduck")'));
    expect(duck).toMatch(/if !self\.earRunning && !session\.categoryOptions\.contains\(\.duckOthers\) \{\s*self\.keepAlive\?\.pause\(\)\s*do \{\s*try session\.setActive\(false\)/);
    expect(duck).toContain('self.lastDuck = ["letGo": letGo, "taken": "ok"');
    // A trial never runs over a workout's microphone.
    expect(module).toMatch(/AsyncFunction\("sessionTrial"\)[\s\S]{0,200}?ear\.running \{\s*promise\.resolve\(\["name": name, "error": "the workout holds the microphone"\]\)/);
  });
});

describe('the trials the phone is asked for exist, by name, on the phone', () => {
  const swift = read('modules/hush-voice-audio/ios/HushSessionTrial.swift');
  const cases = [...swift.matchAll(/^\s*case "([^"]+)":/gm)].map((m) => m[1]);

  it('every name the measurement asks for is a trial in the Swift, and the Swift has no trial nobody asks for', () => {
    expect(cases).toEqual([...TRIALS]);
  });

  it('the workout\'s own way is among them, exactly: warm, the three options, the microphone, the restate, a player\'s line', () => {
    expect(swift).toMatch(/private static let standard: AVAudioSession\.CategoryOptions = \[\.mixWithOthers, \.defaultToSpeaker, \.allowBluetoothA2DP\]/);
    expect(read('modules/hush-voice-audio/ios/HushEar.swift')).toMatch(/var options: AVAudioSession\.CategoryOptions = \[\.mixWithOthers, \.defaultToSpeaker\][\s\S]{0,200}?case \.phone: options\.insert\(\.allowBluetoothA2DP\)/);
    expect(swift).toMatch(/case "mic \+ restate \+ line":[\s\S]{0,120}?Plan\(warm: true, record: true, options: standard, microphone: true, restate: true, sound: \.player, processed: false\)/);
    // The control holds no microphone and records nothing.
    expect(swift).toMatch(/case "playback":[\s\S]{0,200}?Plan\(warm: false, record: false, options: \[\.mixWithOthers\], microphone: false/);
  });

  it('every trial ends by giving the session back — the release that lets her music resume — and a player is never started on a stopped engine', () => {
    const release = swift.slice(swift.indexOf('private func release('), swift.indexOf('// MARK: - Generated sound'));
    expect(release).toContain('setActive(false, options: [.notifyOthersOnDeactivation])');
    expect(release).toContain('done(facts.all)');
    expect(swift).toMatch(/guard engine\.isRunning else \{ return "engine stopped" \}\s*node\.play\(\)/);
    expect(read('modules/hush-voice-audio/ios/HushProcessedEar.swift')).toMatch(/guard engine\.isRunning else \{ return ending\.fire\(false\) \}\s*mouth\.play\(\)/);
  });

  it('CI type-checks all three files at the app\'s own floor', () => {
    const ci = read('../../.github/workflows/ci.yml');
    expect(ci).toMatch(/swiftc -typecheck -parse-as-library -target arm64-apple-ios15\.1 code\/mobile\/modules\/hush-voice-audio\/ios\/HushEar\.swift code\/mobile\/modules\/hush-voice-audio\/ios\/HushProcessedEar\.swift code\/mobile\/modules\/hush-voice-audio\/ios\/HushSessionTrial\.swift/);
  });
});

describe('the copy', () => {
  const he = JSON.parse(read('src/i18n/locales/he.json'));
  const en = JSON.parse(read('src/i18n/locales/en.json'));

  it('every line the profile shows for the measurement exists in both languages — and a Hebrew line that tells him to do something has her form too', () => {
    const sheet = read('src/screens/profile/ProfileSheet.tsx');
    const keys = [...new Set([...sheet.matchAll(/'profile\.(measure\w*)'/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThanOrEqual(19);
    for (const k of keys) {
      expect(typeof he.profile[k]).toBe('string');
      expect(typeof en.profile[k]).toBe('string');
    }
    expect(Object.keys(he.profile).filter((k) => k.startsWith('measure') && !k.endsWith('_female')).sort()).toEqual([...keys].sort());
    for (const k of ['measureInWorkout', 'measureNoHeadset', 'measureNoMic', 'measureNoMusic', 'measurePressPlay', 'measureDuckLine', 'measureShot']) {
      expect(typeof he.profile[`${k}_female`]).toBe('string');
      expect(he.profile[`${k}_female`]).not.toBe(he.profile[k]);
    }
  });

  it('the voice row says what the voice does now: it speaks and the music is lowered — it no longer says it asks or writes down', () => {
    expect(he.profile.voiceSub).toContain('מונמכת');
    expect(he.profile.voiceSub).toContain('מסמנים');
    expect(he.profile.voiceSub).not.toMatch(/שואלת|רושמת/);
    expect(en.profile.voiceSub).not.toMatch(/asks|logs it/);
  });

  it('the first workout\'s one sentence has its no-microphone form: where a set is marked, not what to say', () => {
    expect(he.voice.openFirstSessionMark).toBe('אני המאמנת שלך. בסוף כל סט, סמן אותו במסך הנעילה או בשעון.');
    expect(he.voice.openFirstSessionMark_female).toBe('אני המאמנת שלך. בסוף כל סט, סמני אותו במסך הנעילה או בשעון.');
    expect(en.voice.openFirstSessionMark).not.toMatch(/say/i);
    const conductor = read('src/platform/voice/voiceConductor.ts');
    expect(conductor).toContain('this.earless() ? voiceScript.openFirstSessionMark() : voiceScript.openFirstSession()');
  });
});

/*
 * ════ THE REAL PHONE UNDER IT ════
 * `measurePhone` is the only part of the measurement that touches the phone, and a desk cannot run
 * it. What a desk CAN hold: a trial that never answers is not waited on for ever, her music is read
 * from what iOS says and from nothing else, and the screen is kept lit and then let go.
 */
describe('the real phone under it', () => {
  let calls: string[] = [];
  let appState = 'active';
  let other: boolean | undefined = true;
  const hints: boolean[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
    calls = [];
    appState = 'active';
    other = true;
    hints.length = 0;
    mockAwake.length = 0;
    for (const m of [mockAudio, mockMouth, mockNatural]) for (const k of Object.keys(m)) delete m[k];
    Object.assign(mockAudio, {
      sessionReport: () => (other === undefined ? null : { otherAudio: other }),
      sessionTrial: async (name: string) => (calls.push(`trial ${name}`), { name, open: true, sound: true }),
      duckReport: () => ({ letGo: 'ok', taken: 'ok', option: true }),
      holdKeepAlive: async (owner: string) => void calls.push(`hold ${owner}`),
      releaseKeepAlive: async (owner: string) => void calls.push(`release ${owner}`),
      duck: async () => void calls.push('duck'),
      unduck: async () => void calls.push('unduck'),
    });
    Object.assign(mockMouth, { say: async (line: string, locale: string) => void calls.push(`say ${line} (${locale})`) });
    Object.assign(mockNatural, { enabled: () => true, clip: async (line: string) => (calls.push(`fetch ${line}`), 'file:///clip.wav') });
    Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => appState });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const phone = () => measurePhone('he', (on) => void hints.push(on));

  it('her music is what iOS says it is — and "cannot say" is not "playing"', () => {
    expect(phone().music()).toBe(true);
    other = false;
    expect(phone().music()).toBe(false);
    other = undefined;
    expect(phone().music()).toBeNull();
  });

  it('⛔ a trial that never answers is not waited on for ever', async () => {
    mockAudio.sessionTrial = () => new Promise(() => {});
    let answer: TrialFacts | null = null;
    void phone().trial('mic + line').then((r) => (answer = r));
    await jest.advanceTimersByTimeAsync(19_000);
    expect(answer).toBeNull();
    await jest.advanceTimersByTimeAsync(1_500);
    expect(answer).toEqual({ name: 'mic + line', error: 'timed out' });
  });

  it('the line is fetched in her voice before it is needed, and said with nothing done to the session around it', async () => {
    const p = phone();
    await p.prepare('שורה');
    await p.speak('שורה');
    expect(calls).toEqual(['fetch שורה', 'say שורה (he)']);
    mockNatural.enabled = () => false;
    calls = [];
    await phone().prepare('שורה');
    expect(calls).toEqual([]); // the phone's own voice needs no fetch
  });

  it('the silent loop is the measurement\'s own, the screen is kept lit and let go, and the hint reaches the screen', async () => {
    const p = phone();
    await p.hold();
    await p.release();
    expect(calls).toEqual(['hold voiceTest', 'release voiceTest']);
    p.keepAwake(true);
    p.keepAwake(false);
    await jest.advanceTimersByTimeAsync(10);
    expect(mockAwake).toEqual(['awake ferrox-measure', 'asleep ferrox-measure']);
    p.askForMusic(true);
    p.askForMusic(false);
    expect(hints).toEqual([true, false]);
    appState = 'background';
    expect(p.onGlass()).toBe(false);
  });
});
