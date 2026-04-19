<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Wu-Wu Expo app. The project already had `posthog-react-native`, `react-native-svg`, `AppPostHogProvider`, and a `usePostHogScreenViewed` hook in place. This integration built on that foundation by adding **action-level event tracking** across all major user flows, plus user identification during onboarding.

**Changes made:**

- `app/(tabs)/index.tsx` — `orb_tapped` event when user taps the main orb to begin a session
- `app/session/selection.tsx` — `session_started` event (with `background`, `frequency`/`brainwave`, `playlist_id`) when user confirms their soundscape selection
- `app/session/playback.tsx` — `session_finished` event (with `session_ms`, `background`, soundscape) when user taps "Finish Session"; includes `flush()` to ensure delivery
- `app/add/recording.tsx` — `recording_saved` event (with `pillar`, effect flags, `onboarding` flag) when user saves an affirmation recording
- `app/(tabs)/library.tsx` — `library_recording_played`, `playlist_created`, and `recording_deleted` events at the appropriate action points
- `app/(tabs)/profile.tsx` — `review_requested` event when user taps "Leave a review"
- `app/(onboarding)/screen3.tsx` — `posthog.identify()` called with the user's name when they complete onboarding step 3; followed by `onboarding_name_set` capture and `flush()`
- `.env` — `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` verified and set to correct values

| Event | Description | File |
|---|---|---|
| `orb_tapped` | User taps the main orb to begin session flow | `app/(tabs)/index.tsx` |
| `session_started` | User starts a manifesting session (bg, freq/brainwave, playlist) | `app/session/selection.tsx` |
| `session_finished` | User finishes a session; includes duration in ms | `app/session/playback.tsx` |
| `recording_saved` | User saves an affirmation recording to library | `app/add/recording.tsx` |
| `recording_deleted` | User deletes a recording from the library | `app/(tabs)/library.tsx` |
| `playlist_created` | User creates a new affirmation playlist | `app/(tabs)/library.tsx` |
| `library_recording_played` | User plays a recording from the library | `app/(tabs)/library.tsx` |
| `review_requested` | User taps "Leave a review" on profile | `app/(tabs)/profile.tsx` |
| `onboarding_name_set` | User sets their name during onboarding (triggers identify) | `app/(onboarding)/screen3.tsx` |

*Pre-existing events (not modified):* `screen_viewed`, `paywall_register_started`, `paywall_presented`, `paywall_dismissed`, `paywall_skipped`, `paywall_error`

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://us.posthog.com/project/296771/dashboard/1474635
- **Session Conversion Funnel** (orb tap → session start → finish): https://us.posthog.com/project/296771/insights/uRCRPPmT
- **Daily Sessions Started** (DAU trend): https://us.posthog.com/project/296771/insights/3C2GnWDz
- **Paywall Conversion Funnel** (presented → purchased): https://us.posthog.com/project/296771/insights/wfs2LF3L
- **Affirmation Recordings Saved by Pillar** (content engagement): https://us.posthog.com/project/296771/insights/SBs2iMmF
- **Onboarding → First Session Retention** (activation funnel): https://us.posthog.com/project/296771/insights/es1BxxYp

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-expo/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
