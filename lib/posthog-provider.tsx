import { PostHogProvider } from 'posthog-react-native';
import { type ReactNode } from 'react';

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

export function AppPostHogProvider({ children }: { children: ReactNode }) {
  const hasKey = Boolean(POSTHOG_KEY.trim());
  const debug =
    process.env.EXPO_PUBLIC_POSTHOG_DEBUG === '1' ||
    process.env.EXPO_PUBLIC_POSTHOG_DEBUG === 'true';

  return (
    <PostHogProvider
      apiKey={hasKey ? POSTHOG_KEY : 'phc_disabled_placeholder'}
      options={{
        host: POSTHOG_HOST,
        disabled: !hasKey,
      }}
      autocapture={{
        captureScreens: false,
        captureTouches: false,
      }}
      debug={debug}>
      {children}
    </PostHogProvider>
  );
}

export { usePostHog } from 'posthog-react-native';
