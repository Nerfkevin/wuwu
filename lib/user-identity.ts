import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Superwall, { IdentityOptions } from '@superwall/react-native-superwall';
import type { PostHog } from 'posthog-react-native';
import { createPostHogClient } from './posthog-provider';

export const USER_UUID_KEY = 'app_user_uuid';
export const SUPERWALL_IDENTIFIER_KEY = 'superwallIdentifier';
export const USER_NAME_KEY = 'user_name';

const SUPERWALL_API_KEY_IOS = 'pk_5L3AcVB9DaMbr9E9M79vc';
const SUPERWALL_IDENTIFY_TIMEOUT_MS = 8000;

type PostHogLike = PostHog | null | undefined;

let configurePromise: Promise<void> | null = null;
let superwallIdentifyInFlight: Promise<string | null> | null = null;
let bootstrapPromise: Promise<PostHog> | null = null;
let posthogSingleton: PostHog | null = null;
let cachedUserId: string | null = null;

export function getPostHogClient(): PostHog | null {
  return posthogSingleton;
}

export function getCachedUserId(): string | null {
  return cachedUserId;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function flushPostHog(posthog: PostHogLike): Promise<void> {
  try {
    const flushed = posthog?.flush?.();
    if (flushed && typeof (flushed as Promise<unknown>).then === 'function') {
      await flushed;
    }
  } catch {
    /* */
  }
}

export async function configureSuperwall(): Promise<void> {
  if (configurePromise) return configurePromise;
  configurePromise = Superwall.configure({ apiKey: SUPERWALL_API_KEY_IOS }).then(
    () => undefined,
  );
  return configurePromise;
}

export async function getOrCreateUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  let uuid = await SecureStore.getItemAsync(USER_UUID_KEY);
  if (!uuid) {
    uuid =
      globalThis.crypto?.randomUUID?.() ??
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    await SecureStore.setItemAsync(USER_UUID_KEY, uuid);
  }
  cachedUserId = uuid;
  return uuid;
}

function personProps(uuid: string, name: string) {
  const set: Record<string, string> = {
    app_user_id: uuid,
    device_uuid: uuid,
    platform: Platform.OS,
  };
  if (name) set.name = name;
  return set;
}

/** PostHog only — Speaketh `setupUserIdentity`. Always `await ready()` first. */
export async function setupUserIdentity(posthog: PostHogLike): Promise<string | null> {
  if (!posthog) return null;
  try {
    if (posthog.ready) await posthog.ready();
    const uuid = await getOrCreateUserId();
    const name = ((await SecureStore.getItemAsync(USER_NAME_KEY)) ?? '').trim();
    const props = personProps(uuid, name);

    posthog.identify(uuid, {
      $set: props,
      $set_once: { device_uuid: uuid, app_user_id: uuid },
    });
    void posthog.register?.({ app_user_id: uuid });
    posthog.capture?.('user_identified', {
      app_user_id: uuid,
      $set: props,
      $set_once: { device_uuid: uuid },
    });
    await flushPostHog(posthog);
    return uuid;
  } catch (e) {
    console.log('[Identity] PostHog identify error:', e);
    return null;
  }
}

/** Superwall only. Concurrent calls share one in-flight promise. */
export function identifySuperwallUser(): Promise<string | null> {
  if (superwallIdentifyInFlight) return superwallIdentifyInFlight;

  superwallIdentifyInFlight = (async () => {
    try {
      const identified = await withTimeout(
        (async () => {
          await configureSuperwall();
          const uuid = await getOrCreateUserId();
          const name = ((await SecureStore.getItemAsync(USER_NAME_KEY)) ?? '').trim();

          await Superwall.shared.identify({
            userId: uuid,
            options: new IdentityOptions(true),
          });
          await SecureStore.setItemAsync(SUPERWALL_IDENTIFIER_KEY, uuid);

          const attributes: Record<string, string> = {
            app_user_id: uuid,
            platform: Platform.OS,
          };
          if (name) attributes.name = name;
          await Superwall.shared.setUserAttributes(attributes);

          return uuid;
        })(),
        SUPERWALL_IDENTIFY_TIMEOUT_MS,
      );
      if (!identified) console.log('[Identity] Superwall identify timed out');
      return identified;
    } catch (e) {
      console.log('[Identity] Superwall identify error:', e);
      return null;
    } finally {
      superwallIdentifyInFlight = null;
    }
  })();

  return superwallIdentifyInFlight;
}

/**
 * Blocks first paint until the same persisted UUID is identified on PostHog.
 * Superwall identify runs in parallel; timed out so splash cannot hang.
 */
export function bootstrapUserIdentity(): Promise<PostHog> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    const uuid = await getOrCreateUserId();
    const posthog = posthogSingleton ?? createPostHogClient();
    posthogSingleton = posthog;

    const superwall = identifySuperwallUser();

    try {
      await setupUserIdentity(posthog);
    } catch (e) {
      console.log('[Identity] PostHog bootstrap error:', e);
    }

    const superwallId = await withTimeout(superwall, SUPERWALL_IDENTIFY_TIMEOUT_MS);
    if (!superwallId) {
      console.log('[Identity] Superwall identify timed out; continuing');
    }

    console.log(
      '[Identity] ready app_user_id=',
      uuid,
      'posthog=',
      posthog.getDistinctId(),
    );

    return posthog;
  })().catch((e) => {
    console.log('[Identity] bootstrap failed:', e);
    if (!posthogSingleton) posthogSingleton = createPostHogClient();
    return posthogSingleton;
  });

  return bootstrapPromise;
}
