/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE WORKOUT HOLDS NO MICROPHONE — THE COACH SPEAKS, THE MUSIC IS LOWERED, A SET IS MARKED
 *
 * The decision (founder, 2026-10-10, after two measurements on his own phone — Spotify, Sony
 * WH-1000XM5, iOS 26.3.1): *"אני מסכים"*, to this:
 *
 *   > the coach's voice is the product, the number is a detail. Everything of value travels through
 *   > what she says — what to do, how much, when the rest is over — and a coach nobody can hear over
 *   > the music is no coach. The number of reps has another good road (a tap); her voice has none.
 *
 * What the measurements found, so that nobody has to find it again:
 *   · With a microphone held, her line cannot lower his music: a duck "begins when you activate your
 *     app's audio session and ends when you deactivate" it (Apple), a deactivation closes the
 *     microphone, and a locked phone refused every change to a live session (build 77: "לא ניתן היה
 *     להשלים את הפעולה", 23 ms). Apple's voice processing threw the sound out of the earbuds.
 *   · His music STOPPING outright was never the microphone: it is the category being changed from
 *     playback to record on a session that is already active (build 78, three identical runs — a
 *     record session with NO microphone stopped Spotify the same way; one activated fresh, microphone
 *     running, did not). The way back for the microphone, the day there is a reason: let go, state,
 *     activate. Never change the category of a live session.
 *   · With no microphone the line lowers his music and gives it back — in the profile's test, in the
 *     measurement under the workout's silent loop, and in a workout: *"המוזיקה נחלשה כשהיא דיברה
 *     במהלך אימון וכשהיא סיימה לדבר המוזיקה חזרה לעוצמה המקורית, בדיוק כמו שזה אמור להיות."*
 *
 * So the workout takes the half that works. This law holds it there: the switch is off, no road
 * opens the microphone, nothing she is told asks her to SAY anything, and the measurements that
 * answered all this are gone from the product (their code is in commit 20a8036; their answers are in
 * `docs/canonical/FERROX_VOICE_SCREENPLAY.md` §10–§11). The workout itself is walked, from his
 * pocket, in `theVoiceSurvivesThePhone` ("the workout holds no microphone", "a line that is no
 * longer true is not said").
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string): boolean => fs.existsSync(path.join(ROOT, rel));
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e: { name: string; isDirectory(): boolean }) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : [],
  );

describe('⛔ the workout holds no microphone', () => {
  it('the switch is off, and it is one function in one file', () => {
    const { workoutHoldsMicrophone } = require('@/platform/voice/workoutMicrophone');
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
    expect(open.indexOf('if (!workoutHoldsMicrophone()) {')).toBeGreaterThan(-1);
    expect(open.indexOf('if (!workoutHoldsMicrophone()) {')).toBeLessThan(open.indexOf('voiceCapture.ensurePermission()'));
    expect(hook).toContain('hearsHer: () => workoutHoldsMicrophone()');
    expect(read('src/platform/voice/voiceCapture.ts')).toMatch(/async askAtStart\(voiceOn: boolean\): Promise<void> \{[\s\S]{0,300}?if \(!workoutHoldsMicrophone\(\)\) return;/);
    // The conductor: down by design, never undone by a return to glass, and never apologised for.
    const conductor = read('src/platform/voice/voiceConductor.ts');
    expect(conductor).toMatch(/earMayListen\(\): void \{\s*if \(!this\.earDown \|\| this\.earless\(\)\) return;/);
    expect(conductor).toMatch(/private shutEarByDesign\(\): void \{[\s\S]{0,260}?this\.cantHearSaid = true;/);
  });

  it('the Swift under a workout: a held ear is never ducked under and never deactivated under — and `duck` only writes down what it did', () => {
    const module = read('modules/hush-voice-audio/ios/HushVoiceAudioModule.swift');
    const apply = module.slice(module.indexOf('private func applySession(duck: Bool) throws {'), module.indexOf('private static func setPlayback'));
    expect(apply).toContain('HushEar.sessionOptions(ear.source, duck: false)');
    expect(apply).not.toContain('setActive(false');
    const duck = module.slice(module.indexOf('AsyncFunction("duck")'), module.indexOf('AsyncFunction("unduck")'));
    expect(duck).toMatch(/if !self\.earRunning && !session\.categoryOptions\.contains\(\.duckOthers\) \{\s*self\.keepAlive\?\.pause\(\)\s*do \{\s*try session\.setActive\(false\)/);
    expect(duck).toContain('self.lastDuck = ["letGo": letGo, "taken": "ok"');
  });

  it('her music in a POCKET is written down by the workout itself: every line\'s journal row says where the phone was and what the duck did', () => {
    expect(walk('src').filter((f) => /\bduckReport\b/.test(read(f))).sort()).toEqual(['src/platform/voice/audioSession.ts', 'src/platform/voice/useVoiceCoach.ts']);
    expect(read('src/platform/voice/useVoiceCoach.ts')).toMatch(/void track\('voice_said', \{[\s\S]{0,260}?glass: AppState\.currentState === 'active',\s*duck: duck \?/);
  });
});

describe('⛔ what was measured, and what the phone refused, is GONE from the product — not parked in it', () => {
  it('no measurement, no trial, no live duck, no move to the earbuds\' microphone, no choice of microphone', () => {
    for (const gone of [
      'src/platform/voice/voiceMeasure.ts',
      'modules/hush-voice-audio/ios/HushSessionTrial.swift',
      'modules/hush-voice-audio/ios/HushProcessedEar.swift',
      '__tests__/laws/theMeasurementAsksThePhone.test.ts',
    ]) {
      expect(exists(gone)).toBe(false);
    }
    expect(fs.readdirSync(path.join(ROOT, 'modules/hush-voice-audio/ios')).sort()).toEqual(['HushEar.swift', 'HushVoiceAudio.podspec', 'HushVoiceAudioModule.swift']);
    const everything = [...walk('src').map(read), read('modules/hush-voice-audio/ios/HushVoiceAudioModule.swift'), read('modules/hush-voice-audio/ios/HushEar.swift')].join('\n');
    expect(everything).not.toMatch(/sessionTrial|sessionReport|runMeasure|HushSessionTrial|HushProcessedEar|setVoiceProcessingEnabled/);
    expect(everything).not.toMatch(/duckUnderEar|setDuckUnderEar|earReroute|answerMic|processedOpen|earProcessed|voiceDuck/);
    expect(read('modules/hush-voice-audio/ios/HushEar.swift')).not.toMatch(/func reroute|func settle/);
    expect(read('src/screens/profile/ProfileSheet.tsx')).not.toMatch(/voiceMic|voiceDuck|measure[A-Z]|startMeasure/);
    for (const locale of ['he', 'en']) {
      const copy = JSON.parse(read(`src/i18n/locales/${locale}.json`)).profile;
      expect(Object.keys(copy).filter((k) => /^voice(Mic|Duck|Probe)|^measure/.test(k))).toEqual([]);
    }
  });

  it('CI type-checks the workout\'s microphone file, and only it', () => {
    const ci = read('../../.github/workflows/ci.yml');
    expect(ci).toMatch(/swiftc -typecheck -parse-as-library -target arm64-apple-ios15\.1 code\/mobile\/modules\/hush-voice-audio\/ios\/HushEar\.swift > typecheck\.log/);
  });
});

describe('nothing she is told asks her to SAY anything', () => {
  const he = JSON.parse(read('src/i18n/locales/he.json'));
  const en = JSON.parse(read('src/i18n/locales/en.json'));
  const conductor = read('src/platform/voice/voiceConductor.ts');

  it('the voice row says what the voice does now: it speaks and the music is lowered — it no longer says it asks or writes down', () => {
    expect(he.profile.voiceSub).toContain('מונמכת');
    expect(he.profile.voiceSub).toContain('מסמנים');
    expect(he.profile.voiceSub).not.toMatch(/שואלת|רושמת/);
    expect(en.profile.voiceSub).not.toMatch(/asks|logs it/);
  });

  it('the first workout\'s one sentence says where a set is MARKED', () => {
    expect(he.voice.openFirstSessionMark).toBe('אני המאמנת שלך. בסוף כל סט, סמן אותו במסך הנעילה או בשעון.');
    expect(he.voice.openFirstSessionMark_female).toBe('אני המאמנת שלך. בסוף כל סט, סמני אותו במסך הנעילה או בשעון.');
    expect(en.voice.openFirstSessionMark).not.toMatch(/say/i);
    expect(conductor).toContain('this.earless() ? voiceScript.openFirstSessionMark() : voiceScript.openFirstSession()');
  });

  it('a pause is announced without "say: continue" whenever nothing can hear it (it was said in his build-78 workout)', () => {
    expect(he.voice.pausedNoEar).toBe('האימון מושהה.');
    expect(en.voice.pausedNoEar).toBe('Workout paused.');
    expect(he.voice.paused).toContain('תגיד'); // the line with the instruction still exists — for the day something listens
    expect(conductor).toContain('this.earDown ? voiceScript.pausedNoEar() : voiceScript.paused()');
  });

  it('⛔ a line that is no longer true is not said: every line is asked again at its turn, the echo of a written set is the one thing said to the end, and what was withheld is written down', () => {
    expect(conductor).toMatch(/private speak\(lines: string\[\], keepDucked = false, chime = false, still\?: \(index: number\) => boolean\): Promise<void> \{/);
    // With no answer of its own: decided in a workout, unsaid once the workout has ended.
    expect(conductor).toContain("const stillTrue = (i: number) => (still ? still(i) : !decidedInAWorkout || this.mode !== 'ended');");
    expect(conductor.match(/SAID_TO_THE_END\)/g)!.length).toBeGreaterThanOrEqual(3);
    expect(conductor).toMatch(/void this\.speak\(lines, false, chime, \(\) => this\.inSet\(key\)\)/);
    expect(conductor.match(/this\.d\.track\?\.\('voice_unsaid'/g)).toHaveLength(2);
  });
});
