import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLedger } from '../contexts/LedgerContext';
import { exportReportExcel, exportReportPDF } from '../lib/exportUtils';
import {
  formatDateDisplay,
  formatMoney,
  fromCents,
  getTodayISO,
  toCents,
  TRANSACTION_TYPE_META,
} from '../lib/math';

type ReportKind =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'person-wise'
  | 'given'
  | 'received'
  | 'receivable'
  | 'payable';

const REPORT_TABS: Array<{ id: ReportKind; label: string }> = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'person-wise', label: 'Person-wise' },
  { id: 'given', label: 'Given Money' },
  { id: 'received', label: 'Received Money' },
  { id: 'receivable', label: 'Receivable' },
  { id: 'payable', label: 'Payable' },
];

function getWeekStartISO(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const day = dt.getDay();
  const diff = (day + 6) % 7; // Monday start
  dt.setDate(dt.getDate() - diff);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
}

export function ReportsView() {
  const { persons, transactions, personMap, preferences, notify } = useLedger();

  const [activeReport, setActiveReport] = useState<ReportKind>('monthly');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const applyPreset = (preset: 'today' | 'week' | 'month' | 'year' | 'all') => {
    const today = getTodayISO();
    const now = new Date();
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    if (preset === 'today') {
      setDateFrom(today);
      setDateTo(today);
      return;
    }
    if (preset === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setDateFrom(
        `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(
          start.getDate()
        ).padStart(2, '0')}`
      );
      setDateTo(today);
      return;
    }
    if (preset === 'month') {
      setDateFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
      setDateTo(today);
      return;
    }
    if (preset === 'year') {
      setDateFrom(`${now.getFullYear()}-01-01`);
      setDateTo(today);
    }
  };

  const rangeTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo) return false;
      return true;
    });
  }, [transactions, dateFrom, dateTo]);

  // Period aggregation for daily / weekly / monthly / yearly
  const periodRows = useMemo(() => {
    const map = new Map<
      string,
      {
        period: string;
        count: number;
        givenCents: number;
        receivedCents: number;
        payableCents: number;
        paidCents: number;
      }
    >();

    for (const tx of rangeTransactions) {
      let key = tx.date;
      if (activeReport === 'weekly') key = `Week of ${getWeekStartISO(tx.date)}`;
      else if (activeReport === 'monthly') key = tx.date.slice(0, 7);
      else if (activeReport === 'yearly') key = tx.date.slice(0, 4);

      if (!map.has(key)) {
        map.set(key, {
          period: key,
          count: 0,
          givenCents: 0,
          receivedCents: 0,
          payableCents: 0,
          paidCents: 0,
        });
      }
      const b = map.get(key)!;
      b.count += 1;
      const c = toCents(tx.amount);
      if (tx.type === 'GIVEN') b.givenCents += c;
      else if (tx.type === 'RECEIVED') b.receivedCents += c;
      else if (tx.type === 'PAYABLE') b.payableCents += c;
      else if (tx.type === 'PAID') b.paidCents += c;
    }

    return Array.from(map.values())
      .sort((a, b) => b.period.localeCompare(a.period))
      .map((item) => ({
        period: item.period,
        count: item.count,
        given: fromCents(item.givenCents),
        received: fromCents(item.receivedCents),
        netReceivable: fromCents(item.givenCents - item.receivedCents),
        payable: fromCents(item.payableCents),
        paid: fromCents(item.paidCents),
        netPayable: fromCents(item.payableCents - item.paidCents),
      }));
  }, [rangeTransactions, activeReport]);

  // Person-wise aggregation within selected date range
  const personRows = useMemo(() => {
    const accum = new Map<
      string,
      { given: number; received: number; payable: number; paid: number; count: number }
    >();
    for (const p of persons) {
      accum.set(p.id, { given: 0, received: 0, payable: 0, paid: 0, count: 0 });
    }
    for (const tx of rangeTransactions) {
      if (!accum.has(tx.personId)) {
        accum.set(tx.personId, { given: 0, received: 0, payable: 0, paid: 0, count: 0 });
      }
      const b = accum.get(tx.personId)!;
      b.count += 1;
      const c = toCents(tx.amount);
      if (tx.type === 'GIVEN') b.given += c;
      else if (tx.type === 'RECEIVED') b.received += c;
      else if (tx.type === 'PAYABLE') b.payable += c;
      else if (tx.type === 'PAID') b.paid += c;
    }

    const rows = persons.map((p) => {
      const b = accum.get(p.id)!;
      return {
        personId: p.id,
        name: p.name,
        code: p.code,
        phone: p.phone,
        count: b.count,
        given: fromCents(b.given),
        received: fromCents(b.received),
        receivable: fromCents(b.given - b.received),
        payablePrincipal: fromCents(b.payable),
        paid: fromCents(b.paid),
        payable: fromCents(b.payable - b.paid),
      };
    });

    if (activeReport === 'receivable') {
      return rows
        .filter((r) => r.receivable > 0)
        .sort((a, b) => b.receivable - a.receivable);
    }
    if (activeReport === 'payable') {
      return rows.filter((r) => r.payable > 0).sort((a, b) => b.payable - a.payable);
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [persons, rangeTransactions, activeReport]);

  const txTypeRows = useMemo(() => {
    if (activeReport === 'given') {
      return rangeTransactions.filter((t) => t.type === 'GIVEN');
    }
    if (activeReport === 'received') {
      return rangeTransactions.filter((t) => t.type === 'RECEIVED');
    }
    return [];
  }, [rangeTransactions, activeReport]);

  // Overall totals for range
  const totals = useMemo(() => {
    let given = 0;
    let received = 0;
    let payable = 0;
    let paid = 0;
    for (const tx of rangeTransactions) {
      const c = toCents(tx.amount);
      if (tx.type === 'GIVEN') given += c;
      else if (tx.type === 'RECEIVED') received += c;
      else if (tx.type === 'PAYABLE') payable += c;
      else if (tx.type === 'PAID') paid += c;
    }
    return {
      given: fromCents(given),
      received: fromCents(received),
      receivable: fromCents(given - received),
      payablePrincipal: fromCents(payable),
      paid: fromCents(paid),
      payable: fromCents(payable - paid),
    };
  }, [rangeTransactions]);

  const dateRangeLabel =
    dateFrom || dateTo
      ? `${dateFrom ? formatDateDisplay(dateFrom) : 'Start'} — ${
          dateTo ? formatDateDisplay(dateTo) : 'Present'
        }`
      : 'All Time';

  const currentTabLabel =
    REPORT_TABS.find((t) => t.id === activeReport)?.label ?? 'Report';

  const handleExportPDF = () => {
    const sym = preferences.currencySymbol;
    if (['daily', 'weekly', 'monthly', 'yearly'].includes(activeReport)) {
      exportReportPDF({
        title: `${currentTabLabel} Financial Report`,
        subtitle: `Period: ${dateRangeLabel}`,
        columns: [
          'Period',
          'Entries',
          'Given',
          'Received',
          'Receivable (Period)',
          'Payable Owed',
          'Paid',
          'Payable (Period)',
        ],
        rows: periodRows.map((r) => [
          r.period,
          r.count,
          formatMoney(r.given, sym),
          formatMoney(r.received, sym),
          formatMoney(r.netReceivable, sym),
          formatMoney(r.payable, sym),
          formatMoney(r.paid, sym),
          formatMoney(r.netPayable, sym),
        ]),
        summaryLines: [
          { label: 'Total Given', value: formatMoney(totals.given, sym) },
          { label: 'Total Received', value: formatMoney(totals.received, sym) },
          { label: 'Net Receivable', value: formatMoney(totals.receivable, sym) },
          { label: 'Net Payable', value: formatMoney(totals.payable, sym) },
        ],
        fileSlug: `${activeReport}_report`,
      });
    } else if (['person-wise', 'receivable', 'payable'].includes(activeReport)) {
      exportReportPDF({
        title: `${currentTabLabel} Report`,
        subtitle: `Period: ${dateRangeLabel}`,
        columns: [
          'Person',
          'Code',
          'Given',
          'Received',
          'Remaining Receivable',
          'Payable Owed',
          'Paid',
          'Remaining Payable',
        ],
        rows: personRows.map((r) => [
          r.name,
          r.code,
          formatMoney(r.given, sym),
          formatMoney(r.received, sym),
          formatMoney(r.receivable, sym),
          formatMoney(r.payablePrincipal, sym),
          formatMoney(r.paid, sym),
          formatMoney(r.payable, sym),
        ]),
        summaryLines: [
          { label: 'Persons Included', value: String(personRows.length) },
          { label: 'Total Receivable', value: formatMoney(totals.receivable, sym) },
          { label: 'Total Payable', value: formatMoney(totals.payable, sym) },
        ],
        fileSlug: `${activeReport}_report`,
      });
    } else {
      const subtotal = fromCents(
        txTypeRows.reduce((sum, tx) => sum + toCents(tx.amount), 0)
      );
      exportReportPDF({
        title: `${currentTabLabel} Report`,
        subtitle: `Period: ${dateRangeLabel}`,
        columns: ['Date', 'Person', 'Code', 'Reference', 'Description', 'Amount'],
        rows: txTypeRows.map((tx) => {
          const p = personMap[tx.personId];
          return [
            formatDateDisplay(tx.date),
            p?.name ?? 'Unknown',
            p?.code ?? '-',
            tx.referenceNumber || '-',
            tx.description || '-',
            formatMoney(tx.amount, sym),
          ];
        }),
        summaryLines: [
          { label: 'Total Entries', value: String(txTypeRows.length) },
          { label: `Total ${currentTabLabel}`, value: formatMoney(subtotal, sym) },
        ],
        fileSlug: `${activeReport}_report`,
      });
    }
    notify('success', 'PDF report exported', `${currentTabLabel} Report (${dateRangeLabel})`);
  };

  const handleExportExcel = () => {
    if (['daily', 'weekly', 'monthly', 'yearly'].includes(activeReport)) {
      exportReportExcel({
        sheetName: `${currentTabLabel} Report`,
        rows: periodRows.map((r) => ({
          Period: r.period,
          Entries: r.count,
          Given: r.given,
          Received: r.received,
          'Receivable (Period)': r.netReceivable,
          'Payable Owed': r.payable,
          Paid: r.paid,
          'Payable (Period)': r.netPayable,
        })),
        fileSlug: `${activeReport}_report`,
      });
    } else if (['person-wise', 'receivable', 'payable'].includes(activeReport)) {
      exportReportExcel({
        sheetName: `${currentTabLabel} Report`,
        rows: personRows.map((r) => ({
          Person: r.name,
          Code: r.code,
          Phone: r.phone,
          Entries: r.count,
          'Total Given': r.given,
          'Total Received': r.received,
          'Remaining Receivable': r.receivable,
          'Total Payable Owed': r.payablePrincipal,
          'Total Paid': r.paid,
          'Remaining Payable': r.payable,
        })),
        fileSlug: `${activeReport}_report`,
      });
    } else {
      exportReportExcel({
        sheetName: `${currentTabLabel} Report`,
        rows: txTypeRows.map((tx) => {
          const p = personMap[tx.personId];
          return {
            Date: tx.date,
            Person: p?.name ?? 'Unknown',
            Code: p?.code ?? '',
            Type: TRANSACTION_TYPE_META[tx.type].label,
            Amount: tx.amount,
            Reference: tx.referenceNumber,
            Description: tx.description,
          };
        }),
        fileSlug: `${activeReport}_report`,
      });
    }
    notify('success', 'Excel report exported', `${currentTabLabel} Report (${dateRangeLabel})`);
  };

  const isPeriodReport = ['daily', 'weekly', 'monthly', 'yearly'].includes(activeReport);
  const isPersonReport = ['person-wise', 'receivable', 'payable'].includes(activeReport);

  return (
    <div className="space-y-6">
      {/* Header & Exports */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            Financial Reports
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Filter by period and export audit-ready PDF or Excel spreadsheets.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] transition-colors whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-700 text-slate-200 hover:border-[#D4AF37]/50 hover:text-[#E5C55C] transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Report Tabs + Date Range Controls */}
      <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-1 p-1 bg-[#070B14] border border-slate-800 rounded-lg overflow-x-auto">
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveReport(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeReport === tab.id
                  ? 'bg-[#121C32] text-[#E5C55C]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['today', 'Today'],
                ['week', 'Last 7 Days'],
                ['month', 'This Month'],
                ['year', 'This Year'],
                ['all', 'All Time'],
              ] as const
            ).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                className="px-2.5 py-1.5 text-xs rounded-md border border-slate-800 text-slate-300 hover:border-[#D4AF37]/40 hover:text-[#E5C55C] transition-colors whitespace-nowrap"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Report start date"
              className="px-3 py-1.5 text-xs font-mono bg-[#070B14] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-[#D4AF37]"
            />
            <span className="text-xs text-slate-500">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Report end date"
              className="px-3 py-1.5 text-xs font-mono bg-[#070B14] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>
      </div>

      {/* Period Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-4">
          <p className="text-xs text-slate-400">Given ({dateRangeLabel})</p>
          <p className="text-lg font-bold font-mono tabular-nums text-slate-100 mt-1">
            {formatMoney(totals.given, preferences.currencySymbol)}
          </p>
        </div>
        <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-4">
          <p className="text-xs text-slate-400">Received ({dateRangeLabel})</p>
          <p className="text-lg font-bold font-mono tabular-nums text-sky-400 mt-1">
            {formatMoney(totals.received, preferences.currencySymbol)}
          </p>
        </div>
        <div className="bg-[#0D1424] border border-emerald-500/25 rounded-xl p-4">
          <p className="text-xs text-emerald-300">Net Receivable</p>
          <p className="text-lg font-bold font-mono tabular-nums text-emerald-400 mt-1">
            {formatMoney(totals.receivable, preferences.currencySymbol)}
          </p>
        </div>
        <div className="bg-[#0D1424] border border-amber-500/25 rounded-xl p-4">
          <p className="text-xs text-amber-300">Net Payable</p>
          <p className="text-lg font-bold font-mono tabular-nums text-amber-400 mt-1">
            {formatMoney(totals.payable, preferences.currencySymbol)}
          </p>
        </div>
      </div>

      {/* Visual Chart for Period Reports */}
      {isPeriodReport && periodRows.length > 0 && (
        <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">
            {currentTabLabel} Breakdown Chart
          </h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...periodRows].reverse().slice(-12)}
                margin={{ top: 6, right: 8, left: -12, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="period" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
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
                <Bar dataKey="given" name="Given" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="received" name="Received" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="payable" name="Payable" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="paid" name="Paid" fill="#F43F5E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Report Data Table */}
      <div className="bg-[#0D1424] border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            {currentTabLabel} Report &middot; {dateRangeLabel}
          </h3>
        </div>

        <div className="overflow-x-auto">
          {isPeriodReport ? (
            periodRows.length === 0 ? (
              <p className="p-10 text-center text-xs text-slate-400">
                No transactions recorded in the selected date range.
              </p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-xs font-medium text-slate-400">
                    <th className="py-3 px-5">Period</th>
                    <th className="py-3 px-4 text-right">Entries</th>
                    <th className="py-3 px-4 text-right">Given</th>
                    <th className="py-3 px-4 text-right">Received</th>
                    <th className="py-3 px-4 text-right">Receivable</th>
                    <th className="py-3 px-4 text-right">Payable Owed</th>
                    <th className="py-3 px-4 text-right">Paid</th>
                    <th className="py-3 px-5 text-right">Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm font-mono tabular-nums">
                  {periodRows.map((row) => (
                    <tr key={row.period} className="hover:bg-[#121C32]/60">
                      <td className="py-3 px-5 text-xs text-slate-200 whitespace-nowrap">
                        {row.period}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-400">
                        {row.count}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-200">
                        {formatMoney(row.given, preferences.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right text-sky-400">
                        {formatMoney(row.received, preferences.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-400">
                        {formatMoney(row.netReceivable, preferences.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-200">
                        {formatMoney(row.payable, preferences.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right text-rose-400">
                        {formatMoney(row.paid, preferences.currencySymbol)}
                      </td>
                      <td className="py-3 px-5 text-right font-semibold text-amber-400">
                        {formatMoney(row.netPayable, preferences.currencySymbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : isPersonReport ? (
            personRows.length === 0 ? (
              <p className="p-10 text-center text-xs text-slate-400">
                No matching person accounts for this report.
              </p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-xs font-medium text-slate-400">
                    <th className="py-3 px-5">Person</th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4 text-right">Given</th>
                    <th className="py-3 px-4 text-right">Received</th>
                    <th className="py-3 px-4 text-right">Remaining Receivable</th>
                    <th className="py-3 px-4 text-right">Payable Owed</th>
                    <th className="py-3 px-4 text-right">Paid</th>
                    <th className="py-3 px-5 text-right">Remaining Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {personRows.map((row) => (
                    <tr key={row.personId} className="hover:bg-[#121C32]/60">
                      <td className="py-3 px-5 font-medium text-slate-100 whitespace-nowrap">
                        {row.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[#D4AF37]">
                        {row.code}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                        {formatMoney(row.given, preferences.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-sky-400">
                        {formatMoney(row.received, preferences.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-400">
                        {formatMoney(row.receivable, preferences.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                        {formatMoney(row.payablePrincipal, preferences.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-400">
                        {formatMoney(row.paid, preferences.currencySymbol)}
                      </td>
                      <td className="py-3 px-5 text-right font-mono tabular-nums font-semibold text-amber-400">
                        {formatMoney(row.payable, preferences.currencySymbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : txTypeRows.length === 0 ? (
            <p className="p-10 text-center text-xs text-slate-400">
              No {currentTabLabel.toLowerCase()} transactions in this date range.
            </p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-xs font-medium text-slate-400">
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-4">Person</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {txTypeRows.map((tx) => {
                  const p = personMap[tx.personId];
                  return (
                    <tr key={tx.id} className="hover:bg-[#121C32]/60">
                      <td className="py-3 px-5 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {formatDateDisplay(tx.date)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-100">
                        {p?.name ?? 'Unknown'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[#D4AF37]">
                        {p?.code ?? '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">
                        {tx.referenceNumber || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400">
                        {tx.description || '—'}
                      </td>
                      <td className="py-3 px-5 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                        {formatMoney(tx.amount, preferences.currencySymbol)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
