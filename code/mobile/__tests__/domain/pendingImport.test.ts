/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE IMPORT THAT RUNS UNDERNEATH THE INTAKE.
 *
 * ⛔ FOUNDER, 2026-08-11: *"בזמן שהבינה מייבאת את התוכנית שלו הוא עובר את תהליך הONBORDING … וכך
 * המעבר יהיה חלק יותר."*
 *
 * The thing awaiting this module is the last screen of onboarding — the one place she cannot go
 * back from. So the failures that matter are not "the import was wrong" (that is tested elsewhere);
 * they are "the import never resolved", "it threw", and "it ran twice". Each of those is a white
 * screen or a double charge between her and her programme.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { startImport, settledImport, peekImport, clearImport, watchImport } from '@/domain/pendingImport';

/** A model whose answer the test releases by hand, so the "still running" window is real. */
function heldModel() {
  const gates: (() => void)[] = [];
  let n = 0;
  const ask = async (_req, _s, _t, images) => {
    n += 1;
    await new Promise<void>((resolve) => gates.push(resolve));
    return {
      ok: true,
      text: JSON.stringify(
        images
          ? { sessions: [{ name: 'A', lifts: [{ name: 'Barbell Bench Press', sets: 4 }] }] }
          : { lifts: [] },
      ),
    };
  };
  return { ask, release: () => gates.shift()?.(), calls: () => n };
}

const PHOTO = [{ mime: 'image/jpeg', data: 'x' }];

beforeEach(() => clearImport());

describe('⛔ an import running under the intake', () => {
  it('starts, and says so — a waiting screen has something honest to show', async () => {
    const { ask, release } = heldModel();
    expect(peekImport().phase).toBe('idle');
    startImport(ask, { images: PHOTO });
    expect(peekImport()).toMatchObject({ phase: 'running', step: 'reading' });
    release();
    await settledImport();
    expect(peekImport().phase).toBe('done');
  });

  it('⛔ awaiting AFTER it finished resolves at once — she never waits for work already done', async () => {
    const { ask, release } = heldModel();
    startImport(ask, { images: PHOTO });
    release();
    await settledImport();
    const again = await settledImport();
    expect(again.ok).toBe(true);
    expect(again.liftCount).toBe(1);
  });

  it('⛔ awaiting BEFORE it finished waits for it — the whole point of starting early', async () => {
    const { ask, release } = heldModel();
    startImport(ask, { images: PHOTO });
    let landed = false;
    const p = settledImport().then((r) => {
      landed = true;
      return r;
    });
    expect(landed).toBe(false); // still in flight while she answers the intake
    release();
    const out = await p;
    expect(landed).toBe(true);
    expect(out.ok).toBe(true);
  });

  it('⛔ starting twice does NOT read twice — one photograph, one call', async () => {
    /*
     * She can reach the import screen again: back out of onboarding, come in a second time. A second
     * read would spend a second call on the same sheet and leave two answers competing over one week.
     */
    const { ask, release, calls } = heldModel();
    startImport(ask, { images: PHOTO });
    startImport(ask, { images: PHOTO });
    startImport(ask, { images: PHOTO });
    release();
    await settledImport();
    expect(calls()).toBe(1);
  });

  it('⛔ NOTHING started is not an error — most athletes bring no programme', async () => {
    expect(await settledImport()).toBeNull();
    expect(peekImport().phase).toBe('idle');
  });

  it('⛔ a THROWN call becomes a settled failure — never an unhandled rejection', async () => {
    /*
     * The awaiting screen is the last step of onboarding, which she cannot leave. A rejection there
     * is a white screen between her and her programme.
     */
    const boom = async () => {
      throw new Error('network exploded');
    };
    startImport(boom, { images: PHOTO });
    const out = await settledImport();
    expect(out).toEqual({ ok: false, reason: 'unreachable' });
    expect(peekImport().phase).toBe('done');
  });

  it('a failed import settles as a failure the caller can render', async () => {
    const ask = async () => ({ ok: false, reason: 'upstream' });
    startImport(ask, { images: PHOTO });
    const out = await settledImport();
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('unreachable');
  });

  it('⛔ the REPORT lands while the leftovers call is still in the air', async () => {
    /*
     * `onReady` fires between the two calls. Held here so a waiting screen can show her the real
     * report the moment it exists rather than a spinner — even with the optional half still running.
     */
    const gates = [];
    const ask = async (_r, _s, _t, images) => {
      await new Promise((res) => gates.push(res));
      return {
        ok: true,
        text: JSON.stringify(
          images
            ? { sessions: [{ name: 'A', lifts: [{ name: 'Barbell Bench Press', sets: 4 }, { name: 'Zercher Squat', sets: 3 }] }] }
            : { lifts: [] },
        ),
      };
    };
    startImport(ask, { images: PHOTO });
    gates.shift()(); // the read comes back
    await Promise.resolve();
    await Promise.resolve();
    const mid = peekImport();
    expect(mid.phase).toBe('running');
    expect(mid.step).toBe('matching');
    expect(mid.partial).not.toBeNull();
    expect(mid.partial.liftCount).toBe(1); // the Zercher squat is not ours, and is reported
    gates.shift()();
    await settledImport();
  });

  it('watchers see every move, and unsubscribe cleanly', async () => {
    const seen = [];
    const stop = watchImport((s) => seen.push(s.phase));
    const { ask, release } = heldModel();
    startImport(ask, { images: PHOTO });
    release();
    await settledImport();
    stop();
    expect(seen[0]).toBe('idle'); // fired immediately with the current state
    expect(seen).toContain('running');
    expect(seen[seen.length - 1]).toBe('done');
    const after = seen.length;
    clearImport();
    expect(seen).toHaveLength(after); // nothing after unsubscribe
  });

  it('⛔ clearing lets a NEW import start — she can replace the sheet she photographed', async () => {
    const first = heldModel();
    startImport(first.ask, { images: PHOTO });
    first.release();
    await settledImport();
    clearImport();
    expect(peekImport().phase).toBe('idle');

    const second = heldModel();
    startImport(second.ask, { images: PHOTO });
    second.release();
    await settledImport();
    expect(second.calls()).toBe(1);
  });
});
