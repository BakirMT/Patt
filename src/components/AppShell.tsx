import React, { useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  BookOpenCheck,
  Calculator,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AppView } from '../types/ledger';

interface AppShellProps {
  activeView: AppView;
  breadcrumb: string;
  onNavigate: (view: AppView) => void;
  onOpenNewTransaction: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'persons', label: 'Persons', icon: Users },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'calculator', label: 'Calculator', icon: Calculator },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'security-backup', label: 'PIN & Backup', icon: Shield },
];

export function AppShell({
  activeView,
  breadcrumb,
  onNavigate,
  onOpenNewTransaction,
  children,
}: AppShellProps) {
  const { user, pinStatus, lockBook, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const effectiveNavId: AppView =
    activeView === 'person-detail' ? 'persons' : activeView;

  const handleNavClick = (id: AppView) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-[#0A101E] border-r border-slate-800/80 transition-[width] duration-200 no-print ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[256px]'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-3 min-w-0 text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <BookOpenCheck className="w-5 h-5" />
            </div>
            {!sidebarCollapsed && (
              <span className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap truncate">
                SMART PATT BOOK
              </span>
            )}
          </button>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {sidebarCollapsed && (
          <div className="px-3 pt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              aria-label="Expand sidebar"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = effectiveNavId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#D4AF37]/12 text-[#E5C55C]'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                } ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-[#D4AF37]' : ''}`} />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800/80 space-y-2">
          {!sidebarCollapsed && (
            <div className="px-3 py-2">
              <p className="text-xs font-medium text-slate-200 truncate">
                {user?.displayName || 'Account Owner'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
            </div>
          )}

          {pinStatus.pinEnabled && (
            <button
              type="button"
              onClick={() => void lockBook()}
              title={sidebarCollapsed ? 'Lock Book' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-amber-300 hover:bg-amber-500/10 transition-colors whitespace-nowrap ${
                sidebarCollapsed ? 'justify-center px-2' : ''
              }`}
            >
              <Lock className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Lock Book</span>}
            </button>
          )}

          <button
            type="button"
            onClick={() => void logout()}
            title={sidebarCollapsed ? 'Sign Out' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors whitespace-nowrap ${
              sidebarCollapsed ? 'justify-center px-2' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex no-print"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-[#0A101E] border-r border-slate-800 flex flex-col z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
                  <BookOpenCheck className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-100 whitespace-nowrap">
                  SMART PATT BOOK
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 text-slate-400 hover:text-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = effectiveNavId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#D4AF37]/12 text-[#E5C55C]'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-[#D4AF37]' : ''}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-800 space-y-2">
              <div className="pb-2">
                <p className="text-xs font-medium text-slate-200 truncate">
                  {user?.displayName || 'Account Owner'}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
              </div>
              {pinStatus.pinEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    void lockBook();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/10"
                >
                  <Lock className="w-4 h-4" />
                  Lock Book Now
                </button>
              )}
              <button
                type="button"
                onClick={() => void logout()}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (Compact <= 56px mobile, 64px desktop) */}
        <header className="h-14 lg:h-16 sticky top-0 z-30 bg-[#070B14]/95 backdrop-blur border-b border-slate-800/80 px-4 lg:px-8 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-300 hover:bg-slate-800/70"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm lg:text-base font-semibold text-slate-100 truncate">
              {breadcrumb}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {pinStatus.pinEnabled && (
              <button
                type="button"
                onClick={() => void lockBook()}
                title="Lock Book"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-800 text-slate-300 hover:border-[#D4AF37]/40 hover:text-[#E5C55C] transition-colors whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock
              </button>
            )}
            <button
              type="button"
              onClick={onOpenNewTransaction}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-[#D4AF37] text-[#070B14] hover:bg-[#E5C55C] transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Transaction</span>
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
