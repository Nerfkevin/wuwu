import PostHog, { PostHogProvider } from 'posthog-react-native';
import { type ReactNode } from 'react';

const POSTHOG_KEY =
  process.env.EXPO_PUBLIC_POSTHOG_KEY ??
  'phc_wMrsZHqHroozsPiKyZpd3tt9fvyP85HMTdKzr4m5472Y';
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
const IS_DEBUG =
  process.env.EXPO_PUBLIC_POSTHOG_DEBUG === '1' ||
  process.env.EXPO_PUBLIC_POSTHOG_DEBUG === 'true';

export function createPostHogClient(): PostHog {
  const hasKey = Boolean(POSTHOG_KEY.trim());

  return new PostHog(hasKey ? POSTHOG_KEY : 'phc_disabled_placeholder', {
    host: POSTHOG_HOST,
    disabled: !hasKey,
    flushAt: IS_DEBUG ? 1 : 20,
    flushInterval: IS_DEBUG ? 1000 : 30000,
    captureAppLifecycleEvents: true,
    personProfiles: 'identified_only',
    enableSessionReplay: true,
    sessionReplayConfig: {
      maskAllTextInputs: true,
      maskAllImages: true,
      maskAllSandboxedViews: true,
      captureLog: true,
      captureNetworkTelemetry: true,
    },
  });
}

export function AppPostHogProvider({
  client,
  children,
}: {
  client: PostHog;
  children: ReactNode;
}) {
  return (
    <PostHogProvider
      client={client}
      autocapture={{
        captureScreens: false,
        captureTouches: false,
      }}
      debug={IS_DEBUG}>
      {children}
    </PostHogProvider>
  );
}

export type { PostHog };
export { usePostHog } from 'posthog-react-native';
