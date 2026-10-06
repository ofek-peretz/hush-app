/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE VOICE JOURNAL READS BACK WHAT THE PHONE WROTE DOWN (2026-10-06)
 *
 * Founder: *"מזערתי את מסך האפליקציה … לא היה לי התראה. כשחזרתי … הבינה אמרה 'חזרתי' … אבל היא לא
 * הגיבה."* — four findings about a phone nobody at a desk can see. The phone had been writing the
 * answers down all along (`track('voice_…')`), and nothing showed them. The profile does now.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { db } from '@/data/local/db';
import { journalLine, readVoiceJournal } from '@/platform/voice/voiceJournal';
import { track } from '@/platform/telemetry';

const fs = require('node:fs');
const path = require('node:path');
const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('⛔ the voice journal', () => {
  beforeEach(async () => {
    await db.clearAll();
  });

  it('one row, one line: the time on her clock, what happened, and the detail — nothing empty, nothing long', () => {
    const at = new Date(2026, 9, 6, 9, 41, 7).toISOString();
    expect(journalLine({ type: 'voice_ear', client_ts: at, data: { state: 'open', source: 'phone', strong: true, error: null } })).toBe('09:41:07  ear  state=open source=phone strong=yes');
    expect(journalLine({ type: 'voice_window_end', client_ts: at, data: { why: 'deaf', expect: 'reps' } })).toBe('09:41:07  window_end  why=deaf expect=reps');
    expect(journalLine({ type: 'pause', client_ts: at })).toBe('09:41:07  pause');
    expect(journalLine({ type: 'voice_said', client_ts: at, data: { line: 'x'.repeat(90) } }).length).toBeLessThan(70);
  });

  it('reads the voice\'s rows from the journal the phone already keeps — and only those, oldest first', async () => {
    await track('app_open');
    await track('voice_gate', { switchOn: true, headset: true });
    await track('weight_logged', { kg: 81 });
    await track('voice_ear', { state: 'open', source: 'phone' });
    await track('session_started', { sessionId: 's1' });
    await track('voice_window', { expect: 'ready', s: 90, mic: 'held' });
    const rows = await readVoiceJournal();
    expect(rows.map((r) => r.split('  ')[1])).toEqual(['gate', 'ear', 'session_started', 'window']);
    expect(rows[1]).toMatch(/^\d\d:\d\d:\d\d  ear  state=open source=phone$/);
    expect(rows.join(' ')).not.toContain('sessionId');
  });

  it('the last eighty, however long the workout was', async () => {
    for (let i = 0; i < 130; i++) await track('voice_said', { line: `line ${i}` });
    const rows = await readVoiceJournal();
    expect(rows).toHaveLength(80);
    expect(rows[79]).toContain('line 129');
  });

  it('the turns of the phone a report hangs on are all written down by the hook', () => {
    const hook = read('src/platform/voice/useVoiceCoach.ts');
    for (const event of ['voice_on', 'voice_off', 'voice_app', 'voice_window', 'voice_window_end', 'voice_said', 'voice_ear', 'voice_gate']) {
      expect(`${event}: ${hook.includes(`'${event}'`)}`).toBe(`${event}: true`);
    }
    // …and the profile shows them where the voice's other tests are.
    const profile = read('src/screens/profile/ProfileSheet.tsx');
    expect(profile).toContain("t('profile.voiceJournal')");
    expect(profile).toContain('readVoiceJournal()');
  });
});
