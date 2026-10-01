/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE BUILD LINKS WHAT THE APP ASKS FOR — founder, 2026-09-27: *"הקול באימון עדיין לא עובד. לא
 * האפשרות לשמוע ולא האפשרות לדבר."*
 *
 * Every voice report since 2026-09-09 had one cause, and no test, linter or build step could see
 * it. `expo-speech-recognition@57` (the SDK 57 line) declares `s.platforms = { :ios => '16.4' }`;
 * this app builds for iOS 15.1. Expo's autolinker compares the two and SKIPS a pod whose floor is
 * higher — with one line printed only in verbose mode. The build succeeds, the binary simply has no
 * `ExpoSpeechRecognition`, `requireOptionalNativeModule` answers null, and the voice gate reads
 * "no engine" — so the coach neither listened nor spoke in builds 69–74. The EAS logs of 73 and 74
 * prove it: `HushVoiceAudio` and `ExpoSpeech` installed, `ExpoSpeechRecognition` absent.
 *
 * `expo-apple-authentication@57` was skipped the same way, so Sign in with Apple ran on the local
 * stub in every build. Both are now on their SDK 54 lines (3.1.x and 8.0.x).
 *
 * What this law holds:
 *   1. Every Expo module the app depends on (and every local module) declares an iOS floor no
 *      higher than the app's — the exact comparison the autolinker makes.
 *   2. Every native module the JS asks for by name is declared by one of those packages — a name
 *      nothing links is a seam that is silently absent in every build.
 *   3. The app's floor is the SDK's own, so an SDK upgrade that moves it moves this law too.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** SDK 54's Podfile default (`ios.deploymentTarget` absent) — the `-target arm64-apple-ios15.1` of build 74. */
const SDK_DEFAULT_FLOOR = '15.1';

function appFloor(): string {
  const plugins: unknown[] = JSON.parse(read('app.json')).expo.plugins ?? [];
  for (const p of plugins) {
    if (Array.isArray(p) && p[0] === 'expo-build-properties') {
      const target = (p[1] as { ios?: { deploymentTarget?: string } } | undefined)?.ios?.deploymentTarget;
      if (target) return target;
    }
  }
  return SDK_DEFAULT_FLOOR;
}

const cmp = (a: string, b: string): number => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/** Every file under `dir` with the extension, never descending into a nested node_modules. */
function filesUnder(dir: string, ext: string, depth = 4): string[] {
  if (depth < 0 || !fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(p, ext, depth - 1));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

/** The iOS floor a podspec declares, in any of the three spellings the linked pods use. */
function podFloor(spec: string): string | null {
  const m =
    spec.match(/:ios\s*=>\s*['"]([\d.]+)['"]/) ??
    spec.match(/\.platform\s*=\s*:ios\s*,\s*['"]([\d.]+)['"]/) ??
    spec.match(/ios\.deployment_target\s*=\s*['"]([\d.]+)['"]/);
  return m ? m[1] : null;
}

interface LinkedPackage {
  name: string;
  floor: string | null;
  /** The native module names its Swift declares (`Name("…")`). */
  modules: string[];
}

/** The Expo modules on iOS: the dependencies that carry an expo-module.config.json, and ./modules/*. */
function expoPackages(): LinkedPackage[] {
  const deps = Object.keys(JSON.parse(read('package.json')).dependencies ?? {});
  const dirs: [string, string][] = deps.map((d) => [d, path.join(ROOT, 'node_modules', d)]);
  for (const m of fs.readdirSync(path.join(ROOT, 'modules'))) dirs.push([m, path.join(ROOT, 'modules', m)]);
  const out: LinkedPackage[] = [];
  for (const [name, dir] of dirs) {
    const cfgPath = path.join(dir, 'expo-module.config.json');
    if (!fs.existsSync(cfgPath)) continue;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { platforms?: string[] };
    if (!(cfg.platforms ?? []).some((p) => p === 'ios' || p === 'apple')) continue;
    const specs = filesUnder(dir, '.podspec');
    if (specs.length === 0) continue;
    const floors = specs.map((s) => podFloor(fs.readFileSync(s, 'utf8')));
    const modules = filesUnder(dir, '.swift').flatMap((f) =>
      [...fs.readFileSync(f, 'utf8').matchAll(/\bName\(\s*"([A-Za-z0-9_]+)"\s*\)/g)].map((m) => m[1]),
    );
    out.push({ name, floor: floors.find((f) => f != null) ?? null, modules });
  }
  return out;
}

/** Every `requireOptionalNativeModule('Name')` in the app's source. */
function askedFor(): string[] {
  const names = new Set<string>();
  for (const f of [...filesUnder(path.join(ROOT, 'src'), '.ts', 8), ...filesUnder(path.join(ROOT, 'src'), '.tsx', 8)]) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/requireOptionalNativeModule(?:<[^>]*>)?\??\.?\(\s*'([A-Za-z0-9_]+)'/g)) {
      names.add(m[1]);
    }
  }
  return [...names].sort();
}

describe('1 · no Expo module asks for a newer iOS than the app builds for', () => {
  const pkgs = expoPackages();

  it('the survey found the modules this file was written against', () => {
    const names = pkgs.map((p) => p.name);
    for (const n of ['expo-speech', 'expo-speech-recognition', 'expo-apple-authentication', 'hush-voice-audio']) {
      expect(names).toContain(n);
    }
  });

  it('every podspec states its floor in a spelling this law can read', () => {
    expect(pkgs.filter((p) => p.floor == null).map((p) => p.name)).toEqual([]);
  });

  it('…and none is above the app’s floor — the autolinker would skip it without a word', () => {
    const floor = appFloor();
    const skipped = pkgs
      .filter((p) => p.floor != null && cmp(p.floor, floor) > 0)
      .map((p) => `${p.name} wants iOS ${p.floor}, the app builds for ${floor}`);
    expect(skipped).toEqual([]);
  });
});

describe('2 · every native module the JS asks for is one a linked package declares', () => {
  it('the voice seam, the sign-in seam and the rest are all declared', () => {
    const declared = new Set(expoPackages().flatMap((p) => p.modules));
    const asked = askedFor();
    for (const n of ['ExpoSpeechRecognition', 'HushVoiceAudio', 'ExpoAppleAuthentication']) expect(asked).toContain(n);
    expect(asked.filter((n) => !declared.has(n))).toEqual([]);
  });
});

describe('3 · the app’s floor is the SDK’s own', () => {
  it('ExpoModulesCore declares the default this law assumes (an SDK bump must revisit it)', () => {
    const core = podFloor(read('node_modules/expo-modules-core/ExpoModulesCore.podspec'));
    expect(core).toBe(SDK_DEFAULT_FLOOR);
  });
});
