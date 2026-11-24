import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createServer as createViteServer } from 'vite';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(configPath, 'utf-8')
);

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({ projectId: firebaseConfig.projectId });

const adminAuth = getAuth(adminApp);

const FIRESTORE_DATABASE_ID =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId.trim() !== ''
    ? firebaseConfig.firestoreDatabaseId
    : '(default)';

const SERVER_SECRET =
  process.env.PIN_PEPPER && process.env.PIN_PEPPER.trim().length >= 16
    ? process.env.PIN_PEPPER.trim()
    : crypto.randomBytes(32).toString('hex');

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const UNLOCK_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface RateLimitState {
  attempts: number;
  lockedUntil: number | null;
}

interface UnlockSessionState {
  nonce: string;
  expiresAt: number;
}

const rateLimits = new Map<string, RateLimitState>();
const unlockSessions = new Map<string, UnlockSessionState>();

function getRateLimit(uid: string): RateLimitState {
  const existing = rateLimits.get(uid);
  const now = Date.now();
  if (!existing) {
    return { attempts: 0, lockedUntil: null };
  }
  if (existing.lockedUntil && existing.lockedUntil <= now) {
    const reset = { attempts: 0, lockedUntil: null };
    rateLimits.set(uid, reset);
    return reset;
  }
  return existing;
}

function recordFailedAttempt(uid: string): RateLimitState {
  const state = getRateLimit(uid);
  const nextAttempts = state.attempts + 1;
  const lockedUntil =
    nextAttempts >= MAX_PIN_ATTEMPTS ? Date.now() + LOCKOUT_DURATION_MS : null;
  const nextState: RateLimitState = {
    attempts: nextAttempts,
    lockedUntil,
  };
  rateLimits.set(uid, nextState);
  return nextState;
}

function clearRateLimit(uid: string): void {
  rateLimits.delete(uid);
}

function hashPin(pin: string, salt: string): string {
  const derived = crypto.scryptSync(pin, `${salt}:${SERVER_SECRET}`, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return derived.toString('hex');
}

function verifyPinHash(pin: string, salt: string, storedHash: string): boolean {
  if (!salt || !storedHash) return false;
  const computed = hashPin(pin, salt);
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function issueUnlockToken(uid: string): string {
  const nonce = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + UNLOCK_TOKEN_TTL_MS;
  unlockSessions.set(uid, { nonce, expiresAt });
  const payload = `${uid}.${nonce}.${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

function isUnlockTokenValid(uid: string, token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const session = unlockSessions.get(uid);
  if (!session || session.expiresAt <= Date.now()) {
    unlockSessions.delete(uid);
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [tokenUid, nonce, expStr, sig] = parts;
  if (tokenUid !== uid || nonce !== session.nonce) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;

  const expectedSig = crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(`${tokenUid}.${nonce}.${expStr}`)
    .digest('hex');

  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expectedSig, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function revokeUnlockSession(uid: string): void {
  unlockSessions.delete(uid);
}

function isValidPinFormat(pin: unknown, length?: unknown): pin is string {
  if (typeof pin !== 'string') return false;
  if (length === 4) return /^\d{4}$/.test(pin);
  if (length === 6) return /^\d{6}$/.test(pin);
  return /^\d{4}$/.test(pin) || /^\d{6}$/.test(pin);
}

interface VerifiedCaller {
  uid: string;
  idToken: string;
  emailVerified: boolean;
}

async function authenticateRequest(req: Request): Promise<VerifiedCaller | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      idToken,
      emailVerified: Boolean(decoded.email_verified),
    };
  } catch {
    return null;
  }
}

interface StoredPinDoc {
  exists: boolean;
  pinEnabled: boolean;
  pinHash: string;
  pinSalt: string;
  pinLength: 4 | 6;
}

function firestoreDocPath(uid: string): string {
  return `projects/${firebaseConfig.projectId}/databases/${FIRESTORE_DATABASE_ID}/documents/users/${uid}/settings/pin`;
}

function firestoreRestBase(): string {
  return `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${FIRESTORE_DATABASE_ID}/documents`;
}

async function readPinDoc(uid: string, idToken: string): Promise<StoredPinDoc> {
  const url = `${firestoreRestBase()}/users/${encodeURIComponent(uid)}/settings/pin`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (resp.status === 404) {
    return {
      exists: false,
      pinEnabled: false,
      pinHash: '',
      pinSalt: '',
      pinLength: 4,
    };
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Firestore read failed (${resp.status}): ${body}`);
  }

  const json = (await resp.json()) as {
    fields?: Record<
      string,
      { stringValue?: string; booleanValue?: boolean; integerValue?: string; doubleValue?: number }
    >;
  };
  const fields = json.fields ?? {};
  const pinLengthRaw = Number(
    fields.pinLength?.integerValue ?? fields.pinLength?.doubleValue ?? 4
  );
  return {
    exists: true,
    pinEnabled: Boolean(fields.pinEnabled?.booleanValue),
    pinHash: fields.pinHash?.stringValue ?? '',
    pinSalt: fields.pinSalt?.stringValue ?? '',
    pinLength: pinLengthRaw === 6 ? 6 : 4,
  };
}

async function writePinDoc(
  uid: string,
  idToken: string,
  isUpdate: boolean,
  data: { pinEnabled: boolean; pinHash: string; pinSalt: string; pinLength: 4 | 6 }
): Promise<void> {
  const url = `${firestoreRestBase()}:commit`;
  const docName = firestoreDocPath(uid);

  const fields: Record<string, unknown> = {
    pinEnabled: { booleanValue: data.pinEnabled },
    pinHash: { stringValue: data.pinHash },
    pinSalt: { stringValue: data.pinSalt },
    pinLength: { integerValue: String(data.pinLength) },
  };

  if (!isUpdate) {
    fields.ownerId = { stringValue: uid };
    fields.settingType = { stringValue: 'pin' };
  }

  const writeOp: Record<string, unknown> = {
    update: {
      name: docName,
      fields,
    },
    updateTransforms: isUpdate
      ? [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]
      : [
          { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        ],
  };

  if (isUpdate) {
    writeOp.updateMask = {
      fieldPaths: ['pinEnabled', 'pinHash', 'pinSalt', 'pinLength'],
    };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes: [writeOp] }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Firestore write failed (${resp.status}): ${body}`);
  }
}

async function deletePinDoc(uid: string, idToken: string): Promise<void> {
  const url = `${firestoreRestBase()}/users/${encodeURIComponent(uid)}/settings/pin`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!resp.ok && resp.status !== 404) {
    const body = await resp.text();
    throw new Error(`Firestore delete failed (${resp.status}): ${body}`);
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  // Security headers for API responses
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // 1. Check PIN status & unlock session
  app.get('/api/pin/status', async (req: Request, res: Response) => {
    const caller = await authenticateRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!caller.emailVerified) {
      res.status(403).json({ error: 'Email verification required.' });
      return;
    }

    try {
      const doc = await readPinDoc(caller.uid, caller.idToken);
      const rl = getRateLimit(caller.uid);
      const unlockHeader = req.headers['x-pin-unlock-token'];
      const unlockToken =
        typeof unlockHeader === 'string' ? unlockHeader : undefined;

      if (!doc.exists || !doc.pinEnabled) {
        res.json({
          pinEnabled: false,
          pinLength: 4,
          unlocked: true,
          lockedUntil: null,
          remainingAttempts: MAX_PIN_ATTEMPTS,
        });
        return;
      }

      const unlocked = isUnlockTokenValid(caller.uid, unlockToken);
      res.json({
        pinEnabled: true,
        pinLength: doc.pinLength,
        unlocked,
        lockedUntil: rl.lockedUntil,
        remainingAttempts: Math.max(0, MAX_PIN_ATTEMPTS - rl.attempts),
      });
    } catch (err) {
      console.error('PIN status error:', err);
      res.status(500).json({ error: 'Unable to check PIN status.' });
    }
  });

  // 2. Set up a new 4-digit or 6-digit PIN
  app.post('/api/pin/setup', async (req: Request, res: Response) => {
    const caller = await authenticateRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!caller.emailVerified) {
      res.status(403).json({ error: 'Email verification required.' });
      return;
    }

    const { pin, confirmPin, pinLength } = req.body ?? {};
    const targetLen = pinLength === 6 ? 6 : 4;

    if (!isValidPinFormat(pin, targetLen)) {
      res.status(400).json({ error: `PIN must be exactly ${targetLen} numeric digits.` });
      return;
    }
    if (pin !== confirmPin) {
      res.status(400).json({ error: 'PIN and confirmation PIN do not match.' });
      return;
    }

    try {
      const existing = await readPinDoc(caller.uid, caller.idToken);
      if (existing.exists && existing.pinEnabled) {
        res.status(409).json({
          error: 'A PIN is already active. Use Change PIN instead.',
        });
        return;
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const pinHash = hashPin(pin, salt);

      await writePinDoc(caller.uid, caller.idToken, existing.exists, {
        pinEnabled: true,
        pinHash,
        pinSalt: salt,
        pinLength: targetLen,
      });

      clearRateLimit(caller.uid);
      const unlockToken = issueUnlockToken(caller.uid);

      res.json({
        pinEnabled: true,
        pinLength: targetLen,
        unlocked: true,
        unlockToken,
        lockedUntil: null,
        remainingAttempts: MAX_PIN_ATTEMPTS,
      });
    } catch (err) {
      console.error('PIN setup error:', err);
      res.status(500).json({ error: 'Failed to save PIN securely.' });
    }
  });

  // 3. Verify PIN to unlock book (with rate limiting)
  app.post('/api/pin/verify', async (req: Request, res: Response) => {
    const caller = await authenticateRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!caller.emailVerified) {
      res.status(403).json({ error: 'Email verification required.' });
      return;
    }

    const rl = getRateLimit(caller.uid);
    if (rl.lockedUntil && rl.lockedUntil > Date.now()) {
      const secondsRemaining = Math.ceil((rl.lockedUntil - Date.now()) / 1000);
      res.status(429).json({
        error: `Too many incorrect attempts. Try again in ${secondsRemaining} seconds.`,
        lockedUntil: rl.lockedUntil,
        remainingAttempts: 0,
      });
      return;
    }

    const { pin } = req.body ?? {};
    if (!isValidPinFormat(pin)) {
      res.status(400).json({ error: 'Enter a valid 4-digit or 6-digit PIN.' });
      return;
    }

    try {
      const doc = await readPinDoc(caller.uid, caller.idToken);
      if (!doc.exists || !doc.pinEnabled) {
        res.json({
          pinEnabled: false,
          pinLength: 4,
          unlocked: true,
          unlockToken: null,
          lockedUntil: null,
          remainingAttempts: MAX_PIN_ATTEMPTS,
        });
        return;
      }

      const matched = verifyPinHash(pin, doc.pinSalt, doc.pinHash);
      if (!matched) {
        const updatedRl = recordFailedAttempt(caller.uid);
        const remaining = Math.max(0, MAX_PIN_ATTEMPTS - updatedRl.attempts);
        if (updatedRl.lockedUntil) {
          res.status(429).json({
            error: 'Too many incorrect PIN attempts. Access temporarily locked for 5 minutes.',
            lockedUntil: updatedRl.lockedUntil,
            remainingAttempts: 0,
          });
          return;
        }
        res.status(401).json({
          error: `Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
          lockedUntil: null,
          remainingAttempts: remaining,
        });
        return;
      }

      clearRateLimit(caller.uid);
      const unlockToken = issueUnlockToken(caller.uid);
      res.json({
        pinEnabled: true,
        pinLength: doc.pinLength,
        unlocked: true,
        unlockToken,
        lockedUntil: null,
        remainingAttempts: MAX_PIN_ATTEMPTS,
      });
    } catch (err) {
      console.error('PIN verify error:', err);
      res.status(500).json({ error: 'Unable to verify PIN right now.' });
    }
  });

  // 4. Change existing PIN (requires current PIN verification)
  app.post('/api/pin/change', async (req: Request, res: Response) => {
    const caller = await authenticateRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!caller.emailVerified) {
      res.status(403).json({ error: 'Email verification required.' });
      return;
    }

    const rl = getRateLimit(caller.uid);
    if (rl.lockedUntil && rl.lockedUntil > Date.now()) {
      const secondsRemaining = Math.ceil((rl.lockedUntil - Date.now()) / 1000);
      res.status(429).json({
        error: `Too many incorrect attempts. Try again in ${secondsRemaining} seconds.`,
        lockedUntil: rl.lockedUntil,
        remainingAttempts: 0,
      });
      return;
    }

    const { currentPin, newPin, confirmPin, pinLength } = req.body ?? {};
    const targetLen = pinLength === 6 ? 6 : 4;

    if (!isValidPinFormat(currentPin)) {
      res.status(400).json({ error: 'Current PIN is required.' });
      return;
    }
    if (!isValidPinFormat(newPin, targetLen)) {
      res.status(400).json({ error: `New PIN must be exactly ${targetLen} numeric digits.` });
      return;
    }
    if (newPin !== confirmPin) {
      res.status(400).json({ error: 'New PIN and confirmation PIN do not match.' });
      return;
    }

    try {
      const doc = await readPinDoc(caller.uid, caller.idToken);
      if (!doc.exists || !doc.pinEnabled) {
        res.status(404).json({ error: 'No PIN is currently configured.' });
        return;
      }

      const matched = verifyPinHash(currentPin, doc.pinSalt, doc.pinHash);
      if (!matched) {
        const updatedRl = recordFailedAttempt(caller.uid);
        const remaining = Math.max(0, MAX_PIN_ATTEMPTS - updatedRl.attempts);
        res.status(updatedRl.lockedUntil ? 429 : 401).json({
          error: updatedRl.lockedUntil
            ? 'Too many incorrect PIN attempts. Locked for 5 minutes.'
            : `Current PIN is incorrect. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
          lockedUntil: updatedRl.lockedUntil,
          remainingAttempts: remaining,
        });
        return;
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const pinHash = hashPin(newPin, salt);

      await writePinDoc(caller.uid, caller.idToken, true, {
        pinEnabled: true,
        pinHash,
        pinSalt: salt,
        pinLength: targetLen,
      });

      clearRateLimit(caller.uid);
      const unlockToken = issueUnlockToken(caller.uid);
      res.json({
        pinEnabled: true,
        pinLength: targetLen,
        unlocked: true,
        unlockToken,
        lockedUntil: null,
        remainingAttempts: MAX_PIN_ATTEMPTS,
      });
    } catch (err) {
      console.error('PIN change error:', err);
      res.status(500).json({ error: 'Failed to update PIN.' });
    }
  });

  // 5. Disable PIN (requires current PIN verification)
  app.post('/api/pin/disable', async (req: Request, res: Response) => {
    const caller = await authenticateRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!caller.emailVerified) {
      res.status(403).json({ error: 'Email verification required.' });
      return;
    }

    const rl = getRateLimit(caller.uid);
    if (rl.lockedUntil && rl.lockedUntil > Date.now()) {
      const secondsRemaining = Math.ceil((rl.lockedUntil - Date.now()) / 1000);
      res.status(429).json({
        error: `Too many incorrect attempts. Try again in ${secondsRemaining} seconds.`,
        lockedUntil: rl.lockedUntil,
        remainingAttempts: 0,
      });
      return;
    }

    const { currentPin } = req.body ?? {};
    if (!isValidPinFormat(currentPin)) {
      res.status(400).json({ error: 'Current PIN is required.' });
      return;
    }

    try {
      const doc = await readPinDoc(caller.uid, caller.idToken);
      if (!doc.exists || !doc.pinEnabled) {
        res.json({
          pinEnabled: false,
          pinLength: 4,
          unlocked: true,
          lockedUntil: null,
          remainingAttempts: MAX_PIN_ATTEMPTS,
        });
        return;
      }

      const matched = verifyPinHash(currentPin, doc.pinSalt, doc.pinHash);
      if (!matched) {
        const updatedRl = recordFailedAttempt(caller.uid);
        const remaining = Math.max(0, MAX_PIN_ATTEMPTS - updatedRl.attempts);
        res.status(updatedRl.lockedUntil ? 429 : 401).json({
          error: updatedRl.lockedUntil
            ? 'Too many incorrect PIN attempts. Locked for 5 minutes.'
            : `Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
          lockedUntil: updatedRl.lockedUntil,
          remainingAttempts: remaining,
        });
        return;
      }

      await deletePinDoc(caller.uid, caller.idToken);
      clearRateLimit(caller.uid);
      revokeUnlockSession(caller.uid);

      res.json({
        pinEnabled: false,
        pinLength: 4,
        unlocked: true,
        lockedUntil: null,
        remainingAttempts: MAX_PIN_ATTEMPTS,
      });
    } catch (err) {
      console.error('PIN disable error:', err);
      res.status(500).json({ error: 'Failed to disable PIN lock.' });
    }
  });

  // 6. Lock Book immediately (revokes server unlock session)
  app.post('/api/pin/lock', async (req: Request, res: Response) => {
    const caller = await authenticateRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    revokeUnlockSession(caller.uid);
    res.json({ locked: true });
  });

  // Serve Vite in dev or static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SMART PATT BOOK server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
