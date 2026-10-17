/**
 * ════ WHICH CAMPAIGN BROUGHT HER (2026-09-16, the growth playbook §02) ════
 *
 * Paid growth is only worth a shekel if it can say what the shekel bought. Apple Search Ads answers
 * that without asking the athlete for tracking permission: `modules/hush-ad-attribution` hands out
 * Apple's opaque AdServices token, this posts it to Apple, and Apple replies with the campaign ids.
 * The answer rides the ordinary telemetry pipe as ONE event per install.
 *
 * The rules:
 *   · ONCE PER INSTALL — `trackFirst` marks it; a resolved answer is never asked for again.
 *   · Apple's own retry contract: a 404 means the record is not ready yet — wait 5 s, three tries.
 *     Anything else unexpected ends the attempt for this launch; the next cold launch tries again
 *     until an answer lands (the token itself is valid for 24 hours and is re-fetched every time).
 *   · Ids and flags only — the fields below, scalars, nothing about her.
 *   · Silent. Attribution failing must never touch the product.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { db } from '@/data/local/db';
import { trackFirst } from '@/platform/telemetry';
import { LIFECYCLE_EVENTS } from '@/platform/events';

interface AdAttributionModule {
  attributionToken(): Promise<string | null>;
}

const native: AdAttributionModule | null =
  Platform.OS === 'ios' ? requireOptionalNativeModule<AdAttributionModule>('HushAdAttribution') : null;

export const AD_SERVICES_ENDPOINT = 'https://api-adservices.apple.com/api/v1/';

/** Exactly what Apple's answer may contribute to the event. */
export const ATTRIBUTION_FIELDS = [
  'attribution',
  'orgId',
  'campaignId',
  'adGroupId',
  'keywordId',
  'adId',
  'conversionType',
  'claimType',
  'countryOrRegion',
] as const;

interface Seams {
  token?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}

export async function resolveAdAttribution(seams: Seams = {}): Promise<void> {
  try {
    if (await db.hasFirst(LIFECYCLE_EVENTS.adAttribution)) return;
    const getToken = seams.token ?? (native ? () => native.attributionToken() : null);
    if (!getToken) return;
    const token = await getToken();
    if (!token) return;
    const post = seams.fetchImpl ?? fetch;
    const wait = seams.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await post(AD_SERVICES_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: token,
      });
      if (res.status === 404) {
        await wait(5000);
        continue;
      }
      if (!res.ok) return;
      const answer = (await res.json()) as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      for (const k of ATTRIBUTION_FIELDS) {
        const v = answer[k];
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') data[k] = v;
      }
      await trackFirst(LIFECYCLE_EVENTS.adAttribution, data);
      return;
    }
  } catch {
    /* attribution is best-effort; the product never waits on it */
  }
}
