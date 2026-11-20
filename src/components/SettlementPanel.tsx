import { useState } from 'react';
import { ArrowRight, BellRing, Bookmark, Check, CheckCircle2, Copy, MessageCircle, Share2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ExpenseItem, Participant, PaymentDetails } from '../types/expense';
import { formatCurrency } from '../utils/currency';
import type { SettlementSummary } from '../utils/settlement';
import { formatWhatsAppSummary } from '../utils/whatsappFormatter';

interface SettlementPanelProps {
  title: string;
  date: string;
  participants: Participant[];
  expenses: ExpenseItem[];
  summary: SettlementSummary;
  settledTransferIds: string[];
  onToggleTransferSettled: (transferId: string) => void;
  paymentDetails: PaymentDetails;
  onUpdatePaymentDetails: (details: PaymentDetails) => void;
  onSaveToHistory: () => void;
  historySavedToast: boolean;
  onSendSettlementPush?: () => void;
  pushSentToast?: boolean;
}

export function SettlementPanel({
  title,
  date,
  participants,
  expenses,
  summary,
  settledTransferIds,
  onToggleTransferSettled,
  paymentDetails,
  onUpdatePaymentDetails,
  onSaveToHistory,
  historySavedToast,
  onSendSettlementPush,
  pushSentToast = false,
}: SettlementPanelProps) {
  const { t } = useLanguage();
  const [includeBreakdown, setIncludeBreakdown] = useState(true);
  const [copied, setCopied] = useState(false);

  const whatsappText = formatWhatsAppSummary({
    title,
    date,
    participants,
    expenses,
    summary,
    paymentDetails,
    includeBreakdown,
    labels: t.whatsapp,
  });

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback copy via temporary textarea
      const el = document.createElement('textarea');
      el.value = whatsappText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Metrics & Save Action */}
      <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 dark:shadow-[0_0_28px_-12px_rgba(139,92,246,0.22)] rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900 dark:text-slate-50">
              {t.settlement.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t.settlement.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onSaveToHistory}
            disabled={expenses.length === 0}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-violet-500/30 bg-white dark:bg-violet-500/10 text-xs font-semibold text-slate-700 dark:text-violet-200 hover:border-emerald-600 dark:hover:border-violet-400 hover:text-emerald-700 dark:hover:text-violet-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {historySavedToast ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-emerald-700 dark:text-emerald-300">{t.settlement.saved}</span>
              </>
            ) : (
              <>
                <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.settlement.saveGathering}</span>
              </>
            )}
          </button>
        </div>

        {/* 3-Column Metrics Grid */}
        <div className="grid grid-cols-3 gap-3 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t.settlement.totalSpent}</div>
            <div className="text-lg sm:text-xl font-display font-bold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-0.5">
              {formatCurrency(summary.totalSpent)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t.settlement.avgPerPerson}</div>
            <div className="text-lg sm:text-xl font-display font-bold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-0.5">
              {formatCurrency(summary.averagePerPerson)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t.settlement.transfersCount}</div>
            <div className="text-lg sm:text-xl font-display font-bold font-mono tabular-nums text-emerald-700 dark:text-violet-300 mt-0.5">
              {summary.transfers.length}
            </div>
          </div>
        </div>

        {/* Minimum Transfers List */}
        <div className="pt-4">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t.settlement.whoTransfersTitle}
            </h3>
            {onSendSettlementPush && summary.transfers.length > 0 && (
              <button
                type="button"
                onClick={onSendSettlementPush}
                className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-violet-500/30 bg-slate-50 dark:bg-violet-500/10 text-[11px] font-semibold text-slate-700 dark:text-violet-200 hover:border-emerald-600 dark:hover:border-violet-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                {pushSentToast ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span className="text-emerald-700 dark:text-emerald-300">{t.settlement.alertSent}</span>
                  </>
                ) : (
                  <>
                    <BellRing className="w-3 h-3 text-emerald-600 dark:text-violet-300" aria-hidden="true" />
                    <span>{t.settlement.pushReminder}</span>
                  </>
                )}
              </button>
            )}
          </div>
          {summary.transfers.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 px-3.5 py-3 text-sm text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <span>
                {expenses.length === 0
                  ? t.settlement.addExpensesHint
                  : t.settlement.allBalanced}
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {summary.transfers.map((transfer) => {
                const isSettled = settledTransferIds.includes(transfer.id);
                return (
                  <button
                    key={transfer.id}
                    type="button"
                    onClick={() => onToggleTransferSettled(transfer.id)}
                    className={`w-full flex items-center justify-between gap-3 min-h-[52px] px-3.5 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      isSettled
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                        : 'bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-violet-500/40 text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 text-sm">
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          isSettled
                            ? 'bg-emerald-600 dark:bg-emerald-500 border-emerald-600 dark:border-emerald-500 text-white'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {isSettled && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      </span>
                      <span className={`font-semibold truncate ${isSettled ? 'line-through opacity-75' : ''}`}>
                        {transfer.fromName}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-violet-400 shrink-0" aria-hidden="true" />
                      <span className={`font-semibold truncate ${isSettled ? 'line-through opacity-75' : ''}`}>
                        {transfer.toName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-violet-200">
                        {formatCurrency(transfer.amount)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Per-Person Balance Breakdown */}
        {summary.balances.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
              {t.settlement.balanceByDiner}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="text-left font-medium py-2 pr-2">{t.settlement.colPerson}</th>
                    <th className="text-right font-medium py-2 px-2">{t.settlement.colPaid}</th>
                    <th className="text-right font-medium py-2 px-2">{t.settlement.colConsumed}</th>
                    <th className="text-right font-medium py-2 pl-2">{t.settlement.colBalance}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {summary.balances.map((b) => {
                    const isPositive = b.netBalance > 1;
                    const isNegative = b.netBalance < -1;
                    return (
                      <tr key={b.participantId}>
                        <td className="py-2.5 pr-2 font-semibold text-slate-900 dark:text-slate-100">{b.name}</td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {formatCurrency(b.paid)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {formatCurrency(b.consumed)}
                        </td>
                        <td
                          className={`py-2.5 pl-2 text-right font-mono tabular-nums font-semibold ${
                            isPositive
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : isNegative
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {isPositive
                            ? `+${formatCurrency(b.netBalance)} (${t.settlement.receives})`
                            : isNegative
                              ? `${formatCurrency(b.netBalance)} (${t.settlement.owes})`
                              : `$0 (${t.settlement.even})`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* WhatsApp Formatter & Alias/CBU Card */}
      <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-emerald-700 dark:text-violet-400" aria-hidden="true" />
            <h3 className="text-base font-display font-bold text-slate-900 dark:text-slate-50">
              {t.settlement.whatsappTitle}
            </h3>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeBreakdown}
              onChange={(e) => setIncludeBreakdown(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-emerald-600 dark:text-violet-500 focus:ring-emerald-600 dark:focus:ring-violet-500 dark:bg-slate-950"
            />
            <span>{t.settlement.includeBreakdown}</span>
          </label>
        </div>

        {/* Saved Alias / CBU */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="alias-cbu" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t.settlement.aliasLabel}
            </label>
            <input
              id="alias-cbu"
              type="text"
              value={paymentDetails.aliasOrCbu}
              onChange={(e) =>
                onUpdatePaymentDetails({ ...paymentDetails, aliasOrCbu: e.target.value })
              }
              placeholder={t.settlement.aliasPlaceholder}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 font-mono text-xs text-slate-900 dark:text-violet-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="account-holder" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t.settlement.holderLabel}
            </label>
            <input
              id="account-holder"
              type="text"
              value={paymentDetails.accountHolder}
              onChange={(e) =>
                onUpdatePaymentDetails({ ...paymentDetails, accountHolder: e.target.value })
              }
              placeholder={t.settlement.holderPlaceholder}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Live WhatsApp Message Preview */}
        <pre className="rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3.5 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
          {whatsappText}
        </pre>

        {/* Share CTAs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-violet-500/40 active:scale-[0.99] transition-all cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-emerald-700 dark:text-emerald-300">{t.settlement.copied}</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 dark:text-violet-300" aria-hidden="true" />
                <span>{t.settlement.copySummary}</span>
              </>
            )}
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-600 dark:bg-violet-600 text-white text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-violet-500 dark:shadow-[0_0_22px_-6px_rgba(139,92,246,0.6)] active:scale-[0.99] transition-all"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            <span>{t.settlement.sendWhatsapp}</span>
          </a>
        </div>
      </section>
    </div>
  );
}
