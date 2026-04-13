import { useEffect } from 'react';
import { usePostHog } from './posthog-provider';

export { AppPostHogProvider, usePostHog } from './posthog-provider';

/** Same shape as 67Time: `screen_viewed` with `screen`, `component`, optional `screen_number`. */
export type PostHogScreenViewedPayload = {
  screen: string;
  component: string;
  screen_number?: number;
};

type UsePostHogScreenViewedOptions = {
  /**
   * Onboarding screens in 67Time call flush() after capture. Tabs typically do not.
   * Default: flush when `screen_number` is defined (onboarding), else no flush.
   */
  flush?: boolean;
};

export function usePostHogScreenViewed(
  payload: PostHogScreenViewedPayload,
  options?: UsePostHogScreenViewedOptions
) {
  const ph = usePostHog();
  const { screen, component, screen_number } = payload;
  const flush =
    options?.flush ?? (screen_number !== undefined ? true : false);

  useEffect(() => {
    try {
      const props: Record<string, string | number> = { screen, component };
      if (screen_number !== undefined) props.screen_number = screen_number;
      ph?.capture('screen_viewed', props);
      if (flush) void ph?.flush();
    } catch {
      /* 67Time onboarding pattern */
    }
  }, [ph, screen, component, screen_number, flush]);
}
