import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  KeyRound,
  Lock,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useLedger } from '../contexts/LedgerContext';
import {
  downloadBackupJSON,
  validateBackupJSON,
  type BackupValidationResult,
} from '../lib/exportUtils';
import { restoreFromBackup, savePreferences } from '../lib/ledgerService';
import { CURRENCY_OPTIONS } from '../lib/math';
import { PinApiError } from '../lib/pinService';

export function SecurityBackupView() {
  const {
    user,
    pinStatus,
    setupUserPin,
    changeUserPin,
    disableUserPin,
    lockBook,
  } = useAuth();
  const { persons, transactions, preferences, notify } = useLedger();

  // Currency preferences
  const [savingCurrency, setSavingCurrency] = useState(false);

  // PIN Setup state
  const [pinLength, setPinLength] = useState<4 | 6>(4);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [disableCurrentPin, setDisableCurrentPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Backup / Restore state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [backupValidation, setBackupValidation] =
    useState<BackupValidationResult | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [restoreMode, setRestoreMode] = useState<'merge' | 'overwrite'>('merge');
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleCurrencyChange = async (code: string) => {
    if (!user) return;
    const opt = CURRENCY_OPTIONS.find((c) => c.code === code);
    if (!opt) return;
    setSavingCurrency(true);
    try {
      await savePreferences(user.uid, {
        currencyCode: opt.code,
        currencySymbol: opt.symbol,
      });
      notify('success', 'Currency updated', `Ledger currency set to ${opt.label}`);
    } catch {
      notify('error', 'Update failed', 'Could not save currency preference.');
    } finally {
      setSavingCurrency(false);
    }
  };

  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (newPin.length !== pinLength || !/^\d+$/.test(newPin)) {
      setPinError(`Enter exactly ${pinLength} numeric digits.`);
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('PIN and confirmation PIN do not match.');
      return;
    }
    setPinBusy(true);
    try {
      await setupUserPin(newPin, confirmPin, pinLength);
      setNewPin('');
      setConfirmPin('');
      notify(
        'success',
        'PIN lock enabled',
        `Your book is now protected by a server-verified ${pinLength}-digit PIN.`
      );
    } catch (err) {
      setPinError(
        err instanceof PinApiError ? err.message : 'Unable to enable PIN lock.'
      );
    } finally {
      setPinBusy(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (!/^\d{4}$|^\d{6}$/.test(currentPin)) {
      setPinError('Enter your current PIN.');
      return;
    }
    if (newPin.length !== pinLength || !/^\d+$/.test(newPin)) {
      setPinError(`New PIN must be exactly ${pinLength} numeric digits.`);
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PIN and confirmation PIN do not match.');
      return;
    }
    setPinBusy(true);
    try {
      await changeUserPin(currentPin, newPin, confirmPin, pinLength);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      notify('success', 'PIN updated', 'Your book lock PIN has been changed.');
    } catch (err) {
      setPinError(
        err instanceof PinApiError ? err.message : 'Unable to change PIN.'
      );
    } finally {
      setPinBusy(false);
    }
  };

  const handleDisablePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (!/^\d{4}$|^\d{6}$/.test(disableCurrentPin)) {
      setPinError('Enter your current PIN to disable PIN lock.');
      return;
    }
    setPinBusy(true);
    try {
      await disableUserPin(disableCurrentPin);
      setDisableCurrentPin('');
      notify('info', 'PIN lock disabled', 'You can re-enable PIN protection anytime.');
    } catch (err) {
      setPinError(
        err instanceof PinApiError ? err.message : 'Unable to disable PIN.'
      );
    } finally {
      setPinBusy(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    const text = await file.text();
    const result = validateBackupJSON(text);
    setBackupValidation(result);
  };

  const executeRestore = async () => {
    if (!user || !backupValidation?.valid || !backupValidation.payload) return;
    setRestoring(true);
    try {
      const summary = await restoreFromBackup(
        user.uid,
        backupValidation.payload,
        restoreMode,
        persons,
        transactions
      );
      notify(
        'success',
        'Backup restored successfully',
        `Imported ${summary.personsImported} person(s) and ${summary.transactionsImported} transaction(s). Skipped ${
          summary.personsSkipped + summary.transactionsSkipped
        } duplicate/invalid record(s).`
      );
      setBackupValidation(null);
      setSelectedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setConfirmOverwriteOpen(false);
    } catch {
      notify('error', 'Restore failed', 'Unable to restore backup records.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Security, PIN Lock &amp; Backup
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Manage your server-verified PIN lock, display currency, and JSON backup/restore archives.
        </p>
      </div>

      {/* Display Currency */}
      <section className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-100">
            Ledger Currency
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Applied to all dashboards, statements, and PDF exports across your account.
          </p>
        </div>
        <select
          value={preferences.currencyCode}
          disabled={savingCurrency}
          onChange={(e) => void handleCurrencyChange(e.target.value)}
          aria-label="Select ledger currency"
          className="px-3.5 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-[#D4AF37] min-w-[200px]"
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </section>

      {/* PIN Lock Management */}
      <section className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-[#D4AF37]/12 text-[#D4AF37] shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Application PIN Lock
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {pinStatus.pinEnabled
                  ? `Active (${pinStatus.pinLength}-digit PIN) · Hashed with scrypt on the server · Rate-limited after 5 failed attempts`
                  : 'Protect access to your financial book after login with a 4-digit or 6-digit PIN.'}
              </p>
            </div>
          </div>

          {pinStatus.pinEnabled && (
            <button
              type="button"
              onClick={() => void lockBook()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] transition-colors whitespace-nowrap shrink-0"
            >
              <Lock className="w-4 h-4" />
              Lock Book Now
            </button>
          )}
        </div>

        {pinError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{pinError}</span>
          </div>
        )}

        {!pinStatus.pinEnabled ? (
          <form onSubmit={handleSetupPin} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                PIN Length
              </label>
              <div className="inline-flex items-center gap-1 p-1 bg-[#070B14] border border-slate-800 rounded-lg">
                {([4, 6] as const).map((len) => (
                  <button
                    key={len}
                    type="button"
                    onClick={() => {
                      setPinLength(len);
                      setNewPin('');
                      setConfirmPin('');
                    }}
                    className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      pinLength === len
                        ? 'bg-[#121C32] text-[#E5C55C]'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {len}-Digit PIN
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  New PIN ({pinLength} digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={pinLength}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={pinLength === 4 ? '••••' : '••••••'}
                  required
                  className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Confirm PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={pinLength}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={pinLength === 4 ? '••••' : '••••••'}
                  required
                  className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={pinBusy}
              className="px-5 py-2.5 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] transition-colors disabled:opacity-50"
            >
              {pinBusy ? 'Securing PIN...' : `Enable ${pinLength}-Digit PIN Lock`}
            </button>
          </form>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Change PIN */}
            <form onSubmit={handleChangePin} className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-200">Change PIN</h4>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Current PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter current PIN"
                  required
                  className="w-full px-3.5 py-2 text-sm font-mono tracking-widest bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>New length:</span>
                {([4, 6] as const).map((len) => (
                  <button
                    key={len}
                    type="button"
                    onClick={() => {
                      setPinLength(len);
                      setNewPin('');
                      setConfirmPin('');
                    }}
                    className={`px-2.5 py-1 rounded border transition-colors ${
                      pinLength === len
                        ? 'border-[#D4AF37] text-[#E5C55C] bg-[#121C32]'
                        : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    {len} digits
                  </button>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    New PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={pinLength}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder={pinLength === 4 ? '••••' : '••••••'}
                    required
                    className="w-full px-3.5 py-2 text-sm font-mono tracking-widest bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Confirm New PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={pinLength}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder={pinLength === 4 ? '••••' : '••••••'}
                    required
                    className="w-full px-3.5 py-2 text-sm font-mono tracking-widest bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={pinBusy}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] disabled:opacity-50"
              >
                {pinBusy ? 'Updating...' : 'Update PIN'}
              </button>
            </form>

            {/* Disable PIN */}
            <form
              onSubmit={handleDisablePin}
              className="space-y-4 lg:pl-8 lg:border-l lg:border-slate-800/80"
            >
              <h4 className="text-sm font-semibold text-slate-200">
                Disable PIN Lock
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Confirm your current PIN to turn off the extra PIN lock screen after Firebase login.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Current PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={disableCurrentPin}
                  onChange={(e) =>
                    setDisableCurrentPin(e.target.value.replace(/\D/g, ''))
                  }
                  placeholder="Enter current PIN"
                  required
                  className="w-full px-3.5 py-2 text-sm font-mono tracking-widest bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-rose-400"
                />
              </div>
              <button
                type="submit"
                disabled={pinBusy}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                {pinBusy ? 'Verifying...' : 'Disable PIN Lock'}
              </button>
            </form>
          </div>
        )}
      </section>

      {/* Backup & Restore */}
      <section className="grid lg:grid-cols-2 gap-6">
        {/* Export Backup */}
        <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Download className="w-5 h-5 text-[#D4AF37]" />
              <h3 className="text-base font-semibold text-slate-100">
                Export Complete Backup
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Download a full JSON archive containing all {persons.length} person profile(s), {transactions.length} transaction(s), and your currency preferences.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              downloadBackupJSON(persons, transactions, preferences);
              notify(
                'success',
                'Backup downloaded',
                `${persons.length} persons and ${transactions.length} transactions exported.`
              );
            }}
            className="w-full py-2.5 px-4 rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download JSON Backup
          </button>
        </div>

        {/* Restore Backup */}
        <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-6 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <Upload className="w-5 h-5 text-[#D4AF37]" />
              <h3 className="text-base font-semibold text-slate-100">
                Restore from Backup JSON
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Select a valid SMART PATT BOOK JSON archive. Every record is validated before import and duplicate person codes or identical transactions are prevented.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => void handleFileChange(e)}
            className="block w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border file:border-slate-700 file:text-xs file:font-medium file:bg-[#121C32] file:text-slate-200 hover:file:border-[#D4AF37]/50 cursor-pointer"
          />

          {backupValidation && !backupValidation.valid && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{backupValidation.error}</span>
            </div>
          )}

          {backupValidation?.valid && backupValidation.payload && (
            <div className="p-4 rounded-lg bg-[#070B14] border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Validated: {selectedFileName}</span>
              </div>
              <p className="text-xs text-slate-300 font-mono">
                {backupValidation.payload.persons.length} persons &middot;{' '}
                {backupValidation.payload.transactions.length} transactions
              </p>

              {backupValidation.warnings.length > 0 && (
                <p className="text-[11px] text-amber-300">
                  {backupValidation.warnings.length} invalid or duplicate item(s) inside file will be skipped.
                </p>
              )}

              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="mt-0.5 accent-[#D4AF37]"
                  />
                  <span>
                    <strong className="text-slate-100">Merge (Recommended):</strong>{' '}
                    Keep existing records and import only non-duplicate persons &amp; transactions.
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="restoreMode"
                    checked={restoreMode === 'overwrite'}
                    onChange={() => setRestoreMode('overwrite')}
                    className="mt-0.5 accent-rose-500"
                  />
                  <span>
                    <strong className="text-rose-300">Overwrite Existing Data:</strong>{' '}
                    Replace all current persons and transactions with this backup file.
                  </span>
                </label>
              </div>

              <button
                type="button"
                disabled={restoring}
                onClick={() => {
                  if (restoreMode === 'overwrite') {
                    setConfirmOverwriteOpen(true);
                  } else {
                    void executeRestore();
                  }
                }}
                className="w-full py-2 px-4 rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] font-semibold text-xs transition-colors disabled:opacity-50"
              >
                {restoring
                  ? 'Restoring...'
                  : restoreMode === 'overwrite'
                  ? 'Overwrite & Restore Backup'
                  : 'Merge Backup Records'}
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck className="w-4 h-4 text-[#D4AF37] shrink-0" />
        <span>
          Your PIN is never stored in plain text. Verification and attempt rate limiting run on the server using salted scrypt hashes.
        </span>
      </div>

      <ConfirmDialog
        open={confirmOverwriteOpen}
        title="Overwrite All Existing Data?"
        description={`This will permanently erase your current ${persons.length} person(s) and ${transactions.length} transaction(s) and replace them with the selected backup archive. This action cannot be undone.`}
        confirmLabel="Yes, Overwrite Data"
        variant="danger"
        loading={restoring}
        onConfirm={() => void executeRestore()}
        onCancel={() => setConfirmOverwriteOpen(false)}
      />
    </div>
  );
}
