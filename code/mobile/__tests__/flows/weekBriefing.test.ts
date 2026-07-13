/**
 * THE SENTENCE HUSH SAYS ABOUT ITSELF (founder 2026-07-13).
 *
 * "The app still doesn't say what it does — it doesn't read like anybody is MANAGING a training
 * programme." The answer is not a tutorial, it is this line: the engine's actual weekly decisions,
 * narrated on Home in the first person. Which makes the line load-bearing in a way copy usually is
 * not — every claim in it is a claim about what the engine DID, and a wrong one is a lie told with
 * total confidence. So the resolver is pinned here: what it says, when it stays silent, and above
 * all that it never reports a change that did not happen.
 */
import { weekBriefing, type BriefChange } from '@/domain/weekBriefing';
import { initI18n, tg } from '@/i18n';
import { resetGender } from '@/i18n/gender';
import i18next from 'i18next';

const raise = (name: string, from: number, to: number): BriefChange => ({ name, loadFrom: from, loadTo: to, swapped: false });
const drop = (name: string, from: number, to: number): BriefChange => ({ name, loadFrom: from, loadTo: to, swapped: false });
const swap = (name: string): BriefChange => ({ name, loadFrom: 40, loadTo: 40, swapped: true });

/**
 * The rendered sentence, as an athlete reads it on Home — with the BiDi isolates stripped.
 * Exercise names stay English inside Hebrew copy (the RTL law), which means they arrive wrapped in
 * U+2066…U+2069. Those are invisible to the eye and must stay invisible to these assertions.
 */
const ISOLATES = /[⁦-⁩]/g;
const say = (changes: BriefChange[] | null): string =>
  weekBriefing(changes, 'kg')
    .map((l) => tg(l.key, l.params))
    .join(' ')
    .replace(ISOLATES, '');

beforeAll(async () => {
  await initI18n();
});
afterEach(() => resetGender());

describe('week 1 — silence, not a report', () => {
  it('says NOTHING before it has decided anything (founder 2026-07-13)', () => {
    // The promise about Saturday is made where the programme is handed over (ProgramCreated).
    // Repeating it on the week card cost the card its top third to say what was just said.
    expect(weekBriefing(null, 'kg')).toEqual([]);
  });
});

describe('a week where Hush changed nothing', () => {
  it('SAYS SO — a steady week is a decision, and pretending otherwise devalues every other line', () => {
    expect(weekBriefing([], 'kg')).toEqual([{ key: 'home.briefSteady' }]);
  });
});

describe('the loads', () => {
  it('names the lift and the NEW load when one load went up', async () => {
    await i18next.changeLanguage('en');
    expect(say([raise('Bench Press', 60, 62.5)])).toBe('I raised your Bench Press to 62.5 kg.');
  });

  it('the headline of several raises is the BIGGEST STEP, not the heaviest lift', () => {
    // The squat is far heavier; the row is the news (+5 kg vs +2.5 kg).
    const lines = weekBriefing([raise('Back Squat', 100, 102.5), raise('Barbell Row', 50, 55)], 'kg');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ key: 'home.briefRaisedMany', params: expect.objectContaining({ n: 2, load: '55' }) });
    expect(String(lines[0].params!.lift).replace(ISOLATES, '')).toBe('Barbell Row');
  });

  it('a load coming DOWN is never a setback — it is the prescription matching what was demonstrated', async () => {
    await i18next.changeLanguage('en');
    const line = say([drop('Overhead Press', 45, 40)]);
    expect(line).toBe('I matched the load on Overhead Press to what you demonstrated.');
    expect(line.toLowerCase()).not.toMatch(/lower|down|dropp|fail|deload|back/);
  });

  it('a raise outranks a match-down — the week has ONE headline', () => {
    const lines = weekBriefing([drop('Overhead Press', 45, 40), raise('Bench Press', 60, 62.5)], 'kg');
    expect(lines.map((l) => l.key)).toEqual(['home.briefRaisedOne']);
  });

  it('a change that touched neither load nor exercise is reported as what it was: a tuning', () => {
    const setsOnly: BriefChange = { name: 'Lat Pulldown', loadFrom: 50, loadTo: 50, swapped: false };
    expect(weekBriefing([setsOnly], 'kg')).toEqual([{ key: 'home.briefTuned', params: { n: 1 } }]);
  });

  it('speaks the athlete\'s own units — never kg at somebody who chose pounds', () => {
    const [line] = weekBriefing([raise('Bench Press', 60, 62.5)], 'lb');
    expect(line.params!.unit).toBe('lb');
    expect(line.params!.load).not.toBe('62.5');
  });
});

describe('the swaps', () => {
  it('a swap is its own sentence, after the loads — two facts, never one blurred one', () => {
    const lines = weekBriefing([raise('Bench Press', 60, 62.5), swap('Leg Press')], 'kg');
    expect(lines.map((l) => l.key)).toEqual(['home.briefRaisedOne', 'home.briefSwappedOne']);
  });

  it('stands alone when the swap is all that happened', () => {
    expect(weekBriefing([swap('Leg Press')], 'kg').map((l) => l.key)).toEqual(['home.briefSwappedOne']);
  });

  it('a swapped lift is NEVER counted as a load change (it has no from→to to speak of)', () => {
    const lines = weekBriefing([swap('Leg Press'), swap('Cable Row')], 'kg');
    expect(lines.map((l) => l.key)).toEqual(['home.briefSwappedMany']);
    expect(lines[0].params).toEqual({ n: 2 });
  });
});

describe('the voice', () => {
  it('is Hush speaking in the FIRST PERSON, in both languages', async () => {
    for (const [lng, mark] of [['en', 'I '], ['he', 'אני|העליתי|קראתי|בניתי|התאמתי|החלפתי|כיווננתי']] as const) {
      await i18next.changeLanguage(lng);
      // (week 1 is not in this list: the card says nothing at all then — see the first describe.)
      const sentences = [
        say([]),
        say([raise('Bench Press', 60, 62.5)]),
        say([drop('Overhead Press', 45, 40)]),
        say([swap('Leg Press')]),
      ];
      for (const s of sentences) {
        expect(s).toBeTruthy();
        expect(s).not.toContain('home.brief'); // never a raw key on the athlete's screen
        expect(s).toMatch(new RegExp(mark));
      }
    }
    await i18next.changeLanguage('en');
  });
});
