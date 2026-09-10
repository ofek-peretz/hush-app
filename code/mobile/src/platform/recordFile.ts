/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HER RECORD, AS A FILE — the one native seam the backup needs.
 *
 * Same shape as `platform/share` and `platform/liveActivity`: a real host when the native modules
 * are present, a clean `unavailable` everywhere else (jest, web, a build without them). Nothing here
 * decides anything — `domain/record` owns what a record IS, what may be read back, and whether a
 * restore is allowed. This writes bytes and opens sheets.
 *
 * ── ⚠️ WHY A FILE AND NOT A SERVER (2026-08-22; final form 2026-08-25) ──────────────────────────
 * When this was written a v4-era backend still nominally existed, and the argument was that its
 * contract (blocks and sets) would lose everything she DECLARED — a body map, a leave-it, a rest
 * window, a substitution. The argument has since become simpler: that backend's client code is
 * deleted from this repo outright (founder: "we're on v8"), so there is no server to restore from,
 * only this file and iCloud (`platform/cloud`) carrying the SAME snapshot per Apple ID.
 *
 * A file she owns needs no infrastructure, works on the first build that ships it, and cannot lose
 * the half the server never knew about. When there is a real account service, this module is what it
 * replaces — the shape (`snapshotRecord` → bytes → `readRecord`) does not change.
 *
 * ⚠️ AND IT IS HERS, NOT OURS. It goes to the OS sheet and Hush steps back — the same ruling the
 * share card lives under: *"whoever wants to will save it. We don't need to signal to them."*
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { Platform } from 'react-native';

export type RecordSaveResult = 'saved' | 'unavailable' | 'error';
export type RecordPickResult =
  | { ok: true; text: string }
  | { ok: false; why: 'cancelled' | 'unavailable' | 'error' };

/**
 * Guarded require — the pattern this codebase already uses for every native module it cannot
 * verify off a device. A missing module is a runtime this file degrades on, never a bundle that
 * fails to build.
 */
function optionalRequire<T = unknown>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}

interface FileSystemModule {
  documentDirectory: string | null;
  cacheDirectory: string | null;
  writeAsStringAsync(uri: string, contents: string, options?: unknown): Promise<void>;
  readAsStringAsync(uri: string, options?: unknown): Promise<string>;
}
interface SharingModule {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options?: Record<string, unknown>): Promise<void>;
}
interface DocumentPickerModule {
  getDocumentAsync(options?: Record<string, unknown>): Promise<{
    canceled?: boolean;
    type?: string;
    assets?: { uri: string }[] | null;
    uri?: string;
  }>;
}

const fileSystem = optionalRequire<FileSystemModule>(() => require('expo-file-system'));
const sharing = optionalRequire<SharingModule>(() => require('expo-sharing'));
const picker = optionalRequire<DocumentPickerModule>(() => require('expo-document-picker'));

export interface RecordFileHost {
  /** Whether saving and reading a copy is possible on this runtime. */
  available(): boolean;
  /** Write `json` to a temporary file called `name` and hand it to the OS sheet. */
  save(name: string, json: string): Promise<RecordSaveResult>;
  /** Ask her for a file and return its text. */
  pick(): Promise<RecordPickResult>;
}

export const recordFileStub: RecordFileHost = {
  available: () => false,
  async save() {
    return 'unavailable';
  },
  async pick() {
    return { ok: false, why: 'unavailable' };
  },
};

const recordFileNative: RecordFileHost = {
  available: () => Platform.OS !== 'web' && !!fileSystem && !!sharing && !!picker,

  async save(name, json) {
    if (!fileSystem || !sharing) return 'unavailable';
    try {
      /*
       * ⚠️ THE CACHE, NOT THE DOCUMENT DIRECTORY. The copy she keeps is the one the OS sheet puts
       * wherever she chose — Files, Drive, a message to herself. What we write is a hand-off, and a
       * hand-off that accumulated in the app's own documents forever would be a second, invisible
       * copy of her whole record growing on the device the backup exists to stop trusting.
       */
      const dir = fileSystem.cacheDirectory ?? fileSystem.documentDirectory;
      if (!dir) return 'unavailable';
      const uri = `${dir}${name}`;
      await fileSystem.writeAsStringAsync(uri, json);
      if (!(await sharing.isAvailableAsync())) return 'unavailable';
      await sharing.shareAsync(uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: name,
      });
      return 'saved';
    } catch {
      // A write or sheet failure is never fatal — she stays on the screen with nothing changed.
      return 'error';
    }
  },

  async pick() {
    if (!fileSystem || !picker) return { ok: false, why: 'unavailable' };
    try {
      /*
       * ⚠️ `type: '*&#47;*'` RATHER THAN `application/json`. iOS decides a file's UTI from how it was
       * created, and a record saved to Drive and re-downloaded frequently comes back as
       * `public.data` or `public.plain-text` — a filter would show her a picker in which her own
       * backup is greyed out. `readRecord` is the real gate, and it is a better one: it reads the
       * bytes rather than trusting a label.
       */
      const res = await picker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || res.type === 'cancel') return { ok: false, why: 'cancelled' };
      const uri = res.assets?.[0]?.uri ?? res.uri;
      if (!uri) return { ok: false, why: 'cancelled' };
      return { ok: true, text: await fileSystem.readAsStringAsync(uri) };
    } catch {
      return { ok: false, why: 'error' };
    }
  },
};

/**
 * The active host. Native when the modules resolved, the stub otherwise — so jest, web and any
 * build without them get a surface that reports `unavailable` instead of throwing.
 */
export const recordFile: RecordFileHost = fileSystem && sharing && picker ? recordFileNative : recordFileStub;
