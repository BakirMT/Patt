import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { ensureUserProfile } from '../lib/ledgerService';
import {
  changePin as apiChangePin,
  disablePin as apiDisablePin,
  fetchPinStatus,
  lockBookSession,
  setupPin as apiSetupPin,
  verifyPin as apiVerifyPin,
} from '../lib/pinService';
import type { PinStatus } from '../types/ledger';

interface AuthContextValue {
  user: User | null;
  authLoading: boolean;
  profileReady: boolean;
  pinStatus: PinStatus;
  pinLoading: boolean;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (name: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshUserVerification: () => Promise<boolean>;
  logout: () => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  setupUserPin: (pin: string, confirmPin: string, length: 4 | 6) => Promise<void>;
  changeUserPin: (
    currentPin: string,
    newPin: string,
    confirmPin: string,
    length: 4 | 6
  ) => Promise<void>;
  disableUserPin: (currentPin: string) => Promise<void>;
  lockBook: () => Promise<void>;
}

const DEFAULT_PIN_STATUS: PinStatus = {
  pinEnabled: false,
  pinLength: 4,
  unlocked: true,
  lockedUntil: null,
  remainingAttempts: 5,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [pinStatus, setPinStatus] = useState<PinStatus>(DEFAULT_PIN_STATUS);
  const [pinLoading, setPinLoading] = useState(false);
  // Server-issued HMAC unlock token kept strictly in React memory (never localStorage)
  const [unlockToken, setUnlockToken] = useState<string | null>(null);

  const initializeVerifiedUser = useCallback(async (u: User, token: string | null) => {
    setPinLoading(true);
    setProfileReady(false);
    try {
      await ensureUserProfile(u);
      setProfileReady(true);
      const status = await fetchPinStatus(u, token);
      setPinStatus(status);
    } catch (err) {
      console.error('Error initializing verified session:', err);
      setProfileReady(true);
      setPinStatus(DEFAULT_PIN_STATUS);
    } finally {
      setPinLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (!nextUser) {
        setUnlockToken(null);
        setProfileReady(false);
        setPinStatus(DEFAULT_PIN_STATUS);
        return;
      }
      if (nextUser.emailVerified) {
        await initializeVerifiedUser(nextUser, null);
      } else {
        setProfileReady(false);
        setPinStatus(DEFAULT_PIN_STATUS);
      }
    });
    return () => unsub();
  }, [initializeVerifiedUser]);

  const signInGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const registerEmail = useCallback(async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) {
      await updateProfile(cred.user, { displayName: name.trim() });
    }
    await sendEmailVerification(cred.user);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const resendVerification = useCallback(async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshUserVerification = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const fresh = auth.currentUser;
    if (fresh && fresh.emailVerified) {
      // Force refresh ID token so email_verified claim updates immediately for Firestore rules & server
      await fresh.getIdToken(true);
      setUser({ ...fresh } as User);
      await initializeVerifiedUser(fresh, null);
      return true;
    }
    return false;
  }, [initializeVerifiedUser]);

  const logout = useCallback(async () => {
    if (auth.currentUser && unlockToken) {
      try {
        await lockBookSession(auth.currentUser, unlockToken);
      } catch {
        // Proceed with logout even if server lock revoke fails
      }
    }
    setUnlockToken(null);
    setPinStatus(DEFAULT_PIN_STATUS);
    await signOut(auth);
  }, [unlockToken]);

  const unlockWithPin = useCallback(async (pin: string) => {
    if (!auth.currentUser) throw new Error('Not signed in.');
    const res = await apiVerifyPin(auth.currentUser, pin);
    setUnlockToken(res.unlockToken ?? null);
    setPinStatus({
      pinEnabled: res.pinEnabled,
      pinLength: res.pinLength,
      unlocked: res.unlocked,
      lockedUntil: res.lockedUntil,
      remainingAttempts: res.remainingAttempts,
    });
  }, []);

  const setupUserPin = useCallback(
    async (pin: string, confirmPin: string, length: 4 | 6) => {
      if (!auth.currentUser) throw new Error('Not signed in.');
      const res = await apiSetupPin(auth.currentUser, pin, confirmPin, length);
      setUnlockToken(res.unlockToken ?? null);
      setPinStatus({
        pinEnabled: res.pinEnabled,
        pinLength: res.pinLength,
        unlocked: res.unlocked,
        lockedUntil: res.lockedUntil,
        remainingAttempts: res.remainingAttempts,
      });
    },
    []
  );

  const changeUserPin = useCallback(
    async (
      currentPin: string,
      newPin: string,
      confirmPin: string,
      length: 4 | 6
    ) => {
      if (!auth.currentUser) throw new Error('Not signed in.');
      const res = await apiChangePin(
        auth.currentUser,
        currentPin,
        newPin,
        confirmPin,
        length,
        unlockToken
      );
      setUnlockToken(res.unlockToken ?? null);
      setPinStatus({
        pinEnabled: res.pinEnabled,
        pinLength: res.pinLength,
        unlocked: res.unlocked,
        lockedUntil: res.lockedUntil,
        remainingAttempts: res.remainingAttempts,
      });
    },
    [unlockToken]
  );

  const disableUserPin = useCallback(
    async (currentPin: string) => {
      if (!auth.currentUser) throw new Error('Not signed in.');
      const res = await apiDisablePin(auth.currentUser, currentPin, unlockToken);
      setUnlockToken(null);
      setPinStatus(res);
    },
    [unlockToken]
  );

  const lockBook = useCallback(async () => {
    if (!auth.currentUser) return;
    if (!pinStatus.pinEnabled) return;
    await lockBookSession(auth.currentUser, unlockToken);
    setUnlockToken(null);
    setPinStatus((prev) => ({ ...prev, unlocked: false }));
  }, [pinStatus.pinEnabled, unlockToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        profileReady,
        pinStatus,
        pinLoading,
        signInGoogle,
        signInEmail,
        registerEmail,
        resetPassword,
        resendVerification,
        refreshUserVerification,
        logout,
        unlockWithPin,
        setupUserPin,
        changeUserPin,
        disableUserPin,
        lockBook,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
