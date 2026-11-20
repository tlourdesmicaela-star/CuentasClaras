import { TRANSLATIONS, type TranslationDict } from '../i18n/translations';
import type { ExpenseItem, Participant, PaymentDetails } from '../types/expense';
import { formatCurrency } from './currency';
import type { SettlementSummary } from './settlement';

export function formatWhatsAppSummary(options: {
  title: string;
  date: string;
  participants: Participant[];
  expenses: ExpenseItem[];
  summary: SettlementSummary;
  paymentDetails: PaymentDetails;
  includeBreakdown: boolean;
  labels?: TranslationDict['whatsapp'];
}): string {
  const {
    title,
    date,
    participants,
    expenses,
    summary,
    paymentDetails,
    includeBreakdown,
    labels = TRANSLATIONS.es.whatsapp,
  } = options;

  const lines: string[] = [];
  lines.push(`🧾 *${title || labels.defaultTitle}*`);
  lines.push(`📅 ${date} · 👥 ${participants.length} ${labels.people}`);
  lines.push(`💰 *${labels.totalSpent}: ${formatCurrency(summary.totalSpent)}*`);
  lines.push(`📊 ${labels.average}: ${formatCurrency(summary.averagePerPerson)} ${labels.each}`);

  if (includeBreakdown && expenses.length > 0) {
    lines.push('');
    lines.push(`📋 *${labels.expenseDetail}*`);
    for (const exp of expenses) {
      const payerText = exp.payers
        .map((p) => {
          const found = participants.find((part) => part.id === p.participantId);
          return found ? found.name : labels.someone;
        })
        .join(` ${labels.and} `);
      const isExcluded = exp.splitAmongIds.length > 0 && exp.splitAmongIds.length < participants.length;
      const splitNote = isExcluded
        ? ` (${labels.between} ${exp.splitAmongIds.length})`
        : '';
      lines.push(`• ${exp.description}: *${formatCurrency(exp.amount)}* — ${labels.paidBy} ${payerText}${splitNote}`);
    }
  }

  lines.push('');
  lines.push(`💸 *${labels.minSettlement}*`);
  if (summary.transfers.length === 0) {
    lines.push(`✅ ${labels.allEven}`);
  } else {
    for (const t of summary.transfers) {
      lines.push(`➡️ *${t.fromName}* ${labels.transfersTo} *${formatCurrency(t.amount)}* ${labels.toWord} *${t.toName}*`);
    }
  }

  if (paymentDetails.aliasOrCbu.trim()) {
    lines.push('');
    lines.push(`🏦 *${labels.transferData}*`);
    lines.push(`${labels.aliasLabel}: \`${paymentDetails.aliasOrCbu.trim()}\``);
    if (paymentDetails.accountHolder.trim()) {
      lines.push(`${labels.holderLabel}: ${paymentDetails.accountHolder.trim()}`);
    }
  }

  lines.push('');
  lines.push(`_${labels.footer}_`);
  return lines.join('\n');
}
