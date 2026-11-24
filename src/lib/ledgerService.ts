import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  isValidPersonCode,
  normalizePersonCodeKey,
  parseAmount,
} from './math';
import type {
  BackupPayload,
  Person,
  PersonInput,
  Transaction,
  TransactionInput,
  TransactionType,
  UserPreferences,
} from '../types/ledger';

export class DuplicatePersonCodeError extends Error {
  public readonly codeValue: string;
  constructor(codeValue: string) {
    super(`Person code "${codeValue}" is already assigned to another person in your book.`);
    this.name = 'DuplicatePersonCodeError';
    this.codeValue = codeValue;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function sanitizeText(val: string | undefined | null, maxLen: number): string {
  return String(val ?? '').trim().slice(0, maxLen);
}

function isPermissionOrFirestoreError(err: unknown): boolean {
  return !(err instanceof DuplicatePersonCodeError) && !(err instanceof ValidationError);
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    const email = sanitizeText(user.email, 254);
    const displayName = sanitizeText(user.displayName || user.email?.split('@')[0] || 'Account Owner', 120);

    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: user.uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = snap.data();
      if (existing.email !== email || existing.displayName !== displayName) {
        await updateDoc(ref, {
          email,
          displayName,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribePersons(
  uid: string,
  onData: (persons: Person[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/persons`;
  const q = query(collection(db, 'users', uid, 'persons'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: Person[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId ?? uid),
          name: String(data.name ?? ''),
          code: String(data.code ?? ''),
          codeKey: String(data.codeKey ?? ''),
          phone: String(data.phone ?? ''),
          place: String(data.place ?? ''),
          email: String(data.email ?? ''),
          notes: String(data.notes ?? ''),
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export function subscribeTransactions(
  uid: string,
  onData: (transactions: Transaction[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/transactions`;
  const q = query(collection(db, 'users', uid, 'transactions'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: Transaction[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId ?? uid),
          personId: String(data.personId ?? ''),
          type: (data.type as TransactionType) ?? 'GIVEN',
          amount: Number(data.amount ?? 0),
          date: String(data.date ?? ''),
          description: String(data.description ?? ''),
          referenceNumber: String(data.referenceNumber ?? ''),
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });
      list.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        if (onError && e instanceof Error) onError(e);
      }
    }
  );
}

export function subscribePreferences(
  uid: string,
  onData: (prefs: UserPreferences) => void
): Unsubscribe {
  const path = `users/${uid}/settings/preferences`;
  const ref = doc(db, 'users', uid, 'settings', 'preferences');
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        onData({
          currencyCode: String(data.currencyCode || 'USD'),
          currencySymbol: String(data.currencySymbol || '$'),
        });
      } else {
        onData({ currencyCode: 'USD', currencySymbol: '$' });
      }
    },
    (error) => {
      console.error(`Preferences snapshot error (${path}):`, error);
    }
  );
}

export async function savePreferences(
  uid: string,
  prefs: UserPreferences
): Promise<void> {
  const path = `users/${uid}/settings/preferences`;
  const ref = doc(db, 'users', uid, 'settings', 'preferences');
  try {
    const snap = await getDoc(ref);
    const currencyCode = sanitizeText(prefs.currencyCode, 10) || 'USD';
    const currencySymbol = sanitizeText(prefs.currencySymbol, 10) || '$';

    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        settingType: 'preferences',
        currencyCode,
        currencySymbol,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        currencyCode,
        currencySymbol,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createPerson(uid: string, input: PersonInput): Promise<string> {
  const name = sanitizeText(input.name, 120);
  const code = sanitizeText(input.code, 40);
  if (!name) throw new ValidationError('Person name is required.');
  if (!code) throw new ValidationError('Unique person code is required.');
  if (!isValidPersonCode(code)) {
    throw new ValidationError(
      'Person code can contain letters, numbers, hyphens, underscores, dots, and spaces (max 40 characters).'
    );
  }

  const codeKey = normalizePersonCodeKey(code);
  const personRef = doc(collection(db, 'users', uid, 'persons'));
  const codeRef = doc(db, 'users', uid, 'personCodes', codeKey);
  const path = `users/${uid}/persons/${personRef.id}`;

  try {
    await runTransaction(db, async (tx) => {
      const existingCodeSnap = await tx.get(codeRef);
      if (existingCodeSnap.exists()) {
        throw new DuplicatePersonCodeError(code);
      }

      tx.set(personRef, {
        ownerId: uid,
        name,
        code,
        codeKey,
        phone: sanitizeText(input.phone, 30),
        place: sanitizeText(input.place, 200),
        email: sanitizeText(input.email, 160),
        notes: sanitizeText(input.notes, 1000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(codeRef, {
        ownerId: uid,
        personId: personRef.id,
        code,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    return personRef.id;
  } catch (error) {
    if (isPermissionOrFirestoreError(error)) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    throw error;
  }
}

export async function updatePerson(
  uid: string,
  personId: string,
  existingCodeKey: string,
  input: PersonInput
): Promise<void> {
  const name = sanitizeText(input.name, 120);
  const code = sanitizeText(input.code, 40);
  if (!name) throw new ValidationError('Person name is required.');
  if (!code) throw new ValidationError('Unique person code is required.');
  if (!isValidPersonCode(code)) {
    throw new ValidationError(
      'Person code can contain letters, numbers, hyphens, underscores, dots, and spaces (max 40 characters).'
    );
  }

  const newCodeKey = normalizePersonCodeKey(code);
  const personRef = doc(db, 'users', uid, 'persons', personId);
  const oldCodeRef = doc(db, 'users', uid, 'personCodes', existingCodeKey);
  const newCodeRef = doc(db, 'users', uid, 'personCodes', newCodeKey);
  const path = `users/${uid}/persons/${personId}`;

  try {
    await runTransaction(db, async (tx) => {
      if (newCodeKey !== existingCodeKey) {
        const newCodeSnap = await tx.get(newCodeRef);
        if (newCodeSnap.exists() && newCodeSnap.data().personId !== personId) {
          throw new DuplicatePersonCodeError(code);
        }
        tx.delete(oldCodeRef);
        tx.set(newCodeRef, {
          ownerId: uid,
          personId,
          code,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const sameCodeSnap = await tx.get(oldCodeRef);
        if (sameCodeSnap.exists()) {
          tx.update(oldCodeRef, {
            code,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(oldCodeRef, {
            ownerId: uid,
            personId,
            code,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      tx.update(personRef, {
        name,
        code,
        codeKey: newCodeKey,
        phone: sanitizeText(input.phone, 30),
        place: sanitizeText(input.place, 200),
        email: sanitizeText(input.email, 160),
        notes: sanitizeText(input.notes, 1000),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (isPermissionOrFirestoreError(error)) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    throw error;
  }
}

export async function deletePersonAndTransactions(
  uid: string,
  person: Person,
  relatedTransactionIds: string[]
): Promise<void> {
  const path = `users/${uid}/persons/${person.id}`;
  try {
    // Delete transactions in safe batches of 400
    const chunkSize = 400;
    for (let i = 0; i < relatedTransactionIds.length; i += chunkSize) {
      const chunk = relatedTransactionIds.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const txId of chunk) {
        batch.delete(doc(db, 'users', uid, 'transactions', txId));
      }
      await batch.commit();
    }

    // Delete person and their unique code reservation atomically
    const finalBatch = writeBatch(db);
    finalBatch.delete(doc(db, 'users', uid, 'persons', person.id));
    if (person.codeKey) {
      finalBatch.delete(doc(db, 'users', uid, 'personCodes', person.codeKey));
    }
    await finalBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createTransaction(
  uid: string,
  input: TransactionInput
): Promise<string> {
  if (!input.personId) throw new ValidationError('Please select a person.');
  const amount = parseAmount(input.amount);
  if (amount === null) {
    throw new ValidationError('Enter a valid positive amount greater than 0.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new ValidationError('Enter a valid date (YYYY-MM-DD).');
  }
  if (!['GIVEN', 'RECEIVED', 'PAYABLE', 'PAID'].includes(input.type)) {
    throw new ValidationError('Invalid transaction type.');
  }

  const txRef = doc(collection(db, 'users', uid, 'transactions'));
  const path = `users/${uid}/transactions/${txRef.id}`;

  try {
    await setDoc(txRef, {
      ownerId: uid,
      personId: input.personId,
      type: input.type,
      amount,
      date: input.date,
      description: sanitizeText(input.description, 500),
      referenceNumber: sanitizeText(input.referenceNumber, 80),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return txRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTransaction(
  uid: string,
  txId: string,
  input: TransactionInput
): Promise<void> {
  if (!input.personId) throw new ValidationError('Please select a person.');
  const amount = parseAmount(input.amount);
  if (amount === null) {
    throw new ValidationError('Enter a valid positive amount greater than 0.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new ValidationError('Enter a valid date (YYYY-MM-DD).');
  }
  if (!['GIVEN', 'RECEIVED', 'PAYABLE', 'PAID'].includes(input.type)) {
    throw new ValidationError('Invalid transaction type.');
  }

  const txRef = doc(db, 'users', uid, 'transactions', txId);
  const path = `users/${uid}/transactions/${txId}`;

  try {
    await updateDoc(txRef, {
      personId: input.personId,
      type: input.type,
      amount,
      date: input.date,
      description: sanitizeText(input.description, 500),
      referenceNumber: sanitizeText(input.referenceNumber, 80),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTransaction(uid: string, txId: string): Promise<void> {
  const path = `users/${uid}/transactions/${txId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'transactions', txId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface RestoreSummary {
  personsImported: number;
  personsSkipped: number;
  transactionsImported: number;
  transactionsSkipped: number;
}

export async function restoreFromBackup(
  uid: string,
  payload: BackupPayload,
  mode: 'merge' | 'overwrite',
  existingPersons: Person[],
  existingTransactions: Transaction[]
): Promise<RestoreSummary> {
  const path = `users/${uid}`;
  try {
    if (mode === 'overwrite') {
      // Clear existing transactions first, then persons + personCodes
      const allDeletes: Array<ReturnType<typeof doc>> = [];
      for (const tx of existingTransactions) {
        allDeletes.push(doc(db, 'users', uid, 'transactions', tx.id));
      }
      for (const p of existingPersons) {
        allDeletes.push(doc(db, 'users', uid, 'persons', p.id));
        if (p.codeKey) {
          allDeletes.push(doc(db, 'users', uid, 'personCodes', p.codeKey));
        }
      }
      for (let i = 0; i < allDeletes.length; i += 400) {
        const batch = writeBatch(db);
        for (const ref of allDeletes.slice(i, i + 400)) {
          batch.delete(ref);
        }
        await batch.commit();
      }
    }

    const activePersonsByCodeKey = new Map<string, string>();
    const activeTxFingerprints = new Set<string>();

    if (mode === 'merge') {
      for (const p of existingPersons) {
        activePersonsByCodeKey.set(p.codeKey, p.id);
      }
      for (const t of existingTransactions) {
        activeTxFingerprints.add(
          `${t.personId}|${t.type}|${t.amount}|${t.date}|${t.referenceNumber}|${t.description}`
        );
      }
    }

    const oldPersonIdToNewPersonId = new Map<string, string>();
    let personsImported = 0;
    let personsSkipped = 0;

    // Step 1: Commit Persons + PersonCodes atomically in batches (max 200 pairs = 400 writes per batch)
    const personsToCreate: Array<{
      newId: string;
      oldId: string;
      codeKey: string;
      data: Omit<Person, 'id' | 'createdAt' | 'updatedAt'>;
    }> = [];

    for (const p of payload.persons) {
      const code = sanitizeText(p.code, 40);
      const codeKey = normalizePersonCodeKey(code);
      if (!codeKey || !p.name.trim()) {
        personsSkipped += 1;
        continue;
      }

      if (activePersonsByCodeKey.has(codeKey)) {
        oldPersonIdToNewPersonId.set(p.id, activePersonsByCodeKey.get(codeKey)!);
        personsSkipped += 1;
        continue;
      }

      const newRef = doc(collection(db, 'users', uid, 'persons'));
      activePersonsByCodeKey.set(codeKey, newRef.id);
      oldPersonIdToNewPersonId.set(p.id, newRef.id);
      personsToCreate.push({
        newId: newRef.id,
        oldId: p.id,
        codeKey,
        data: {
          ownerId: uid,
          name: sanitizeText(p.name, 120),
          code,
          codeKey,
          phone: sanitizeText(p.phone, 30),
          place: sanitizeText(p.place, 200),
          email: sanitizeText(p.email, 160),
          notes: sanitizeText(p.notes, 1000),
        },
      });
    }

    for (let i = 0; i < personsToCreate.length; i += 200) {
      const chunk = personsToCreate.slice(i, i + 200);
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.set(doc(db, 'users', uid, 'persons', item.newId), {
          ...item.data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'users', uid, 'personCodes', item.codeKey), {
          ownerId: uid,
          personId: item.newId,
          code: item.data.code,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      personsImported += chunk.length;
    }

    // Step 2: Commit Transactions (now all referenced persons exist!)
    let transactionsImported = 0;
    let transactionsSkipped = 0;
    const txsToCreate: Array<{
      personId: string;
      type: TransactionType;
      amount: number;
      date: string;
      description: string;
      referenceNumber: string;
    }> = [];

    for (const tx of payload.transactions) {
      let resolvedPersonId = oldPersonIdToNewPersonId.get(tx.personId);
      if (!resolvedPersonId && tx.personCode) {
        const key = normalizePersonCodeKey(tx.personCode);
        resolvedPersonId = activePersonsByCodeKey.get(key);
      }
      const parsedAmount = parseAmount(tx.amount);
      if (!resolvedPersonId || parsedAmount === null || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
        transactionsSkipped += 1;
        continue;
      }

      const description = sanitizeText(tx.description, 500);
      const referenceNumber = sanitizeText(tx.referenceNumber, 80);
      const fingerprint = `${resolvedPersonId}|${tx.type}|${parsedAmount}|${tx.date}|${referenceNumber}|${description}`;
      if (activeTxFingerprints.has(fingerprint)) {
        transactionsSkipped += 1;
        continue;
      }
      activeTxFingerprints.add(fingerprint);
      txsToCreate.push({
        personId: resolvedPersonId,
        type: tx.type,
        amount: parsedAmount,
        date: tx.date,
        description,
        referenceNumber,
      });
    }

    for (let i = 0; i < txsToCreate.length; i += 400) {
      const chunk = txsToCreate.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const tx of chunk) {
        const newTxRef = doc(collection(db, 'users', uid, 'transactions'));
        batch.set(newTxRef, {
          ownerId: uid,
          personId: tx.personId,
          type: tx.type,
          amount: tx.amount,
          date: tx.date,
          description: tx.description,
          referenceNumber: tx.referenceNumber,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      transactionsImported += chunk.length;
    }

    if (payload.preferences) {
      await savePreferences(uid, payload.preferences);
    }

    return {
      personsImported,
      personsSkipped,
      transactionsImported,
      transactionsSkipped,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
