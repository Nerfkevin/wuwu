import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Superwall, { IdentityOptions } from '@superwall/react-native-superwall';

export const USER_UUID_KEY = 'app_user_uuid';
export const SUPERWALL_IDENTIFIER_KEY = 'superwallIdentifier';
export const USER_NAME_KEY = 'user_name';

const SUPERWALL_API_KEY_IOS = 'pk_5L3AcVB9DaMbr9E9M79vc';

type PostHogLike = {
  identify: (...args: any[]) => void;
  flush?: () => unknown;
} | null | undefined;

let configurePromise: Promise<void> | null = null;

export async function configureSuperwall(): Promise<void> {
  if (configurePromise) return configurePromise;
  configurePromise = Superwall.configure({ apiKey: SUPERWALL_API_KEY_IOS }).then(
    () => undefined,
  );
  return configurePromise;
}

export async function getOrCreateUserId(): Promise<string> {
  let uuid = await SecureStore.getItemAsync(USER_UUID_KEY);
  if (!uuid) {
    uuid = crypto.randomUUID();
    await SecureStore.setItemAsync(USER_UUID_KEY, uuid);
  }
  return uuid;
}

/** PostHog only — Speaketh `setupUserIdentity`. */
export async function setupUserIdentity(posthog: PostHogLike): Promise<string | null> {
  if (!posthog) return null;
  try {
    const uuid = await getOrCreateUserId();
    const name = ((await SecureStore.getItemAsync(USER_NAME_KEY)) ?? '').trim();
    const setProps: Record<string, string> = { platform: Platform.OS };
    if (name) setProps.name = name;

    posthog.identify(uuid, {
      $set: setProps,
      $set_once: { device_uuid: uuid },
    });
    void posthog.flush?.();
    return uuid;
  } catch (e) {
    console.log('[Identity] PostHog identify error:', e);
    return null;
  }
}

/** Superwall only — Speaketh SuperwallManager. */
export async function identifySuperwallUser(): Promise<string | null> {
  try {
    await configureSuperwall();
    const uuid = await getOrCreateUserId();
    const name = ((await SecureStore.getItemAsync(USER_NAME_KEY)) ?? '').trim();

    await Superwall.shared.identify({
      userId: uuid,
      options: new IdentityOptions(true),
    });
    await SecureStore.setItemAsync(SUPERWALL_IDENTIFIER_KEY, uuid);

    const attributes: Record<string, string> = { platform: Platform.OS };
    if (name) attributes.name = name;
    await Superwall.shared.setUserAttributes(attributes);

    return uuid;
  } catch (e) {
    console.log('[Identity] Superwall identify error:', e);
    return null;
  }
}
