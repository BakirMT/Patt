import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Plus,
  Search,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLedger } from '../contexts/LedgerContext';
import {
  formatDateDisplay,
  formatMoney,
  fromCents,
  toCents,
  TRANSACTION_TYPE_META,
} from '../lib/math';
import type { AppView } from '../types/ledger';

interface DashboardViewProps {
  onNavigate: (view: AppView) => void;
  onSelectPerson: (personId: string) => void;
  onAddPerson: () => void;
  onAddTransaction: () => void;
}

export function DashboardView({
  onNavigate,
  onSelectPerson,
  onAddPerson,
  onAddTransaction,
}: DashboardViewProps) {
  const {
    persons,
    transactions,
    personMap,
    personBalances,
    metrics,
    preferences,
    loading,
  } = useLedger();

  const [quickQuery, setQuickQuery] = useState('');

  const quickMatches = useMemo(() => {
    const q = quickQuery.trim().toLowerCase();
    if (!q) return [];
    return persons
      .filter(
        (p) =>
          p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [persons, quickQuery]);

  // Build last 6 months (or active months) financial aggregation from actual Firestore data
  const monthlyData = useMemo(() => {
    const map = new Map<
      string,
      {
        monthKey: string;
        label: string;
        givenCents: number;
        receivedCents: number;
        payableCents: number;
        paidCents: number;
      }
    >();

    // Seed last 6 calendar months so chart always has a clear timeline
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      map.set(key, {
        monthKey: key,
        label,
        givenCents: 0,
        receivedCents: 0,
        payableCents: 0,
        paidCents: 0,
      });
    }

    for (const tx of transactions) {
      if (!tx.date || tx.date.length < 7) continue;
      const key = tx.date.slice(0, 7);
      if (!map.has(key)) {
        const [y, m] = key.split('-').map(Number);
        const dt = new Date(y, (m || 1) - 1, 1);
        map.set(key, {
          monthKey: key,
          label: dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          givenCents: 0,
          receivedCents: 0,
          payableCents: 0,
          paidCents: 0,
        });
      }
      const bucket = map.get(key)!;
      const c = toCents(tx.amount);
      if (tx.type === 'GIVEN') bucket.givenCents += c;
      else if (tx.type === 'RECEIVED') bucket.receivedCents += c;
      else if (tx.type === 'PAYABLE') bucket.payableCents += c;
      else if (tx.type === 'PAID') bucket.paidCents += c;
    }

    return Array.from(map.values())
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .slice(-8)
      .map((item) => ({
        month: item.label,
        Given: fromCents(item.givenCents),
        Received: fromCents(item.receivedCents),
        Payable: fromCents(item.payableCents),
        Paid: fromCents(item.paidCents),
        Inflow: fromCents(item.receivedCents + item.payableCents),
        Outflow: fromCents(item.givenCents + item.paidCents),
      }));
  }, [transactions]);

  const recentTransactions = useMemo(() => transactions.slice(0, 8), [transactions]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-[#0D1424] border border-slate-800/80" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="h-80 rounded-xl bg-[#0D1424] border border-slate-800/80" />
          <div className="h-80 rounded-xl bg-[#0D1424] border border-slate-800/80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Row & Quick Code/Name Lookup */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            Financial Overview
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Live balances computed directly from your Firestore ledger records.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              placeholder="Search person by code (ALI-001) or name..."
              className="w-full pl-10 pr-3.5 py-2 text-sm bg-[#0D1424] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#D4AF37]"
            />
            {quickQuery.trim() && (
              <div className="absolute left-0 right-0 mt-1.5 bg-[#0D1424] border border-slate-700 rounded-lg shadow-2xl z-20 overflow-hidden">
                {quickMatches.length === 0 ? (
                  <p className="px-3.5 py-3 text-xs text-slate-400">
                    No person found matching &ldquo;{quickQuery}&rdquo;
                  </p>
                ) : (
                  quickMatches.map((p) => {
                    const bal = personBalances[p.id];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setQuickQuery('');
                          onSelectPerson(p.id);
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-[#121C32] border-b border-slate-800/70 last:border-b-0 flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100 truncate">
                            {p.name}
                          </p>
                          <p className="text-xs font-mono text-[#D4AF37]">{p.code}</p>
                        </div>
                        {bal && (
                          <div className="text-right shrink-0 text-[11px] font-mono tabular-nums">
                            <p className="text-emerald-400">
                              Rec: {formatMoney(bal.remainingReceivable, preferences.currencySymbol)}
                            </p>
                            <p className="text-amber-400">
                              Pay: {formatMoney(bal.remainingPayable, preferences.currencySymbol)}
                            </p>
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onAddPerson}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-700 text-slate-200 hover:border-[#D4AF37]/50 hover:text-[#E5C55C] transition-colors whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            Add Person
          </button>
        </div>
      </div>

      {/* 5 Executive KPI Cards — Receivable and Payable strictly separated */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Persons</span>
            <Users className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-100">
              {metrics.totalPersons}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {metrics.totalTransactionCount} recorded transactions
            </p>
          </div>
        </div>

        <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Money Given</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-100">
              {formatMoney(metrics.totalGiven, preferences.currencySymbol)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Principal given to persons</p>
          </div>
        </div>

        <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Money Received</span>
            <ArrowDownLeft className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-100">
              {formatMoney(metrics.totalReceived, preferences.currencySymbol)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Collected back from persons</p>
          </div>
        </div>

        <div className="bg-[#0D1424] border border-emerald-500/25 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-300">Total Receivable</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
              {formatMoney(metrics.totalReceivable, preferences.currencySymbol)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Given minus Received</p>
          </div>
        </div>

        <div className="bg-[#0D1424] border border-amber-500/25 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-300">Total Payable</span>
            <Wallet className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-400">
              {formatMoney(metrics.totalPayable, preferences.currencySymbol)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Owed {formatMoney(metrics.totalPayablePrincipal, preferences.currencySymbol)} &middot; Paid{' '}
              {formatMoney(metrics.totalPaid, preferences.currencySymbol)}
            </p>
          </div>
        </div>
      </section>

      {/* Charts Row */}
      <section className="grid lg:grid-cols-2 gap-6">
        {/* Monthly Financial Overview */}
        <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Monthly Financial Overview
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Money Given vs. Money Received by month
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="text-emerald-400 font-medium">Given</span>
              <span aria-hidden="true">/</span>
              <span className="text-sky-400 font-medium">Received</span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A101E',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#F1F5F9',
                  }}
                  formatter={(value: unknown) =>
                    formatMoney(Number(value ?? 0), preferences.currencySymbol)
                  }
                />
                <Bar dataKey="Given" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Received" fill="#38BDF8" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cash Inflow & Outflow Chart */}
        <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Income &amp; Expense Flow
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Inflows (Received + Payable) vs. Outflows (Given + Paid)
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="text-[#D4AF37] font-medium">Inflow</span>
              <span aria-hidden="true">/</span>
              <span className="text-rose-400 font-medium">Outflow</span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="goldInflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="roseOutflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A101E',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#F1F5F9',
                  }}
                  formatter={(value: unknown) =>
                    formatMoney(Number(value ?? 0), preferences.currencySymbol)
                  }
                />
                <Area
                  type="monotone"
                  dataKey="Inflow"
                  stroke="#D4AF37"
                  strokeWidth={2}
                  fill="url(#goldInflow)"
                />
                <Area
                  type="monotone"
                  dataKey="Outflow"
                  stroke="#F43F5E"
                  strokeWidth={2}
                  fill="url(#roseOutflow)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Recent Transactions */}
      <section className="bg-[#0D1424] border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-800/80 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Recent Transactions
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Latest entries recorded across your accounts
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#D4AF37] hover:text-[#E5C55C] transition-colors whitespace-nowrap shrink-0"
          >
            View All
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="p-10 text-center space-y-4">
            <p className="text-sm font-medium text-slate-200">
              No transactions recorded yet
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Add your first person with a unique code, then record money given, received, payable, or paid to see your live dashboard figures.
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={onAddPerson}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C]"
              >
                <UserPlus className="w-4 h-4" />
                Add First Person
              </button>
              {persons.length > 0 && (
                <button
                  type="button"
                  onClick={onAddTransaction}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800"
                >
                  <Plus className="w-4 h-4" />
                  Record Transaction
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-xs font-medium text-slate-400">
                    <th className="py-3 px-6">Date</th>
                    <th className="py-3 px-4">Person</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Reference / Note</th>
                    <th className="py-3 px-6 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {recentTransactions.map((tx) => {
                    const person = personMap[tx.personId];
                    const meta = TRANSACTION_TYPE_META[tx.type];
                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-[#121C32]/60 transition-colors"
                      >
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
                              <span className="font-medium text-slate-100 group-hover:text-[#E5C55C] transition-colors">
                                {person.name}
                              </span>
                              <span className="ml-2 text-xs font-mono text-slate-500">
                                {person.code}
                              </span>
                            </button>
                          ) : (
                            <span className="text-slate-500">Unknown Person</span>
                          )}
                        </td>
                        <td className={`py-3 px-4 text-xs font-semibold ${meta.textClass}`}>
                          {meta.label}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-400 max-w-xs truncate">
                          {tx.referenceNumber && (
                            <span className="font-mono text-slate-300 mr-2">
                              {tx.referenceNumber}
                            </span>
                          )}
                          {tx.description || (!tx.referenceNumber ? '—' : '')}
                        </td>
                        <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                          {formatMoney(tx.amount, preferences.currencySymbol)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-800/70">
              {recentTransactions.map((tx) => {
                const person = personMap[tx.personId];
                const meta = TRANSACTION_TYPE_META[tx.type];
                return (
                  <div key={tx.id} className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      {person ? (
                        <button
                          type="button"
                          onClick={() => onSelectPerson(person.id)}
                          className="text-sm font-semibold text-slate-100 hover:text-[#E5C55C] truncate"
                        >
                          {person.name}{' '}
                          <span className="font-mono text-xs text-slate-500">
                            {person.code}
                          </span>
                        </button>
                      ) : (
                        <span className="text-sm text-slate-500">Unknown</span>
                      )}
                      <span className="font-mono tabular-nums text-sm font-bold text-slate-100 shrink-0">
                        {formatMoney(tx.amount, preferences.currencySymbol)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className={`font-medium ${meta.textClass}`}>
                        {meta.label}
                      </span>
                      <span className="font-mono">{formatDateDisplay(tx.date)}</span>
                    </div>
                    {(tx.description || tx.referenceNumber) && (
                      <p className="text-xs text-slate-500 truncate">
                        {tx.referenceNumber ? `${tx.referenceNumber} · ` : ''}
                        {tx.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
