// Both the studio and guide use the same anonymous visitor/session identity.
const token = import.meta.env.VITE_POSTHOG_KEY?.trim();
const enabled = import.meta.env.PROD || import.meta.env.VITE_POSTHOG_ENABLED === 'true';

if (token && enabled) {
  // Analytics must not delay mounting the editor or prevent it from working offline.
  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(token, {
        api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
        defaults: '2026-05-30',
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true,
        capture_exceptions: false,
        mask_all_text: true,
        mask_all_element_attributes: true,
        disable_session_recording: false,
        enable_recording_console_log: false,
        session_recording: {
          maskAllInputs: true,
          // Files and rendered lyrics stay on the device, including in replays.
          blockSelector:
            '#stage, #video-name, #ttml-name, #saved-exports, [role="alert"], [data-error="true"]',
          recordHeaders: false,
          recordBody: false,
        },
      });
    })
    .catch(() => {
      console.warn('Analytics could not be loaded. The editor is still available.');
    });
}
