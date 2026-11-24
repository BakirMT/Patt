import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLedger } from '../contexts/LedgerContext';
import {
  createPerson,
  DuplicatePersonCodeError,
  updatePerson,
  ValidationError,
} from '../lib/ledgerService';
import { isValidPersonCode, normalizePersonCodeKey } from '../lib/math';
import type { Person } from '../types/ledger';

interface PersonModalProps {
  open: boolean;
  editingPerson: Person | null;
  onClose: () => void;
  onSaved?: (personId: string) => void;
}

export function PersonModal({
  open,
  editingPerson,
  onClose,
  onSaved,
}: PersonModalProps) {
  const { user } = useAuth();
  const { persons, notify } = useLedger();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    if (editingPerson) {
      setName(editingPerson.name);
      setCode(editingPerson.code);
      setPhone(editingPerson.phone);
      setPlace(editingPerson.place);
      setEmail(editingPerson.email);
      setNotes(editingPerson.notes);
    } else {
      // Never auto-generate person code: user must manually enter it
      setName('');
      setCode('');
      setPhone('');
      setPlace('');
      setEmail('');
      setNotes('');
    }
  }, [open, editingPerson]);

  const duplicatePerson = useMemo(() => {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const key = normalizePersonCodeKey(trimmed);
    return (
      persons.find(
        (p) => p.codeKey === key && p.id !== editingPerson?.id
      ) ?? null
    );
  }, [code, persons, editingPerson]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Person name is required.');
      return;
    }
    if (!code.trim()) {
      setErrorMsg('Please enter a unique person code manually (e.g. ALI-001).');
      return;
    }
    if (!isValidPersonCode(code)) {
      setErrorMsg(
        'Person code can only use letters, numbers, hyphens, underscores, dots, or spaces (max 40 chars).'
      );
      return;
    }
    if (duplicatePerson) {
      setErrorMsg(
        `Person code "${code.trim()}" is already used by ${duplicatePerson.name}. Enter a different code.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim(),
        phone: phone.trim(),
        place: place.trim(),
        email: email.trim(),
        notes: notes.trim(),
      };

      if (editingPerson) {
        await updatePerson(user.uid, editingPerson.id, editingPerson.codeKey, payload);
        notify('success', 'Person updated', `${payload.name} (${payload.code})`);
        onSaved?.(editingPerson.id);
      } else {
        const newId = await createPerson(user.uid, payload);
        notify('success', 'Person added', `${payload.name} (${payload.code})`);
        onSaved?.(newId);
      }
      onClose();
    } catch (err) {
      if (err instanceof DuplicatePersonCodeError || err instanceof ValidationError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to save person. Please verify your connection and try again.');
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
      aria-labelledby="person-modal-title"
    >
      <div className="w-full max-w-lg bg-[#0D1424] border border-slate-800 rounded-xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 id="person-modal-title" className="text-base font-bold text-slate-100">
              {editingPerson ? 'Edit Person Profile' : 'Add New Person'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter a manual unique code to quickly find this person anytime.
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Person Name <span className="text-[#D4AF37]">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Muhammed Ali"
                required
                maxLength={120}
                className="w-full px-3.5 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Unique Person Code <span className="text-[#D4AF37]">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. ALI-001"
                required
                maxLength={40}
                className={`w-full px-3.5 py-2.5 text-sm font-mono bg-[#070B14] border rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none ${
                  duplicatePerson
                    ? 'border-rose-500 focus:border-rose-400'
                    : 'border-slate-800 focus:border-[#D4AF37]'
                }`}
              />
              {duplicatePerson ? (
                <p className="text-[11px] text-rose-400 mt-1">
                  Already assigned to {duplicatePerson.name}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 mt-1">
                  Manually entered; must be unique in your account.
                </p>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Phone Number <span className="text-slate-500">(Optional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 0100"
                maxLength={30}
                className="w-full px-3.5 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email <span className="text-slate-500">(Optional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@example.com"
                maxLength={160}
                className="w-full px-3.5 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Place / Address <span className="text-slate-500">(Optional)</span>
            </label>
            <input
              type="text"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="City, street, or business location"
              maxLength={200}
              className="w-full px-3.5 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Notes <span className="text-slate-500">(Optional)</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, account remarks, or reference details"
              maxLength={1000}
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
              disabled={submitting || Boolean(duplicatePerson)}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] transition-colors disabled:opacity-50"
            >
              {submitting
                ? 'Saving...'
                : editingPerson
                ? 'Save Changes'
                : 'Add Person'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
