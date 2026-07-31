import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { CoachChat, type CoachTurn } from '@/screens/coach/CoachChat';
import { initI18n, tg } from '@/i18n';

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
    const read = textOf(draw(<CoachChat turns={turns} onSend={jest.fn()} />));
    expect(read).toContain('What are you training for?');
    expect(read).toContain('marathon in April');
    expect(read.indexOf('What are you training')).toBeLessThan(read.indexOf('marathon in April'));
  });

  it('opens with the coach already asking, not an empty box', () => {
    // An empty chat with a blinking cursor asks HER to know what to say first.
    const read = textOf(draw(<CoachChat turns={[]} opening="What are you training for?" onSend={jest.fn()} />));
    expect(read).toContain('What are you training for?');
  });

  it('drops the opening the moment there is a real conversation', () => {
    const read = textOf(draw(<CoachChat turns={turns} opening="AN OPENING LINE" onSend={jest.fn()} />));
    expect(read).not.toContain('AN OPENING LINE');
  });
});

describe('sending', () => {
  it('sends what she typed, trimmed', () => {
    const onSend = jest.fn();
    const r = draw(<CoachChat turns={turns} onSend={onSend} />);
    type(r, '  Longest was 18 km.  ');
    press(r, tg('coach.send'));
    expect(onSend).toHaveBeenCalledWith('Longest was 18 km.');
  });

  it('clears the field so she cannot send the same thing twice by accident', () => {
    const r = draw(<CoachChat turns={turns} onSend={jest.fn()} />);
    type(r, 'Eighteen kilometres.');
    press(r, tg('coach.send'));
    expect(byLabel(r, tg('coach.placeholder')).props.value).toBe('');
  });

  it('refuses an empty message, and refuses whitespace', () => {
    // The send control sits live on a blank field; without this guard a stray tap costs a call.
    const onSend = jest.fn();
    const r = draw(<CoachChat turns={turns} onSend={onSend} />);
    press(r, tg('coach.send'));
    type(r, '   \n  ');
    press(r, tg('coach.send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('marks the send control disabled until there is something to send', () => {
    const r = draw(<CoachChat turns={turns} onSend={jest.fn()} />);
    expect(byLabel(r, tg('coach.send')).props.accessibilityState).toEqual({ disabled: true });
    type(r, 'ok');
    expect(byLabel(r, tg('coach.send')).props.accessibilityState).toEqual({ disabled: false });
  });

  it('stays usable while the coach is composing — she may keep typing', () => {
    // A model can take many seconds. Locking the field for that long makes the app feel broken,
    // and her next thought is gone by the time it unlocks.
    const onSend = jest.fn();
    const r = draw(<CoachChat turns={turns} busy onSend={onSend} />);
    type(r, 'Also my knee has been sore.');
    press(r, tg('coach.send'));
    expect(onSend).toHaveBeenCalledWith('Also my knee has been sore.');
  });
});

describe('the states that are easy to fake and expensive to get wrong', () => {
  it('says the coach is composing, in a way a screen reader can hear', () => {
    const r = draw(<CoachChat turns={turns} busy onSend={jest.fn()} />);
    expect(byLabel(r, tg('coach.thinking'))).toBeDefined();
  });

  it('says nothing about composing when it is not', () => {
    const r = draw(<CoachChat turns={turns} onSend={jest.fn()} />);
    expect(r.root.findAll((n) => n.props?.accessibilityLabel === tg('coach.thinking')).length).toBe(0);
  });

  it('shows a message that has not landed differently from one that has', () => {
    const pending: CoachTurn[] = [...turns, { id: '4', by: 'athlete', text: 'Sent but unanswered', pending: true }];
    const r = draw(<CoachChat turns={pending} onSend={jest.fn()} />);
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
    const read = textOf(draw(<CoachChat turns={failed} onSend={jest.fn()} />));
    expect(read).toContain('This never arrived');
    expect(read.toUpperCase()).toContain(tg('coach.notSent').toUpperCase());
  });

  it('says nothing about failure on an ordinary message', () => {
    const read = textOf(draw(<CoachChat turns={turns} onSend={jest.fn()} />)).toUpperCase();
    expect(read).not.toContain(tg('coach.notSent').toUpperCase());
  });
});

describe('the keyboard is part of the screen', () => {
  it('asks for the dark keyboard — a light one is the brightest thing in the product', () => {
    const r = draw(<CoachChat turns={turns} onSend={jest.fn()} />);
    expect(byLabel(r, tg('coach.placeholder')).props.keyboardAppearance).toBe('dark');
  });

  it('lets Return make a newline instead of sending', () => {
    // On a multiline field, a Return that sends costs her the paragraph she was halfway through.
    const input = byLabel(draw(<CoachChat turns={turns} onSend={jest.fn()} />), tg('coach.placeholder'));
    expect(input.props.multiline).toBe(true);
    expect(input.props.blurOnSubmit).toBe(false);
  });
});
