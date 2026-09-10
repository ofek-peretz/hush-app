/**
 * A band is not her body (2026-09-10, the band family).
 *
 * A load-less row always printed the bodyweight word, because a null load only ever meant one thing.
 * The band family is load-less too — an elastic strip has no kilograms on it — and a row that tells
 * her the resistance is her body while the card says "Band Curl" is the wrong word in the one cell
 * she reads to know what to pick up. The cell asks the lift, not the load.
 */

//

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { FigureCells, type PlanLift } from '@/components/PlanLifts';
import { initI18n } from '@/i18n';

beforeAll(async () => {
  await initI18n();
});

function flat(c: unknown): string {
  if (Array.isArray(c)) return c.map(flat).join('');
  return typeof c === 'string' || typeof c === 'number' ? String(c) : '';
}

function said(tree: ReactTestRenderer): string {
  return tree.root.findAllByType(Text).map((n) => flat(n.props.children)).join(' | ');
}

const row = (exerciseId: string): PlanLift => ({ exerciseId, name: exerciseId, load: null, sets: 3, band: [8, 12] });

it('⛔ a load-less BAND lift says the band word, never the body word', () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<FigureCells lift={row('band_curl')} units="kg" bodyweightWord="BODY" bandWord="BAND" />);
  });
  expect(said(tree)).toContain('BAND');
  expect(said(tree)).not.toContain('BODY');
  act(() => tree.unmount());
});

it('…and a bodyweight lift, and an assist machine, still say the body word', () => {
  for (const id of ['push_up', 'assisted_pull_up']) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FigureCells lift={row(id)} units="kg" bodyweightWord="BODY" bandWord="BAND" />);
    });
    expect({ id, said: said(tree).includes('BODY') }).toEqual({ id, said: true });
    act(() => tree.unmount());
  }
});

it('a caller that never passed a band word keeps its old cell — no row goes blank', () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<FigureCells lift={row('band_curl')} units="kg" bodyweightWord="BODY" />);
  });
  expect(said(tree)).toContain('BODY');
  act(() => tree.unmount());
});
