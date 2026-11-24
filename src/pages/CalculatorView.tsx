import { useCallback, useEffect, useState } from 'react';
import { ArrowRightCircle, Delete, History, RotateCcw } from 'lucide-react';
import { useLedger } from '../contexts/LedgerContext';
import { formatMoney, fromCents, toCents } from '../lib/math';

interface CalculatorViewProps {
  onTransferToTransaction: (amount: string) => void;
}

type Operator = '+' | '-' | '*' | '/';

interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
}

function computeBinary(a: number, b: number, op: Operator): number | null {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      if (b === 0) return null;
      return a / b;
  }
}

function formatCalcNumber(num: number): string {
  if (!Number.isFinite(num)) return 'Error';
  const rounded = Math.round((num + Number.EPSILON) * 1e8) / 1e8;
  return String(rounded);
}

const OP_SYMBOL: Record<Operator, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
};

export function CalculatorView({ onTransferToTransaction }: CalculatorViewProps) {
  const { preferences, notify } = useLedger();

  const [display, setDisplay] = useState('0');
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<Operator | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const handleClear = useCallback(() => {
    setDisplay('0');
    setStoredValue(null);
    setPendingOp(null);
    setWaitingForOperand(false);
  }, []);

  const handleDigit = useCallback(
    (digit: string) => {
      setDisplay((prev) => {
        if (prev === 'Error' || waitingForOperand) {
          setWaitingForOperand(false);
          return digit;
        }
        if (prev === '0') return digit;
        if (prev.length >= 16) return prev;
        return prev + digit;
      });
    },
    [waitingForOperand]
  );

  const handleDecimal = useCallback(() => {
    if (display === 'Error' || waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay((prev) => `${prev}.`);
    }
  }, [display, waitingForOperand]);

  const handleBackspace = useCallback(() => {
    if (display === 'Error' || waitingForOperand) {
      setDisplay('0');
      setWaitingForOperand(false);
      return;
    }
    setDisplay((prev) => {
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith('-'))) {
        return '0';
      }
      return prev.slice(0, -1);
    });
  }, [display, waitingForOperand]);

  const handleOperator = useCallback(
    (nextOp: Operator) => {
      if (display === 'Error') return;
      const inputVal = Number(display);
      if (!Number.isFinite(inputVal)) return;

      if (storedValue === null) {
        setStoredValue(inputVal);
      } else if (pendingOp && !waitingForOperand) {
        const computed = computeBinary(storedValue, inputVal, pendingOp);
        if (computed === null) {
          setDisplay('Error');
          setStoredValue(null);
          setPendingOp(null);
          setWaitingForOperand(false);
          return;
        }
        const formatted = formatCalcNumber(computed);
        setDisplay(formatted);
        setStoredValue(Number(formatted));
      }

      setPendingOp(nextOp);
      setWaitingForOperand(true);
    },
    [display, storedValue, pendingOp, waitingForOperand]
  );

  const handlePercent = useCallback(() => {
    if (display === 'Error') return;
    const current = Number(display);
    if (!Number.isFinite(current)) return;

    let result: number;
    if (storedValue !== null && (pendingOp === '+' || pendingOp === '-')) {
      result = (storedValue * current) / 100;
    } else {
      result = current / 100;
    }
    setDisplay(formatCalcNumber(result));
  }, [display, storedValue, pendingOp]);

  const handleEquals = useCallback(() => {
    if (display === 'Error' || storedValue === null || !pendingOp) return;
    const inputVal = Number(display);
    if (!Number.isFinite(inputVal)) return;

    const computed = computeBinary(storedValue, inputVal, pendingOp);
    if (computed === null) {
      setDisplay('Error');
      setStoredValue(null);
      setPendingOp(null);
      setWaitingForOperand(false);
      return;
    }

    const formatted = formatCalcNumber(computed);
    const expr = `${formatCalcNumber(storedValue)} ${OP_SYMBOL[pendingOp]} ${formatCalcNumber(
      inputVal
    )}`;

    setHistory((prev) => [
      { id: `${Date.now()}_${Math.random()}`, expression: expr, result: formatted },
      ...prev.slice(0, 14),
    ]);
    setDisplay(formatted);
    setStoredValue(null);
    setPendingOp(null);
    setWaitingForOperand(true);
  }, [display, storedValue, pendingOp]);

  // Keyboard support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        handleDecimal();
      } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        e.preventDefault();
        handleOperator(e.key as Operator);
      } else if (e.key === '%') {
        e.preventDefault();
        handlePercent();
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleDigit,
    handleDecimal,
    handleOperator,
    handlePercent,
    handleEquals,
    handleBackspace,
    handleClear,
  ]);

  const numericDisplay = Number(display);
  const canTransfer =
    display !== 'Error' && Number.isFinite(numericDisplay) && numericDisplay > 0;

  const handleTransfer = () => {
    if (!canTransfer) {
      notify(
        'error',
        'Positive amount required',
        'Calculate a positive amount greater than 0 before transferring.'
      );
      return;
    }
    const rounded = fromCents(toCents(numericDisplay)).toFixed(2);
    onTransferToTransaction(rounded);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Smart Calculator
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Compute totals, splits, or percentage adjustments and send results straight into a new transaction.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Main Calculator Body */}
        <div className="lg:col-span-7 bg-[#0D1424] border border-slate-800/90 rounded-xl p-5 sm:p-6 space-y-5">
          {/* Display Screen */}
          <div className="bg-[#070B14] border border-slate-800 rounded-xl p-5 text-right space-y-1.5">
            <p className="text-xs font-mono text-slate-500 h-4 truncate">
              {storedValue !== null && pendingOp
                ? `${formatCalcNumber(storedValue)} ${OP_SYMBOL[pendingOp]}`
                : 'Ready'}
            </p>
            <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-slate-100 truncate">
              {display}
            </p>
            <p className="text-xs font-mono tabular-nums text-[#D4AF37]">
              {canTransfer
                ? formatMoney(fromCents(toCents(numericDisplay)), preferences.currencySymbol)
                : formatMoney(0, preferences.currencySymbol)}
            </p>
          </div>

          {/* Keypad Grid */}
          <div className="grid grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={handleClear}
              className="h-14 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 font-semibold text-base hover:bg-rose-500/20 transition-colors"
            >
              C
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              aria-label="Delete last digit"
              className="h-14 rounded-lg bg-[#121C32] border border-slate-800 text-slate-200 hover:border-slate-700 flex items-center justify-center transition-colors"
            >
              <Delete className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handlePercent}
              className="h-14 rounded-lg bg-[#121C32] border border-slate-800 text-[#E5C55C] font-mono font-semibold text-lg hover:border-[#D4AF37]/40 transition-colors"
            >
              %
            </button>
            <button
              type="button"
              onClick={() => handleOperator('/')}
              className={`h-14 rounded-lg border font-mono font-semibold text-xl transition-colors ${
                pendingOp === '/'
                  ? 'bg-[#D4AF37] border-[#D4AF37] text-[#070B14]'
                  : 'bg-[#121C32] border-slate-800 text-[#E5C55C] hover:border-[#D4AF37]/40'
              }`}
            >
              ÷
            </button>

            {['7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                className="h-14 rounded-lg bg-[#0A101E] border border-slate-800 hover:border-slate-700 hover:bg-[#121C32] text-slate-100 font-mono font-semibold text-lg transition-colors"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleOperator('*')}
              className={`h-14 rounded-lg border font-mono font-semibold text-xl transition-colors ${
                pendingOp === '*'
                  ? 'bg-[#D4AF37] border-[#D4AF37] text-[#070B14]'
                  : 'bg-[#121C32] border-slate-800 text-[#E5C55C] hover:border-[#D4AF37]/40'
              }`}
            >
              ×
            </button>

            {['4', '5', '6'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                className="h-14 rounded-lg bg-[#0A101E] border border-slate-800 hover:border-slate-700 hover:bg-[#121C32] text-slate-100 font-mono font-semibold text-lg transition-colors"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleOperator('-')}
              className={`h-14 rounded-lg border font-mono font-semibold text-xl transition-colors ${
                pendingOp === '-'
                  ? 'bg-[#D4AF37] border-[#D4AF37] text-[#070B14]'
                  : 'bg-[#121C32] border-slate-800 text-[#E5C55C] hover:border-[#D4AF37]/40'
              }`}
            >
              −
            </button>

            {['1', '2', '3'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                className="h-14 rounded-lg bg-[#0A101E] border border-slate-800 hover:border-slate-700 hover:bg-[#121C32] text-slate-100 font-mono font-semibold text-lg transition-colors"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleOperator('+')}
              className={`h-14 rounded-lg border font-mono font-semibold text-xl transition-colors ${
                pendingOp === '+'
                  ? 'bg-[#D4AF37] border-[#D4AF37] text-[#070B14]'
                  : 'bg-[#121C32] border-slate-800 text-[#E5C55C] hover:border-[#D4AF37]/40'
              }`}
            >
              +
            </button>

            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="col-span-2 h-14 rounded-lg bg-[#0A101E] border border-slate-800 hover:border-slate-700 hover:bg-[#121C32] text-slate-100 font-mono font-semibold text-lg transition-colors"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDecimal}
              className="h-14 rounded-lg bg-[#0A101E] border border-slate-800 hover:border-slate-700 hover:bg-[#121C32] text-slate-100 font-mono font-semibold text-lg transition-colors"
            >
              .
            </button>
            <button
              type="button"
              onClick={handleEquals}
              className="h-14 rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] font-mono font-bold text-xl transition-colors"
            >
              =
            </button>
          </div>

          {/* Primary Transfer CTA */}
          <button
            type="button"
            disabled={!canTransfer}
            onClick={handleTransfer}
            className="w-full py-3 px-4 rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <ArrowRightCircle className="w-4 h-4" />
            Add Result to Transaction
          </button>
        </div>

        {/* Calculation History Tape */}
        <div className="lg:col-span-5 bg-[#0D1424] border border-slate-800/90 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#D4AF37]" />
              <h3 className="text-sm font-semibold text-slate-100">
                Calculation Tape
              </h3>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setHistory([])}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="py-10 text-center space-y-1.5">
              <p className="text-xs font-medium text-slate-400">
                No calculations yet
              </p>
              <p className="text-xs text-slate-500">
                Click any past result to load it back into the display. Keyboard shortcuts supported.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70 max-h-[380px] overflow-y-auto">
              {history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setDisplay(item.result);
                    setWaitingForOperand(false);
                  }}
                  className="w-full py-3 text-right hover:bg-[#121C32]/60 px-2 rounded transition-colors"
                >
                  <p className="text-xs font-mono text-slate-500">
                    {item.expression} =
                  </p>
                  <p className="text-base font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                    {item.result}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
