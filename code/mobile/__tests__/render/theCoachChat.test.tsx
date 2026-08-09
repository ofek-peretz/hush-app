// @ts-nocheck
// 
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { CoachChat, type CoachTurn } from '@/screens/coach/CoachChat';
import { initI18n, tg } from '@/i18n';

/*
 * The picker is native. Mocked so the composer's own behaviour around it can be tested at all —
 * without this, the one control the founder asked for would ship with no coverage whatsoever,
 * which is how `ItemStage` reached an athlete unreachable from the app.
 */
jest.mock('@/platform/coach/coachImage', () => ({
  MAX_IMAGES_PER_TURN: 3,
  pickCoachImage: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pickCoachImage } = require('@/platform/coach/coachImage') as { pickCoachImage: jest.Mock };
const A_PHOTO = { mime: 'image/jpeg', data: 'BASE64', uri: 'file://shot.jpg' };

/**
 * ════ THE COACH CHAT ════
 *
 * The intake conversation and every conversation after it are the same screen — so the states worth
 * pinning are the ones that are easy to get subtly wrong and expensive when they are:
 *
 *   · sending an empty message (a stray tap on a blank field costs a real API call)
 *   · a message that left but has not landed (looking identical to a delivered one is why people
 *     send things twice)
 *   · a message that never arrived (a toast that has already faded is not a state)
 *
 * The layout is deliberately plain and is being redesigned; none of these assertions are about how
 * it looks, and a restyle should not touch this file.
 */

beforeAll(async () => { await initI18n(); });

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { while (mounted.length) mounted.pop()!.unmount(); }); });

function draw(node: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = renderer.create(node); });
  mounted.push(r);
  return r;
}

function textOf(r: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    (n as { children?: unknown[] } | null)?.children?.forEach(walk);
  };
  walk(r.toJSON());
  return out.join(' ');
}

const byLabel = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props?.accessibilityLabel === label)[0];

/** Type into the composer. */
function type(r: ReactTestRenderer, text: string): void {
  const input = byLabel(r, tg('coach.placeholder'));
  act(() => { input.props.onChangeText(text); });
}

function press(r: ReactTestRenderer, label: string): void {
  act(() => { byLabel(r, label).props.onPress(); });
}

const turns: CoachTurn[] = [
  { id: '1', by: 'coach', text: 'What are you training for?' },
  { id: '2', by: 'athlete', text: 'I want to finish a marathon in April.' },
  { id: '3', by: 'coach', text: 'Have you run before, and what is the longest you have done?' },
];

describe('the conversation', () => {
  it('shows both voices in the order they were said', () => {
    const read = textOf(draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />));
    expect(read).toContain('What are you training for?');
    expect(read).toContain('marathon in April');
    expect(read.indexOf('What are you training')).toBeLessThan(read.indexOf('marathon in April'));
  });

  it('⚠️ opens with ONE INVITATION, and says nothing else', () => {
    /*
     * Founder, 2026-08-01, on the version this replaces: *"I don't like it. It's as if before
     * talking to you these sentences appeared — it's strange. What it needs is to be INVITING, to
     * start a conversation, and DURING the conversation the coach introduces and explains
     * itself."*
     *
     * The build before this made the coach recite three lines about itself before she had said a
     * word. Nobody introduces themselves to an empty room. The introduction moved into the prompt,
     * where it happens while answering her — like a person.
     *
     * What is left is the room: one line, above the thread, that makes starting obvious.
     */
    const read = textOf(draw(<CoachChat invitation="AN INVITATION" turns={[]} onSend={jest.fn()} />));
    expect(read).toContain('AN INVITATION');
    // Nothing pretends to be a message from the coach before she has spoken.
    expect(read).not.toContain(tg('coach.thinking'));
  });

  it('drops the invitation the moment there is a real conversation', () => {
    // It is the room, not a turn. A frame that stayed once the conversation started would be a
    // header nobody asked for, taking the space her words should have.
    const read = textOf(draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />));
    expect(read).not.toContain('AN INVITATION');
  });

  it('never blocks the composer while the invitation draws', () => {
    /*
     * The lines land over about a second and a half. A person who already knows what to say must
     * never wait for a performance to finish — so the field and the send control are live from the
     * first frame, and the beat is decoration over a working screen rather than a gate in front of
     * one.
     */
    const input = byLabel(draw(<CoachChat invitation="AN INVITATION" turns={[]} onSend={jest.fn()} />), tg('coach.placeholder'));
    expect(input.props.editable).not.toBe(false);
  });
});

describe('sending', () => {
  it('sends what she typed, trimmed', () => {
    const onSend = jest.fn();
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={onSend} />);
    type(r, '  Longest was 18 km.  ');
    press(r, tg('coach.send'));
    // `undefined` is the images argument: she attached nothing, and a turn with no picture must
    // not send an empty array — the Worker would then push a parts entry nobody asked for.
    expect(onSend).toHaveBeenCalledWith('Longest was 18 km.', undefined);
  });

  it('clears the field so she cannot send the same thing twice by accident', () => {
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />);
    type(r, 'Eighteen kilometres.');
    press(r, tg('coach.send'));
    expect(byLabel(r, tg('coach.placeholder')).props.value).toBe('');
  });

  it('refuses an empty message, and refuses whitespace', () => {
    // The send control sits live on a blank field; without this guard a stray tap costs a call.
    const onSend = jest.fn();
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={onSend} />);
    press(r, tg('coach.send'));
    type(r, '   \n  ');
    press(r, tg('coach.send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('marks the send control disabled until there is something to send', () => {
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />);
    expect(byLabel(r, tg('coach.send')).props.accessibilityState).toEqual({ disabled: true });
    type(r, 'ok');
    expect(byLabel(r, tg('coach.send')).props.accessibilityState).toEqual({ disabled: false });
  });

  it('stays usable while the coach is composing — she may keep typing', () => {
    // A model can take many seconds. Locking the field for that long makes the app feel broken,
    // and her next thought is gone by the time it unlocks.
    const onSend = jest.fn();
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} busy onSend={onSend} />);
    type(r, 'Also my knee has been sore.');
    press(r, tg('coach.send'));
    expect(onSend).toHaveBeenCalledWith('Also my knee has been sore.', undefined);
  });
});

describe('a picture she attaches', () => {
  /*
   * Founder, 2026-08-02: *"build the option for an image, so the AI knows how to analyse it if a
   * user sends one."*
   *
   * Verified live before any of this was drawn: a photographed programme went through the Worker
   * and the coach read a note in its margin — "shoulder hurts on overhead" — and wrote it into its
   * memory of her, without her typing a word about her shoulder. These are the app's half.
   */
  beforeEach(() => pickCoachImage.mockReset());

  const attach = async (r: ReactTestRenderer) => {
    await act(async () => { await byLabel(r, tg('coach.attach')).props.onPress(); });
  };

  it('⚠️ travels with the message, and the message alone carries no images key', async () => {
    const onSend = jest.fn();
    pickCoachImage.mockResolvedValue(A_PHOTO);
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={onSend} />);
    await attach(r);
    type(r, 'This is what I was doing.');
    press(r, tg('coach.send'));
    expect(onSend).toHaveBeenCalledWith('This is what I was doing.', [{ mime: 'image/jpeg', data: 'BASE64' }]);
  });

  it('⚠️ a picture on its own is a message', async () => {
    // "Look at this" is a whole sentence when the thing is attached to it. The empty-field guard
    // must not swallow it.
    const onSend = jest.fn();
    pickCoachImage.mockResolvedValue(A_PHOTO);
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={onSend} />);
    await attach(r);
    expect(byLabel(r, tg('coach.send')).props.accessibilityState).toEqual({ disabled: false });
    press(r, tg('coach.send'));
    expect(onSend).toHaveBeenCalledWith('', [{ mime: 'image/jpeg', data: 'BASE64' }]);
  });

  it('lets her take it back before it is sent', async () => {
    const onSend = jest.fn();
    pickCoachImage.mockResolvedValue(A_PHOTO);
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={onSend} />);
    await attach(r);
    press(r, tg('coach.attachRemove'));
    expect(byLabel(r, tg('coach.send')).props.accessibilityState).toEqual({ disabled: true });
  });

  it('is cleared once it has gone, so the next message does not carry it again', async () => {
    const onSend = jest.fn();
    pickCoachImage.mockResolvedValue(A_PHOTO);
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={onSend} />);
    await attach(r);
    press(r, tg('coach.send'));
    type(r, 'And another thing.');
    press(r, tg('coach.send'));
    expect(onSend).toHaveBeenLastCalledWith('And another thing.', undefined);
  });

  it('says nothing when she backs out of the picker', async () => {
    // `null` is her cancelling. It is not an error and there is nothing to report.
    pickCoachImage.mockResolvedValue(null);
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />);
    await attach(r);
    expect(byLabel(r, tg('coach.send')).props.accessibilityState).toEqual({ disabled: true });
  });

  it('⚠️ survives a picker that throws, rather than taking the screen down', async () => {
    pickCoachImage.mockRejectedValue(new Error('no photo library'));
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />);
    await attach(r);
    // Still a working composer.
    type(r, 'never mind');
    expect(byLabel(r, tg('coach.send')).props.accessibilityState).toEqual({ disabled: false });
  });

  it('will not attach more than the turn allows', async () => {
    pickCoachImage.mockImplementation(() => Promise.resolve({ ...A_PHOTO, uri: `file://${Math.random()}.jpg` }));
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />);
    for (let i = 0; i < 5; i += 1) await attach(r);
    expect(pickCoachImage).toHaveBeenCalledTimes(3);
  });
});

describe('the states that are easy to fake and expensive to get wrong', () => {
  it('says the coach is composing, in a way a screen reader can hear', () => {
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} busy onSend={jest.fn()} />);
    expect(byLabel(r, tg('coach.thinking'))).toBeDefined();
  });

  it('says nothing about composing when it is not', () => {
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />);
    expect(r.root.findAll((n) => n.props?.accessibilityLabel === tg('coach.thinking')).length).toBe(0);
  });

  it('shows a message that has not landed differently from one that has', () => {
    const pending: CoachTurn[] = [...turns, { id: '4', by: 'athlete', text: 'Sent but unanswered', pending: true }];
    const r = draw(<CoachChat invitation="AN INVITATION" turns={pending} onSend={jest.fn()} />);
    // The distinction has to be visible, not just present in the data — a pending message that
    // looks delivered is why people send the same thing twice.
    const bubbles = r.root.findAll((n) => Array.isArray(n.props?.style) && n.props.style.length >= 2);
    expect(bubbles.length).toBeGreaterThan(0);
    expect(textOf(r)).toContain('Sent but unanswered');
  });

  it('says a failed message failed, ON the message', () => {
    // Not a toast: a toast has already faded by the time she looks, and the thing she needs to know
    // about is a specific message, not the session.
    const failed: CoachTurn[] = [...turns, { id: '4', by: 'athlete', text: 'This never arrived', failed: true }];
    const read = textOf(draw(<CoachChat invitation="AN INVITATION" turns={failed} onSend={jest.fn()} />));
    expect(read).toContain('This never arrived');
    expect(read.toUpperCase()).toContain(tg('coach.notSent').toUpperCase());
  });

  it('says nothing about failure on an ordinary message', () => {
    const read = textOf(draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />)).toUpperCase();
    expect(read).not.toContain(tg('coach.notSent').toUpperCase());
  });
});

describe('the keyboard is part of the screen', () => {
  it('asks for the dark keyboard — a light one is the brightest thing in the product', () => {
    const r = draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />);
    expect(byLabel(r, tg('coach.placeholder')).props.keyboardAppearance).toBe('dark');
  });

  it('lets Return make a newline instead of sending', () => {
    // On a multiline field, a Return that sends costs her the paragraph she was halfway through.
    const input = byLabel(draw(<CoachChat invitation="AN INVITATION" turns={turns} onSend={jest.fn()} />), tg('coach.placeholder'));
    expect(input.props.multiline).toBe(true);
    expect(input.props.blurOnSubmit).toBe(false);
  });
});
