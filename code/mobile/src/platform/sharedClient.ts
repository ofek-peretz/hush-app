/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PAIR'S WIRE — one socket, two athletes, and a gym with bad reception. (2026-08-31)
 *
 * The client half of `HushPairRoom` (`server/hush-identity/src/index.ts`). Everything it may say is shaped by
 * `domain/sharedSession`; everything it hears is rebuilt by that file's readers before it reaches
 * a screen. This module owns exactly one thing the pure half cannot: **the socket, and what to do
 * when it dies.**
 *
 * ── ⛔ THE WIRE IS AN ACCELERATOR, NEVER A DEPENDENCY ────────────────────────────────────────────
 *
 * A gym is the worst network an app meets: steel, concrete, a basement, four hundred phones on one
 * access point. So nothing in this file may ever be on the path between an athlete and her own
 * set. It has no `await` a screen waits on, it throws nothing, and every failure — no URL, no
 * session, no signal, a room that filled up — resolves to the same outcome: **the pair is not
 * connected, and the workout continues exactly as a solo workout does.**
 *
 * ── WHY RECONNECTION IS FOUR LINES AND NOT A PROTOCOL ───────────────────────────────────────────
 *
 * Because the wire carries STATE, not deltas (`domain/sharedSession`'s header). A phone that has
 * been off the air for ninety seconds does not have to replay what it missed or ask what it
 * missed — it re-sends where it is, and both screens are correct on the next frame. So redialling
 * is: mint a new ticket, open a socket, re-send the last frame. There is no catch-up, no sequence
 * negotiation, and no window in which the two phones disagree about a set that was logged while
 * one of them was in a lift.
 *
 * ── THE KEEP-ALIVE IS ALSO THE LIVENESS SIGNAL ──────────────────────────────────────────────────
 *
 * The caller re-publishes every `SHARED_PUBLISH_EVERY_MS` even when nothing has changed. That is
 * not chatter for its own sake: a mobile socket dies silently far more often than it closes, and
 * a frame's `at` is what `sharedStanding` reads to decide a partner has gone quiet. One mechanism,
 * two jobs — the thing that proves the wire is alive is the same thing that proves the PARTNER is.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { circleSignedIn, identityBaseUrl, identityCall } from '@/platform/circleClient';
import { track } from '@/platform/telemetry';
import {
  readSharedPlan,
  readSharedProgress,
  payloadIsWithinAllowList,
  type SharedPlan,
  type SharedProgress,
  type SharedRole,
} from '@/domain/sharedSession';

/** How often the caller re-publishes an unchanged frame. Nine of these fit inside `stale`. */
export const SHARED_PUBLISH_EVERY_MS = 20_000;

/** Redial delays, in order, then the last one forever. Never a tight loop against a dead gym AP. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

/** What the screen needs to know about the wire itself — never about the workout. */
export type SharedLink = 'idle' | 'connecting' | 'open' | 'closed';

/**
 * The reasons a pair cannot form, in the words a screen can say out loud.
 *
 * ⛔ `'signed_out'` IS THE ONE THAT WAS MISSING, and its absence was a lie. An athlete with the app
 * but no account got `'not_found'` — "that code opened no room" — about a code that was perfectly
 * good. She would have read it out to her brother again, and again, and the answer would never
 * change, because the problem was never the code.
 */
export type SharedFailure = 'unavailable' | 'not_found' | 'pair_full' | 'signed_out';

export interface SharedRoomHandlers {
  /** The server's ruling on who this phone is. Never what the client asked for. */
  onRole: (role: SharedRole) => void;
  onPlan: (plan: SharedPlan) => void;
  onPeer: (p: SharedProgress) => void;
  onPartner: (state: 'joined' | 'left') => void;
  onSwapAsk: (from: string, to: string) => void;
  onSwapAnswer: (accept: boolean) => void;
  onLink: (link: SharedLink) => void;
  onFailure: (why: SharedFailure) => void;
}

export interface SharedRoom {
  /** Publish this phone's whole position. Idempotent by construction — see the header. */
  publish: (p: SharedProgress) => void;
  /** Host only: the structure changed (a swap was accepted). */
  publishPlan: (plan: SharedPlan) => void;
  askSwap: (from: string, to: string) => void;
  answerSwap: (accept: boolean) => void;
  /** Hand the lead — whose lifts the workout runs on — to the other side. Refused once a plan
   *  exists; the room decides that, not this file. */
  handOverLead: () => void;
  /** Force a redial now — the app came back to the foreground and the socket may be a ghost. */
  poke: () => void;
  /** Leave. Idempotent, and it never throws. */
  close: () => void;
}

/** Is the pair part of THIS build at all? (No URL → the door is never drawn — same as the circle.) */
export function pairAvailable(): boolean {
  return identityBaseUrl().length > 0;
}

/** Does this phone hold an identity session? The pair needs one, exactly as the circle does. */
export async function pairSignedIn(): Promise<boolean> {
  return circleSignedIn();
}

/**
 * The link that opens a room on the other phone.
 *
 * ⛔ A UNIVERSAL LINK, AND THE REASON IS THE PERSON WHO DOES NOT HAVE THE APP YET.
 *
 * This was `hush://pair?c=…` for an afternoon, and a custom scheme does exactly nothing for the
 * one recipient who most needs it to do something — it is not a link at all to a phone with no app,
 * it is grey text. An `https` link on the identity worker's own origin opens the app when it is
 * installed (`associatedDomains` + the `apple-app-site-association` this worker now serves) and a
 * page with an App Store button when it is not.
 *
 * ⛔ AND IT IS AN `https` LINK EVEN THOUGH THE ENTITLEMENT IS NOT IN THE BINARY YET (2026-08-31).
 *
 * ✔ RESOLVED 2026-09-01: the Associated Domains capability was enabled on the App ID in the Apple
 * Developer portal (under the founder's grant), and `associatedDomains` is back in `app.json`.
 * Builds already in the field still lack the entitlement — the paragraph below describes THEM;
 * from the next build on, this link opens the app directly.
 *
 * ⚠️ THE LINK STAYS `https` ANYWAY, AND THAT IS THE BETTER TRADE. Without the entitlement it opens
 * the worker's landing page in a browser, which offers "open in the app" (a `hush://` button that
 * `Root` answers) and an App Store button. So:
 *
 *   · somebody WITH the app pays ONE EXTRA TAP;
 *   · somebody WITHOUT the app can now install it — which a scheme link could never offer at all.
 *
 * The day the capability is enabled on the App ID, the same link starts opening the app directly,
 * with no code change and no new copy. Nothing here has to be revisited; it just gets shorter.
 */
export function pairLink(code: string): string {
  return `${identityBaseUrl() || 'https://hush-identity.hush-app.workers.dev'}/pair?c=${encodeURIComponent(code)}`;
}

// ───────────────────────────── the two HTTP doors ─────────────────────────────

/** Open a room and get its code — or the reason there is none, in a word a screen can say. */
export async function pairOpen(): Promise<{ code: string; ticket: string } | SharedFailure> {
  if (!pairAvailable()) return 'unavailable';
  if (!(await pairSignedIn())) return 'signed_out';
  const res = await identityCall<{ code?: string; ticket?: string }>('/pair/open', { method: 'POST' });
  if (!res?.code || !res.ticket) return 'unavailable';
  void track('pair_opened');
  return { code: res.code, ticket: res.ticket };
}

/**
 * Walk into a room by its code.
 *
 * `'not_found'` is a real, distinct answer and not an error state: it means she typed it wrong, or
 * her brother's room expired, and the screen must be able to say which — see the worker's own note
 * on why a typo is answered by an HTTP status and never by a socket that quietly closes.
 */
export async function pairJoin(code: string): Promise<{ ticket: string } | SharedFailure> {
  if (!pairAvailable()) return 'unavailable';
  if (!(await pairSignedIn())) return 'signed_out';
  const res = await identityCall<{ ticket?: string }>('/pair/join', { method: 'POST', body: { code } });
  if (!res?.ticket) return 'not_found';
  void track('pair_joined');
  return { ticket: res.ticket };
}

// ───────────────────────────── the socket ─────────────────────────────

/**
 * Hold a room open for the length of a workout, through every way a phone loses a socket.
 *
 * `firstTicket` is the one the caller already minted (from `pairOpen` / `pairJoin`); every ticket
 * after it is minted here, because a ticket is single-use and a redial needs a fresh one. `code` is
 * what makes that possible, which is why the room is entered by code rather than by ticket alone.
 */
export function pairConnect(code: string, firstTicket: string, h: SharedRoomHandlers): SharedRoom {
  const base = identityBaseUrl();
  let ws: WebSocket | null = null;
  let closedByUs = false;
  let attempt = 0;
  let redialTimer: ReturnType<typeof setTimeout> | null = null;
  /** The last frame of each kind, re-sent on every fresh socket — the whole reconnect protocol. */
  let lastProgress: SharedProgress | null = null;
  let lastPlan: SharedPlan | null = null;
  let ticket: string | null = firstTicket;

  const link = (l: SharedLink) => {
    if (!closedByUs) h.onLink(l);
  };

  const send = (frame: unknown): void => {
    /*
     * ⛔ THE FENCE, ON THE WAY OUT. `payloadIsWithinAllowList` is not decoration: it is the last
     * mechanical thing between a future edit to a frame and a load, a bodyweight or a history
     * leaving this phone. A frame that fails it is DROPPED, not fixed — a silent partner is a
     * recoverable state, and a leak is not.
     */
    if (!payloadIsWithinAllowList((frame as { p?: unknown; plan?: unknown }).p ?? (frame as { plan?: unknown }).plan ?? {})) {
      void track('pair_frame_refused');
      return;
    }
    try {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(frame));
    } catch {
      /* the socket is on its way down; the redial below re-sends the state anyway */
    }
  };

  const dial = async (): Promise<void> => {
    if (closedByUs) return;
    link('connecting');
    if (!ticket) {
      const got = await pairJoin(code);
      if (closedByUs) return;
      if (typeof got === 'string') {
        // The room is gone for good (expired, or never existed) — stop dialling and say so once.
        if (got === 'not_found') {
          h.onFailure('not_found');
          link('closed');
          return;
        }
        return void schedule();
      }
      ticket = got.ticket;
    }
    const url = `${base.replace(/^http/, 'ws')}/pair/room?ticket=${encodeURIComponent(ticket)}`;
    ticket = null; // single use, spent on this attempt whether or not it lands
    let sock: WebSocket;
    try {
      sock = new WebSocket(url);
    } catch {
      return void schedule();
    }
    ws = sock;

    sock.onopen = () => {
      if (closedByUs) return;
      attempt = 0;
      link('open');
      // ⛔ THE ENTIRE RECONNECT PROTOCOL. State, not deltas — so "where I am" is also "everything
      // you missed", and there is nothing else to say.
      if (lastPlan) send({ t: 'plan', plan: lastPlan });
      if (lastProgress) send({ t: 'progress', p: lastProgress });
    };

    sock.onmessage = (ev: { data: unknown }) => {
      if (closedByUs || typeof ev.data !== 'string') return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        return;
      }
      switch (msg.t) {
        case 'room': {
          if (msg.role === 'host' || msg.role === 'guest') h.onRole(msg.role);
          return;
        }
        case 'plan': {
          const plan = readSharedPlan(msg.plan);
          if (plan) h.onPlan(plan);
          return;
        }
        case 'peer': {
          const p = readSharedProgress(msg.p);
          if (p) h.onPeer(p);
          return;
        }
        case 'partner': {
          if (msg.state === 'joined' || msg.state === 'left') h.onPartner(msg.state);
          return;
        }
        case 'swapAsk': {
          if (typeof msg.from === 'string' && typeof msg.to === 'string') h.onSwapAsk(msg.from, msg.to);
          return;
        }
        case 'swapAnswer': {
          h.onSwapAnswer(msg.accept === true);
          return;
        }
        case 'error': {
          if (msg.error === 'pair_full') {
            closedByUs = true; // a third phone is not a queue — it is told, and it stops
            h.onFailure('pair_full');
            link('closed');
          }
          return;
        }
        default:
          return; // a frame from a newer app; silence is the compatible answer
      }
    };

    sock.onerror = () => {
      /* `onclose` always follows; the redial lives there so it cannot run twice */
    };

    sock.onclose = () => {
      if (closedByUs) return;
      ws = null;
      link('closed');
      schedule();
    };
  };

  const schedule = (): void => {
    if (closedByUs || redialTimer) return;
    const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt += 1;
    redialTimer = setTimeout(() => {
      redialTimer = null;
      void dial();
    }, wait);
  };

  void dial();

  return {
    publish: (p) => {
      lastProgress = p;
      send({ t: 'progress', p });
    },
    publishPlan: (plan) => {
      lastPlan = plan;
      send({ t: 'plan', plan });
    },
    askSwap: (from, to) => send({ t: 'swapAsk', from, to }),
    answerSwap: (accept) => send({ t: 'swapAnswer', accept }),
    handOverLead: () => send({ t: 'lead' }),
    poke: () => {
      /*
       * iOS hands an app back after a spell in the background with a socket that LOOKS open and is
       * not — no close event ever arrives, and the pair silently stops updating while both screens
       * still say "open". So the foreground handler pokes: if the socket is anything but genuinely
       * open, dial again now rather than at the end of a backoff nobody started.
       */
      if (closedByUs) return;
      if (ws && ws.readyState === 1) {
        if (lastProgress) send({ t: 'progress', p: lastProgress });
        return;
      }
      if (redialTimer) {
        clearTimeout(redialTimer);
        redialTimer = null;
      }
      attempt = 0;
      void dial();
    },
    close: () => {
      closedByUs = true;
      if (redialTimer) {
        clearTimeout(redialTimer);
        redialTimer = null;
      }
      try {
        ws?.send(JSON.stringify({ t: 'bye' }));
        ws?.close();
      } catch {
        /* leaving is never allowed to fail */
      }
      ws = null;
      void track('pair_closed');
    },
  };
}
