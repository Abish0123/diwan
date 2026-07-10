import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'

// Every /api/data/* request now requires a signed session token (server.ts's
// requireAuth middleware) — but the app has ~34 call sites that fetch it
// directly (src/lib/localDb.ts plus many components/hooks that bypass that
// abstraction), so rather than editing each one, patch fetch itself once,
// here, before anything else in the app runs. Only requests to /api/data/*
// are touched; every other fetch (Gemini/OpenRouter, avatar images, etc.)
// passes through unchanged.
const nativeFetch = window.fetch.bind(window);

// If the server rejects our token (expired, or signed under a secret that no
// longer exists — e.g. a dev-server restart before the fallback-secret fix),
// every /api/data/* call starts silently 401ing. Nothing was watching for
// that: each context's fetch just caught the error and fell back to an
// empty result, so the UI kept rendering the "still logged in" shell (name/
// role in the header, from client-side state that 401s never touch) while
// every real number quietted to 0 — indistinguishable from actual data loss.
// The first 401 on a real data call now forces a clean re-login instead of
// leaving the app in that silently-broken state.
let sessionExpiryHandled = false;
function handleSessionExpired() {
  if (sessionExpiryHandled) return;
  sessionExpiryHandled = true;
  sessionStorage.removeItem('sd_user');
  sessionStorage.removeItem('sd_role');
  sessionStorage.removeItem('sd_token');
  sessionStorage.setItem('sd_session_expired_msg', 'Your session expired — please sign in again.');
  window.location.reload();
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : (input as Request).url;
  const isDataCall = !!url && url.includes("/api/data");
  if (isDataCall) {
    const token = sessionStorage.getItem('sd_token');
    if (token) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', `Bearer ${token}`);
      init = { ...init, headers };
    }
  }
  const response = await nativeFetch(input, init);
  // Only treat this as a dead session if we actually had a token to send —
  // a 401 with no token yet (e.g. the brief window right after logout, or a
  // pre-login probe) is expected and not a session-expiry event.
  if (isDataCall && response.status === 401 && sessionStorage.getItem('sd_token')) {
    handleSessionExpired();
  }
  return response;
};

// Suppress ResizeObserver loop limit exceeded error
const resizeObserverError = "ResizeObserver loop completed with undelivered notifications.";
const originalError = window.console.error;
window.console.error = (...args) => {
  if (args[0]?.includes?.(resizeObserverError) || args[0] === resizeObserverError) {
    return;
  }
  originalError.apply(window.console, args);
};

// Shim process.env for browser compatibility
if (typeof window !== 'undefined' && !window.process) {
  // @ts-expect-error: process is not defined in the browser
  window.process = { env: {
    GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY || "",
    OPENROUTER_API_KEY: import.meta.env.VITE_OPENROUTER_API_KEY || "",
  } };
} else if (typeof window !== 'undefined' && window.process && !window.process.env) {
  const shimEnv = { GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY || "", OPENROUTER_API_KEY: import.meta.env.VITE_OPENROUTER_API_KEY || "" };
  window.process.env = shimEnv;
} else if (typeof window !== 'undefined' && window.process && window.process.env) {
  // @ts-expect-error: GEMINI_API_KEY is not defined in the browser
  window.process.env.GEMINI_API_KEY = window.process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || "";
  // @ts-expect-error: OPENROUTER_API_KEY is not defined in the browser
  window.process.env.OPENROUTER_API_KEY = window.process.env.OPENROUTER_API_KEY || import.meta.env.VITE_OPENROUTER_API_KEY || "";
}

window.addEventListener('error', (e) => {
  if (e.message === resizeObserverError || e.message.includes(resizeObserverError)) {
    e.stopImmediatePropagation();
  }
});

// Auto-clear stale service workers and caches to prevent white-screen crashes
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
  caches.keys().then((keys) => {
    keys.forEach((k) => caches.delete(k));
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
