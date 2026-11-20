import type { ExpenseItem, Participant, PersonBalance, Transfer } from '../types/expense';

export interface SettlementSummary {
  totalSpent: number;
  averagePerPerson: number;
  balances: PersonBalance[];
  transfers: Transfer[];
}

export function calculateMinimumSettlement(
  participants: Participant[],
  expenses: ExpenseItem[]
): SettlementSummary {
  const totalSpent = expenses.reduce((sum, item) => sum + Math.round(item.amount), 0);

  if (participants.length === 0) {
    return {
      totalSpent,
      averagePerPerson: 0,
      balances: [],
      transfers: [],
    };
  }

  const paidMap = new Map<string, number>();
  const consumedMap = new Map<string, number>();

  for (const p of participants) {
    paidMap.set(p.id, 0);
    consumedMap.set(p.id, 0);
  }

  for (const expense of expenses) {
    const expenseAmount = Math.round(expense.amount);
    if (expenseAmount <= 0) continue;

    // Tally payers cleanly
    const validPayers = expense.payers.filter((p) => paidMap.has(p.participantId) && p.amount > 0);
    const totalDeclaredPaid = validPayers.reduce((s, p) => s + p.amount, 0);

    if (validPayers.length > 0 && totalDeclaredPaid > 0) {
      // Scale payers proportionally if partial amounts differ slightly from expense.amount
      let distributedPaid = 0;
      validPayers.forEach((payer, index) => {
        const share =
          index === validPayers.length - 1
            ? expenseAmount - distributedPaid
            : Math.round((payer.amount / totalDeclaredPaid) * expenseAmount);
        distributedPaid += share;
        paidMap.set(payer.participantId, (paidMap.get(payer.participantId) ?? 0) + share);
      });
    } else if (participants.length > 0) {
      // Fallback to first participant if payer missing
      const firstId = participants[0].id;
      paidMap.set(firstId, (paidMap.get(firstId) ?? 0) + expenseAmount);
    }

    // Tally consumption across participating diners with exact integer remainder distribution
    const validSplitIds = expense.splitAmongIds.filter((id) => consumedMap.has(id));
    const consumers = validSplitIds.length > 0 ? validSplitIds : participants.map((p) => p.id);

    const baseShare = Math.floor(expenseAmount / consumers.length);
    const remainder = expenseAmount - baseShare * consumers.length;

    consumers.forEach((id, idx) => {
      const share = baseShare + (idx < remainder ? 1 : 0);
      consumedMap.set(id, (consumedMap.get(id) ?? 0) + share);
    });
  }

  const balances: PersonBalance[] = participants.map((p) => {
    const paid = paidMap.get(p.id) ?? 0;
    const consumed = consumedMap.get(p.id) ?? 0;
    return {
      participantId: p.id,
      name: p.name,
      paid,
      consumed,
      netBalance: paid - consumed,
    };
  });

  // Greedy Minimum Cash Flow Simplification
  const debtors = balances
    .filter((b) => b.netBalance < -1)
    .map((b) => ({ id: b.participantId, name: b.name, amount: -b.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = balances
    .filter((b) => b.netBalance > 1)
    .map((b) => ({ id: b.participantId, name: b.name, amount: b.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const transferAmount = Math.min(debtor.amount, creditor.amount);

    if (transferAmount > 0) {
      transfers.push({
        id: `${debtor.id}->${creditor.id}`,
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        amount: Math.round(transferAmount),
      });
    }

    debtor.amount -= transferAmount;
    creditor.amount -= transferAmount;

    if (debtor.amount <= 1) i++;
    if (creditor.amount <= 1) j++;
  }

  return {
    totalSpent,
    averagePerPerson: Math.round(totalSpent / participants.length),
    balances: balances.sort((a, b) => b.netBalance - a.netBalance),
    transfers,
  };
}
