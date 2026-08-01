/**
 * ════ +15 IS A MEASUREMENT, NOT A COURTESY ════
 *
 * Founder C.10: *"adding +15 s shows nothing, so the learning looks one-directional."*
 *
 * He was exactly right, and the cause is two correct rules meeting. `restTotalS` NEVER GROWS — that
 * is the fill-forward law, and it is what makes the ring sweep by a visible slice when she presses
 * +15 instead of nudging imperceptibly. Meanwhile the elapsed rest was read as `total - remaining`,
 * off that same deliberately frozen total.
 *
 * So every second she ADDED was invisible to the measurement. She stretched her rest, the beat
 * reported the old duration, her median did not move, and the one direction the feature could not
 * learn was the one she had just demonstrated with her thumb.
 *
 * The clock she actually watched is `total + extra`. This file holds that.
 */

import { restedSeconds as rested } from '@/domain/restPrescription';

describe('the rest she actually took', () => {
  it('counts a rest she CUT SHORT — the direction that always worked', () => {
    // 120 s prescribed, she starts with 45 s left: she rested 75.
    expect(rested(120, 45, 0)).toBe(75);
  });

  it('⚠️ counts a rest she EXTENDED, which is the whole of C.10', () => {
    /*
     * She pressed +15 and let the whole thing run out. She rested 135 seconds. Read off the frozen
     * total it looks like 120 — the same as if she had never touched the control, which is exactly
     * what "adding +15 shows nothing" means from the other side of the screen.
     */
    expect(rested(120, 0, 15)).toBe(135);
    expect(rested(120, 0, 30)).toBe(150); // twice
  });

  it('counts an extension she then cut short — both hands on the same number', () => {
    // +15 (remaining jumps to 60), then Start with 40 left: 120 + 15 − 40 = 95.
    expect(rested(120, 40, 15)).toBe(95);
  });

  it('reports the same instant whether she presses +15 or not, when she starts immediately', () => {
    /*
     * The control adds to `remaining`, so pressing it and starting straight away must report the
     * time she had ALREADY spent. Otherwise the button would rewrite the past.
     */
    const before = rested(120, 30, 0);
    const afterPressingPlus15 = rested(120, 45, 15); // remaining grew by exactly the extra
    expect(afterPressingPlus15).toBe(before);
  });

  it('never reports a negative rest', () => {
    // Defensive: a resume across a clock change can hand back more remaining than total.
    expect(rested(90, 200, 0)).toBe(0);
  });
});
