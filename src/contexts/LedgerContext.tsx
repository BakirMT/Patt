import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  subscribePersons,
  subscribePreferences,
  subscribeTransactions,
} from '../lib/ledgerService';
import { computeDashboardMetrics, computePersonBalanceMap } from '../lib/math';
import type {
  DashboardMetrics,
  Person,
  PersonBalanceSummary,
  Transaction,
  UserPreferences,
} from '../types/ledger';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

interface LedgerContextValue {
  persons: Person[];
  transactions: Transaction[];
  preferences: UserPreferences;
  loading: boolean;
  personBalances: Record<string, PersonBalanceSummary>;
  personMap: Record<string, Person>;
  metrics: DashboardMetrics;
  toasts: ToastMessage[];
  notify: (type: ToastMessage['type'], title: string, detail?: string) => void;
  dismissToast: (id: string) => void;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const { user, profileReady, pinStatus } = useAuth();
  const [persons, setPersons] = useState<Person[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>({
    currencyCode: 'USD',
    currencySymbol: '$',
  });
  const [personsLoaded, setPersonsLoaded] = useState(false);
  const [txLoaded, setTxLoaded] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, detail?: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, title, detail }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const canSubscribe = Boolean(
    user && user.emailVerified && profileReady && (!pinStatus.pinEnabled || pinStatus.unlocked)
  );

  useEffect(() => {
    if (!canSubscribe || !user) {
      setPersons([]);
      setTransactions([]);
      setPersonsLoaded(false);
      setTxLoaded(false);
      return;
    }

    const unsubPersons = subscribePersons(
      user.uid,
      (list) => {
        setPersons(list);
        setPersonsLoaded(true);
      },
      (err) => {
        notify('error', 'Failed to load persons', err.message);
        setPersonsLoaded(true);
      }
    );

    const unsubTx = subscribeTransactions(
      user.uid,
      (list) => {
        setTransactions(list);
        setTxLoaded(true);
      },
      (err) => {
        notify('error', 'Failed to load transactions', err.message);
        setTxLoaded(true);
      }
    );

    const unsubPrefs = subscribePreferences(user.uid, setPreferences);

    return () => {
      unsubPersons();
      unsubTx();
      unsubPrefs();
    };
  }, [canSubscribe, user, notify]);

  const personBalances = useMemo(
    () => computePersonBalanceMap(persons, transactions),
    [persons, transactions]
  );

  const personMap = useMemo(() => {
    const map: Record<string, Person> = {};
    for (const p of persons) map[p.id] = p;
    return map;
  }, [persons]);

  const metrics = useMemo(
    () => computeDashboardMetrics(persons, transactions),
    [persons, transactions]
  );

  const loading = canSubscribe && (!personsLoaded || !txLoaded);

  return (
    <LedgerContext.Provider
      value={{
        persons,
        transactions,
        preferences,
        loading,
        personBalances,
        personMap,
        metrics,
        toasts,
        notify,
        dismissToast,
      }}
    >
      {children}
    </LedgerContext.Provider>
  );
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error('useLedger must be used inside LedgerProvider');
  return ctx;
}
