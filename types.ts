
export enum UnitStatus {
  VACANT = 'VACANT',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE'
}

export interface RentalUnit {
  id: string;
  name: string; // e.g., "Pintu A1"
  area: string; // e.g., "Wilayah Timur"
  monthlyPrice: number;
  status: UnitStatus;
}

export interface Tenant {
  id: string;
  name: string;
  unitId: string;
  moveInDate: string;
  dueDay: number; // Day of month for payment
  contact: string;
  documentUrl?: string; // Base64 string of the uploaded document/ID
  accumulatedPaidRent?: number; // Total rent paid from closed periods
}

export interface Payment {
  id: string;
  tenantId: string;
  unitId: string;
  amount: number;
  date: string;
  periodCovered: string; // e.g., "Januari 2024"
  notes: string;
  isInstallment: boolean;
  proofUrl?: string;
  createdAt?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  area?: string; // Optional area association
  proofUrl?: string;
  createdAt?: string;
}

export interface OtherIncome {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  notes?: string;
  allocateToWallet?: boolean; // If true (default), allocated to Zakat/Cash/Saving. If false, only to Dividends.
  createdAt?: string;
}

export interface WalletTransaction {
  id: string;
  wallet: 'zakat' | 'cash' | 'saving';
  type: 'income' | 'expense';
  amount: number;
  date: string;
  description: string;
  proofUrl?: string;
  createdAt: string;
}

export interface DividendRecipient {
  id: string;
  name: string;
  percentage: number; // e.g., 50 for 50%
}

export interface BookClosingAllocation {
  cash: number;
  saving: number;
  zakat: number;
  dividends: { recipientId: string; recipientName: string; amount: number }[];
  isManualCash?: boolean;
  isManualSaving?: boolean;
}

export interface BookClosing {
  id: string;
  periodMonth: number;
  periodYear: number;
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  allocation: BookClosingAllocation;
  closedAt: string;
  closedBy: string;
  notes?: string;
  archivedPayments?: Payment[];
  archivedExpenses?: Expense[];
  archivedOtherIncomes?: OtherIncome[];
}

export interface User {
  username: string;
  pin: string;
  role: 'admin' | 'user' | 'viewer' | 'accountant';
  allowedAreas?: string[];
}

export interface AppLog {
  id: string;
  timestamp: string;
  user: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'UPLOAD' | 'LOGIN' | 'OTHER';
  entity: string;
  details: string;
}

export interface AppData {
  units: RentalUnit[];
  tenants: Tenant[];
  payments: Payment[];
  expenses: Expense[];
  otherIncomes?: OtherIncome[];
  walletTransactions?: WalletTransaction[];
  areas: string[];
  expenseCategories: string[];
  users: User[];
  bookClosings?: BookClosing[];
  dividendRecipients?: DividendRecipient[];
  logs?: AppLog[];
  settings?: {
    cashPercentage: number;
    savingPercentage: number;
  };
}
