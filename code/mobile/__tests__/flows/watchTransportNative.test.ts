/**
 * watchTransportNative — degradation safety.
 *
 * With no native WCSession module present (jest / Expo Go / web), the active
 * `watchTransport` must be a safe no-op pipe so the JS WatchSession bridge keeps
 * running (all authority/validation lives in the bridge, exercised separately).
 */
import { watchTransport, watchTransportNative } from '@/platform/watch/watchTransportNative';

describe('watchTransportNative (no native module under test)', () => {
  it('selects a transport with no native module available', () => {
    expect(watchTransportNative).toBeNull();
  });

  it('active transport is a safe no-op pipe', () => {
    expect(watchTransport.isReachable()).toBe(false);
    // sendState never throws even with no transport.
    expect(() =>
      watchTransport.sendState({
        v: 1,
        type: 'session_state',
        mirror: null,
        authoritySeq: 1,
        sentAt: new Date().toISOString(),
      }),
    ).not.toThrow();
    // Subscriptions return an unsubscribe fn and never fire.
    const offIntent = watchTransport.onIntent(() => {
      throw new Error('should never fire');
    });
    const offReach = watchTransport.onReachabilityChange(() => {
      throw new Error('should never fire');
    });
    expect(typeof offIntent).toBe('function');
    expect(typeof offReach).toBe('function');
    offIntent();
    offReach();
  });
});
