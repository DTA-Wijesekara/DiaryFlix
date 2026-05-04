import React, { useEffect, useRef } from 'react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/**
 * Renders Google's official "Sign in with Google" button.
 * Loads Google Identity Services (GIS), prompts the user, and calls onCredential
 * with the resulting ID token (a short-lived JWT) which the backend verifies.
 *
 * If VITE_GOOGLE_CLIENT_ID is not configured, the component renders nothing.
 */
export default function GoogleSignInButton({ onCredential, onError }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !containerRef.current) return;

    let cancelled = false;
    let intervalId;

    const init = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id) return false;

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response?.credential) onCredential(response.credential);
            else onError?.(new Error('No credential returned from Google'));
          },
          ux_mode: 'popup',
          auto_select: false,
        });

        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: containerRef.current.offsetWidth || 320,
        });
      } catch (err) {
        onError?.(err);
      }
      return true;
    };

    if (!init()) {
      intervalId = setInterval(() => {
        if (init() && intervalId) clearInterval(intervalId);
      }, 100);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [onCredential, onError]);

  if (!GOOGLE_CLIENT_ID) return null;

  return <div ref={containerRef} className="google-signin-btn" />;
}
