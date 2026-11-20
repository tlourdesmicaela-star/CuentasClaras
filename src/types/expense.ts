export type ExpenseCategory = 'comida' | 'bebida' | 'transporte' | 'otros';

export interface PayerContribution {
  participantId: string;
  amount: number;
}

export interface Participant {
  id: string;
  name: string;
}

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  payers: PayerContribution[];
  splitAmongIds: string[];
  source?: 'manual' | 'ai' | 'js' | 'ocr';
  createdAt: string;
}

export interface ReceiptScanItem {
  id: string;
  name: string;
  quantity: number;
  totalPrice: number;
  category: ExpenseCategory;
  splitAmongIds: string[];
  selected: boolean;
}

export interface ReceiptScanResult {
  merchantName: string;
  date: string;
  detectedTotal: number;
  items: ReceiptScanItem[];
}

export interface PersonBalance {
  participantId: string;
  name: string;
  paid: number;
  consumed: number;
  netBalance: number;
}

export interface Transfer {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}

export interface PaymentDetails {
  aliasOrCbu: string;
  accountHolder: string;
}

export interface Gathering {
  id: string;
  title: string;
  date: string;
  participants: Participant[];
  expenses: ExpenseItem[];
  settledTransferIds: string[];
  updatedAt: string;
}
