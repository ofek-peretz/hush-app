/**
 * THE WRIST SHOWS NOTHING THE PHONE DOES NOT KNOW.
 *
 * ── The founder's rule, as a test ────────────────────────────────────────────────────────────────
 * *"What is on the watch necessarily exists on the phone, and not the other way round."* The phone
 * is the sole authority (register S-48); the wrist is a terminal that renders what it is handed and
 * proposes intents. So every FACT a watch screen draws has to arrive from the phone — and the way
 * that breaks is never dramatic. A screen reads `mirror.somethingNew`, the wire never carries it,
 * `JSONDecoder` leaves it nil, and the wrist draws a blank where a number should be. No crash, no
 * error, nothing red anywhere.
 *
 * `watchWireParity` guards the wire's two DECLARATIONS against each other. This guards the layer
 * above it: the SCREENS. It reads every `mirror.x` and `lobby.x` in `WatchScreens.swift` and
 * requires each one to be a field the wire actually declares — so a screen can never render a fact
 * the phone has no way to send it.
 *
 * Together the three laws close the loop in both directions:
 *   · this file — what the wrist DRAWS came from the phone;
 *   · `watchWireParity` — the two wire declarations agree, field for field, in both languages;
 *   · `everyWristIntentLandsSomewhere` — what the wrist SENDS reaches a handler on the phone.
 */
import fs from 'fs';
import path from 'path';
import { sessionKcal, strengthSessionKcal } from '@/domain/energy';

const WATCH = path.join(__dirname, '..', '..', 'targets', 'watch');
const screensSrc = fs.readFileSync(path.join(WATCH, 'WatchScreens.swift'), 'utf8');
const wireSrc = fs.readFileSync(path.join(WATCH, 'WatchWire.swift'), 'utf8');
const appSrc = fs.readFileSync(path.join(WATCH, 'HushWatchApp.swift'), 'utf8');
const watchSources = fs
  .readdirSync(WATCH)
  .filter((f) => f.endsWith('.swift'))
  .map((f) => ({ file: f, src: fs.readFileSync(path.join(WATCH, f), 'utf8') }));

/** The `var name:` fields a Swift struct declares. */
function fieldsOf(struct: string): Set<string> {
  const at = new RegExp(`struct\\s+${struct}\\b`).exec(wireSrc);
  if (!at) throw new Error(`no Swift struct ${struct}`);
  const open = wireSrc.indexOf('{', at.index);
  let depth = 0;
  let close = open;
  for (let i = open; i < wireSrc.length; i++) {
    if (wireSrc[i] === '{') depth += 1;
    else if (wireSrc[i] === '}') {
      depth -= 1;
      if (depth === 0) { close = i; break; }
    }
  }
  return new Set([...wireSrc.slice(open, close).matchAll(/var\s+([a-zA-Z]+)\s*:/g)].map((m) => m[1]));
}

/** Every `<receiver>.<field>` a screen reads — `mirror.targetWeight`, `lobby.gated`, … */
function readsOn(receiver: string): string[] {
  return [...new Set([...screensSrc.matchAll(new RegExp(`\\b${receiver}\\.([a-zA-Z]+)`, 'g'))].map((m) => m[1]))];
}

describe('every fact a watch screen draws came from the phone', () => {
  it('every mirror field a screen reads is a field the wire declares', () => {
    const declared = fieldsOf('WireMirror');
    const read = readsOn('mirror');
    expect(read.length).toBeGreaterThan(10); // the extraction must not be silently matching nothing
    const invented = read.filter((f) => !declared.has(f));
    expect({ readByAScreenButNeverSent: invented }).toEqual({ readByAScreenButNeverSent: [] });
  });

  it('every lobby field a screen reads is a field the wire declares', () => {
    const declared = fieldsOf('WireLobby');
    const invented = readsOn('lobby').filter((f) => !declared.has(f) && f !== 'workouts');
    expect({ readByAScreenButNeverSent: invented }).toEqual({ readByAScreenButNeverSent: [] });
  });

  it('no screen computes a PRESCRIPTION — the phone owns every load, band and set count', () => {
    // S-48. The wrist may format what it is given (a clock counting down from `restEndsAt`, kilos
    // rendered to one decimal) and it may show what its OWN sensors read, but the moment it decides
    // a weight or a rep target there are two engines and they will disagree.
    const forbidden = [
      /\bsnapDown\s*\(/, /\bmoveRungs\s*\(/, /\bnextRung\s*\(/, /\brepsPerRung\b/,
      /\btargetWeight\s*[*+-]\s*[0-9]/, // arithmetic ON a prescription
    ];
    const offenders: string[] = [];
    for (const { file, src } of watchSources) {
      for (const rx of forbidden) if (rx.test(src)) offenders.push(`${file} :: ${rx}`);
    }
    expect({ prescribingOnTheWrist: offenders }).toEqual({ prescribingOnTheWrist: [] });
  });
});

/**
 * NOTIFICATIONS — one scheduler, and it is the phone's.
 *
 * A paired Apple Watch mirrors the iPhone's notifications by itself; that is the platform's job and
 * it needs no code. What would break the founder's rule is the watch target scheduling or
 * presenting its OWN — then a nudge could reach her wrist that her phone never sent, and worse, the
 * two schedulers would double-notify for the same event with no way to coalesce them (the phone's
 * `notifier` de-dupes by identifier, and it cannot de-dupe against a scheduler it does not own).
 *
 * The watch target is clean today. This keeps it that way.
 */
describe('the phone is the only thing in this app that notifies', () => {
  it('the watch target schedules and presents no notifications of its own', () => {
    const banned = [
      /UNUserNotificationCenter/, /UNMutableNotificationContent/, /UNNotificationRequest/,
      /WKNotificationScene/, /didReceiveRemoteNotification/,
    ];
    const offenders: string[] = [];
    for (const { file, src } of watchSources) {
      for (const rx of banned) if (rx.test(src)) offenders.push(`${file} :: ${String(rx)}`);
    }
    expect({ aSecondScheduler: offenders }).toEqual({ aSecondScheduler: [] });
  });

  it('the watch app declares one scene — the app itself, no notification scene beside it', () => {
    const scenes = [...appSrc.matchAll(/\b(WindowGroup|WKNotificationScene)\b/g)].map((m) => m[1]);
    expect({ scenes }).toEqual({ scenes: ['WindowGroup'] });
  });
});

/**
 * ONE NUMBER PER WORKOUT (founder 2026-07-28).
 *
 * The wrist can read HealthKit's active energy; the phone cannot, and estimates instead (MET ×
 * bodyweight × hours). Both are honest. Printing BOTH — 412 on her wrist, 380 in her Log, for the
 * same session — is not, and it costs more trust than the extra accuracy buys.
 *
 * The rule: **whichever surface was the AUTHORITY produces the figure, and the other renders it.**
 * Phone-authority ⇒ the phone computes and sends it on the summary. Standalone ⇒ the wrist measures
 * and its figure travels home on the record, stamped on the session at creation. Every surface then
 * reads the one door, `domain/energy.sessionKcal`, and nobody re-derives beside it.
 */
describe('one workout, one calorie figure', () => {
  it('a session carrying a MEASURED figure reports it, not the estimate', () => {
    const measured = sessionKcal({ measuredKcal: 412 }, 52 * 60_000, 80);
    const estimate = strengthSessionKcal(52 * 60_000, 80);
    expect(measured).toBe(412);
    expect(measured).not.toBe(estimate); // the two really are different numbers
  });

  it('without one, it is the estimate — unchanged for every phone-run workout', () => {
    expect(sessionKcal({}, 52 * 60_000, 80)).toBe(strengthSessionKcal(52 * 60_000, 80));
  });

  it('no bodyweight still means NO number — Hush never guesses a body to bill against', () => {
    expect(sessionKcal({}, 52 * 60_000, null)).toBeNull();
    expect(sessionKcal({}, 52 * 60_000, 0)).toBeNull();
  });

  it('a nonsense measurement is refused rather than printed', () => {
    expect(sessionKcal({ measuredKcal: 0 }, 52 * 60_000, 80)).toBe(strengthSessionKcal(52 * 60_000, 80));
    expect(sessionKcal({ measuredKcal: -5 }, 52 * 60_000, 80)).toBe(strengthSessionKcal(52 * 60_000, 80));
  });

  it('no surface holding a SESSION calls the raw estimator — they all go through the one door', () => {
    // The estimator is not private (Progress's week roll-up and the share card legitimately price a
    // span). What must not happen is a surface that HAS the session ignoring its measured figure —
    // that is precisely the divergence this rule exists to remove.
    const surfaces = ['screens/session/WellDone.tsx', 'screens/history/WorkoutDetail.tsx',
                      'screens/weekly/WeeklyUpdate.tsx', 'screens/home/Home.tsx',
                      'domain/progressAggregate.ts', 'domain/shareCard.ts'];
    const offenders = surfaces.filter((f) =>
      /\bstrengthSessionKcal\s*\(/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'src', f), 'utf8')),
    );
    expect({ reDerivingBesideTheDoor: offenders }).toEqual({ reDerivingBesideTheDoor: [] });
  });
});
