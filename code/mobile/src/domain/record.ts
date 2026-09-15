/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HER RECORD, AS SOMETHING SHE CAN KEEP — the backup, and the rules for reading one back.
 *
 * ⛔ FOUNDER, 2026-08-22, on what stands between this app and working at scale. The finding that
 * prompted this was mine and it needs stating precisely, because I first stated it too strongly:
 *
 *   | scenario                                            | before this module |
 *   |-----------------------------------------------------|--------------------|
 *   | new phone restored from an iCloud device backup      | ✅ carried over — AsyncStorage lives in `Library/Application Support`, which iOS backs up, and nothing here opts out |
 *   | **deletes the app and reinstalls it**                | ❌ everything gone |
 *   | **iCloud backup off, or the account is full**        | ❌ everything gone |
 *   | **signs in on a second device**                      | ❌ nothing arrives |
 *
 * So it is not the certainty I called it. It is three common holes under a product whose entire
 * claim rests on the thing that falls through them.
 *
 * ── ⚠️ AND WHY THAT IS WORSE HERE THAN IN A LOGGER ──────────────────────────────────────────────
 * In a logger, losing history costs her the memories. Here it costs her **the engine**: her measured
 * reps-per-rung, the rungs she taught it by performing them, the rail she built, her rest medians,
 * the volume she earned. Every one of those is derived from the history on this phone. Losing it
 * does not set her back a week — it returns her to the bootstraps, as a stranger.
 *
 * ── WHAT TRAVELS, AND WHY IT IS AN ALLOW-LIST ───────────────────────────────────────────────────
 * The same discipline `domain/planShare` keeps, for the opposite reason: there, a list of what may
 * NEVER leave; here, a list of what must. A backup built by spreading "everything in storage" would
 * carry the telemetry buffer, the sync queue, the cached entitlement and the once-per-athlete flags
 * — state about a DEVICE and a PURCHASE, not about her — and restoring those onto another phone is
 * how an app hands someone else's subscription to the wrong person.
 *
 * Two kinds of thing travel, and only two:
 *
 *   · **WHAT SHE DID** — her sessions, her runs. The substrate: the engine reconstructs almost
 *     everything measured from this alone, which is the same guarantee S-47 already makes
 *     (*"her history IS the safe prescription"*).
 *   · **WHAT SHE DECLARED** — her profile, her body map and bands, her library picks and refusals,
 *     her leave-its, her rest windows. Not derivable from anything. Small.
 *
 * The learned engine blob rides along as a convenience, never as a requirement: it is rebuildable
 * from the history beside it, and a restore that refused without it would be refusing over the one
 * field that does not matter.
 *
 * Pure & I/O-free — the same payload in, the same verdict out, on any device, for ever.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { CardioActivity, Profile, Program, Session } from '@/data/local/models';

/**
 * Bumped when the SHAPE changes in a way an older build cannot read. A file written by a newer app
 * is refused rather than half-read — the one thing worse than losing a record is silently importing
 * two thirds of one.
 */
export const RECORD_VERSION = 1 as const;

/** What a backup carries. Nothing else may be added without a line in `travels` below. */
export interface AthleteRecord {
  v: number;
  /** When the copy was taken, ISO — so she can tell two files apart without opening them. */
  at: string;
  /** WHAT SHE DID. */
  sessions: Session[];
  cardio: CardioActivity[];
  /** WHAT SHE DECLARED. */
  profile: Profile | null;
  preferences: unknown | null;
  /**
   * ⛔ THE WEEK TRAVELS, AND I HAD THIS BACKWARDS FOR AN HOUR (corrected 2026-08-22).
   *
   * The first cut CLEARED the programme on restore, on the argument that a week is ASSEMBLED from
   * the profile, the map, the preferences and the learned volume — so carrying it would be carrying
   * a derived thing beside the facts that derive it.
   *
   * ⚠️ THAT IS TRUE OF AN ENGINE WEEK AND FALSE OF THE ONE THAT MATTERS. A week she **brought** —
   * photographed from a coach's sheet, stamped `authored: 'athlete_or_coach'` — is not derived from
   * anything. It cannot be regenerated, `aWeekSheBroughtIsNotOursToRewrite` exists to stop the
   * engine touching it, and dropping it in a restore would destroy the exact thing that law
   * protects, in the one flow written to protect her from loss.
   *
   * ⚠️ AND CLEARING IT WAS A DEAD END EVEN FOR AN ENGINE WEEK: `Root` gates on the PROFILE, so she
   * would have landed in the app with a full history and no week at all — nothing on Today, no act.
   * Boot does not build one; only `completeOnboarding` does.
   */
  program?: Program | null;
  /** Rebuildable from `sessions`; carried because it is free, never depended on. */
  engine?: unknown | null;
}

/**
 * The keys a backup is allowed to carry, as a list rather than as a spread.
 *
 * ⚠️ IT IS A LIST SO THAT ADDING A STORAGE KEY IS A DECISION. `db.clearAll` wipes
 * `Object.values(K)` and `everyStorageKeyIsAccountedFor` sweeps the source so a new key cannot be
 * forgotten there; this is the same guard pointed the other way — a new key does NOT join a backup
 * by existing.
 */
export const RECORD_KEYS = ['sessions', 'cardio', 'profile', 'preferences', 'program', 'engine'] as const;

/** Why a file cannot be read back. Each is a different sentence to her, never one "invalid file". */
export type RecordRejection =
  /** Not JSON, or not an object at all — the wrong file entirely. */
  | 'unreadable'
  /** JSON, but nothing that identifies it as a Hush record. */
  | 'not_a_record'
  /** Written by a newer version of the app than this one. */
  | 'too_new'
  /** A Hush record with no training in it — restoring it would replace something with nothing. */
  | 'empty';

export type RecordRead =
  | { ok: true; record: AthleteRecord }
  | { ok: false; why: RecordRejection };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Read a backup, or say exactly why not.
 *
 * ⚠️ IT VALIDATES SHAPE, NOT CONTENT. A session whose fields have drifted across versions is still
 * her session, and the readers downstream already treat every field as optional (that is what made
 * `?? []` the house style). What is checked is the frame: is this a Hush record, can this build read
 * it, and is there anything in it — because those are the three ways a restore does harm.
 */
export function readRecord(raw: unknown): RecordRead {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, why: 'unreadable' };
    }
  }
  if (!isObj(parsed)) return { ok: false, why: 'unreadable' };
  if (typeof parsed.v !== 'number' || !Array.isArray(parsed.sessions)) {
    return { ok: false, why: 'not_a_record' };
  }
  /*
   * ⛔ A NEWER FILE IS REFUSED, NOT SALVAGED. Reading two thirds of a record is worse than reading
   * none: she would be left with a plausible-looking history that quietly lost whatever the newer
   * version added, and the engine would go on deciding from it for months.
   */
  if (parsed.v > RECORD_VERSION) return { ok: false, why: 'too_new' };

  const sessions = parsed.sessions as Session[];
  const cardio = Array.isArray(parsed.cardio) ? (parsed.cardio as CardioActivity[]) : [];
  if (sessions.length === 0 && cardio.length === 0) return { ok: false, why: 'empty' };

  return {
    ok: true,
    record: {
      v: parsed.v,
      at: typeof parsed.at === 'string' ? parsed.at : '',
      sessions,
      cardio,
      profile: isObj(parsed.profile) ? (parsed.profile as unknown as Profile) : null,
      preferences: isObj(parsed.preferences) ? parsed.preferences : null,
      program: isObj(parsed.program) ? (parsed.program as unknown as Program) : null,
      engine: isObj(parsed.engine) ? parsed.engine : null,
    },
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ WHEN A RESTORE IS ALLOWED TO REPLACE WHAT IS ON THE PHONE.
 *
 * The dangerous case is not the empty one. It is an athlete who has trained on THIS phone, opens a
 * file from an old one, and loses six weeks — from one tap, silently, with no way back.
 *
 * So the rule is arithmetic and it is stated to her, never guessed:
 *
 *   · the phone is EMPTY .................. restore, without asking. Nothing can be lost.
 *   · the file holds MORE than the phone ... restore, after she confirms — this is the case the
 *     feature exists for (a reinstall, a new device), and the confirmation is what makes it safe.
 *   · the file holds THE SAME OR LESS ...... refuse by default and say so. A backup that would
 *     shrink her record is almost always the wrong file, and "almost always" is not a licence to
 *     act — it is a reason to ask.
 *
 * ⚠️ AND IT COUNTS SESSIONS, NOT BYTES. A record is a number of workouts; that is the unit she
 * thinks in and the one the sentence can quote back to her.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
export type RestoreVerdict =
  | { do: 'restore'; confirm: false }
  | { do: 'restore'; confirm: true; gaining: number }
  | { do: 'refuse'; onPhone: number; inFile: number };

export function restoreVerdict(record: AthleteRecord, sessionsOnPhone: number): RestoreVerdict {
  const inFile = record.sessions.length;
  if (sessionsOnPhone === 0) return { do: 'restore', confirm: false };
  if (inFile > sessionsOnPhone) return { do: 'restore', confirm: true, gaining: inFile - sessionsOnPhone };
  return { do: 'refuse', onPhone: sessionsOnPhone, inFile };
}

/**
 * A stable, human-legible file name: `hush-record-2026-08-22.json`.
 *
 * ⚠️ THE DATE IS THE POINT. She will end up with several of these in a Files folder and the only
 * question she will ever ask of them is "which is the newest" — so the name answers it, and sorts
 * correctly while doing so.
 */
export function recordFileName(atMs: number, iso = new Date(atMs).toISOString()): string {
  return `hush-record-${iso.slice(0, 10)}.json`;
}
