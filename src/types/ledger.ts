import type { Timestamp } from 'firebase/firestore';

export type TransactionType = 'GIVEN' | 'RECEIVED' | 'PAYABLE' | 'PAID';

export interface UserProfile {
  ownerId: string;
  email: string;
  displayName: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Person {
  id: string;
  ownerId: string;
  name: string;
  code: string;
  codeKey: string;
  phone: string;
  place: string;
  email: string;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface PersonInput {
  name: string;
  code: string;
  phone: string;
  place: string;
  email: string;
  notes: string;
}

export interface Transaction {
  id: string;
  ownerId: string;
  personId: string;
  type: TransactionType;
  amount: number;
  date: string; // YYYY-MM-DD
  description: string;
  referenceNumber: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface TransactionInput {
  personId: string;
  type: TransactionType;
  amount: number;
  date: string;
  description: string;
  referenceNumber: string;
}

export interface PersonBalanceSummary {
  personId: string;
  totalGiven: number;
  totalReceived: number;
  remainingReceivable: number; // Total Given - Total Received
  totalPayablePrincipal: number; // Total Owed (PAYABLE)
  totalPaid: number; // Total Paid (PAID)
  remainingPayable: number; // Total Owed - Total Paid
  transactionCount: number;
  lastTransactionDate: string | null;
}

export interface DashboardMetrics {
  totalPersons: number;
  totalGiven: number;
  totalReceived: number;
  totalReceivable: number;
  totalPayablePrincipal: number;
  totalPaid: number;
  totalPayable: number;
  totalTransactionCount: number;
}

export interface UserPreferences {
  currencyCode: string;
  currencySymbol: string;
}

export interface PinStatus {
  pinEnabled: boolean;
  pinLength: 4 | 6;
  unlocked: boolean;
  lockedUntil: number | null;
  remainingAttempts: number;
}

export interface BackupPayload {
  app: 'SMART PATT BOOK';
  schemaVersion: 1;
  exportedAt: string;
  preferences?: UserPreferences;
  persons: Array<{
    id: string;
    name: string;
    code: string;
    phone: string;
    place: string;
    email: string;
    notes: string;
  }>;
  transactions: Array<{
    id: string;
    personId: string;
    personCode?: string;
    type: TransactionType;
    amount: number;
    date: string;
    description: string;
    referenceNumber: string;
  }>;
}

export type AppView =
  | 'dashboard'
  | 'persons'
  | 'person-detail'
  | 'transactions'
  | 'calculator'
  | 'reports'
  | 'security-backup';
