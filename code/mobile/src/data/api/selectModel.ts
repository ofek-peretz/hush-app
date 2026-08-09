/**
 * Model selection. Use the real backend when it is BOTH configured (base URL)
 * AND enrolled (a token exists); otherwise fall back to the local fixture so the
 * app always runs. This is the single swap point referenced by the app store.
 *
 * NOTE: even when selected, the HTTP client cannot yet fulfill portraitSnapshot
 * (B2) or the program day-list (B1) — see the connect-backend blockers. Until
 * those backend surfaces exist, leaving the fixture active keeps the app whole.
 */
// @ts-nocheck

// 

import type { ModelClient } from './modelClient';
import { fixtureModel } from './fixtureModel';
import { HttpModelClient } from './httpClient';
import { getBaseUrl, getToken } from './config';

let cached: ModelClient | null = null;

export async function selectModel(): Promise<ModelClient> {
  if (cached) return cached;
  const configured = getBaseUrl().length > 0;
  const token = await getToken();
  cached = configured && token ? new HttpModelClient() : fixtureModel;
  return cached;
}

/** Reset the cached selection (e.g. after enrollment delivers a token, or sign-out). */
export function resetModelSelection(): void {
  cached = null;
}
