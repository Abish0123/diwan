import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'
import { LanguageProvider } from './contexts/LanguageContext.tsx'

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
// Set to true during the login sequence to prevent a 401 on an in-flight
// /api/data request from incorrectly triggering session expiry while a fresh
// token is being stored. Auth endpoints (/api/session/*) set this flag so
// that a brief race between token storage and the first data fetch is ignored.
let loginInProgress = false;
// Track when we last successfully stored a token to avoid false session expiry
let lastSuccessfulLoginTime = 0;

// Expose a setter for AuthContext to call around loginWithEmail
let loginProgressTimeout: NodeJS.Timeout | null = null;
(window as Window & { __setLoginInProgress?: (v: boolean) => void }).__setLoginInProgress = (v: boolean) => {
  if (loginProgressTimeout) clearTimeout(loginProgressTimeout);
  loginInProgress = v;
  // Auto-clear after 10 seconds as a safety net in case AuthContext forgets
  if (v) {
    loginProgressTimeout = setTimeout(() => {
      loginInProgress = false;
      loginProgressTimeout = null;
    }, 10000);
  }
};

// Monitor when AuthContext stores a token (via __loginTime) to update our grace period
setInterval(() => {
  const win = window as Window & { __loginTime?: number };
  if (win.__loginTime && win.__loginTime > lastSuccessfulLoginTime) {
    lastSuccessfulLoginTime = win.__loginTime;
    sessionExpiryHandled = false; // Reset the handler so it can fire again after 8 seconds
  }
}, 100);

function handleSessionExpired() {
  if (sessionExpiryHandled) return;
  if (loginInProgress) return; // Don't expire during an active login
  // Don't expire for 10 seconds after successful login (grace period for initial page loads)
  const timeSinceLogin = Date.now() - lastSuccessfulLoginTime;
  if (timeSinceLogin < 10000) {
    // Still in the grace period — suppress the expiry
    return;
  }
  // After grace period, just clear the token but don't reload (the page components
  // will notice the missing token and render appropriately).
  if (sessionExpiryHandled) return;
  sessionExpiryHandled = true;
  sessionStorage.removeItem('sd_token');
  // Leave sd_user and sd_role intact so components can show who was logged in before expiry
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : (input as Request).url;
  const isDataCall = !!url && url.includes("/api/data");
  // Never intercept /api/session/* — those are auth endpoints that don't need a token
  const isAuthCall = !!url && url.includes("/api/session");
  if (isDataCall && !isAuthCall) {
    const token = sessionStorage.getItem('sd_token');
    if (token) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', `Bearer ${token}`);
      init = { ...init, headers };
    }
  }
  const response = await nativeFetch(input, init);
  // Only treat this as a dead session if:
  // 1. We actually had a token to send (so a pre-login probe is not a session expiry)
  // 2. We are not currently in the middle of a login sequence
  // 3. The response is from a real data call, not an auth endpoint
  if (isDataCall && !isAuthCall && response.status === 401 && sessionStorage.getItem('sd_token') && !loginInProgress) {
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
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
)
