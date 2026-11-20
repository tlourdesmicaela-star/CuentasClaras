import { FolderOpen, History, Trash2, Users } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { Gathering } from '../types/expense';
import { formatCurrency } from '../utils/currency';

interface HistoryPanelProps {
  history: Gathering[];
  activeGatheringId: string;
  onLoadGathering: (gathering: Gathering) => void;
  onDuplicateGroup: (gathering: Gathering) => void;
  onDeleteGathering: (id: string) => void;
}

export function HistoryPanel({
  history,
  activeGatheringId,
  onLoadGathering,
  onDuplicateGroup,
  onDeleteGathering,
}: HistoryPanelProps) {
  const { t } = useLanguage();

  return (
    <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 dark:shadow-[0_0_28px_-12px_rgba(139,92,246,0.22)] rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-display font-bold text-slate-900 dark:text-slate-50">
            {t.history.title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t.history.subtitle}
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
          {history.length} {history.length === 1 ? t.history.recordSingular : t.history.recordPlural}
        </span>
      </div>

      {history.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-violet-500/15 text-slate-500 dark:text-violet-300 flex items-center justify-center mx-auto mb-3">
            <History className="w-5 h-5" aria-hidden="true" />
          </div>
          <h3 className="text-base font-display font-bold text-slate-900 dark:text-slate-100">
            {t.history.emptyTitle}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {t.history.emptySubtitle}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {history.map((item) => {
            const total = item.expenses.reduce((sum, e) => sum + e.amount, 0);
            const isCurrent = item.id === activeGatheringId;

            return (
              <div
                key={item.id}
                className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-violet-500/[0.04] transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-display font-bold text-slate-900 dark:text-slate-100 truncate">
                      {item.title || t.history.untitled}
                    </h3>
                    {isCurrent && (
                      <span className="text-xs font-semibold text-emerald-700 dark:text-violet-300">
                        {t.history.activeNow}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>{item.date}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{item.participants.length} {t.history.diners}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{item.expenses.length} {t.history.expenses}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-violet-200">
                      {formatCurrency(total)}
                    </span>
                  </div>

                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                    {item.participants.map((p) => p.name).join(', ')}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onLoadGathering(item)}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 dark:bg-violet-600 text-white text-xs font-semibold hover:bg-emerald-700 dark:hover:bg-violet-500 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.history.restore}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDuplicateGroup(item)}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-violet-500/40 transition-colors cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.history.reuseGroup}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteGathering(item.id)}
                    aria-label={`${t.history.deletePrefix} ${item.title}`}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
