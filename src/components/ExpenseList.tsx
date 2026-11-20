import { useState } from 'react';
import { ChevronDown, ChevronUp, Receipt, Trash2, Utensils, Wine, Car, Package } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ExpenseCategory, ExpenseItem, Participant } from '../types/expense';
import { formatCurrency } from '../utils/currency';

interface ExpenseListProps {
  expenses: ExpenseItem[];
  participants: Participant[];
  onToggleParticipantSplit: (expenseId: string, participantId: string) => void;
  onDeleteExpense: (expenseId: string) => void;
}

function getCategoryIcon(category: ExpenseCategory) {
  switch (category) {
    case 'comida':
      return Utensils;
    case 'bebida':
      return Wine;
    case 'transporte':
      return Car;
    default:
      return Package;
  }
}

export function ExpenseList({
  expenses,
  participants,
  onToggleParticipantSplit,
  onDeleteExpense,
}: ExpenseListProps) {
  const { t } = useLanguage();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (expenses.length === 0) {
    return (
      <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 text-center">
        <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-violet-500/15 text-slate-500 dark:text-violet-300 flex items-center justify-center mx-auto mb-3">
          <Receipt className="w-5 h-5" aria-hidden="true" />
        </div>
        <h3 className="text-base font-display font-bold text-slate-900 dark:text-slate-100">
          {t.expenses.emptyTitle}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          {t.expenses.emptySubtitle}
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
        <h3 className="text-base font-display font-bold text-slate-900 dark:text-slate-50">
          {t.expenses.listTitle}
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {expenses.length} {expenses.length === 1 ? t.expenses.itemSingular : t.expenses.itemPlural}
        </span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
        {expenses.map((expense) => {
          const Icon = getCategoryIcon(expense.category);
          const isExpanded = expandedId === expense.id;
          const payerNames = expense.payers
            .map((payer) => {
              const person = participants.find((p) => p.id === payer.participantId);
              if (!person) return null;
              return expense.payers.length > 1
                ? `${person.name} (${formatCurrency(payer.amount)})`
                : person.name;
            })
            .filter(Boolean)
            .join(' + ');

          const activeSplitCount = expense.splitAmongIds.filter((id) =>
            participants.some((p) => p.id === id)
          ).length;
          const splitCount = activeSplitCount > 0 ? activeSplitCount : participants.length;
          const perPerson = splitCount > 0 ? Math.round(expense.amount / splitCount) : expense.amount;
          const hasExclusion =
            participants.length > 0 && splitCount < participants.length;

          return (
            <div
              key={expense.id}
              className="px-4 sm:px-5 py-3.5 transition-colors hover:bg-slate-50/60 dark:hover:bg-violet-500/[0.04]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-violet-500/10 border border-transparent dark:border-violet-500/20 text-slate-600 dark:text-violet-300 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">
                      {expense.description}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span>{t.expenses.paidPrefix} {payerNames || t.expenses.groupFallback}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {hasExclusion
                          ? `${t.expenses.betweenPrefix} ${splitCount} ${t.expenses.ofPrefix} ${participants.length}`
                          : `${t.expenses.allLabel} (${splitCount})`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatCurrency(perPerson)} {t.expenses.eachSuffix}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono tabular-nums text-sm sm:text-base font-bold text-slate-900 dark:text-slate-50 mr-1">
                    {formatCurrency(expense.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                    aria-label={isExpanded ? t.expenses.hideParticipants : t.expenses.adjustParticipants}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-violet-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteExpense(expense.id)}
                    aria-label={`${t.expenses.deletePrefix} ${expense.description}`}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {isExpanded && participants.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 pl-12">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                    {t.expenses.togglePrompt}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {participants.map((p) => {
                      const included = expense.splitAmongIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onToggleParticipantSplit(expense.id, p.id)}
                          className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            included
                              ? 'bg-emerald-50 dark:bg-violet-500/15 text-emerald-800 dark:text-violet-200 border-emerald-400 dark:border-violet-500/50 font-semibold'
                              : 'bg-white dark:bg-slate-950/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 line-through'
                          }`}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
