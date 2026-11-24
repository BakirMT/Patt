import { useState } from 'react';
import { AppShell } from './components/AppShell';
import { AuthScreen } from './components/AuthScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PersonModal } from './components/PersonModal';
import { PinLockScreen } from './components/PinLockScreen';
import { ToastContainer } from './components/ToastContainer';
import {
  TransactionModal,
  type TransactionModalPrefill,
} from './components/TransactionModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LedgerProvider, useLedger } from './contexts/LedgerContext';
import { isFirebaseConfigured } from './lib/firebase';
import { CalculatorView } from './pages/CalculatorView';
import { DashboardView } from './pages/DashboardView';
import { PersonDetailView } from './pages/PersonDetailView';
import { PersonsView } from './pages/PersonsView';
import { ReportsView } from './pages/ReportsView';
import { SecurityBackupView } from './pages/SecurityBackupView';
import { TransactionsView } from './pages/TransactionsView';
import type { AppView, Person, Transaction, TransactionType } from './types/ledger';

function AuthenticatedApp() {
  const { user, authLoading, profileReady, pinStatus, pinLoading } = useAuth();
  const { personMap } = useLedger();

  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Person Modal State
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);

  // Transaction Modal State
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txPrefill, setTxPrefill] = useState<TransactionModalPrefill | null>(null);

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-[#070B14] text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-[#0D1424] border border-slate-800 rounded-xl p-6 space-y-3">
          <h1 className="text-lg font-bold text-[#D4AF37]">
            Firebase Configuration Required
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Provide a valid <code className="font-mono text-xs text-[#E5C55C]">firebase-applet-config.json</code> with your Firebase project credentials to connect Firebase Authentication and Cloud Firestore.
          </p>
        </div>
      </div>
    );
  }

  if (authLoading || (user && user.emailVerified && (!profileReady || pinLoading))) {
    return (
      <div className="min-h-screen bg-[#070B14] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-[#D4AF37] animate-spin" />
        <p className="text-xs text-slate-400">Loading SMART PATT BOOK...</p>
      </div>
    );
  }

  // Protected Route: Require authenticated & email-verified user
  if (!user || !user.emailVerified) {
    return <AuthScreen />;
  }

  // Server-Verified PIN Lock Gate after login
  if (pinStatus.pinEnabled && !pinStatus.unlocked) {
    return <PinLockScreen />;
  }

  const openAddPerson = () => {
    setEditingPerson(null);
    setPersonModalOpen(true);
  };

  const openEditPerson = (person: Person) => {
    setEditingPerson(person);
    setPersonModalOpen(true);
  };

  const openNewTransaction = (prefill: TransactionModalPrefill | null = null) => {
    setEditingTx(null);
    setTxPrefill(prefill);
    setTxModalOpen(true);
  };

  const openEditTransaction = (tx: Transaction) => {
    setEditingTx(tx);
    setTxPrefill(null);
    setTxModalOpen(true);
  };

  const openPersonDetail = (personId: string) => {
    setSelectedPersonId(personId);
    setActiveView('person-detail');
  };

  const handleQuickPersonTx = (personId: string, type: TransactionType) => {
    openNewTransaction({ personId, type });
  };

  const handleCalculatorTransfer = (amount: string) => {
    openNewTransaction({ amount });
  };

  const breadcrumb = (() => {
    switch (activeView) {
      case 'dashboard':
        return 'Dashboard';
      case 'persons':
        return 'Persons';
      case 'person-detail': {
        const p = selectedPersonId ? personMap[selectedPersonId] : null;
        return p ? `Persons / ${p.name} (${p.code})` : 'Persons / Account';
      }
      case 'transactions':
        return 'Transactions';
      case 'calculator':
        return 'Smart Calculator';
      case 'reports':
        return 'Reports';
      case 'security-backup':
        return 'PIN Lock & Backup';
      default:
        return 'SMART PATT BOOK';
    }
  })();

  return (
    <>
      <AppShell
        activeView={activeView}
        breadcrumb={breadcrumb}
        onNavigate={(view) => {
          setActiveView(view);
          if (view !== 'person-detail') setSelectedPersonId(null);
        }}
        onOpenNewTransaction={() => openNewTransaction(null)}
      >
        {activeView === 'dashboard' && (
          <DashboardView
            onNavigate={setActiveView}
            onSelectPerson={openPersonDetail}
            onAddPerson={openAddPerson}
            onAddTransaction={() => openNewTransaction(null)}
          />
        )}

        {activeView === 'persons' && (
          <PersonsView
            onSelectPerson={openPersonDetail}
            onAddPerson={openAddPerson}
            onEditPerson={openEditPerson}
          />
        )}

        {activeView === 'person-detail' && selectedPersonId && (
          <PersonDetailView
            personId={selectedPersonId}
            onBack={() => setActiveView('persons')}
            onEditPerson={openEditPerson}
            onQuickTransaction={handleQuickPersonTx}
            onEditTransaction={openEditTransaction}
          />
        )}

        {activeView === 'transactions' && (
          <TransactionsView
            onAddTransaction={() => openNewTransaction(null)}
            onEditTransaction={openEditTransaction}
            onSelectPerson={openPersonDetail}
          />
        )}

        {activeView === 'calculator' && (
          <CalculatorView onTransferToTransaction={handleCalculatorTransfer} />
        )}

        {activeView === 'reports' && <ReportsView />}

        {activeView === 'security-backup' && <SecurityBackupView />}
      </AppShell>

      <PersonModal
        open={personModalOpen}
        editingPerson={editingPerson}
        onClose={() => setPersonModalOpen(false)}
      />

      <TransactionModal
        open={txModalOpen}
        editingTransaction={editingTx}
        prefill={txPrefill}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
          setTxPrefill(null);
        }}
        onRequestAddPerson={openAddPerson}
      />

      <ToastContainer />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LedgerProvider>
          <AuthenticatedApp />
        </LedgerProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
