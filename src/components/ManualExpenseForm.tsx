import { useEffect, useState, type FormEvent } from 'react';
import { Check, Plus, Users } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ExpenseCategory, Participant, PayerContribution } from '../types/expense';
import { formatCurrency } from '../utils/currency';

interface ManualExpenseFormProps {
  participants: Participant[];
  prefillDraft?: { id: number; description: string; category: ExpenseCategory; amount?: number } | null;
  onAddExpense: (draft: {
    description: string;
    amount: number;
    category: ExpenseCategory;
    payers: PayerContribution[];
    splitAmongIds: string[];
  }) => void;
}

const QUICK_AMOUNT_STEPS = [1000, 5000, 10000];

export function ManualExpenseForm({
  participants,
  prefillDraft,
  onAddExpense,
}: ManualExpenseFormProps) {
  const { t } = useLanguage();
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('comida');
  const [multiPayerMode, setMultiPayerMode] = useState(false);
  const [singlePayerId, setSinglePayerId] = useState<string>(participants[0]?.id || '');
  const [partialAmounts, setPartialAmounts] = useState<Record<string, string>>({});
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const categories: { id: ExpenseCategory; label: string }[] = [
    { id: 'comida', label: t.manual.catFood },
    { id: 'bebida', label: t.manual.catDrink },
    { id: 'transporte', label: t.manual.catTransport },
    { id: 'otros', label: t.manual.catOther },
  ];

  useEffect(() => {
    if (!prefillDraft) return;
    setDescription(prefillDraft.description);
    setCategory(prefillDraft.category);
    if (typeof prefillDraft.amount === 'number' && prefillDraft.amount > 0) {
      setAmountStr(String(Math.round(prefillDraft.amount)));
    }
  }, [prefillDraft]);

  const activeSinglePayerId = participants.some((p) => p.id === singlePayerId)
    ? singlePayerId
    : participants[0]?.id || '';

  const splitAmongIds = participants
    .map((p) => p.id)
    .filter((id) => !excludedIds.includes(id));

  const parsedSingleAmount = Math.max(0, Math.round(Number(amountStr) || 0));
  const parsedPartialSum = participants.reduce(
    (sum, p) => sum + Math.max(0, Math.round(Number(partialAmounts[p.id]) || 0)),
    0
  );
  const effectiveTotal = multiPayerMode ? parsedPartialSum : parsedSingleAmount;

  const perPersonPreview =
    splitAmongIds.length > 0 && effectiveTotal > 0
      ? Math.round(effectiveTotal / splitAmongIds.length)
      : 0;

  const handleStepAmount = (delta: number) => {
    const next = Math.max(0, parsedSingleAmount + delta);
    setAmountStr(String(next));
  };

  const toggleParticipantInclusion = (id: string) => {
    setExcludedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (participants.length === 0 || effectiveTotal <= 0) return;

    const payers: PayerContribution[] = multiPayerMode
      ? participants
          .map((p) => ({
            participantId: p.id,
            amount: Math.max(0, Math.round(Number(partialAmounts[p.id]) || 0)),
          }))
          .filter((p) => p.amount > 0)
      : [{ participantId: activeSinglePayerId, amount: effectiveTotal }];

    if (payers.length === 0) return;

    onAddExpense({
      description: description.trim() || t.manual.defaultDesc,
      amount: effectiveTotal,
      category,
      payers,
      splitAmongIds: splitAmongIds.length > 0 ? splitAmongIds : participants.map((p) => p.id),
    });

    setDescription('');
    setAmountStr('');
    setPartialAmounts({});
    setExcludedIds([]);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Description + Category */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-7">
          <label htmlFor="manual-desc" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {t.manual.descLabel}
          </label>
          <input
            id="manual-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.manual.descPlaceholder}
            className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none transition-colors"
          />
        </div>

        <div className="sm:col-span-5">
          <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {t.manual.categoryLabel}
          </span>
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950/80 border border-transparent dark:border-slate-800">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`min-h-[36px] px-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer truncate ${
                  category === cat.id
                    ? 'bg-white dark:bg-violet-600/90 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payer Mode Switch & Amount Controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {t.manual.whoPaidLabel}
          </span>
          <button
            type="button"
            onClick={() => setMultiPayerMode((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-violet-300 hover:text-emerald-800 dark:hover:text-violet-200 py-1 px-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-violet-500/10 transition-colors cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{multiPayerMode ? t.manual.switchSinglePayer : t.manual.switchMultiPayer}</span>
          </button>
        </div>

        {!multiPayerMode ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="manual-amount" className="sr-only">
                  {t.manual.amountSrLabel}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-slate-500 dark:text-slate-400 font-semibold">
                    $
                  </span>
                  <input
                    id="manual-amount"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="100"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[46px] pl-8 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {QUICK_AMOUNT_STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => handleStepAmount(step)}
                    className="flex-1 min-h-[46px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 font-mono tabular-nums text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-600 dark:hover:border-violet-400/60 hover:text-emerald-700 dark:hover:text-violet-300 active:scale-[0.98] transition-all whitespace-nowrap cursor-pointer"
                  >
                    +{formatCurrency(step)}
                  </button>
                ))}
              </div>
            </div>

            {/* Payer chips */}
            <div className="flex flex-wrap gap-1.5">
              {participants.map((p) => {
                const isSelected = activeSinglePayerId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSinglePayerId(p.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 dark:bg-violet-600 text-white border-slate-900 dark:border-violet-500'
                        : 'bg-white dark:bg-slate-950/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {t.manual.paidChipPrefix} {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-3 py-2"
              >
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{p.name}</span>
                <div className="relative w-32 shrink-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400 dark:text-slate-500">
                    $
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={partialAmounts[p.id] || ''}
                    onChange={(e) =>
                      setPartialAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    placeholder="0"
                    className="w-full min-h-[36px] pl-6 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100 text-right focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exclusions / Split Among */}
      {participants.length > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t.manual.participatePrefix} ({splitAmongIds.length}/{participants.length})
            </span>
            {perPersonPreview > 0 && (
              <span className="font-mono tabular-nums text-xs font-semibold text-emerald-700 dark:text-violet-300">
                {formatCurrency(perPersonPreview)} {t.manual.eachSuffix}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {participants.map((p) => {
              const included = !excludedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleParticipantInclusion(p.id)}
                  className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                    included
                      ? 'bg-emerald-50 dark:bg-violet-500/15 text-emerald-800 dark:text-violet-200 border-emerald-400 dark:border-violet-500/50 font-semibold'
                      : 'bg-slate-50 dark:bg-slate-950/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 line-through'
                  }`}
                >
                  {included && (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-violet-400" aria-hidden="true" />
                  )}
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={participants.length === 0 || effectiveTotal <= 0}
        className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl bg-slate-900 dark:bg-violet-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-violet-500 dark:shadow-[0_0_22px_-6px_rgba(139,92,246,0.55)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-all cursor-pointer"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        <span>
          {t.manual.addExpenseBtn} {effectiveTotal > 0 ? `(${formatCurrency(effectiveTotal)})` : ''}
        </span>
      </button>
    </form>
  );
}
