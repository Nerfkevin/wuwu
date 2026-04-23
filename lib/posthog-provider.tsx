import { PostHogProvider } from 'posthog-react-native';
import { type ReactNode } from 'react';

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? 'phc_wMrsZHqHroozsPiKyZpd3tt9fvyP85HMTdKzr4m5472Y';
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
const IS_DEBUG =
  process.env.EXPO_PUBLIC_POSTHOG_DEBUG === '1' ||
  process.env.EXPO_PUBLIC_POSTHOG_DEBUG === 'true';

export function AppPostHogProvider({ children }: { children: ReactNode }) {
  const hasKey = Boolean(POSTHOG_KEY.trim());

  console.log('[PostHog] resolved key:', POSTHOG_KEY, '| env var:', process.env.EXPO_PUBLIC_POSTHOG_KEY);

  return (
    <PostHogProvider
      apiKey={hasKey ? POSTHOG_KEY : 'phc_disabled_placeholder'}
      options={{
        host: POSTHOG_HOST,
        disabled: !hasKey,
        // flush after every event in debug so nothing gets stuck in the queue
        flushAt: IS_DEBUG ? 1 : 20,
        flushInterval: IS_DEBUG ? 1000 : 30000,
        captureAppLifecycleEvents: true,
      }}
      autocapture={{
        captureScreens: false,
        captureTouches: false,
      }}
      debug={IS_DEBUG}>
      {children}
    </PostHogProvider>
  );
}

export { usePostHog } from 'posthog-react-native';
