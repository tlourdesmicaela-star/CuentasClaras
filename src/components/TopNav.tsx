import { Calculator, History, MapPin, Plus, QrCode, ReceiptText, UserCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export type ActiveTab = 'gastos' | 'escaner' | 'liquidacion' | 'ofertas' | 'historial' | 'cuenta';

interface TopNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onNewGathering: () => void;
  historyCount: number;
  unreadNotifications?: number;
  userPhotoUrl?: string | null;
  userName?: string | null;
}

export function TopNav({
  activeTab,
  onSelectTab,
  onNewGathering,
  historyCount,
  unreadNotifications = 0,
}: TopNavProps) {
  const { t } = useLanguage();

  const navItems: { id: ActiveTab; label: string; mobileLabel: string }[] = [
    { id: 'gastos', label: t.nav.expenses, mobileLabel: t.nav.expensesShort },
    { id: 'escaner', label: t.nav.scanner, mobileLabel: t.nav.scannerShort },
    { id: 'liquidacion', label: t.nav.settlement, mobileLabel: t.nav.settlementShort },
    { id: 'ofertas', label: t.nav.offers, mobileLabel: t.nav.offersShort },
    { id: 'historial', label: t.nav.history, mobileLabel: t.nav.historyShort },
    { id: 'cuenta', label: t.nav.account, mobileLabel: t.nav.accountShort },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-[#0D101A]/90 backdrop-blur-md border-b border-slate-200 dark:border-violet-500/20">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('gastos')}
            className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600 dark:focus-visible:outline-violet-400 rounded"
          >
            CuentasClaras
          </button>

          {/* Zone 2: Clean single-line text nav links (Desktop) */}
          <nav className="hidden md:flex items-center gap-5 lg:gap-6" aria-label={t.nav.mainNavAria}>
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600 dark:focus-visible:outline-violet-400 rounded ${
                    isActive
                      ? 'text-emerald-700 dark:text-violet-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                  {item.id === 'historial' && historyCount > 0 ? ` (${historyCount})` : ''}
                  {item.id === 'cuenta' && unreadNotifications > 0
                    ? ` (${unreadNotifications})`
                    : ''}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 right-0 -bottom-[17px] h-0.5 bg-emerald-600 dark:bg-violet-400 dark:shadow-[0_0_10px_rgba(167,139,250,0.75)] rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onNewGathering}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg bg-emerald-600 dark:bg-violet-600 text-white text-xs sm:text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-violet-500 dark:shadow-[0_0_20px_-4px_rgba(139,92,246,0.55)] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:focus-visible:outline-violet-400"
            >
              <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t.nav.newGathering}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar (Thumb Zone) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-[#0D101A]/95 backdrop-blur-md border-t border-slate-200 dark:border-violet-500/20 grid grid-cols-6 items-center px-1"
        aria-label={t.nav.mobileNavAria}
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon =
            item.id === 'gastos'
              ? ReceiptText
              : item.id === 'escaner'
                ? QrCode
                : item.id === 'liquidacion'
                  ? Calculator
                  : item.id === 'ofertas'
                    ? MapPin
                    : item.id === 'historial'
                      ? History
                      : UserCircle2;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] py-1 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? 'text-emerald-700 dark:text-violet-300'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden="true" />
              <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap truncate max-w-full px-0.5">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
