import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Delete, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PinApiError } from '../lib/pinService';

export function PinLockScreen() {
  const { user, pinStatus, unlockWithPin, logout } = useAuth();
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(pinStatus.lockedUntil);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const targetLength = pinStatus.pinLength;

  useEffect(() => {
    setLockedUntil(pinStatus.lockedUntil);
  }, [pinStatus.lockedUntil]);

  useEffect(() => {
    if (!lockedUntil) {
      setSecondsLeft(0);
      return;
    }
    const updateTimer = () => {
      const diff = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (diff <= 0) {
        setSecondsLeft(0);
        setLockedUntil(null);
        setErrorMsg(null);
      } else {
        setSecondsLeft(diff);
      }
    };
    updateTimer();
    const id = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  const submitPin = useCallback(
    async (value: string) => {
      if (value.length !== targetLength || verifying || secondsLeft > 0) return;
      setVerifying(true);
      setErrorMsg(null);
      try {
        await unlockWithPin(value);
      } catch (err) {
        setPin('');
        if (err instanceof PinApiError) {
          setErrorMsg(err.message);
          if (err.lockedUntil) setLockedUntil(err.lockedUntil);
        } else {
          setErrorMsg('Unable to verify PIN. Please try again.');
        }
      } finally {
        setVerifying(false);
      }
    },
    [targetLength, verifying, secondsLeft, unlockWithPin]
  );

  const appendDigit = useCallback(
    (digit: string) => {
      if (verifying || secondsLeft > 0) return;
      setErrorMsg(null);
      setPin((prev) => {
        if (prev.length >= targetLength) return prev;
        const next = prev + digit;
        if (next.length === targetLength) {
          void submitPin(next);
        }
        return next;
      });
    },
    [verifying, secondsLeft, targetLength, submitPin]
  );

  const deleteDigit = useCallback(() => {
    if (verifying) return;
    setPin((prev) => prev.slice(0, -1));
  }, [verifying]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        appendDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        deleteDigit();
      } else if (e.key === 'Escape') {
        setPin('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appendDigit, deleteDigit]);

  const formatCountdown = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#070B14] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#0D1424] border border-slate-800 rounded-xl p-7 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37]">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-100">SMART PATT BOOK Locked</h1>
          <p className="text-xs text-slate-400">
            Enter your {targetLength}-digit PIN to unlock {user?.email}
          </p>
        </div>

        {/* PIN Dot Indicators */}
        <div className="flex items-center justify-center gap-3 py-2">
          {Array.from({ length: targetLength }).map((_, idx) => {
            const filled = idx < pin.length;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                  filled
                    ? 'bg-[#D4AF37] border-[#D4AF37] scale-110'
                    : 'bg-transparent border-slate-600'
                }`}
              />
            );
          })}
        </div>

        {secondsLeft > 0 ? (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center space-y-1">
            <p className="font-semibold">Too many incorrect attempts</p>
            <p className="font-mono tabular-nums">
              Try again in {formatCountdown(secondsLeft)}
            </p>
          </div>
        ) : errorMsg ? (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Server-verified PIN protection</span>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={verifying || secondsLeft > 0}
              onClick={() => appendDigit(digit)}
              className="h-13 rounded-lg bg-[#121C32] border border-slate-800 hover:border-[#D4AF37]/40 hover:bg-[#17233D] text-lg font-mono font-semibold text-slate-100 transition-colors disabled:opacity-40"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            disabled={verifying || pin.length === 0}
            onClick={() => setPin('')}
            className="h-13 rounded-lg bg-[#0A101E] border border-slate-800 hover:bg-slate-800/70 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={verifying || secondsLeft > 0}
            onClick={() => appendDigit('0')}
            className="h-13 rounded-lg bg-[#121C32] border border-slate-800 hover:border-[#D4AF37]/40 hover:bg-[#17233D] text-lg font-mono font-semibold text-slate-100 transition-colors disabled:opacity-40"
          >
            0
          </button>
          <button
            type="button"
            disabled={verifying || pin.length === 0}
            onClick={deleteDigit}
            aria-label="Delete last digit"
            className="h-13 rounded-lg bg-[#0A101E] border border-slate-800 hover:bg-slate-800/70 text-slate-300 flex items-center justify-center transition-colors disabled:opacity-40"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            {verifying ? 'Verifying...' : 'Keyboard digits supported'}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-rose-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
