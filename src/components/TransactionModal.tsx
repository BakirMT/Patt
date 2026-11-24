import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Search, UserPlus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLedger } from '../contexts/LedgerContext';
import {
  createTransaction,
  updateTransaction,
  ValidationError,
} from '../lib/ledgerService';
import {
  formatMoney,
  getTodayISO,
  parseAmount,
  TRANSACTION_TYPE_META,
} from '../lib/math';
import type { Transaction, TransactionType } from '../types/ledger';

export interface TransactionModalPrefill {
  personId?: string;
  type?: TransactionType;
  amount?: string;
  description?: string;
}

interface TransactionModalProps {
  open: boolean;
  editingTransaction: Transaction | null;
  prefill?: TransactionModalPrefill | null;
  onClose: () => void;
  onRequestAddPerson?: () => void;
}

const TX_TYPES: TransactionType[] = ['GIVEN', 'RECEIVED', 'PAYABLE', 'PAID'];

export function TransactionModal({
  open,
  editingTransaction,
  prefill,
  onClose,
  onRequestAddPerson,
}: TransactionModalProps) {
  const { user } = useAuth();
  const { persons, personBalances, preferences, notify } = useLedger();

  const [personId, setPersonId] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [type, setType] = useState<TransactionType>('GIVEN');
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(getTodayISO());
  const [referenceNumber, setReferenceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setPersonSearch('');
    if (editingTransaction) {
      setPersonId(editingTransaction.personId);
      setType(editingTransaction.type);
      setAmountStr(String(editingTransaction.amount));
      setDate(editingTransaction.date);
      setReferenceNumber(editingTransaction.referenceNumber);
      setDescription(editingTransaction.description);
    } else {
      setPersonId(prefill?.personId || (persons.length === 1 ? persons[0].id : ''));
      setType(prefill?.type || 'GIVEN');
      setAmountStr(prefill?.amount || '');
      setDate(getTodayISO());
      setReferenceNumber('');
      setDescription(prefill?.description || '');
    }
  }, [open, editingTransaction, prefill, persons]);

  const filteredPersons = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    if (!q) return persons;
    return persons.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [persons, personSearch]);

  const selectedBalance = personId ? personBalances[personId] : undefined;

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);

    if (!personId) {
      setErrorMsg('Please select a person for this transaction.');
      return;
    }

    const parsed = parseAmount(amountStr);
    if (parsed === null) {
      setErrorMsg('Please enter a valid positive amount (e.g. 250.00).');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErrorMsg('Please choose a valid transaction date.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        personId,
        type,
        amount: parsed,
        date,
        referenceNumber: referenceNumber.trim(),
        description: description.trim(),
      };

      if (editingTransaction) {
        await updateTransaction(user.uid, editingTransaction.id, payload);
        notify(
          'success',
          'Transaction updated',
          `${TRANSACTION_TYPE_META[type].label} · ${formatMoney(parsed, preferences.currencySymbol)}`
        );
      } else {
        await createTransaction(user.uid, payload);
        notify(
          'success',
          'Transaction recorded',
          `${TRANSACTION_TYPE_META[type].label} · ${formatMoney(parsed, preferences.currencySymbol)}`
        );
      }
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Unable to save transaction. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
    >
      <div className="w-full max-w-lg bg-[#0D1424] border border-slate-800 rounded-xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 id="tx-modal-title" className="text-base font-bold text-slate-100">
              {editingTransaction ? 'Edit Transaction' : 'Record Transaction'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Receivable and payable balances update automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Person Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                Person <span className="text-[#D4AF37]">*</span>
              </label>
              {persons.length === 0 && onRequestAddPerson && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRequestAddPerson();
                  }}
                  className="inline-flex items-center gap-1 text-xs text-[#D4AF37] hover:text-[#E5C55C]"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add a person first
                </button>
              )}
            </div>

            {persons.length > 6 && (
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                  placeholder="Filter person by name or code..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#070B14] border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            )}

            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="">Select person by name or code...</option>
              {filteredPersons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>

            {selectedBalance && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>
                  Receivable:{' '}
                  <strong className="font-mono tabular-nums text-emerald-400">
                    {formatMoney(selectedBalance.remainingReceivable, preferences.currencySymbol)}
                  </strong>
                </span>
                <span aria-hidden="true">&middot;</span>
                <span>
                  Payable:{' '}
                  <strong className="font-mono tabular-nums text-amber-400">
                    {formatMoney(selectedBalance.remainingPayable, preferences.currencySymbol)}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {/* Transaction Type */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Transaction Type <span className="text-[#D4AF37]">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TX_TYPES.map((t) => {
                const meta = TRANSACTION_TYPE_META[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      active
                        ? `${meta.subtleBgClass} ${meta.borderClass} ${meta.textClass}`
                        : 'bg-[#070B14] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-xs font-semibold">{meta.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {t === 'GIVEN'
                        ? 'Adds to Receivable'
                        : t === 'RECEIVED'
                        ? 'Reduces Receivable'
                        : t === 'PAYABLE'
                        ? 'Adds to Payable'
                        : 'Reduces Payable'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount and Date */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Amount ({preferences.currencySymbol.trim()}) <span className="text-[#D4AF37]">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="9999999999.99"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                required
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Date <span className="text-[#D4AF37]">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          {/* Optional Reference Number */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Reference Number <span className="text-slate-500">(Optional)</span>
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Receipt #, bank ref, invoice #, or cheque #"
              maxLength={80}
              className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {/* Description / Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Description / Notes <span className="text-slate-500">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Purpose of transaction or settlement note"
              maxLength={500}
              className="w-full px-3.5 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37] resize-none"
            />
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || persons.length === 0}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] transition-colors disabled:opacity-50"
            >
              {submitting
                ? 'Saving...'
                : editingTransaction
                ? 'Update Transaction'
                : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
