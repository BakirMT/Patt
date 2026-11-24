import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Mail,
  MapPin,
  Phone,
  Printer,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useLedger } from '../contexts/LedgerContext';
import {
  exportPersonAccountExcel,
  exportPersonStatementPDF,
} from '../lib/exportUtils';
import { deleteTransaction } from '../lib/ledgerService';
import {
  formatDateDisplay,
  formatMoney,
  getTodayISO,
  TRANSACTION_TYPE_META,
} from '../lib/math';
import type { Person, Transaction, TransactionType } from '../types/ledger';

interface PersonDetailViewProps {
  personId: string;
  onBack: () => void;
  onEditPerson: (person: Person) => void;
  onQuickTransaction: (personId: string, type: TransactionType) => void;
  onEditTransaction: (tx: Transaction) => void;
}

export function PersonDetailView({
  personId,
  onBack,
  onEditPerson,
  onQuickTransaction,
  onEditTransaction,
}: PersonDetailViewProps) {
  const { user } = useAuth();
  const { personMap, personBalances, transactions, preferences, notify } = useLedger();

  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const person = personMap[personId];
  const balance = personBalances[personId] ?? {
    personId,
    totalGiven: 0,
    totalReceived: 0,
    remainingReceivable: 0,
    totalPayablePrincipal: 0,
    totalPaid: 0,
    remainingPayable: 0,
    transactionCount: 0,
    lastTransactionDate: null,
  };

  const personTransactions = useMemo(
    () =>
      transactions.filter(
        (tx) =>
          tx.personId === personId &&
          (typeFilter === 'ALL' || tx.type === typeFilter)
      ),
    [transactions, personId, typeFilter]
  );

  const allPersonTransactions = useMemo(
    () => transactions.filter((tx) => tx.personId === personId),
    [transactions, personId]
  );

  if (!person) {
    return (
      <div className="bg-[#0D1424] border border-slate-800 rounded-xl p-8 text-center space-y-4">
        <p className="text-sm font-semibold text-slate-200">Person account not found</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#070B14]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Persons
        </button>
      </div>
    );
  }

  const handleDeleteTx = async () => {
    if (!user || !deletingTx) return;
    setIsDeleting(true);
    try {
      await deleteTransaction(user.uid, deletingTx.id);
      notify('success', 'Transaction deleted', 'Balances updated automatically.');
      setDeletingTx(null);
    } catch {
      notify('error', 'Delete failed', 'Unable to delete transaction.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportPDF = () => {
    exportPersonStatementPDF(
      person,
      balance,
      allPersonTransactions,
      preferences.currencySymbol,
      user?.displayName || user?.email || 'Account Owner'
    );
    notify('success', 'PDF statement exported', `${person.name} (${person.code})`);
  };

  const handleExportExcel = () => {
    exportPersonAccountExcel(
      person,
      balance,
      allPersonTransactions,
      preferences.currencySymbol
    );
    notify('success', 'Excel account exported', `${person.name} (${person.code})`);
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Statement Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100 transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Persons
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onEditPerson(person)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Person
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Statement
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 text-slate-200 hover:border-[#D4AF37]/50 hover:text-[#E5C55C] transition-colors whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 text-slate-200 hover:border-[#D4AF37]/50 hover:text-[#E5C55C] transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Print-only Statement Masthead */}
      <div className="hidden print-only border-b border-slate-300 pb-4 mb-4">
        <div className="flex justify-between items-baseline">
          <div>
            <h1 className="text-xl font-bold">SMART PATT BOOK — Account Statement</h1>
            <p className="text-xs text-slate-600 mt-1">
              Prepared by {user?.displayName || user?.email}
            </p>
          </div>
          <p className="text-xs font-mono text-slate-600">
            Statement Date: {formatDateDisplay(getTodayISO())}
          </p>
        </div>
      </div>

      {/* Person Profile Banner */}
      <section className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-6 print-surface">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-mono font-semibold text-[#D4AF37]">
                CODE: {person.code}
              </p>
              <h2 className="text-2xl font-bold text-slate-100 mt-0.5">
                {person.name}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
              {person.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  {person.phone}
                </span>
              )}
              {person.place && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  {person.place}
                </span>
              )}
              {person.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  {person.email}
                </span>
              )}
            </div>

            {person.notes && (
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed pt-1">
                {person.notes}
              </p>
            )}
          </div>

          {/* Direct Transaction Action Buttons */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 shrink-0 no-print">
            <button
              type="button"
              onClick={() => onQuickTransaction(person.id, 'GIVEN')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] transition-colors whitespace-nowrap"
            >
              <ArrowUpRight className="w-4 h-4" />
              Give Money
            </button>
            <button
              type="button"
              onClick={() => onQuickTransaction(person.id, 'RECEIVED')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-sky-500/15 border border-sky-500/35 text-sky-300 hover:bg-sky-500/25 transition-colors whitespace-nowrap"
            >
              <ArrowDownLeft className="w-4 h-4" />
              Receive Money
            </button>
            <button
              type="button"
              onClick={() => onQuickTransaction(person.id, 'PAYABLE')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium rounded-lg border border-amber-500/35 text-amber-300 hover:bg-amber-500/15 transition-colors whitespace-nowrap"
            >
              Record Payable
            </button>
            <button
              type="button"
              onClick={() => onQuickTransaction(person.id, 'PAID')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium rounded-lg border border-rose-500/35 text-rose-300 hover:bg-rose-500/15 transition-colors whitespace-nowrap"
            >
              Pay Payable
            </button>
          </div>
        </div>
      </section>

      {/* Strictly Separated Receivable & Payable Balance Grids */}
      <section className="grid lg:grid-cols-2 gap-4">
        {/* Receivable Ledger Summary */}
        <div className="bg-[#0D1424] border border-emerald-500/25 rounded-xl p-5 print-surface">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <h3 className="text-sm font-semibold text-emerald-300">
              Receivable Balance (Money You Gave)
            </h3>
            <span className="text-xs text-slate-500">Given &minus; Received</span>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4">
            <div>
              <p className="text-xs text-slate-400">Total Given</p>
              <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-100 mt-1">
                {formatMoney(balance.totalGiven, preferences.currencySymbol)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Total Received</p>
              <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-sky-400 mt-1">
                {formatMoney(balance.totalReceived, preferences.currencySymbol)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Remaining Receivable</p>
              <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-emerald-400 mt-1">
                {formatMoney(balance.remainingReceivable, preferences.currencySymbol)}
              </p>
            </div>
          </div>
        </div>

        {/* Payable Ledger Summary */}
        <div className="bg-[#0D1424] border border-amber-500/25 rounded-xl p-5 print-surface">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <h3 className="text-sm font-semibold text-amber-300">
              Payable Balance (Money You Owe)
            </h3>
            <span className="text-xs text-slate-500">Owed &minus; Paid</span>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4">
            <div>
              <p className="text-xs text-slate-400">Total Owed</p>
              <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-100 mt-1">
                {formatMoney(balance.totalPayablePrincipal, preferences.currencySymbol)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Total Paid</p>
              <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-rose-400 mt-1">
                {formatMoney(balance.totalPaid, preferences.currencySymbol)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Remaining Payable</p>
              <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-amber-400 mt-1">
                {formatMoney(balance.remainingPayable, preferences.currencySymbol)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Complete Transaction History */}
      <section className="bg-[#0D1424] border border-slate-800/90 rounded-xl overflow-hidden print-surface">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Complete Transaction History
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {personTransactions.length} showing of {allPersonTransactions.length} total entries
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#070B14] border border-slate-800 rounded-lg overflow-x-auto no-print">
            {(
              [
                ['ALL', 'All'],
                ['GIVEN', 'Given'],
                ['RECEIVED', 'Received'],
                ['PAYABLE', 'Payable'],
                ['PAID', 'Paid'],
              ] as Array<['ALL' | TransactionType, string]>
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setTypeFilter(val)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  typeFilter === val
                    ? 'bg-[#121C32] text-[#E5C55C]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {personTransactions.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-slate-300">
              No transactions found for this account
            </p>
            <p className="text-xs text-slate-500">
              Use Give Money, Receive Money, Record Payable, or Pay Payable above to add entries.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-xs font-medium text-slate-400">
                    <th className="py-3 px-6">Date</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Description / Notes</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-6 text-right no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {personTransactions.map((tx) => {
                    const meta = TRANSACTION_TYPE_META[tx.type];
                    return (
                      <tr key={tx.id} className="hover:bg-[#121C32]/60 transition-colors">
                        <td className="py-3 px-6 font-mono text-xs text-slate-400 whitespace-nowrap">
                          {formatDateDisplay(tx.date)}
                        </td>
                        <td className={`py-3 px-4 text-xs font-semibold ${meta.textClass}`}>
                          {meta.label}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-300">
                          {tx.referenceNumber || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-400 max-w-md">
                          {tx.description || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                          {formatMoney(tx.amount, preferences.currencySymbol)}
                        </td>
                        <td className="py-3 px-6 text-right whitespace-nowrap no-print">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditTransaction(tx)}
                              aria-label="Edit transaction"
                              className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingTx(tx)}
                              aria-label="Delete transaction"
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-800/70">
              {personTransactions.map((tx) => {
                const meta = TRANSACTION_TYPE_META[tx.type];
                return (
                  <div key={tx.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold ${meta.textClass}`}>
                        {meta.label}
                      </span>
                      <span className="font-mono tabular-nums text-sm font-bold text-slate-100">
                        {formatMoney(tx.amount, preferences.currencySymbol)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-mono">{formatDateDisplay(tx.date)}</span>
                      {tx.referenceNumber && (
                        <span className="font-mono text-slate-300">
                          Ref: {tx.referenceNumber}
                        </span>
                      )}
                    </div>
                    {tx.description && (
                      <p className="text-xs text-slate-400">{tx.description}</p>
                    )}
                    <div className="flex items-center justify-end gap-3 pt-1 no-print">
                      <button
                        type="button"
                        onClick={() => onEditTransaction(tx)}
                        className="text-xs text-slate-300 hover:text-[#E5C55C]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingTx(tx)}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Export Bar for convenience */}
      <div className="flex items-center justify-end gap-2 text-xs text-slate-500 no-print">
        <Download className="w-3.5 h-3.5" />
        <span>
          Statement exports include separate Receivable and Payable totals for audit accuracy.
        </span>
      </div>

      <ConfirmDialog
        open={Boolean(deletingTx)}
        title="Delete Transaction?"
        description={
          deletingTx
            ? `Delete this ${TRANSACTION_TYPE_META[deletingTx.type].label} entry of ${formatMoney(
                deletingTx.amount,
                preferences.currencySymbol
              )} from ${formatDateDisplay(deletingTx.date)}? Balances will recalculate automatically.`
            : ''
        }
        confirmLabel="Delete Transaction"
        loading={isDeleting}
        onConfirm={handleDeleteTx}
        onCancel={() => setDeletingTx(null)}
      />
    </div>
  );
}
