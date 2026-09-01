/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ACCOUNT IS HER APPLE ID — founder, 2026-08-23: *"קח את כל המוצר שלי לרמת הקצה."*
 *
 * The gap between "very good app" and "a paid product" was the account: a subscription whose data
 * lives on one phone is not a subscription. The decision, in writing (`platform/cloud`): no
 * server. iCloud is the account — the record rides her Apple ID into the ubiquity container after
 * every workout, a fresh install on any of her devices finds it and silently puts it back, and
 * the trial ledger's cloud half makes the fourteen per-PERSON instead of per-device. No sign-in
 * screen exists, which is the whole point: the athlete's experience of "her account" is that
 * there is nothing to do.
 *
 * What this law holds:
 *   1. The seam degrades cleanly off-device — jest/web/Android run on the stub, never a throw.
 *   2. The silent restore lands ONLY on an EMPTY phone — a phone with any history keeps the
 *      manual, confirmed restore in You. Silently merging two lives is how records get eaten.
 *   3. Every completion reaches the cloud — strength (the phone's and the watch's, both through
 *      `recordSessionCompleted`) and cardio alike.
 *   4. The backup is never load-bearing: fire-and-forget, throttled, and a failure costs the
 *      backup and nothing else.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';
import { cloudStub } from '@/platform/cloud';
import { trialUsed } from '@/domain/trialLedger';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('1 · the seam degrades cleanly off-device', () => {
  it('the stub answers honestly and never throws', async () => {
    expect(cloudStub.available()).toBe(false);
    expect(await cloudStub.backup('{}')).toBe(false);
    expect(await cloudStub.readBackup()).toBeNull();
    expect(cloudStub.ledgerGet()).toBeNull();
    expect(() => cloudStub.ledgerSet(7)).not.toThrow();
  });

  it('…and this jest runtime IS the stub (no native module here)', async () => {
    const { cloud } = require('@/platform/cloud');
    expect(cloud.available()).toBe(false);
  });
});

describe('2 · the silent restore lands only on an empty phone', () => {
  const boot = () => {
    const app = read('src/state/stores/appStore.tsx');
    const at = app.indexOf('THE ACCOUNT IS HER APPLE ID');
    expect(at).toBeGreaterThan(-1);
    return app.slice(at, at + 2600);
  };

  it('the gate is BOTH empties — no profile AND no history — and the verdict is asked', () => {
    expect(boot()).toContain('if (!bare && hist.length === 0)');
    expect(boot()).toContain("restoreVerdict(read.record, 0).do === 'restore'");
  });

  it('a cloud read is validated through domain/record, never trusted raw', () => {
    expect(boot()).toContain('readAthleteRecord(JSON.parse(raw))');
    expect(boot()).toContain('read.ok');
  });

  it('…and a failure costs the restore, never the boot', () => {
    expect(boot()).toMatch(/} catch \{\s*\n\s*\/\* a failed cloud read costs the restore, never the boot/);
  });
});

describe('3 · every completion reaches the cloud', () => {
  it('strength — the one crediting path both the phone and the watch pass through', () => {
    const app = read('src/state/stores/appStore.tsx');
    const at = app.indexOf('async recordSessionCompleted()');
    expect(at).toBeGreaterThan(-1);
    expect(app.slice(at, app.indexOf('},', at))).toContain('void cloudAutoBackup()');
  });

  it('cardio — the saved run is a record change too', () => {
    expect(read('src/screens/cardio/Cardio.tsx')).toContain('.then(() => cloudAutoBackup())');
  });
});

describe('4 · the backup is never load-bearing', () => {
  it('throttled, and a second call inside the window does no work', async () => {
    jest.isolateModules(() => {
      jest.doMock('@/platform/cloud', () => ({
        cloud: { available: () => true, backup: jest.fn(async () => true), readBackup: async () => null, ledgerGet: () => null, ledgerSet: () => {} },
      }));
      jest.doMock('@/data/local/db', () => ({ db: { snapshotRecord: jest.fn(async () => ({ v: 1 })) } }));
      const { cloudAutoBackup, resetCloudBackupThrottle } = require('@/platform/cloudBackup');
      const { db } = require('@/data/local/db');
      return (async () => {
        resetCloudBackupThrottle();
        expect(await cloudAutoBackup(1_000_000)).toBe(true);
        expect(await cloudAutoBackup(1_030_000)).toBe(false); // 30 s later — inside the window
        expect(await cloudAutoBackup(1_070_000)).toBe(true); // 70 s later — a new window
        expect(db.snapshotRecord).toHaveBeenCalledTimes(2);
      })();
    });
  });

  it('a serialise/write failure returns false rather than throwing', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@/platform/cloud', () => ({
        cloud: { available: () => true, backup: async () => true, readBackup: async () => null, ledgerGet: () => null, ledgerSet: () => {} },
      }));
      jest.doMock('@/data/local/db', () => ({ db: { snapshotRecord: async () => { throw new Error('disk'); } } }));
      const { cloudAutoBackup, resetCloudBackupThrottle } = require('@/platform/cloudBackup');
      resetCloudBackupThrottle();
      await expect(cloudAutoBackup(2_000_000)).resolves.toBe(false);
    });
  });
});

describe('the trial ledger rides the same Apple ID', () => {
  it('three sources, the highest always wins', () => {
    expect(trialUsed(3, 5, 14)).toBe(14); // new device: cloud alone remembers
    expect(trialUsed(14, 0, null)).toBe(14); // reinstall: Keychain remembers, cloud unreadable
    expect(trialUsed(null, 9, undefined)).toBe(9); // neither cloud nor Keychain — local stands
  });

  it('the persist writes the cloud half, monotonic, beside the Keychain', () => {
    const app = read('src/state/stores/appStore.tsx');
    expect(app).toContain('cloud.ledgerSet(nextLedger(cloud.ledgerGet(), m.completedSessions))');
    expect(app).toContain('trialUsed(ledger, mode.completedSessions, cloud.ledgerGet())');
  });
});

describe('the build carries the capability — or says exactly why it does not yet', () => {
  /*
   * ⛔ PARKED FOR BUILD 58 (2026-08-23). The entitlements were declared and Xcode refused to
   * sign: an iCloud CONTAINER and an App GROUP are account-level objects that must exist on the
   * Apple Developer App IDs first, and creating them needs an interactive Apple session. Two
   * CRITICAL fixes were waiting behind them, so the capability was parked and the fixes shipped.
   *
   * This law now holds the pair: EITHER the entitlements are declared, OR the pending document
   * is present and states how to restore them. A silent removal fails, which is the whole point —
   * a parked capability that nobody writes down is a feature quietly deleted.
   */
  const ICLOUD_KEYS = [
    'com.apple.developer.icloud-container-identifiers',
    'com.apple.developer.icloud-services',
    'com.apple.developer.ubiquity-container-identifiers',
    'com.apple.developer.ubiquity-kvstore-identifier',
  ];

  it('app.json declares the container and the KV store — or IOS_CAPABILITIES_PENDING.md explains', () => {
    const ent = JSON.parse(read('app.json')).expo.ios.entitlements;
    const declared = ICLOUD_KEYS.every((k) => ent[k] != null);
    if (declared) {
      expect(ent['com.apple.developer.icloud-container-identifiers']).toEqual(['iCloud.com.hushfitness.app']);
      expect(ent['com.apple.developer.icloud-services']).toEqual(['CloudDocuments']);
      expect(ent['com.apple.developer.ubiquity-container-identifiers']).toEqual(['iCloud.com.hushfitness.app']);
      expect(ent['com.apple.developer.ubiquity-kvstore-identifier']).toBe('$(TeamIdentifierPrefix)$(CFBundleIdentifier)');
      return;
    }
    const pending = read('IOS_CAPABILITIES_PENDING.md');
    expect(pending).toContain('iCloud.com.hushfitness.app');
    expect(pending).toContain('com.apple.developer.ubiquity-kvstore-identifier');
    expect(pending).toContain('developer.apple.com');
  });

  it('the native pipe stays dumb — and knows a missing file may merely be undownloaded', () => {
    const swift = read('modules/hush-cloud/ios/HushCloudModule.swift');
    expect(swift).toContain('ubiquityIdentityToken');
    expect(swift).toContain('startDownloadingUbiquitousItem');
    expect(swift).toContain('NSUbiquitousKeyValueStore');
    // No record semantics in Swift — the pipe carries strings, the domain owns meaning.
    expect(swift).not.toContain('sessions');
    expect(swift).not.toContain('restoreVerdict');
  });
});
