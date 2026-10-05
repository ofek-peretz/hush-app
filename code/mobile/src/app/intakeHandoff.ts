/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE INTAKE OWES THE FIRST SCREEN AFTER IT — one fact, handed over once. (2026-10-05)
 *
 * The onboarding stack and the main stack are separate navigators: the Ready screen's last press
 * writes the profile, Root swaps the stacks, and nothing the intake knew travels with her. One thing
 * has to — whether this device's free workouts were spent before this install.
 *
 * ── WHY THE PAYWALL IS SHOWN HERE, AND NOT LEFT TO THE FIRST START ──────────────────────────────
 * The trial's count outlives a reinstall (`domain/trialLedger`, the founder's own ruling against the
 * free loop). A phone that trained before finishes a fresh intake with nothing left, and until this
 * the only thing that told her was the gate on Start. The founder met it exactly there, on his own
 * phone — earbuds in, pressing Start on workout one — and asked *"השאלה אם זה הזמן והמקום להכניס את
 * המסך הזה"*; then, of the choice: *"קח אותה בעצמך… את ההחלטה הטובה ביותר מבין כל האופציות."*
 *
 * The options, and why this one:
 *   · LEAVE IT TO START — the offer arrives at the worst moment there is to read one: standing in a
 *     gym, wanting to lift. It converts (the need is real) and it feels like an ambush.
 *   · A WALL BEFORE THE READY SCREEN — she is asked to pay for a programme she has not been shown.
 *   · ONE MORE FREE WORKOUT FOR A RETURNING PHONE — reopens the loop the ledger exists to close.
 *   · ⛔ THIS: the Ready screen says it in a sentence (`ob.readySpent`), her programme is saved
 *     whatever she decides, and the offer is shown ONCE as she lands — at home, with her week one
 *     swipe behind it, dismissible. The gate on Start stays exactly what it was; it is no longer the
 *     first she hears of it.
 *
 * In memory on purpose: it is owed to the screen that follows THIS press. An app killed in between
 * simply does not show it — the Ready sentence was read, and the gate still stands.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

let paywallOwed = false;

export const intakeHandoff = {
  /** The intake is ending on a device with no free workouts left and no membership. */
  owePaywall(): void {
    paywallOwed = true;
  },
  /** Read once by the first screen after the intake; true at most one time. */
  takePaywall(): boolean {
    const owed = paywallOwed;
    paywallOwed = false;
    return owed;
  },
};
