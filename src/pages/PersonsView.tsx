import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useLedger } from '../contexts/LedgerContext';
import { deletePersonAndTransactions } from '../lib/ledgerService';
import { formatMoney, normalizePersonCodeKey } from '../lib/math';
import type { Person } from '../types/ledger';

interface PersonsViewProps {
  onSelectPerson: (personId: string) => void;
  onAddPerson: () => void;
  onEditPerson: (person: Person) => void;
}

type BalanceFilter = 'all' | 'receivable' | 'payable' | 'settled';
type SortKey = 'name' | 'code' | 'receivable-desc' | 'payable-desc' | 'recent';

const PAGE_SIZE = 15;

export function PersonsView({
  onSelectPerson,
  onAddPerson,
  onEditPerson,
}: PersonsViewProps) {
  const { user } = useAuth();
  const { persons, transactions, personBalances, preferences, notify } = useLedger();

  const [searchQuery, setSearchQuery] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [page, setPage] = useState(1);
  const [deletingPerson, setDeletingPerson] = useState<Person | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const exactCodeMatch = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return null;
    const key = normalizePersonCodeKey(trimmed);
    return persons.find((p) => p.codeKey === key) ?? null;
  }, [persons, searchQuery]);

  const filteredPersons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = persons.filter((p) => {
      const bal = personBalances[p.id];
      const rec = bal?.remainingReceivable ?? 0;
      const pay = bal?.remainingPayable ?? 0;

      if (balanceFilter === 'receivable' && rec <= 0) return false;
      if (balanceFilter === 'payable' && pay <= 0) return false;
      if (balanceFilter === 'settled' && (rec !== 0 || pay !== 0)) return false;

      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.place.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      const balA = personBalances[a.id];
      const balB = personBalances[b.id];
      switch (sortBy) {
        case 'code':
          return a.code.localeCompare(b.code);
        case 'receivable-desc':
          return (balB?.remainingReceivable ?? 0) - (balA?.remainingReceivable ?? 0);
        case 'payable-desc':
          return (balB?.remainingPayable ?? 0) - (balA?.remainingPayable ?? 0);
        case 'recent':
          return (balB?.lastTransactionDate ?? '').localeCompare(
            balA?.lastTransactionDate ?? ''
          );
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [persons, personBalances, searchQuery, balanceFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredPersons.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredPersons.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const relatedTxCountForDelete = useMemo(() => {
    if (!deletingPerson) return 0;
    return transactions.filter((t) => t.personId === deletingPerson.id).length;
  }, [deletingPerson, transactions]);

  const confirmDeletePerson = async () => {
    if (!user || !deletingPerson) return;
    setIsDeleting(true);
    try {
      const relatedIds = transactions
        .filter((t) => t.personId === deletingPerson.id)
        .map((t) => t.id);
      await deletePersonAndTransactions(user.uid, deletingPerson, relatedIds);
      notify(
        'success',
        'Person deleted',
        `Removed ${deletingPerson.name} (${deletingPerson.code}) and ${relatedIds.length} transaction(s).`
      );
      setDeletingPerson(null);
    } catch {
      notify('error', 'Delete failed', 'Unable to delete person right now.');
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
            Persons Directory
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {persons.length} {persons.length === 1 ? 'account' : 'accounts'} &middot; Search by full name or unique person code
          </p>
        </div>

        <button
          type="button"
          onClick={onAddPerson}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] transition-colors whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          Add Person
        </button>
      </div>

      {/* Search, Filter & Sort Toolbar */}
      <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Person Name or Unique Code (e.g. ALI-001)..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#070B14] border border-slate-800 rounded-lg">
              {(
                [
                  ['all', 'All'],
                  ['receivable', 'Receivable'],
                  ['payable', 'Payable'],
                  ['settled', 'Settled'],
                ] as Array<[BalanceFilter, string]>
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setBalanceFilter(val);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    balanceFilter === val
                      ? 'bg-[#121C32] text-[#E5C55C]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort persons"
              className="px-3 py-2 text-xs bg-[#070B14] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="name">Sort: Name (A–Z)</option>
              <option value="code">Sort: Code (A–Z)</option>
              <option value="receivable-desc">Sort: Highest Receivable</option>
              <option value="payable-desc">Sort: Highest Payable</option>
              <option value="recent">Sort: Recent Activity</option>
            </select>
          </div>
        </div>

        {/* Exact Person Code Direct Match Callout */}
        {exactCodeMatch && (
          <div className="p-4 rounded-lg bg-[#121C32] border border-[#D4AF37]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-[#D4AF37]">
                Exact Person Code Match
              </p>
              <p className="text-sm font-semibold text-slate-100">
                {exactCodeMatch.name}{' '}
                <span className="font-mono text-xs text-slate-400 ml-1">
                  ({exactCodeMatch.code})
                </span>
              </p>
              <p className="text-xs text-slate-400">
                Receivable:{' '}
                <span className="font-mono tabular-nums text-emerald-400">
                  {formatMoney(
                    personBalances[exactCodeMatch.id]?.remainingReceivable ?? 0,
                    preferences.currencySymbol
                  )}
                </span>{' '}
                &middot; Payable:{' '}
                <span className="font-mono tabular-nums text-amber-400">
                  {formatMoney(
                    personBalances[exactCodeMatch.id]?.remainingPayable ?? 0,
                    preferences.currencySymbol
                  )}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectPerson(exactCodeMatch.id)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] whitespace-nowrap shrink-0"
            >
              <Eye className="w-4 h-4" />
              Open Full Account
            </button>
          </div>
        )}
      </div>

      {/* Directory Table / Cards */}
      <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl overflow-hidden">
        {filteredPersons.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-200">
              {persons.length === 0 ? 'No persons added yet' : 'No matching persons found'}
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {persons.length === 0
                ? 'Start building your book by adding a person with a manually assigned unique code like ALI-001.'
                : 'Try adjusting your search query or balance filter.'}
            </p>
            {persons.length === 0 && (
              <button
                type="button"
                onClick={onAddPerson}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] mt-1"
              >
                <UserPlus className="w-4 h-4" />
                Add First Person
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-xs font-medium text-slate-400">
                    <th className="py-3.5 px-6">Person</th>
                    <th className="py-3.5 px-4">Code</th>
                    <th className="py-3.5 px-4">Contact / Place</th>
                    <th className="py-3.5 px-4 text-right">Receivable</th>
                    <th className="py-3.5 px-4 text-right">Payable</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {pageItems.map((person) => {
                    const bal = personBalances[person.id];
                    const rec = bal?.remainingReceivable ?? 0;
                    const pay = bal?.remainingPayable ?? 0;
                    return (
                      <tr
                        key={person.id}
                        className="hover:bg-[#121C32]/60 transition-colors"
                      >
                        <td className="py-3.5 px-6">
                          <button
                            type="button"
                            onClick={() => onSelectPerson(person.id)}
                            className="text-left group"
                          >
                            <p className="font-semibold text-slate-100 group-hover:text-[#E5C55C] transition-colors">
                              {person.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {bal?.transactionCount ?? 0} transactions
                            </p>
                          </button>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-[#D4AF37] whitespace-nowrap">
                          {person.code}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-400">
                          <p className="truncate max-w-[220px]">
                            {person.phone || '—'}
                          </p>
                          {person.place && (
                            <p className="text-slate-500 truncate max-w-[220px]">
                              {person.place}
                            </p>
                          )}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            rec > 0 ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {formatMoney(rec, preferences.currencySymbol)}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            pay > 0 ? 'text-amber-400' : 'text-slate-400'
                          }`}
                        >
                          {formatMoney(pay, preferences.currencySymbol)}
                        </td>
                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectPerson(person.id)}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-700 text-slate-200 hover:border-[#D4AF37]/50 hover:text-[#E5C55C] transition-colors"
                            >
                              Account
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditPerson(person)}
                              aria-label={`Edit ${person.name}`}
                              className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingPerson(person)}
                              aria-label={`Delete ${person.name}`}
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
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

            {/* Mobile & Tablet Cards */}
            <div className="lg:hidden divide-y divide-slate-800/70">
              {pageItems.map((person) => {
                const bal = personBalances[person.id];
                const rec = bal?.remainingReceivable ?? 0;
                const pay = bal?.remainingPayable ?? 0;
                return (
                  <div key={person.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectPerson(person.id)}
                        className="text-left min-w-0"
                      >
                        <p className="text-sm font-semibold text-slate-100 truncate">
                          {person.name}
                        </p>
                        <p className="text-xs font-mono text-[#D4AF37] mt-0.5">
                          {person.code}
                          {person.place ? ` · ${person.place}` : ''}
                        </p>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditPerson(person)}
                          aria-label={`Edit ${person.name}`}
                          className="p-2 text-slate-400 hover:text-slate-100"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingPerson(person)}
                          aria-label={`Delete ${person.name}`}
                          className="p-2 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/60 text-xs">
                      <div>
                        <p className="text-slate-500">Receivable</p>
                        <p
                          className={`font-mono tabular-nums font-semibold mt-0.5 ${
                            rec > 0 ? 'text-emerald-400' : 'text-slate-300'
                          }`}
                        >
                          {formatMoney(rec, preferences.currencySymbol)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Payable</p>
                        <p
                          className={`font-mono tabular-nums font-semibold mt-0.5 ${
                            pay > 0 ? 'text-amber-400' : 'text-slate-300'
                          }`}
                        >
                          {formatMoney(pay, preferences.currencySymbol)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectPerson(person.id)}
                      className="w-full py-2 text-xs font-medium rounded-lg border border-slate-800 text-slate-200 hover:border-[#D4AF37]/40 hover:text-[#E5C55C] transition-colors"
                    >
                      View Account &amp; History
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filteredPersons.length)} of{' '}
                  {filteredPersons.length}
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
        open={Boolean(deletingPerson)}
        title={`Delete ${deletingPerson?.name ?? 'Person'}?`}
        description={
          deletingPerson
            ? `This will permanently remove ${deletingPerson.name} (${deletingPerson.code}) and ${relatedTxCountForDelete} linked transaction(s). The person code "${deletingPerson.code}" will become available again. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete Person"
        loading={isDeleting}
        onConfirm={confirmDeletePerson}
        onCancel={() => setDeletingPerson(null)}
      />
    </div>
  );
}
