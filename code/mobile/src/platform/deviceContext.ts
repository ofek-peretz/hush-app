/**
 * Device/app context attached to every research event (cohorting, regression
 * attribution, reinstall/device-change detection). Non-PII: a self-generated
 * install id (never the hardware id), app/OS version, locale, network type.
 *
 * `device_id` lives under a key NOT cleared by sign-out/revocation, so it
 * survives a sign-out but resets on REINSTALL — which is exactly how a reinstall
 * or device change is detected (a new install id on an athlete with backend
 * history).
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import Constants from 'expo-constants';
import * as Network from 'expo-network';

const DEVICE_ID_KEY = 'hush.device.id'; // deliberately NOT in db K (survives clearAll)

export interface DeviceContext {
  app_version: string;
  os: string;
  device_id: string;
  locale: string;
  network: string;
}

function uuid(): string {
  // Non-crypto id is fine for event/install ids.
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let deviceId: string | null = null;
let staticCtx: Omit<DeviceContext, 'network'> | null = null;

async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uuid();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  deviceId = id;
  return id;
}

export async function deviceContext(): Promise<DeviceContext> {
  if (!staticCtx) {
    staticCtx = {
      app_version: (Constants.expoConfig?.version as string | undefined) ?? '0.0.0',
      os: `${Platform.OS}:${Platform.Version}`,
      device_id: await getDeviceId(),
      locale: Localization.getLocales()[0]?.languageTag ?? 'en',
    };
  }
  let network = 'unknown';
  try {
    const s = await Network.getNetworkStateAsync();
    network = (s.type as string | undefined) ?? 'unknown';
  } catch {
    /* network unknown */
  }
  return { ...staticCtx, network };
}

/** A fresh event id (idempotent dedupe key for the durable store). */
export function newEventId(): string {
  return uuid();
}
