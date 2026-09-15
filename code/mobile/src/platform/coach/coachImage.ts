/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A PICTURE, ON ITS WAY TO THE COACH.
 *
 * Founder, 2026-08-02: *"build the option for an image, so the AI knows how to analyse it if a user
 * sends one."*
 *
 * Two jobs, and the second one is the one that matters: pick it, then make it SMALL. A phone
 * photograph is three to six megabytes, base64 adds a third, and an image is billed as tokens like
 * everything else — so a screen that sent what the camera produced would be the most expensive
 * thing in the product by an order of magnitude, for no gain at all. A programme written on paper
 * is legible at 1024px; so is the plate stack on a machine.
 *
 * ⚠️ The Worker enforces its own ceiling as well, and that is not redundancy. This file runs inside
 * the app, which is the part an attacker controls — a client that skipped its resize would be able
 * to spend whatever a phone can encode. Belt here, braces there.
 *
 * Platform-facing on purpose: the picker and the resizer are native, so they live behind this seam
 * and everything above it deals in `{ mime, data }`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

// 

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Ready to send: base64, and what it was encoded as. */
export interface CoachImage {
  mime: string;
  data: string;
  /** A local uri, for drawing the thumbnail she is about to send. Never leaves the device. */
  uri: string;
}

/**
 * The long edge we resize to.
 *
 * 1024 is what the model's own guidance treats as a full-detail tile, and it is comfortably enough
 * to read a handwritten programme — verified: a photographed sheet at this size was read back
 * line by line, including a note in the margin nobody had typed.
 */
const LONG_EDGE = 1024;
export const MAX_IMAGES_PER_TURN = 3;

/**
 * Ask for one from her library, resized and encoded.
 *
 * `null` when she backed out, which is not an error and must not be reported as one.
 */
export async function pickCoachImage(): Promise<CoachImage | null> {
  const many = await pickCoachImages();
  return many?.[0] ?? null;
}

/**
 * Ask for up to `MAX_IMAGES_PER_TURN` from her library, resized and encoded, in the order she
 * picked them.
 *
 * `null` when she backed out, which is not an error and must not be reported as one. An EMPTY
 * array is impossible: the picker cannot return zero assets without also reporting `canceled`.
 *
 * ⛔ IT USED TO BE ONE, AND THE LIMIT WAS IN THE WRONG PLACE (founder 2026-08-29: *"שמתי לב שאפשר
 * לשלוח רק תמונה אחת בשביל לייבא"*).
 *
 * The argument for `allowsMultipleSelection: false` was cost — *"a screen that lets her attach nine
 * by accident spends nine times as much without ever saying so"* — and it is a real argument
 * answered in the wrong layer. `MAX_IMAGES_PER_TURN` has been 3 in this same file since it was
 * written, and `runImport` has always taken an ARRAY and sent it in one turn. So the cost was
 * already bounded, and what `false` actually bought was this: **a programme that runs over two
 * pages could not be imported at all.** A four-day week photographed from a coach's sheet, a
 * screenshot of a chat that scrolled — she picked one, and the read returned half her week and
 * reported it as the whole of it, which is worse than refusing.
 *
 * ⚠️ THE BOUND IS `selectionLimit`, WHICH THE SYSTEM PICKER ENFORCES ITSELF — she cannot pick a
 * fourth. One turn, at most three pages, and the spend is stated where it is decided.
 */
export async function pickCoachImages(): Promise<CoachImage[] | null> {
  /*
   * ⚠️ NO PERMISSION PROMPT OF OUR OWN, and this is deliberate. On iOS the system picker runs out
   * of process and returns only what she chose, so asking for library access first would be a
   * dialog that buys nothing and costs the one thing onboarding cannot spare.
   */
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: MAX_IMAGES_PER_TURN,
    orderedSelection: true,
  });
  if (picked.canceled || !picked.assets?.length) return null;
  /*
   * ⚠️ SEQUENTIALLY, NOT `Promise.all`. Each `shrink` decodes a full-resolution photograph into
   * memory; three at once on an older phone is the kind of spike that gets the app killed rather
   * than the kind that gets it a stack trace.
   */
  const out: CoachImage[] = [];
  for (const asset of picked.assets.slice(0, MAX_IMAGES_PER_TURN)) out.push(await shrink(asset.uri));
  return out;
}

/*
 * ⚠️ THERE IS DELIBERATELY NO CAMERA PATH YET, and it is one function away.
 *
 * Photographing a machine mid-session is a real case and a camera control would serve it. It is not
 * here because the composer would then need a chooser, this app uses no system action sheets
 * anywhere, and inventing one for a first cut is how a spare screen stops being spare. The common
 * case — a programme from a previous coach, a screenshot, something already photographed — is in
 * her library.
 *
 * Adding it is `launchCameraAsync` plus `requestCameraPermissionsAsync` and a second control. It is
 * NOT written until something reaches it: a function no control can call is the exact class of
 * defect this codebase keeps finding.
 */

/**
 * Down to `LONG_EDGE` and into JPEG.
 *
 * JPEG whatever it arrived as: a screenshot of a programme is commonly PNG, which is several times
 * the bytes for a photograph of text and buys nothing a model can use. HEIC has to be converted
 * regardless — it is what an iPhone produces and not something the API accepts.
 */
async function shrink(uri: string): Promise<CoachImage> {
  const context = ImageManipulator.manipulate(uri).resize({ width: LONG_EDGE });
  const image = await context.renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  return { mime: 'image/jpeg', data: out.base64 ?? '', uri: out.uri };
}
