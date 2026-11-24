import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useLedger } from '../contexts/LedgerContext';
import { deleteTransaction } from '../lib/ledgerService';
import {
  formatDateDisplay,
  formatMoney,
  fromCents,
  toCents,
  TRANSACTION_TYPE_META,
} from '../lib/math';
import type { Transaction, TransactionType } from '../types/ledger';

interface TransactionsViewProps {
  onAddTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onSelectPerson: (personId: string) => void;
}

const PAGE_SIZE = 20;

export function TransactionsView({
  onAddTransaction,
  onEditTransaction,
  onSelectPerson,
}: TransactionsViewProps) {
  const { user } = useAuth();
  const { persons, transactions, personMap, preferences, notify } = useLedger();

  const [searchQuery, setSearchQuery] = useState('');
  const [personFilter, setPersonFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (personFilter !== 'ALL' && tx.personId !== personFilter) return false;
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) return false;
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo) return false;
      if (!q) return true;
      const person = personMap[tx.personId];
      return (
        tx.description.toLowerCase().includes(q) ||
        tx.referenceNumber.toLowerCase().includes(q) ||
        (person?.name.toLowerCase().includes(q) ?? false) ||
        (person?.code.toLowerCase().includes(q) ?? false)
      );
    });
  }, [transactions, personMap, searchQuery, personFilter, typeFilter, dateFrom, dateTo]);

  const filteredSummary = useMemo(() => {
    let given = 0;
    let received = 0;
    let payable = 0;
    let paid = 0;
    for (const tx of filteredTransactions) {
      const c = toCents(tx.amount);
      if (tx.type === 'GIVEN') given += c;
      else if (tx.type === 'RECEIVED') received += c;
      else if (tx.type === 'PAYABLE') payable += c;
      else if (tx.type === 'PAID') paid += c;
    }
    return {
      given: fromCents(given),
      received: fromCents(received),
      payable: fromCents(payable),
      paid: fromCents(paid),
    };
  }, [filteredTransactions]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredTransactions.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const hasActiveFilters = Boolean(
    searchQuery || personFilter !== 'ALL' || typeFilter !== 'ALL' || dateFrom || dateTo
  );

  const resetFilters = () => {
    setSearchQuery('');
    setPersonFilter('ALL');
    setTypeFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const confirmDelete = async () => {
    if (!user || !deletingTx) return;
    setIsDeleting(true);
    try {
      await deleteTransaction(user.uid, deletingTx.id);
      notify('success', 'Transaction deleted', 'Account balances recalculated.');
      setDeletingTx(null);
    } catch {
      notify('error', 'Delete failed', 'Could not delete transaction.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            Transactions Ledger
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {filteredTransactions.length} matching of {transactions.length} total entries
          </p>
        </div>
        <button
          type="button"
          onClick={onAddTransaction}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Transaction
        </button>
      </div>

      {/* Filters Panel */}
      <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="relative xl:col-span-2">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search person, code, reference, or notes..."
              className="w-full pl-10 pr-3 py-2 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <select
            value={personFilter}
            onChange={(e) => {
              setPersonFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by person"
            className="px-3 py-2 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-[#D4AF37]"
          >
            <option value="ALL">All Persons</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as 'ALL' | TransactionType);
              setPage(1);
            }}
            aria-label="Filter by transaction type"
            className="px-3 py-2 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-[#D4AF37]"
          >
            <option value="ALL">All Types</option>
            <option value="GIVEN">Given Money</option>
            <option value="RECEIVED">Received Money</option>
            <option value="PAYABLE">Payable (Owed)</option>
            <option value="PAID">Paid Back</option>
          </select>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              aria-label="From date"
              className="w-full px-2.5 py-2 text-xs font-mono bg-[#070B14] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-[#D4AF37]"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              aria-label="To date"
              className="w-full px-2.5 py-2 text-xs font-mono bg-[#070B14] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>

        {/* Filtered Totals Strip */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono tabular-nums">
            <span className="text-slate-400">
              Given:{' '}
              <strong className="text-emerald-400">
                {formatMoney(filteredSummary.given, preferences.currencySymbol)}
              </strong>
            </span>
            <span className="text-slate-400">
              Received:{' '}
              <strong className="text-sky-400">
                {formatMoney(filteredSummary.received, preferences.currencySymbol)}
              </strong>
            </span>
            <span className="text-slate-400">
              Payable:{' '}
              <strong className="text-amber-400">
                {formatMoney(filteredSummary.payable, preferences.currencySymbol)}
              </strong>
            </span>
            <span className="text-slate-400">
              Paid:{' '}
              <strong className="text-rose-400">
                {formatMoney(filteredSummary.paid, preferences.currencySymbol)}
              </strong>
            </span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 text-xs text-[#D4AF37] hover:text-[#E5C55C]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table / Mobile Cards */}
      <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-200">
              No transactions match your criteria
            </p>
            <p className="text-xs text-slate-400">
              {transactions.length === 0
                ? 'Record your first transaction to begin tracking balances.'
                : 'Clear or adjust your active filters to view entries.'}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-xs font-medium text-slate-400">
                    <th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-4">Person</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Reference</th>
                    <th className="py-3.5 px-4">Description</th>
                    <th className="py-3.5 px-4 text-right">Amount</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {pageItems.map((tx) => {
                    const person = personMap[tx.personId];
                    const meta = TRANSACTION_TYPE_META[tx.type];
                    return (
                      <tr key={tx.id} className="hover:bg-[#121C32]/60 transition-colors">
                        <td className="py-3 px-6 font-mono text-xs text-slate-400 whitespace-nowrap">
                          {formatDateDisplay(tx.date)}
                        </td>
                        <td className="py-3 px-4">
                          {person ? (
                            <button
                              type="button"
                              onClick={() => onSelectPerson(person.id)}
                              className="text-left group"
                            >
                              <span className="font-medium text-slate-100 group-hover:text-[#E5C55C]">
                                {person.name}
                              </span>
                              <span className="ml-2 text-xs font-mono text-slate-500">
                                {person.code}
                              </span>
                            </button>
                          ) : (
                            <span className="text-slate-500">Removed Person</span>
                          )}
                        </td>
                        <td className={`py-3 px-4 text-xs font-semibold ${meta.textClass}`}>
                          {meta.label}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-300">
                          {tx.referenceNumber || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-400 max-w-xs truncate">
                          {tx.description || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                          {formatMoney(tx.amount, preferences.currencySymbol)}
                        </td>
                        <td className="py-3 px-6 text-right whitespace-nowrap">
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
            <div className="lg:hidden divide-y divide-slate-800/70">
              {pageItems.map((tx) => {
                const person = personMap[tx.personId];
                const meta = TRANSACTION_TYPE_META[tx.type];
                return (
                  <div key={tx.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {person ? (
                          <button
                            type="button"
                            onClick={() => onSelectPerson(person.id)}
                            className="text-sm font-semibold text-slate-100 hover:text-[#E5C55C] truncate block"
                          >
                            {person.name}
                          </button>
                        ) : (
                          <span className="text-sm text-slate-500">Removed Person</span>
                        )}
                        <p className="text-xs text-slate-500 font-mono">
                          {person?.code ?? '—'} &middot; {formatDateDisplay(tx.date)}
                        </p>
                      </div>
                      <span className="font-mono tabular-nums text-sm font-bold text-slate-100 shrink-0">
                        {formatMoney(tx.amount, preferences.currencySymbol)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-semibold ${meta.textClass}`}>
                        {meta.label}
                      </span>
                      {tx.referenceNumber && (
                        <span className="font-mono text-slate-400">
                          {tx.referenceNumber}
                        </span>
                      )}
                    </div>

                    {tx.description && (
                      <p className="text-xs text-slate-400">{tx.description}</p>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-1">
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

            {totalPages > 1 && (
              <div className="px-5 py-3.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filteredTransactions.length)} of{' '}
                  {filteredTransactions.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-md border border-slate-800 hover:bg-slate-800 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-mono">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-md border border-slate-800 hover:bg-slate-800 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deletingTx)}
        title="Delete Transaction?"
        description={
          deletingTx
            ? `Permanently delete this ${TRANSACTION_TYPE_META[deletingTx.type].label} entry of ${formatMoney(
                deletingTx.amount,
                preferences.currencySymbol
              )}? Balances will update immediately.`
            : ''
        }
        confirmLabel="Delete Transaction"
        loading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingTx(null)}
      />
    </div>
  );
}
