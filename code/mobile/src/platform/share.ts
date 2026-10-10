/**
 * Share host (§9.3) — the seam that turns a rendered ShareCard into an image and
 * hands it to the OS share sheet. Same shape as platform/liveActivity: a real
 * native host when the capture + sharing modules are present (a native build), and
 * a no-op stub everywhere else (web / Expo Go without the modules / jest / Windows).
 *
 * WHY THE OS SHEET, not a custom row of app icons: the handoff draws Stories /
 * WhatsApp / Save / More, but those ARE the OS share sheet — the user picks the
 * destination and taps it themselves. Hush never posts on their behalf (founder);
 * it only offers the finished card to the system and steps back. Reimplementing
 * per-app targets would be fragile and would quietly claim to post for them.
 *
 * The two native modules are resolved defensively (guarded require) so this file
 * bundles and TESTS even when they are absent — capture cannot be verified off a
 * device, so every path degrades to a clean "unavailable" rather than throwing.
 */

// 

import { Linking, Platform, Share as RNShare } from 'react-native';
import type { RefObject } from 'react';
import type { View } from 'react-native';

export type ShareResult = 'shared' | 'unavailable' | 'error';

export interface ShareHost {
  /** Whether a real capture-and-share is possible on this runtime. */
  available(): boolean;
  /** Capture the referenced view to a PNG and open the OS share sheet. */
  captureAndShare(ref: RefObject<View | null>, filename: string, dialogTitle?: string): Promise<ShareResult>;
}

/**
 * Require a module without letting an absent one break the bundle or a test run.
 * The caller passes a thunk holding a LITERAL require — Metro resolves dynamic
 * `require(variable)` at bundle time and rejects it, so the string must be static.
 */
function optionalRequire<T = unknown>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}

interface ViewShotModule {
  captureRef(ref: unknown, options?: Record<string, unknown>): Promise<string>;
}
interface SharingModule {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(url: string, options?: Record<string, unknown>): Promise<void>;
}

interface ClipboardModule {
  setImageAsync(base64Image: string): Promise<void>;
}

// Resolved once. On web there is no native capture; elsewhere it depends on the build.
const viewShot = Platform.OS === 'web' ? null : optionalRequire<ViewShotModule>(() => require('react-native-view-shot'));
const sharing = Platform.OS === 'web' ? null : optionalRequire<SharingModule>(() => require('expo-sharing'));
const clipboard = Platform.OS === 'web' ? null : optionalRequire<ClipboardModule>(() => require('expo-clipboard'));

/**
 * ════ ✦ THE CARD AS A STICKER (design audit 2026-09-29; the founder's free hand, 2026-09-30) ════
 *
 * *"A transparent background over a photo from the camera — that is what people actually post."* The
 * card shared through the sheet is a full 9:16 picture: Stories takes it as the background, and her
 * gym selfie is gone. A STICKER is the card with no ground of its own, laid by her over her photo.
 *
 * The honest road to that on iOS needs no partner app id and no private URL scheme: a PNG with an
 * alpha channel on the CLIPBOARD, pasted into the story editor, arrives as a sticker she can move and
 * scale. So this captures the sticker face of the card (`ShareCard sticker`) with its transparency
 * intact and puts it there. Nothing is posted; she pastes it herself (founder: Hush never posts).
 */
export async function copySticker(ref: RefObject<View | null>): Promise<'copied' | 'unavailable' | 'error'> {
  if (!viewShot || !clipboard || !ref.current) return 'unavailable';
  try {
    const base64 = await viewShot.captureRef(ref, { format: 'png', quality: 1, result: 'base64' });
    await clipboard.setImageAsync(base64);
    return 'copied';
  } catch {
    return 'error';
  }
}

export const shareStub: ShareHost = {
  available: () => false,
  async captureAndShare() {
    return 'unavailable';
  },
};

export const shareNative: ShareHost = {
  available: () => !!viewShot && !!sharing,
  async captureAndShare(ref, filename, dialogTitle) {
    if (!viewShot || !sharing || !ref.current) return 'unavailable';
    try {
      if (!(await sharing.isAvailableAsync())) return 'unavailable';
      const uri = await viewShot.captureRef(ref, { format: 'png', quality: 1, fileName: filename });
      await sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
      return 'shared';
    } catch {
      // A capture or sheet failure is never fatal — the athlete simply stays on the card.
      return 'error';
    }
  },
};

/** The single swap point: native when the modules are present, the stub otherwise. */
export const share: ShareHost = viewShot && sharing ? shareNative : shareStub;

/**
 * Hand a piece of TEXT to the OS share sheet (v7 11.4 — a plan link).
 *
 * React Native's own `Share` covers this with no extra module, on both platforms, so it does not
 * ride the `viewShot`/`expo-sharing` swap above — a build without those can still send a link. On
 * web there is no sheet: the caller is told, and says so, rather than appearing to have sent it.
 */
export async function shareText(message: string): Promise<'shared' | 'unavailable' | 'error'> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    const result = await RNShare.share({ message });
    return result.action === RNShare.dismissedAction ? 'error' : 'shared';
  } catch {
    return 'error';
  }
}

/**
 * ⛔ ONE PATTERN FOR "SEND THIS SENTENCE TO A PERSON" (2026-09-18).
 *
 * Straight into WhatsApp with the message ready and no recipient chosen — the person picks the
 * contact in WhatsApp's own UI, so nothing is ever sent on anybody's behalf (the ruling at the top
 * of this file). Falls back to the OS share sheet when nothing on the phone answers `whatsapp:`,
 * and on the web to `wa.me`, which is the only spelling a browser can open.
 *
 * It was the coach invite's private helper; the trainee's "ask my coach to replace this lift"
 * (law 7 leaves her no other channel) is the second caller, and a second copy of a deep link is
 * how two surfaces drift.
 */
export async function shareViaWhatsApp(message: string): Promise<'whatsapp' | 'share' | 'error'> {
  const text = encodeURIComponent(message);
  try {
    await Linking.openURL(Platform.OS === 'web' ? `https://wa.me/?text=${text}` : `whatsapp://send?text=${text}`);
    return 'whatsapp';
  } catch {
    const r = await shareText(message).catch((): 'error' => 'error');
    return r === 'shared' ? 'share' : 'error';
  }
}

