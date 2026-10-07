import { useEffect, useRef } from 'react';
import { renderGoogleButton } from '../services/googleIdentity';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function GoogleSignInButton({ onCredential, onError }) {
  const containerRef = useRef(null);
  const callbacks = useRef({ onCredential, onError });
  useEffect(() => { callbacks.current = { onCredential, onError }; }, [onCredential, onError]);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cleanup;
    let attempts = 0;
    const handlers = {
      onCredential: credential => callbacks.current.onCredential(credential),
      onError: error => callbacks.current.onError?.(error),
    };
    const init = () => {
      try { cleanup = renderGoogleButton(GOOGLE_CLIENT_ID, containerRef.current, handlers); }
      catch (error) { handlers.onError(error); return true; }
      return !!cleanup;
    };
    let timer;
    if (!init()) timer = setInterval(() => {
      if (init()) clearInterval(timer);
      else if (++attempts >= 100) {
        clearInterval(timer);
        handlers.onError(new Error('Google sign-in could not load. Check your connection or sign in with email.'));
      }
    }, 100);
    return () => { clearInterval(timer); cleanup?.(); };
  }, []);
  return GOOGLE_CLIENT_ID ? <div ref={containerRef} className="google-signin-btn" /> : null;
}
