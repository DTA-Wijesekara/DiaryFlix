import posthog from 'posthog-js';

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

if (key) {
  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
  });
}

export function identifyUser(user) {
  if (!key || !user) return;
  posthog.identify(String(user.id), {
    email: user.email,
    name: user.displayName || user.email,
  });
}

export function resetAnalyticsUser() {
  if (!key) return;
  posthog.reset();
}

export function track(event, props) {
  if (!key) return;
  posthog.capture(event, props);
}
