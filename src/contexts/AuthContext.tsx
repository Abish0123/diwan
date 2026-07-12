/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, db, isFirestoreWorking, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { isDefaultAdminEmail } from '../lib/admin-emails';
import { smartDb } from '../lib/localDb';
import { isCentralAdmin } from '../lib/roles';
import { trackEvent } from '../lib/analytics';

const IMPERSONATE_KEY = 'sd_impersonate';

interface AuthContextType {
  /** The role the app should behave as — equals realRole unless an admin is previewing another portal. */
  role: string | null;
  /** The actual role granted to the signed-in account (ignores any active preview). */
  realRole: string | null;
  user: User | null;
  loading: boolean;
  isMockSession: boolean;
  /** True while a central admin is previewing the app as another role. */
  isImpersonating: boolean;
  /** Whether the signed-in account is allowed to preview other portals. */
  canImpersonate: boolean;
  /** Begin previewing the app as the given role id (central admins only). */
  impersonateRole: (roleId: string) => void;
  /** Return to the account's real role. */
  stopImpersonating: () => void;
  login: () => Promise<boolean>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Reflects a freshly-saved photoURL into the cached session immediately
   *  (e.g. after Teacher Settings uploads a new profile photo) — the local
   *  session is restored from sessionStorage on every refresh rather than
   *  re-fetched from the User record, so without this the header/sidebar
   *  avatar would keep showing the old photo until the next full login. */
  updateUserPhoto: (photoURL: string) => void;
}

const authContextDefault: AuthContextType = {
  role: null, realRole: null, user: null, loading: true,
  isMockSession: false, isImpersonating: false, canImpersonate: false,
  impersonateRole: () => {}, stopImpersonating: () => {},
  login: async () => false, loginWithEmail: async () => {}, logout: async () => {},
  updateUserPhoto: () => {},
};
export const AuthContext = createContext<AuthContextType>(authContextDefault);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  // realRole = the account's actual granted role. Stored as a free string so any of
  // the 21 registry role ids (principal, grade_coordinator, subject_teacher, parent…)
  // flow through unchanged, not just admin/staff/student.
  const [realRole, setRealRole] = useState<string | null>(null);
  // Optional preview role: only honoured for central admins (see effective role below).
  const [impersonatedRole, setImpersonatedRole] = useState<string | null>(
    () => sessionStorage.getItem(IMPERSONATE_KEY)
  );
  const [loading, setLoading] = useState(true);
  const [isMockSession, setIsMockSession] = useState(false);

  // setRole is kept as the name the rest of this provider already uses to record the
  // account's granted role; it now feeds realRole.
  const setRole = setRealRole;

  // Only a central admin may preview other portals. Everyone else ignores any stale
  // impersonation flag entirely, so a non-admin can never escalate via sessionStorage.
  const canImpersonate = isCentralAdmin(realRole);
  const role = canImpersonate && impersonatedRole ? impersonatedRole : realRole;
  const isImpersonating = canImpersonate && !!impersonatedRole && impersonatedRole !== realRole;

  const impersonateRole = useCallback((roleId: string) => {
    if (!isCentralAdmin(realRole)) return; // guard: admins only
    if (!roleId || roleId === realRole) {
      setImpersonatedRole(null);
      sessionStorage.removeItem(IMPERSONATE_KEY);
      return;
    }
    setImpersonatedRole(roleId);
    sessionStorage.setItem(IMPERSONATE_KEY, roleId);
  }, [realRole]);

  const stopImpersonating = useCallback(() => {
    setImpersonatedRole(null);
    sessionStorage.removeItem(IMPERSONATE_KEY);
  }, []);

  useEffect(() => {
    // Set by main.tsx's fetch wrapper right before it force-reloads on a dead
    // session (expired/invalid token) — surfaces why the user landed back on
    // the login screen instead of leaving them to wonder why their data
    // "disappeared".
    const expiredMsg = sessionStorage.getItem('sd_session_expired_msg');
    if (expiredMsg) {
      sessionStorage.removeItem('sd_session_expired_msg');
      toast.error(expiredMsg);
    }

    // Remove any stale session data from localStorage (legacy — we now use sessionStorage
    // so each browser tab has its own isolated session and tabs never bleed into each other).
    localStorage.removeItem('sd_user');
    localStorage.removeItem('sd_role');

    // Restore a local (email/OTP) session immediately from sessionStorage.
    // sessionStorage is per-tab: survives F5 refresh but never leaks to other tabs.
    const savedUser = sessionStorage.getItem('sd_user');
    const savedRole = sessionStorage.getItem('sd_role');

    if (savedUser && savedRole) {
      setUser(JSON.parse(savedUser) as User);
      setRole(savedRole);
      setIsMockSession(true);
      setLoading(false);
    }

    // Safety net: onAuthStateChanged makes a real network call to Firebase's
    // Auth servers. If that's slow, blocked (corporate network, ad-blocker,
    // DNS issue), or never resolves, `loading` would otherwise stay true
    // forever and the whole app would show an infinite spinner with no way
    // to even reach the login page. Fall through to "logged out" after a
    // few seconds so the app is always usable, even when Firebase isn't
    // reachable — this app's real data lives in MySQL, not Firebase anyway.
    const authTimeout = setTimeout(() => {
      setLoading(current => {
        if (!current) return current;
        console.warn('Firebase auth check timed out — falling back to logged-out state.');
        return false;
      });
    }, 6000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(authTimeout);
      // If a local mock session is active, trust it completely and ignore Firebase.
      // A stale Firebase auth session (e.g. from a previous Google login that was never
      // properly signed out) must not be allowed to overwrite the local session role.
      if (sessionStorage.getItem('sd_user')) {
        setLoading(false);
        return;
      }

      if (firebaseUser) {
        setIsMockSession(false);
        try {
          if (isFirestoreWorking) {
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              setUser(firebaseUser);
              setRole(userData.role);
              sessionStorage.setItem('sd_user', JSON.stringify(firebaseUser));
              sessionStorage.setItem('sd_role', userData.role);
            } else {
              // Create user profile if it doesn't exist
              const isDefaultAdmin = isDefaultAdminEmail(firebaseUser.email);
              const newRole = isDefaultAdmin ? 'admin' : 'staff';

              const userData = {
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || 'New User',
                email: firebaseUser.email,
                role: newRole,
                createdAt: serverTimestamp(),
              };

              try {
                await setDoc(doc(db, 'users', firebaseUser.uid), userData);
                setUser(firebaseUser);
                setRole(newRole);
                sessionStorage.setItem('sd_user', JSON.stringify(firebaseUser));
                sessionStorage.setItem('sd_role', newRole);
              } catch (error) {
                handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
              }
            }
          } else {
            // Firestore not working, use local DB
            const localUser = await smartDb.getOne("users", firebaseUser.uid);
            if (localUser) {
              setUser(firebaseUser);
              setRole(localUser.role);
              sessionStorage.setItem('sd_user', JSON.stringify(firebaseUser));
              sessionStorage.setItem('sd_role', localUser.role);
            } else {
              const isDefaultAdmin = isDefaultAdminEmail(firebaseUser.email);
              const newRole = isDefaultAdmin ? 'admin' : 'staff';
              const userData = {
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || 'New User',
                email: firebaseUser.email,
                role: newRole,
                createdAt: new Date().toISOString(),
              };
              await smartDb.create("users", userData, firebaseUser.uid);
              setUser(firebaseUser);
              setRole(newRole);
              sessionStorage.setItem('sd_user', JSON.stringify(firebaseUser));
              sessionStorage.setItem('sd_role', newRole);
            }
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
          // On DB error keep the role from sessionStorage if we have it, otherwise
          // fall back to the email allowlist check. Never silently demote to student.
          const cachedRole = sessionStorage.getItem('sd_role');
          setUser(firebaseUser);
          setRole(cachedRole || (isDefaultAdminEmail(firebaseUser.email) ? 'admin' : 'staff'));
        }
      } else {
        setLoading(false);
      }
      setLoading(false);
    });
    return () => {
      clearTimeout(authTimeout);
      unsubscribe();
    };
  }, []);

  // Returns whether a real Firebase identity was actually established, so
  // the caller (the "Continue with Google" button) can decide whether it's
  // safe to navigate into the app — previously this swallowed every error
  // internally and returned nothing, so the button navigated to "/" even
  // when the popup was cancelled or sign-in genuinely failed.
  const login = useCallback(async (): Promise<boolean> => {
    // Clear any local mock session before starting Google auth — otherwise the
    // onAuthStateChanged guard above would return early and ignore the real Firebase user.
    sessionStorage.removeItem('sd_user');
    sessionStorage.removeItem('sd_role');
    setIsMockSession(false);
    const provider = new GoogleAuthProvider();
    try {
      const cred = await signInWithPopup(auth, provider);
      setIsMockSession(false);
      toast.success('Logged in successfully');
      trackEvent({ type: 'login', uid: cred.user.uid, role: 'google' });
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        const firebaseError = error as { code: string };
        if (firebaseError.code === 'auth/popup-closed-by-user' || firebaseError.code === 'auth/cancelled-popup-request') {
          return false;
        }

        if (firebaseError.code === 'auth/unauthorized-domain') {
          // A failed Google popup gives us no verified identity, so we must NOT
          // fabricate a session — least of all an admin one. Previously this
          // silently logged ANY user in as the first allowlisted admin. Direct
          // them to the email/password flow instead of escalating privileges.
          console.warn('Domain not authorized in Firebase for Google sign-in.');
          toast.error("Google sign-in isn't available on this domain. Please sign in with your email and password instead.");
          return false;
        }
      }
      console.error('Login error:', error);
      toast.error('Failed to login');
      return false;
    }
  }, []);

  // Combined credential-check + sign-in — this used to be split across
  // loginWithEmail (validate) and a separate verifyOTP step (a fixed demo
  // constant with no real verification value), which only added friction.
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, checkOnly: true })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'User not found. Please register first.');
      }

      const loginRes = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!loginRes.ok) {
        const error = await loginRes.json();
        throw new Error(error.error || 'Failed to login');
      }

      const data = await loginRes.json();

      if (data.user) {
        const localUser = {
          uid: data.user.uid,
          email: data.user.email,
          displayName: data.user.displayName,
          // Real uploaded photo (Teacher Settings) wins; only fall back to a
          // generated placeholder when the account has never set one.
          photoURL: data.user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.user.uid}`,
          emailVerified: true,
        } as User;

        setIsMockSession(true);
        setUser(localUser);
        setRole(data.user.role);

        sessionStorage.setItem('sd_user', JSON.stringify(localUser));
        sessionStorage.setItem('sd_role', data.user.role);
        // The signed session token every /api/data/* request now must present — see
        // src/lib/apiFetch.ts, which reads this key and attaches it as a Bearer header.
        if (data.token) sessionStorage.setItem('sd_token', data.token);

        toast.success(`Logged in as ${data.user.displayName} (Local DB)`);
        trackEvent({ type: 'login', uid: data.user.uid, role: data.user.role });
      }
    } catch (error) {
      console.error('Email login error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to login');
      throw error;
    }
  }, []);

  const updateUserPhoto = useCallback((photoURL: string) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, photoURL } as User;
      try { sessionStorage.setItem('sd_user', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      if (user?.uid) trackEvent({ type: 'logout', uid: user.uid, role: role || undefined });
      // Always sign out Firebase regardless of session type — a stale Firebase auth
      // session left behind after a mock logout is what causes role-flip on next refresh.
      await signOut(auth).catch(() => {});
      setIsMockSession(false);
      setUser(null);
      setRole(null);
      stopImpersonating();
      sessionStorage.removeItem('sd_user');
      sessionStorage.removeItem('sd_role');
      sessionStorage.removeItem('sd_token');
      // Every per-user hook (useTeacherClass, useGradeCoordinator,
      // useParentChildren, etc.) caches its result under a query key scoped
      // to the signed-in user's own email/uid, so a fresh key is used the
      // moment a different account signs in — but without this, switching
      // accounts in the SAME TAB (a shared/demo machine, or an admin using
      // "View as") left every stale cached record sitting in memory until
      // its normal 5-minute staleTime/10-minute gcTime expired, so the next
      // account could momentarily render with the previous one's assignment
      // data before its own fetch resolved. Clearing on logout removes that
      // window entirely instead of relying on the cache to expire in time.
      queryClient.clear();
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  }, [stopImpersonating, queryClient, user, role]);

  // Memoized for the same reason as StudentContext's value: AuthProvider wraps
  // the entire app, so an inline object literal here would hand every
  // consumer everywhere a new context value on every render (e.g. every
  // Firebase onAuthStateChanged tick), cascading unnecessary re-renders down
  // through every provider and page in the tree.
  const value = useMemo(() => ({
    user, role, realRole, loading, isMockSession,
    isImpersonating, canImpersonate, impersonateRole, stopImpersonating,
    login, loginWithEmail, logout, updateUserPhoto,
  }), [user, role, realRole, loading, isMockSession, isImpersonating, canImpersonate,
      impersonateRole, stopImpersonating, login, loginWithEmail, logout, updateUserPhoto]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
