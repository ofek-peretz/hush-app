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
  /*
   * ⚠️ NO PERMISSION PROMPT OF OUR OWN, and this is deliberate. On iOS the system picker runs out
   * of process and returns only what she chose, so asking for library access first would be a
   * dialog that buys nothing and costs the one thing onboarding cannot spare.
   */
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    // One at a time: each is a real cost, and a screen that lets her attach nine by accident is a
    // screen that spends nine times as much without ever saying so.
    allowsMultipleSelection: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  return shrink(picked.assets[0].uri);
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
