/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE IMPORT CALL — what it may ask, and what it may believe.
 *
 * ⛔ FOUNDER, 2026-08-11: *"וצריך לוודא שהכל נעול ומסוגר."*
 *
 * Two things can go wrong with a model in this feature, and both are silent:
 *
 *   · it INVENTS a lift — answers `barbell_zercher_squat`, which is not in the catalogue, and an
 *     exercise that does not exist lands in her week;
 *   · it OVERSTEPS — is handed her programme and comes back with an improved one, which is the
 *     entire thing this feature exists to prevent.
 *
 * The second is prevented by what the call CONTAINS: her week is never sent. The first is prevented
 * by what the reader ACCEPTS. Both are asserted here.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import {
  importRequest,
  readImportReply,
  importReadRequest,
  readImportedWeek,
  IMPORT_MATCH_SCHEMA,
  IMPORT_PROMPT_VERSION,
} from '@/domain/importPrompt';
import { matchWeek, toProgram } from '@/domain/importedPlan';
import { EXERCISES } from '@/data/exercises';

const ASK = ['Zercher Squat', 'Jefferson Curl', 'לחיצת חזה'];

describe('⛔ what the import call asks', () => {
  it('sends the catalogue and the names, and NOTHING about her week', () => {
    /*
     * ⛔ THE LOAD-BEARING ASSERTION OF THIS FILE. The model cannot rewrite a programme it has never
     * seen. If someone later "helps" the model by including her sessions for context, this goes red
     * — which is the point, because that change would quietly re-open the door the whole feature
     * closes.
     */
    const req = importRequest({ unmatched: ASK });
    const sent = req.blocks.map((b) => b.text).join('\n');
    for (const n of ASK) expect(sent).toContain(n);
    // Nothing about days, sets, volume, or what she trains.
    for (const leak of ['setCount', 'sets:', 'Monday', 'session', 'weekly', 'daysPerWeek', 'bodyMap']) {
      expect(sent).not.toContain(leak);
    }
  });

  it('⛔ it is NOT the coach prompt — no programme-building doctrine rides along', () => {
    /*
     * `coachPrompt` teaches a model to converse and to build a week. Both are the wrong instruction
     * here and both cost tokens on every import. Asserted by absence of the vocabulary that prompt
     * is made of, so a future "just reuse coachRequest" refactor fails loudly.
     */
    const sent = importRequest({ unmatched: ASK }).blocks.map((b) => b.text).join('\n');
    for (const doctrine of ['hypertrophy', 'MEV', 'progressive', 'programme for', 'build a week', 'RIR']) {
      expect(sent.toLowerCase()).not.toContain(doctrine.toLowerCase());
    }
    expect(sent).toContain('not writing a programme');
  });

  it('carries every catalogue id, so the model can only choose from what we actually have', () => {
    const sent = importRequest({ unmatched: ASK }).blocks.map((b) => b.text).join('\n');
    const missing = EXERCISES.filter((e) => !sent.includes(`${e.id} = ${e.name}`)).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('⛔ thinks LOW — recall, not planning, and the worker’s own numbers say why', () => {
    /*
     * The worker measured thinking at 4,105 of 4,557 tokens on a programme BUILD — 82% of the bill —
     * and warns that turning it down cost quality there. That warning is about the call that plans a
     * week. Naming a lift does not plan anything. `minimal` is not used either: these names arrive
     * misspelled, translated and abbreviated, and telling "ours under another name" from "not ours"
     * is the whole task.
     */
    expect(importRequest({ unmatched: ASK }).think).toBe('low');
  });

  it('the catalogue is the cache breakpoint — her names sit below it', () => {
    /*
     * The catalogue is identical for every athlete on every import and is most of the tokens; her
     * names are unique to the call. Caching the first and not the second is the same discipline
     * `coachRequest` uses, and the flag defaults off for the same reason.
     */
    const off = importRequest({ unmatched: ASK });
    expect(off.blocks[0].cache).toBeUndefined();
    const on = importRequest({ unmatched: ASK, cache: true });
    expect(on.blocks[0].cache).toBe(true);
    expect(on.blocks[1].cache).toBeUndefined();
    expect(on.blocks[1].text).toContain('Zercher Squat');
  });

  it('asks for `why` in her language', () => {
    expect(importRequest({ unmatched: ASK, locale: 'he' }).blocks[0].text).toContain('Hebrew');
    expect(importRequest({ unmatched: ASK, locale: 'en' }).blocks[0].text).toContain('English');
  });

  it('⛔ the schema permits `id: null` — "not one of ours" must be a legal answer', () => {
    /*
     * A schema that required an id would force the model to invent one for every lift the catalogue
     * genuinely lacks, which is precisely the failure this feature cannot have. The prompt says so
     * twice; the schema has to agree, or the prose is overruled.
     */
    const lift = IMPORT_MATCH_SCHEMA.properties.lifts.items;
    expect(lift.required).toEqual(['name']);
    expect(lift.properties.id.nullable).toBe(true);
    expect(lift.properties.alternative.nullable).toBe(true);
    expect(IMPORT_PROMPT_VERSION).toBeGreaterThan(0);
  });
});

describe('⛔ what the import call believes', () => {
  const asked = ['Zercher Squat', 'Jefferson Curl'];

  it('⛔ an INVENTED id is thrown away — a lift that does not exist never reaches her week', () => {
    const out = readImportReply(
      { lifts: [{ name: 'Zercher Squat', id: 'barbell_zercher_squat', why: 'x' }] },
      asked,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBeNull();
  });

  it('⛔ an invented ALTERNATIVE is thrown away too', () => {
    const out = readImportReply(
      { lifts: [{ name: 'Zercher Squat', id: null, alternative: 'not_a_real_lift', why: 'x' }] },
      asked,
    );
    expect(out[0].alternative).toBeNull();
  });

  it('keeps a real id and a real alternative', () => {
    const out = readImportReply(
      {
        lifts: [
          { name: 'Zercher Squat', id: null, alternative: 'bb_back_squat', why: 'closest squat we carry' },
          { name: 'Jefferson Curl', id: 'bb_rdl', why: 'the same hinge' },
        ],
      },
      asked,
    );
    expect(out[0].alternative).toBe('bb_back_squat');
    expect(out[0].why).toBe('closest squat we carry');
    expect(out[1].id).toBe('bb_rdl');
  });

  it('⛔ an answer about a name we never asked about is dropped', () => {
    /*
     * The model echoes `name` back. If it echoes something else it has answered about a lift nobody
     * asked for — and a row that cannot be paired to one of her own words has no place in her week.
     */
    const out = readImportReply({ lifts: [{ name: 'Bench Press', id: 'bb_bench_press' }] }, asked);
    expect(out).toEqual([]);
  });

  it('a confirmed id wins over an alternative — the two are different claims', () => {
    const out = readImportReply(
      { lifts: [{ name: 'Zercher Squat', id: 'bb_back_squat', alternative: 'front_squat' }] },
      asked,
    );
    expect(out[0].id).toBe('bb_back_squat');
    expect(out[0].alternative).toBeNull();
  });

  it('survives a reply that is not the shape we asked for', () => {
    for (const junk of [null, undefined, {}, { lifts: null }, { lifts: 'no' }, { lifts: [1, 2] }, 'text']) {
      expect(readImportReply(junk, asked)).toEqual([]);
    }
  });
});

describe('⛔ reading a photograph of her programme', () => {
  it('⛔ the READ call carries NO catalogue — the model reads, our code matches', () => {
    /*
     * ⛔ THE DESIGN DECISION, ASSERTED. The tempting build hands the model her photo AND the
     * catalogue and takes back finished ids. `matchWeek` resolves names PERFECTLY (117/117 by name,
     * 46/46 synonyms), so that trade replaces a matcher that cannot be wrong with one that can — on
     * the one step where being wrong is invisible to her.
     *
     * It also happens to be cheaper: 63 tokens of instruction instead of 1,258. That is the smaller
     * reason and it is recorded second on purpose.
     */
    const read = importReadRequest();
    const sent = read.blocks.map((b) => b.text).join('\n');
    for (const ex of ['bb_bench_press', 'leg_press', 'hip_thrust']) expect(sent).not.toContain(ex);
    expect(sent.length).toBeLessThan(1200); // the whole instruction, not a doctrine
    expect(read.think).toBe('low');
  });

  it('⛔ it is told to COPY, not to improve — the instruction a coach’s sheet depends on', () => {
    const sent = importReadRequest().blocks[0].text;
    expect(sent).toContain('EXACTLY as written');
    expect(sent).toContain('Copy, do not improve');
    expect(sent).toContain('Do not translate');
    expect(sent).toContain('Never add an exercise');
  });

  it('⛔ a set count it did not read comes back ABSENT, never guessed', () => {
    const w = readImportedWeek({
      sessions: [{ name: 'A', lifts: [{ name: 'Bench', sets: 4 }, { name: 'Row' }, { name: 'Curl', sets: 0 }] }],
    });
    expect(w.sessions[0].lifts[0].sets).toBe(4);
    expect(w.sessions[0].lifts[1].sets).toBeUndefined();
    // A zero is not a set count — it becomes a question, not a number she never wrote.
    expect(w.sessions[0].lifts[2].sets).toBeUndefined();
  });

  it('drops what it cannot use, and survives junk', () => {
    expect(readImportedWeek({ sessions: [{ name: 'A', lifts: [] }] }).sessions).toEqual([]);
    expect(readImportedWeek({ sessions: [{ lifts: [{ name: 'x' }] }] }).sessions).toEqual([]);
    for (const junk of [null, undefined, {}, { sessions: 'no' }, 'text']) {
      expect(readImportedWeek(junk).sessions).toEqual([]);
    }
  });

  it('the read feeds the matcher — end to end, her words become her programme', () => {
    const week = readImportedWeek({
      title: 'Coach block',
      sessions: [
        { name: 'Push', lifts: [{ name: 'BB Bench Press', sets: 5 }, { name: 'Zercher Squat', sets: 3 }] },
      ],
    });
    const m = matchWeek(week);
    expect(m.sessions[0].lifts[0].match.id).toBe('bb_bench_press');
    expect(m.unmatched).toEqual(['Zercher Squat']); // …and only this goes to the second call
    const p = toProgram(m);
    expect(p.authored).toBe('athlete_or_coach');
    expect(p.days[0].slots).toHaveLength(1);
  });
});
