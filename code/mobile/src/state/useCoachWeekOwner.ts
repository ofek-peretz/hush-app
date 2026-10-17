/**
 * ════ WHO WROTE THE WEEK ON DISK — the coach's name, or null (the coach track, 2026-09-17) ════
 *
 * ⚠️ ASKED OF THE DISK, NOT OF `app.program`. The app store boots with `program: null` and only a
 * write puts a week into state, so a screen that read the name off the store drew "your coach's week
 * is on its way" over the coach's own week after every cold start (found on the web walk). The disk is
 * what every gate of the track already asks; the store's program is only the signal to ask again.
 */

import { useEffect, useState } from 'react';

import { db } from '@/data/local/db';
import { AppContext } from '@/state/stores/appStore';
import React from 'react';

export interface CoachWeekOwner {
  /** The disk has been read at least once — until then nothing may claim the week is not a coach's. */
  known: boolean;
  /**
   * ⛔ A NAME AND AN AUTHOR ARE TWO QUESTIONS (2026-09-18). `authored: 'coach'` is what the laws
   * pin; `coachName` is a display string the envelope carries and a stored week can lack (an older
   * version, a rename between the pull and the read). Today asked ONE of them for BOTH — so a week
   * that had landed with no name made `coachName` null, and the screen drew "your coach's week is on
   * its way" ON TOP of the card announcing that it had arrived. Measured on the walk, 2026-09-17.
   */
  isCoachWeek: boolean;
  coachName: string | null;
}

const NOTHING: CoachWeekOwner = { known: false, isCoachWeek: false, coachName: null };

export function useCoachWeekOwner(): CoachWeekOwner {
  const signal = React.useContext(AppContext)?.program ?? null;
  const [owner, setOwner] = useState<CoachWeekOwner>(NOTHING);
  useEffect(() => {
    let alive = true;
    void db
      .loadProgram()
      .catch(() => null)
      .then((p) => {
        if (!alive) return;
        const isCoachWeek = p?.authored === 'coach';
        const coachName = isCoachWeek ? p?.coachName ?? null : null;
        /* Same answer, same object — a re-render per focus is a re-render the screen cannot use. */
        setOwner((was) =>
          was.known && was.isCoachWeek === isCoachWeek && was.coachName === coachName ? was : { known: true, isCoachWeek, coachName },
        );
      });
    return () => {
      alive = false;
    };
  }, [signal]);
  return owner;
}
