/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HER RECORD SURVIVES THE PHONE IT WAS MADE ON.
 *
 * ⛔ THE FINDING (2026-08-22), stated at the precision it deserves rather than at the volume I first
 * gave it. `EXPO_PUBLIC_API_BASE_URL` is set only in a gitignored local `.env`, so a production
 * build never activates the HTTP model and every fact lives in AsyncStorage. iOS carries
 * `Library/Application Support` into a device backup and nothing here opts out — so:
 *
 *   new phone from an iCloud backup ....... ✅ carried over
 *   **delete the app and reinstall** ....... ❌ everything gone
 *   **iCloud off, or the account is full** . ❌ everything gone
 *   **sign in on a second device** ......... ❌ nothing arrives
 *
 * ── ⚠️ AND WHY IT COSTS MORE HERE THAN IN A LOGGER ──────────────────────────────────────────────
 * It does not cost her the memories. It costs her **the engine**: her reps-per-rung, the rungs she
 * taught it by performing them, the rail she built, her rest medians, the volume she earned. All of
 * it is derived from the history on that phone. Losing it returns her to the bootstraps as a
 * stranger — which is the one state the whole ledger is written to get her out of.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import {
  RECORD_KEYS,
  RECORD_VERSION,
  readRecord,
  recordFileName,
  restoreVerdict,
  type AthleteRecord,
} from '@/domain/record';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const rec = (over: Partial<AthleteRecord> = {}): AthleteRecord => ({
  v: RECORD_VERSION,
  at: '2026-08-22T09:00:00.000Z',
  sessions: [{ id: 'a' }, { id: 'b' }],
  cardio: [],
  profile: { name: 'Erez' },
  preferences: { declaredSubs: { a: 'b' } },
  engine: null,
  ...over,
});

describe('a record can be read back, or refused with a reason', () => {
  it('⛔ reads a whole record, from an object or from the text of a file', () => {
    const r = readRecord(rec());
    expect(r.ok).toBe(true);
    expect(readRecord(JSON.stringify(rec())).ok).toBe(true);
  });

  it('⛔ refuses the wrong file, and says WHICH wrong', () => {
    /*
     * Four rejections rather than one "invalid file", because each is a different sentence to her
     * and two of them are not her fault at all.
     */
    expect(readRecord('not json at all')).toEqual({ ok: false, why: 'unreadable' });
    expect(readRecord(42)).toEqual({ ok: false, why: 'unreadable' });
    expect(readRecord({ hello: 'world' })).toEqual({ ok: false, why: 'not_a_record' });
    expect(readRecord({ v: 1 })).toEqual({ ok: false, why: 'not_a_record' });
  });

  it('⛔⛔ a file from a NEWER build is refused outright, never half-read', () => {
    /*
     * Reading two thirds of a record is worse than reading none: she would be left with a
     * plausible-looking history that quietly lost whatever the newer version added, and the engine
     * would go on deciding from it for months.
     */
    expect(readRecord(rec({ v: RECORD_VERSION + 1 }))).toEqual({ ok: false, why: 'too_new' });
  });

  it('⛔ an EMPTY record is refused — restoring it would replace something with nothing', () => {
    expect(readRecord(rec({ sessions: [], cardio: [] }))).toEqual({ ok: false, why: 'empty' });
    // …but a record with only RUNS in it is a real record: she trained, just not with a bar.
    expect(readRecord(rec({ sessions: [], cardio: [{ id: 'r1' }] })).ok).toBe(true);
  });

  it('⚠️ an older build’s file still reads — a missing field is absent, not fatal', () => {
    const r = readRecord({ v: 1, sessions: [{ id: 'a' }] });
    expect(r.ok).toBe(true);
    expect(r.record.cardio).toEqual([]);
    expect(r.record.profile).toBeNull();
    expect(r.record.preferences).toBeNull();
  });
});

describe('a restore may not quietly cost her weeks', () => {
  it('⛔ an EMPTY phone restores without asking — nothing can be lost', () => {
    expect(restoreVerdict(rec(), 0)).toEqual({ do: 'restore', confirm: false });
  });

  it('⛔⛔ a file with MORE than the phone restores only after she confirms', () => {
    // The case the feature exists for — a reinstall, a new device — and the confirmation is the
    // whole of what makes it safe.
    expect(restoreVerdict(rec({ sessions: [{}, {}, {}, {}, {}] }), 2)).toEqual({
      do: 'restore',
      confirm: true,
      gaining: 3,
    });
  });

  it('⛔⛔ a file with THE SAME OR LESS is refused, and the numbers are handed back', () => {
    /*
     * The dangerous case, and it is not the empty one: an athlete who has trained on THIS phone
     * opens a file from an old one and loses six weeks, from one tap, with no way back. A backup
     * that would shrink her record is almost always the wrong file — and "almost always" is not a
     * licence to act, it is a reason to ask.
     */
    expect(restoreVerdict(rec({ sessions: [{}] }), 18)).toEqual({ do: 'refuse', onPhone: 18, inFile: 1 });
    expect(restoreVerdict(rec({ sessions: [{}, {}] }), 2)).toEqual({ do: 'refuse', onPhone: 2, inFile: 2 });
  });
});

describe('what travels is a list, not a spread', () => {
  it('⛔⛔ the backup carries her RECORD and her DECLARATIONS — and nothing about the device', () => {
    /*
     * The same discipline `planShare` keeps, pointed the other way. A backup built by spreading
     * everything in storage would carry the telemetry buffer, the sync queue, the cached
     * ENTITLEMENT and the once-per-athlete flags — facts about a device and a purchase, not about
     * her. Restoring those onto another phone is how an app hands someone else's subscription to
     * the wrong person.
     */
    expect([...RECORD_KEYS].sort()).toEqual(['cardio', 'engine', 'preferences', 'profile', 'program', 'sessions']);
  });

  it('⛔ …and the snapshot writes exactly those keys, no more', () => {
    const dbSrc = read('data/local/db.ts');
    const snap = dbSrc.slice(dbSrc.indexOf('async snapshotRecord'), dbSrc.indexOf('async restoreRecord'));
    for (const forbidden of ['K.telemetry', 'K.entitlement', 'K.pendingSync', 'K.firsts', 'K.notificationsAsked']) {
      expect({ key: forbidden, inSnapshot: snap.includes(forbidden) }).toEqual({ key: forbidden, inSnapshot: false });
    }
  });

  it('⛔⛔ the restore CARRIES the programme — and this is a correction, not a preference', () => {
    /*
     * The first cut cleared it, arguing that a week is derived from the facts beside it. **That is
     * true of an engine week and false of the one that matters:** a week she BROUGHT is stamped
     * `authored` and cannot be regenerated from anything, `aWeekSheBroughtIsNotOursToRewrite` exists
     * to stop the engine touching it, and dropping it in a restore would have destroyed exactly what
     * that law protects — inside the one flow written to protect her from loss.
     *
     * ⚠️ AND IT WAS A DEAD END FOR AN ENGINE ATHLETE TOO. `Root` gates on the PROFILE, and boot
     * builds no programme — only `completeOnboarding` does. She would have landed in the app with a
     * full history, no week, and no act on Today.
     */
    const dbSrc = read('data/local/db.ts');
    const restore = dbSrc.slice(dbSrc.indexOf('async restoreRecord'), dbSrc.indexOf('async clearAll'));
    expect(restore).toContain('if (record.program)');
    expect(restore).not.toContain('removeItem(K.program)');
    // …and it never blanks a fact the file made no claim about.
    expect(restore).toContain('if (record.profile)');
    expect(restore).toContain('if (record.preferences)');
  });

  it('⛔ …and a record made before this correction still restores, without a dead end', () => {
    /*
     * A file written an hour ago has no `program`. It must still read (it does — every field but
     * `sessions` is optional) and the screen must not leave her weekless: the store rebuilds when
     * the record carried none and there is nothing on the phone either.
     */
    const r = readRecord({ v: 1, sessions: [{ id: 'a' }] });
    expect(r.ok).toBe(true);
    expect(r.record.program).toBeNull();
    const store = read('state/stores/appStore.tsx').replace(/\s+/g, ' ');
    expect(store).toContain('async restoreRecord(record)');
    expect(store).toContain('if (!record.program)');
  });
});

describe('the file has a name she can choose between', () => {
  it('⚠️ dated, and it sorts', () => {
    // She will end up with several in a Files folder, and the only question she will ask of them is
    // "which is the newest" — so the name answers it, and sorts correctly while doing so.
    expect(recordFileName(0, '2026-08-22T09:00:00.000Z')).toBe('hush-record-2026-08-22.json');
    expect(recordFileName(0, '2026-01-02T00:00:00.000Z') < recordFileName(0, '2026-08-22T09:00:00.000Z')).toBe(true);
  });
});
