import type { User } from 'firebase/auth';
import type { PinStatus } from '../types/ledger';

export interface PinActionResponse extends PinStatus {
  unlockToken?: string | null;
}

export class PinApiError extends Error {
  public readonly status: number;
  public readonly lockedUntil: number | null;
  public readonly remainingAttempts: number | null;

  constructor(
    message: string,
    status: number,
    lockedUntil: number | null = null,
    remainingAttempts: number | null = null
  ) {
    super(message);
    this.name = 'PinApiError';
    this.status = status;
    this.lockedUntil = lockedUntil;
    this.remainingAttempts = remainingAttempts;
  }
}

async function callPinApi<T>(
  user: User,
  endpoint: string,
  method: 'GET' | 'POST',
  unlockToken: string | null,
  body?: Record<string, unknown>
): Promise<T> {
  const idToken = await user.getIdToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
  };
  if (unlockToken) {
    headers['X-Pin-Unlock-Token'] = unlockToken;
  }
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const resp = await fetch(`/api/pin/${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    throw new PinApiError(
      typeof data.error === 'string' ? data.error : 'PIN request failed.',
      resp.status,
      typeof data.lockedUntil === 'number' ? data.lockedUntil : null,
      typeof data.remainingAttempts === 'number' ? data.remainingAttempts : null
    );
  }
  return data as T;
}

export function fetchPinStatus(
  user: User,
  unlockToken: string | null
): Promise<PinStatus> {
  return callPinApi<PinStatus>(user, 'status', 'GET', unlockToken);
}

export function setupPin(
  user: User,
  pin: string,
  confirmPin: string,
  pinLength: 4 | 6
): Promise<PinActionResponse> {
  return callPinApi<PinActionResponse>(user, 'setup', 'POST', null, {
    pin,
    confirmPin,
    pinLength,
  });
}

export function verifyPin(
  user: User,
  pin: string
): Promise<PinActionResponse> {
  return callPinApi<PinActionResponse>(user, 'verify', 'POST', null, { pin });
}

export function changePin(
  user: User,
  currentPin: string,
  newPin: string,
  confirmPin: string,
  pinLength: 4 | 6,
  unlockToken: string | null
): Promise<PinActionResponse> {
  return callPinApi<PinActionResponse>(user, 'change', 'POST', unlockToken, {
    currentPin,
    newPin,
    confirmPin,
    pinLength,
  });
}

export function disablePin(
  user: User,
  currentPin: string,
  unlockToken: string | null
): Promise<PinStatus> {
  return callPinApi<PinStatus>(user, 'disable', 'POST', unlockToken, {
    currentPin,
  });
}

export function lockBookSession(
  user: User,
  unlockToken: string | null
): Promise<{ locked: boolean }> {
  return callPinApi<{ locked: boolean }>(user, 'lock', 'POST', unlockToken);
}
