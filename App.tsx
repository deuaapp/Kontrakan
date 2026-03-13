
import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadData, saveData, uploadFileToGAS } from './services/storageService';
import { AppData, RentalUnit, Tenant, Payment, UnitStatus, Expense, User, BookClosing, DividendRecipient, OtherIncome, WalletTransaction } from './types';
import StatCard from './components/StatCard';
import UnitCard from './components/UnitCard';
import Dropdown from './components/Dropdown';
import MultiSelectDropdown from './components/MultiSelectDropdown';
import Logo from './components/Logo';

const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('amg_isLoggedIn') === 'true');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('amg_theme') as 'light' | 'dark') || 'light');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('amg_currentUser');
    return saved ? JSON.parse(saved) : null;
  });
  const [loginName, setLoginName] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Persist login state and theme
  useEffect(() => {
    localStorage.setItem('amg_isLoggedIn', isLoggedIn.toString());
    localStorage.setItem('amg_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (currentUser) {
      localStorage.setItem('amg_currentUser', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('amg_currentUser');
    }
  }, [isLoggedIn, currentUser, theme]);

  const hasWriteAccessToArea = (area: string) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'viewer') return false;
    if (currentUser.role === 'accountant') return false; // Or true? Accountant usually doesn't edit operational data, just views or manages accounting. Let's say false for operational data.
    // role is 'user'
    if (!currentUser.allowedAreas || currentUser.allowedAreas.length === 0) return false;
    return currentUser.allowedAreas.includes(area);
  };

  // App Mode State
  const [appMode, setAppMode] = useState<'transaction' | 'accounting'>(() => 
    (localStorage.getItem('amg_appMode') as 'transaction' | 'accounting') || 'transaction'
  );
  const [showPortal, setShowPortal] = useState(() => localStorage.getItem('amg_showPortal') === 'true');

  // Persist mode and portal state
  useEffect(() => {
    localStorage.setItem('amg_appMode', appMode);
    localStorage.setItem('amg_showPortal', showPortal.toString());
  }, [appMode, showPortal]);

  const [data, setData] = useState<AppData>({ 
    units: [], tenants: [], payments: [], expenses: [], otherIncomes: [], areas: [], expenseCategories: [], users: [], bookClosings: [],
    dividendRecipients: [],
    settings: { cashPercentage: 20, savingPercentage: 30 }
  });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'units' | 'tenants' | 'transactions' | 'reports'>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Accounting Settings State
  const [accountingTab, setAccountingTab] = useState<'closing' | 'settings' | 'balance'>('closing');
  const [cashPercentage, setCashPercentage] = useState(20);
  const [savingPercentage, setSavingPercentage] = useState(30);
  const [dividendRecipients, setDividendRecipients] = useState<DividendRecipient[]>([]);
  const [newRecipientName, setNewRecipientName] = useState('');
  const [newRecipientPercentage, setNewRecipientPercentage] = useState(0);

  // ... (rest of the state)

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = data.users.find(u => u.username.toLowerCase() === loginName.toLowerCase() && u.pin === loginPin);
    if (user) {
      setIsLoggedIn(true);
      setCurrentUser(user);
      setLoginError('');
      
      // Determine initial mode based on role
      if (user.role === 'user') {
        setAppMode('transaction');
        setShowPortal(false);
      } else if (user.role === 'accountant') {
        setAppMode('accounting');
        setShowPortal(false);
      } else {
        // Admin and Viewer can choose
        setShowPortal(true);
      }
    } else {
      setLoginError('Nama atau PIN salah');
    }
  };

  const totalZakat = (data.bookClosings?.reduce((acc, c) => acc + (c.allocation?.zakat || 0), 0) || 0) + 
    (data.walletTransactions?.filter(t => t.wallet === 'zakat').reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0) || 0);
  
  const totalCash = (data.bookClosings?.reduce((acc, c) => acc + (c.allocation?.cash || 0), 0) || 0) + 
    (data.walletTransactions?.filter(t => t.wallet === 'cash').reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0) || 0);
    
  const totalSaving = (data.bookClosings?.reduce((acc, c) => acc + (c.allocation?.saving || 0), 0) || 0) + 
    (data.walletTransactions?.filter(t => t.wallet === 'saving').reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0) || 0);

  const handleSaveWalletTransaction = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      
      if (editingWalletTransaction) {
        const updatedTx: WalletTransaction = {
          ...editingWalletTransaction,
          wallet: selectedWalletForTransaction,
          type: formData.get('type') as 'income' | 'expense',
          amount: Number(formData.get('amount')),
          date: formData.get('date') as string,
          description: formData.get('description') as string,
        };
        const newData = { 
          ...data, 
          walletTransactions: data.walletTransactions?.map(t => t.id === updatedTx.id ? updatedTx : t) || [] 
        };
        setData(newData); saveData(newData); 
        setEditingWalletTransaction(null);
        setIsWalletTransactionModalOpen(false);
        showToast('Transaksi dompet berhasil diperbarui');
      } else {
        const newTx: WalletTransaction = {
          id: Date.now().toString(),
          wallet: selectedWalletForTransaction,
          type: formData.get('type') as 'income' | 'expense',
          amount: Number(formData.get('amount')),
          date: formData.get('date') as string,
          description: formData.get('description') as string,
          createdAt: new Date().toISOString()
        };
        const newData = { ...data, walletTransactions: [...(data.walletTransactions || []), newTx] };
        setData(newData); saveData(newData); setIsWalletTransactionModalOpen(false);
        showToast('Transaksi dompet berhasil dicatat');
      }
    });
  };

  const handleDeleteWalletTransaction = (id: string) => {
    openConfirmModal('Hapus transaksi dompet ini?', () => {
      withLoading(() => {
        const newData = { ...data, walletTransactions: data.walletTransactions?.filter(t => t.id !== id) || [] };
        setData(newData); saveData(newData);
        showToast('Transaksi dompet berhasil dihapus');
      });
    });
  };

  const handleSelectAppMode = (mode: 'transaction' | 'accounting') => {
    setAppMode(mode);
    setShowPortal(false);
  };


  
  // Report State
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportSelectedAreas, setReportSelectedAreas] = useState<string[]>([]);

  const unclosedPeriods = React.useMemo(() => {
    const periods = new Set<string>();
    
    data.payments.forEach(p => {
      const d = new Date(p.date);
      periods.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    
    (data.otherIncomes || []).forEach(i => {
      const d = new Date(i.date);
      periods.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    
    data.expenses.forEach(e => {
      const d = new Date(e.date);
      periods.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    
    (data.bookClosings || []).forEach(c => {
      periods.delete(`${c.periodYear}-${c.periodMonth}`);
    });
    
    return Array.from(periods).map(p => {
      const [year, month] = p.split('-');
      return { year: parseInt(year), month: parseInt(month) };
    }).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [data.payments, data.otherIncomes, data.expenses, data.bookClosings]);

  // Transaction Filter State
  const [transactionFilterMonth, setTransactionFilterMonth] = useState(new Date().getMonth());
  const [transactionFilterYear, setTransactionFilterYear] = useState(new Date().getFullYear());
  const [transactionSelectedAreas, setTransactionSelectedAreas] = useState<string[]>([]);
  
  // Modals visibility
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAddUnitModalOpen, setIsAddUnitModalOpen] = useState(false);
  const [isAddAreaModalOpen, setIsAddAreaModalOpen] = useState(false);
  const [isAddTenantModalOpen, setIsAddTenantModalOpen] = useState(false);
  const [isEditUnitModalOpen, setIsEditUnitModalOpen] = useState(false);
  const [isEditAreaModalOpen, setIsEditAreaModalOpen] = useState(false);
  const [isEditTenantModalOpen, setIsEditTenantModalOpen] = useState(false);
  const [isTenantHistoryModalOpen, setIsTenantHistoryModalOpen] = useState(false);
  const [isEditPaymentModalOpen, setIsEditPaymentModalOpen] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [isAddOtherIncomeModalOpen, setIsAddOtherIncomeModalOpen] = useState(false);
  const [isEditOtherIncomeModalOpen, setIsEditOtherIncomeModalOpen] = useState(false);
  const [isEditExpenseModalOpen, setIsEditExpenseModalOpen] = useState(false);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isUserManagementModalOpen, setIsUserManagementModalOpen] = useState(false);
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);
  const [isConfirmCloseBookModalOpen, setIsConfirmCloseBookModalOpen] = useState(false);
  const [isWalletTransactionModalOpen, setIsWalletTransactionModalOpen] = useState(false);
  const [selectedWalletForTransaction, setSelectedWalletForTransaction] = useState<'zakat' | 'cash' | 'saving'>('cash');
  const [editingWalletTransaction, setEditingWalletTransaction] = useState<WalletTransaction | null>(null);

  // Active selections
  const [selectedUnit, setSelectedUnit] = useState<RentalUnit | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [selectedOtherIncome, setSelectedOtherIncome] = useState<OtherIncome | null>(null);
  const [selectedDateInCalendar, setSelectedDateInCalendar] = useState<number | null>(new Date().getDate());
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ key: keyof Tenant | 'duration', direction: 'asc' | 'desc' } | null>(null);

  // File upload state
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Confirmation Modal State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const openAlertModal = (message: string) => {
    setAlertMessage(message);
    setIsAlertModalOpen(true);
  };

  // Book Closing Detail Modal State
  const [isClosingDetailModalOpen, setIsClosingDetailModalOpen] = useState(false);
  const [selectedBookClosing, setSelectedBookClosing] = useState<BookClosing | null>(null);

  // Manual Allocation State
  const [manualCashAmount, setManualCashAmount] = useState<number | null>(null);
  const [manualSavingAmount, setManualSavingAmount] = useState<number | null>(null);
  const [isEditAllocationModalOpen, setIsEditAllocationModalOpen] = useState(false);
  const [editAllocationType, setEditAllocationType] = useState<'cash' | 'saving' | null>(null);
  const [tempAllocationAmount, setTempAllocationAmount] = useState<string>('');

  // Export Note State
  const [isExportNoteModalOpen, setIsExportNoteModalOpen] = useState(false);
  const [exportNote, setExportNote] = useState('');

  // Book Closing History Pagination & Filter
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFilterYear, setHistoryFilterYear] = useState<number | 'all'>('all');
  const historyItemsPerPage = 6;

  // Balance Details Pagination & Filter
  const [balancePage, setBalancePage] = useState(1);
  const [balanceFilterYear, setBalanceFilterYear] = useState<number | 'all'>('all');
  const balanceItemsPerPage = 6;

  // Form Dropdown States
  const [formAddUnitArea, setFormAddUnitArea] = useState('');
  const [formEditUnitArea, setFormEditUnitArea] = useState('');
  const [formAddExpenseArea, setFormAddExpenseArea] = useState('');
  const [formAddExpenseCategory, setFormAddExpenseCategory] = useState('');
  const [formEditExpenseArea, setFormEditExpenseArea] = useState('');
  const [formEditExpenseCategory, setFormEditExpenseCategory] = useState('');

  // Toast & Loading State
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const withLoading = async (action: () => Promise<void> | void) => {
    setIsLoading(true);
    try {
      await action();
    } catch (error) {
      console.error(error);
      showToast('Terjadi kesalahan sistem', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const openConfirmModal = (message: string, action: () => void) => {
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setIsConfirmModalOpen(true);
  };

  const handleConfirm = () => {
    confirmAction();
    setIsConfirmModalOpen(false);
  };

  const getDefaultUnclosedPeriod = (appData: AppData) => {
    const periods = new Set<string>();
    appData.payments.forEach(p => {
      const d = new Date(p.date);
      periods.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    appData.expenses.forEach(e => {
      const d = new Date(e.date);
      periods.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    (appData.otherIncomes || []).forEach(i => {
      const d = new Date(i.date);
      periods.add(`${d.getFullYear()}-${d.getMonth()}`);
    });

    const closedPeriods = new Set(appData.bookClosings?.map(c => `${c.periodYear}-${c.periodMonth}`) || []);
    const unclosedPeriods = Array.from(periods).filter(p => !closedPeriods.has(p));

    if (unclosedPeriods.length > 0) {
      // Sort descending to get the latest unclosed period
      unclosedPeriods.sort((a, b) => {
        const [yearA, monthA] = a.split('-').map(Number);
        const [yearB, monthB] = b.split('-').map(Number);
        if (yearA !== yearB) return yearB - yearA;
        return monthB - monthA;
      });
      const [year, month] = unclosedPeriods[0].split('-').map(Number);
      return { month, year };
    }
    
    return { month: new Date().getMonth(), year: new Date().getFullYear() };
  };

  // Load data on mount
  useEffect(() => {
    const init = async () => {
      await withLoading(async () => {
        const initialData = await loadData();
        // Initialize default settings if not present
        if (!initialData.settings) {
          initialData.settings = { cashPercentage: 20, savingPercentage: 30 };
        }
        if (!initialData.dividendRecipients) {
          initialData.dividendRecipients = [];
        }
        setData(initialData);
        setCashPercentage(initialData.settings.cashPercentage);
        setSavingPercentage(initialData.settings.savingPercentage);
        setDividendRecipients(initialData.dividendRecipients);

        const defaultPeriod = getDefaultUnclosedPeriod(initialData);
        setReportMonth(defaultPeriod.month);
        setReportYear(defaultPeriod.year);
      });
    };
    init();
  }, []);

  const currentMonthDate = new Date();
  const daysInMonth = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1).getDay();
  const currentPeriod = `${monthNames[currentMonthDate.getMonth()]} ${currentMonthDate.getFullYear()}`;

  const isPeriodClosed = (date: Date) => {
    return data.bookClosings?.some(b => b.periodMonth === date.getMonth() && b.periodYear === date.getFullYear());
  };

  const handleBookClosing = () => {
    // Check if already closed
    const isClosed = data.bookClosings?.some(b => b.periodMonth === reportMonth && b.periodYear === reportYear);
    if (isClosed) {
      showToast('Periode ini sudah ditutup buku!', 'error');
      return;
    }
    setManualCashAmount(null);
    setManualSavingAmount(null);
    setIsConfirmCloseBookModalOpen(true);
  };

  const processBookClosing = () => {
    // 1. Identify transactions to remove (and archive)
    const paymentsToRemove = data.payments.filter(p => {
      const d = new Date(p.date);
      return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
    });

    const expensesToRemove = data.expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
    });

    const otherIncomesToRemove = data.otherIncomes?.filter(i => {
      const d = new Date(i.date);
      return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
    }) || [];

    // Calculate totals from the identified transactions
    const rentalIncome = paymentsToRemove.reduce((acc, p) => acc + p.amount, 0);
    
    const allocatedOtherIncome = otherIncomesToRemove
      .filter(i => i.allocateToWallet !== false)
      .reduce((acc, i) => acc + i.amount, 0);

    const dividendOnlyOtherIncome = otherIncomesToRemove
      .filter(i => i.allocateToWallet === false)
      .reduce((acc, i) => acc + i.amount, 0);

    const income = rentalIncome + allocatedOtherIncome + dividendOnlyOtherIncome;
    const expense = expensesToRemove.reduce((acc, e) => acc + e.amount, 0);

    // Operational Net Income (for Zakat, Cash, Saving)
    const operationalIncome = rentalIncome + allocatedOtherIncome;
    const operationalNetIncome = operationalIncome - expense;

    const netIncome = income - expense;

    // Calculate Allocations
    const zakatAmount = operationalNetIncome > 0 ? operationalNetIncome * 0.025 : 0;
    
    const cashAmount = manualCashAmount !== null ? manualCashAmount : (operationalNetIncome * (cashPercentage / 100));
    const savingAmount = manualSavingAmount !== null ? manualSavingAmount : (operationalNetIncome * (savingPercentage / 100));
    
    const dividendPool = (operationalNetIncome - zakatAmount - cashAmount - savingAmount) + dividendOnlyOtherIncome;
    
    const totalRecipientPercentage = dividendRecipients.reduce((acc, r) => acc + r.percentage, 0);
    
    const dividends = dividendRecipients.map(r => ({
      recipientId: r.id,
      recipientName: r.name,
      amount: totalRecipientPercentage > 0 ? (r.percentage / totalRecipientPercentage) * dividendPool : 0
    }));

    const newClosing: BookClosing = {
      id: Date.now().toString(),
      periodMonth: reportMonth,
      periodYear: reportYear,
      totalIncome: income,
      totalExpense: expense,
      netIncome: netIncome,
      allocation: {
        cash: cashAmount,
        saving: savingAmount,
        zakat: zakatAmount,
        dividends: dividends
      },
      closedAt: new Date().toISOString(),
      closedBy: currentUser?.username || 'Unknown',
      notes: `Tutup buku periode ${monthNames[reportMonth]} ${reportYear}`,
      archivedPayments: paymentsToRemove,
      archivedExpenses: expensesToRemove,
      archivedOtherIncomes: otherIncomesToRemove
    };

    // 2. Update Tenants' accumulatedPaidRent
    const updatedTenants = data.tenants.map(t => {
      const tenantPayments = paymentsToRemove.filter(p => p.tenantId === t.id);
      const totalPaidInPeriod = tenantPayments.reduce((acc, p) => acc + p.amount, 0);
      return {
        ...t,
        accumulatedPaidRent: (t.accumulatedPaidRent || 0) + totalPaidInPeriod
      };
    });

    // 3. Filter out the removed transactions
    const remainingPayments = data.payments.filter(p => !paymentsToRemove.includes(p));
    const remainingExpenses = data.expenses.filter(e => !expensesToRemove.includes(e));
    const remainingOtherIncomes = data.otherIncomes?.filter(i => !otherIncomesToRemove.includes(i)) || [];

    const updatedClosings = [...(data.bookClosings || []), newClosing];
    
    const updatedData = { 
      ...data, 
      bookClosings: updatedClosings,
      tenants: updatedTenants,
      payments: remainingPayments,
      expenses: remainingExpenses,
      otherIncomes: remainingOtherIncomes
    };
    
    setData(updatedData);
    saveData(updatedData);
    setIsConfirmCloseBookModalOpen(false);
    showToast('Tutup buku berhasil! Transaksi periode ini telah di-reset');
  };

  const handleDeleteBookClosing = (id: string) => {
    openConfirmModal('Apakah Anda yakin ingin menghapus riwayat tutup buku ini? Transaksi yang diarsipkan akan dikembalikan.', () => {
      withLoading(() => {
        const closingToDelete = data.bookClosings?.find(b => b.id === id);
        if (!closingToDelete) return;

        // 1. Restore transactions
        const restoredPayments = closingToDelete.archivedPayments || [];
        const restoredExpenses = closingToDelete.archivedExpenses || [];
        const restoredOtherIncomes = closingToDelete.archivedOtherIncomes || [];

        // 2. Subtract restored payments from Tenants' accumulatedPaidRent
        const updatedTenants = data.tenants.map(t => {
          const tenantRestoredPayments = restoredPayments.filter(p => p.tenantId === t.id);
          const totalRestored = tenantRestoredPayments.reduce((acc, p) => acc + p.amount, 0);
          return {
            ...t,
            accumulatedPaidRent: Math.max(0, (t.accumulatedPaidRent || 0) - totalRestored)
          };
        });

        const newData = {
          ...data,
          bookClosings: data.bookClosings?.filter(b => b.id !== id) || [],
          tenants: updatedTenants,
          payments: [...data.payments, ...restoredPayments],
          expenses: [...data.expenses, ...restoredExpenses],
          otherIncomes: [...(data.otherIncomes || []), ...restoredOtherIncomes]
        };
        
        setData(newData);
        saveData(newData);
        showToast('Riwayat tutup buku berhasil dihapus dan transaksi dikembalikan');
      });
    });
  };

  const handleAddRecipient = () => {
    if (newRecipientName && newRecipientPercentage > 0) {
      const currentTotal = dividendRecipients.reduce((acc, r) => acc + r.percentage, 0);
      const newTotal = currentTotal + newRecipientPercentage;
      
      if (newTotal > 100) {
        const remaining = 100 - currentTotal;
        openAlertModal(`Total persentase tidak boleh lebih dari 100%. Sisa persentase yang bisa diinput adalah ${remaining > 0 ? remaining : 0}%.`);
        return;
      }

      withLoading(() => {
        const newRecipient: DividendRecipient = {
          id: Date.now().toString(),
          name: newRecipientName,
          percentage: newRecipientPercentage
        };
        const updatedRecipients = [...dividendRecipients, newRecipient];
        setDividendRecipients(updatedRecipients);
        setNewRecipientName('');
        setNewRecipientPercentage(0);
        
        // Save settings immediately
        const updatedData = { 
          ...data, 
          dividendRecipients: updatedRecipients,
          settings: { cashPercentage, savingPercentage }
        };
        setData(updatedData);
        saveData(updatedData);
        showToast('Penerima dividen berhasil ditambahkan');
      });
    }
  };

  const handleDeleteRecipient = (id: string) => {
    openConfirmModal('Hapus penerima dividen ini?', () => {
      withLoading(() => {
        const updatedRecipients = dividendRecipients.filter(r => r.id !== id);
        setDividendRecipients(updatedRecipients);
        
        const updatedData = { 
            ...data, 
            dividendRecipients: updatedRecipients,
            settings: { cashPercentage, savingPercentage }
          };
          setData(updatedData);
          saveData(updatedData);
          showToast('Penerima dividen berhasil dihapus');
      });
    });
  };

  const handleSaveSettings = () => {
    withLoading(() => {
      const updatedData = { 
        ...data, 
        dividendRecipients: dividendRecipients,
        settings: { cashPercentage, savingPercentage }
      };
      setData(updatedData);
      saveData(updatedData);
      showToast('Pengaturan berhasil disimpan');
    });
  };

  const tenantsDueOnDay = (day: number) => {
    return data.tenants.filter(t => t.dueDay === day);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (dateString: string) => {
    const d = new Date(dateString);
    const day = d.getDate();
    const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const month = monthNamesShort[d.getMonth()];
    const year = d.getFullYear().toString().slice(-2);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
  };

  const getLocalDateString = (dateInput?: string | Date) => {
    if (!dateInput) {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (typeof dateInput === 'string' && !dateInput.includes('T')) {
      return dateInput;
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDuration = (dateString: string) => {
    const start = new Date(dateString);
    const now = new Date();
    let months = (now.getFullYear() - start.getFullYear()) * 12;
    months -= start.getMonth();
    months += now.getMonth();
    
    if (months < 1) return '< 1 Bln';
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    
    if (years > 0) return `${years} Thn ${remainingMonths > 0 ? `${remainingMonths} Bln` : ''}`;
    return `${months} Bln`;
  };

  // --- ARREARS (TUNGGAKAN) LOGIC ---
  const calculateArrears = (tenant: Tenant, unit: RentalUnit | undefined) => {
    if (!unit) return 0;
    const moveIn = new Date(tenant.moveInDate);
    const now = new Date();
    let months = (now.getFullYear() - moveIn.getFullYear()) * 12;
    months -= moveIn.getMonth();
    months += now.getMonth();
    const totalExpected = (Math.max(0, months) + 1) * unit.monthlyPrice;
    
    const currentPayments = data.payments
      .filter(p => p.tenantId === tenant.id)
      .reduce((acc, p) => acc + p.amount, 0);
      
    const totalPaid = (tenant.accumulatedPaidRent || 0) + currentPayments;
    
    return Math.max(0, totalExpected - totalPaid);
  };

  const totalArrears = useMemo(() => {
    return data.tenants.reduce((acc, t) => {
      const unit = data.units.find(u => u.id === t.unitId);
      return acc + calculateArrears(t, unit);
    }, 0);
  }, [data]);

  const handleSort = (key: keyof Tenant | 'duration') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // --- REPORT LOGIC ---
  const getReportData = useMemo(() => {
    const monthName = monthNames[reportMonth];
    
    // Filter payments by period string match (simple approach based on current data structure)
    let income = data.payments.filter(p => p.periodCovered.toLowerCase().includes(monthName.toLowerCase()) && p.periodCovered.includes(reportYear.toString()));
    
    // Filter by selected areas if any
    if (reportSelectedAreas.length > 0) {
      income = income.filter(p => {
        const unit = data.units.find(u => u.id === p.unitId);
        return unit && reportSelectedAreas.includes(unit.area);
      });
    }
    
    // Filter expenses by date and appMode
    const expenses = data.expenses.filter(e => {
      const d = new Date(e.date);
      const matchesDate = d.getMonth() === reportMonth && d.getFullYear() === reportYear;
      if (!matchesDate) return false;
      return appMode === 'accounting' || e.area;
    });

    const totalIncome = income.reduce((acc, curr) => acc + curr.amount, 0);
    const totalExpense = expenses.reduce((acc, curr) => acc + curr.amount, 0);
    
    return { income, expenses, totalIncome, totalExpense, net: totalIncome - totalExpense };
  }, [data, reportMonth, reportYear, reportSelectedAreas]);

  const handleExportPDF = () => {
    const tenantsWithArrears = data.tenants.map(t => {
      const unit = data.units.find(u => u.id === t.unitId);
      return {
        tenant: t,
        unit: unit,
        arrears: calculateArrears(t, unit)
      };
    }).filter(t => t.arrears > 0);

    if (tenantsWithArrears.length > 0) {
      setExportNote('');
      setIsExportNoteModalOpen(true);
    } else {
      generateReportPDF('');
    }
  };

  const generateReportPDF = (note: string) => {
    const { income, expenses, totalIncome, totalExpense, net } = getReportData;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text(`Laporan Keuangan ${monthNames[reportMonth]} ${reportYear}`, 14, 22);

    doc.setFontSize(14);
    doc.text("PENDAPATAN", 14, 32);
    
    const incomeRows = income.map(p => {
      const unit = data.units.find(u => u.id === p.unitId);
      const unitName = unit ? `${unit.area} - ${unit.name}` : '-';
      const tenantName = data.tenants.find(t => t.id === p.tenantId)?.name || '-';
      return [formatDate(p.date), unitName, tenantName, p.notes, p.amount.toLocaleString('id-ID')];
    });

    autoTable(doc, {
      startY: 36,
      head: [['Tanggal', 'Wilayah - Unit', 'Penyewa', 'Keterangan', 'Jumlah']],
      body: incomeRows,
      foot: [['', '', '', 'Total', totalIncome.toLocaleString('id-ID')]],
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    doc.text("PENGELUARAN", 14, finalY);

    const expenseRows = expenses.map(e => [
      formatDate(e.date),
      e.area || '-',
      e.category,
      e.description,
      e.amount.toLocaleString('id-ID')
    ]);

    autoTable(doc, {
      startY: finalY + 4,
      head: [['Tanggal', 'Wilayah', 'Kategori', 'Keterangan', 'Jumlah']],
      body: expenseRows,
      foot: [['', '', '', 'Total', totalExpense.toLocaleString('id-ID')]],
    });

    finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(12);
    doc.text(`BERSIH: Rp ${net.toLocaleString('id-ID')}`, 14, finalY);

    finalY += 15;

    // Add Arrears Table
    const tenantsWithArrears = data.tenants.map(t => {
      const unit = data.units.find(u => u.id === t.unitId);
      return {
        tenant: t,
        unit: unit,
        arrears: calculateArrears(t, unit)
      };
    }).filter(t => t.arrears > 0);

    if (tenantsWithArrears.length > 0) {
      doc.setFontSize(14);
      doc.text("RINCIAN TUNGGAKAN", 14, finalY);

      const arrearsRows = tenantsWithArrears.map(t => [
        t.tenant.name,
        t.unit ? `${t.unit.area} - ${t.unit.name}` : '-',
        t.tenant.contact,
        t.arrears.toLocaleString('id-ID')
      ]);

      const totalArrearsAmount = tenantsWithArrears.reduce((acc, curr) => acc + curr.arrears, 0);

      autoTable(doc, {
        startY: finalY + 4,
        head: [['Penyewa', 'Wilayah - Unit', 'No. HP', 'Jumlah Tunggakan']],
        body: arrearsRows,
        foot: [['', '', 'Total', totalArrearsAmount.toLocaleString('id-ID')]],
        theme: 'grid',
        headStyles: { fillColor: [225, 29, 72] } // Rose-600 color for arrears
      });
      
      finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    if (note.trim()) {
      doc.setFontSize(12);
      doc.setTextColor(225, 29, 72); // Rose-600
      doc.text("Catatan Tunggakan:", 14, finalY);
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // Slate-500
      
      const splitNote = doc.splitTextToSize(note, 180);
      doc.text(splitNote, 14, finalY + 6);
    }

    doc.save(`Laporan_${monthNames[reportMonth]}_${reportYear}.pdf`);
  };

  const exportBookClosingPDF = (closing: BookClosing) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text(`Laporan Tutup Buku ${monthNames[closing.periodMonth]} ${closing.periodYear}`, 14, 22);

    doc.setFontSize(12);
    doc.text(`Tanggal Tutup Buku: ${formatDateTime(closing.closedAt)}`, 14, 30);
    doc.text(`Ditutup Oleh: ${closing.closedBy}`, 14, 36);

    // Ringkasan
    doc.setFontSize(14);
    doc.text("RINGKASAN KEUANGAN", 14, 48);
    
    autoTable(doc, {
      startY: 52,
      head: [['Keterangan', 'Jumlah']],
      body: [
        ['Total Pemasukan', `Rp ${closing.totalIncome.toLocaleString('id-ID')}`],
        ['Total Pengeluaran', `Rp ${closing.totalExpense.toLocaleString('id-ID')}`],
        ['Laba Bersih', `Rp ${closing.netIncome.toLocaleString('id-ID')}`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Alokasi
    if (closing.allocation) {
      doc.setFontSize(14);
      doc.text("ALOKASI LABA", 14, finalY);
      
      const allocationRows = [
        ['Zakat (2.5%)', `Rp ${closing.allocation.zakat.toLocaleString('id-ID')}`],
        ['Kas', `Rp ${closing.allocation.cash.toLocaleString('id-ID')}`],
        ['Tabungan', `Rp ${closing.allocation.saving.toLocaleString('id-ID')}`]
      ];

      let totalDividen = 0;
      if (closing.allocation.dividends && closing.allocation.dividends.length > 0) {
        totalDividen = closing.allocation.dividends.reduce((acc, d) => acc + d.amount, 0);
        allocationRows.push(['Total Dividen', `Rp ${totalDividen.toLocaleString('id-ID')}`]);
      }

      autoTable(doc, {
        startY: finalY + 4,
        head: [['Kategori', 'Jumlah']],
        body: allocationRows,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] }
      });

      finalY = (doc as any).lastAutoTable.finalY + 10;

      if (closing.allocation.dividends && closing.allocation.dividends.length > 0) {
        doc.setFontSize(12);
        doc.text("Rincian Dividen:", 14, finalY);
        
        const dividendRows = closing.allocation.dividends.map(d => [
          d.recipientName,
          `Rp ${d.amount.toLocaleString('id-ID')}`
        ]);

        autoTable(doc, {
          startY: finalY + 4,
          head: [['Penerima', 'Jumlah']],
          body: dividendRows,
          theme: 'plain'
        });
        finalY = (doc as any).lastAutoTable.finalY + 10;
      }
    }

    doc.save(`Tutup_Buku_${monthNames[closing.periodMonth]}_${closing.periodYear}.pdf`);
  };

  const sortedTenants = useMemo(() => {
    let sortableTenants = [...data.tenants];
    if (sortConfig !== null) {
      sortableTenants.sort((a, b) => {
        if (sortConfig.key === 'duration') {
             const dateA = new Date(a.moveInDate).getTime();
             const dateB = new Date(b.moveInDate).getTime();
             // Duration is inverse of start date (earlier start date = longer duration)
             return sortConfig.direction === 'asc' ? dateB - dateA : dateA - dateB;
        }
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableTenants;
  }, [data.tenants, sortConfig]);

  // Helper to get direct link from Google Drive URL
  const getDirectDriveLink = (url: string) => {
    if (!url) return '';
    if (url.includes('drive.google.com')) {
      const fileId = url.match(/[-\w]{25,}/);
      if (fileId) {
        return `https://lh3.googleusercontent.com/d/${fileId[0]}`;
      }
    }
    return url;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      
      try {
        // Compress image before saving to base64
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target?.result as string;
          
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            
            // Compress to JPEG with 0.6 quality
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
            
            uploadFileToGAS(compressedBase64, file.name, 'image/jpeg')
              .then(url => {
                if (url) {
                  setUploadedFileBase64(url);
                  showToast('File berhasil diunggah');
                } else {
                  showToast('Gagal mengunggah file ke Drive', 'error');
                }
              })
              .catch(() => {
                showToast('Terjadi kesalahan saat mengunggah', 'error');
              })
              .finally(() => {
                setIsUploading(false);
              });
          };
          
          img.onerror = () => {
            showToast('Gagal memproses gambar', 'error');
            setIsUploading(false);
          };
        };
        
        reader.onerror = () => {
          showToast('Gagal membaca file', 'error');
          setIsUploading(false);
        };
      } catch (error) {
        showToast('Terjadi kesalahan', 'error');
        setIsUploading(false);
      }
    }
  };

  // --- UNIT ACTIONS ---
  const handleUnitAction = (unit: RentalUnit) => {
    setSelectedUnit(unit);
    if (unit.status === UnitStatus.OCCUPIED) {
      setIsPaymentModalOpen(true);
    } else {
      setUploadedFileBase64(null);
      setIsAddTenantModalOpen(true);
    }
  };

  const handleEditUnitInit = (unit: RentalUnit) => {
    setSelectedUnit(unit);
    setFormEditUnitArea(unit.area);
    setIsEditUnitModalOpen(true);
  };

  const handleDeleteUnit = (unitId: string) => {
    const unit = data.units.find(u => u.id === unitId);
    if (!unit || !hasWriteAccessToArea(unit.area)) {
      showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
      return;
    }

    openConfirmModal('Hapus unit ini?', () => {
      withLoading(() => {
        const newData = { ...data, units: data.units.filter(u => u.id !== unitId) };
        setData(newData); saveData(newData);
        showToast('Unit berhasil dihapus');
      });
    });
  };

  const handleUpdateUnit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUnit) return;
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      const area = formData.get('area') as string;
      if (!hasWriteAccessToArea(area) || !hasWriteAccessToArea(selectedUnit.area)) {
        showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
        return;
      }

      const updatedUnit: RentalUnit = {
        ...selectedUnit,
        name: formData.get('name') as string,
        area: area,
        monthlyPrice: Number(formData.get('price')),
      };
      const newData = { ...data, units: data.units.map(u => u.id === selectedUnit.id ? updatedUnit : u) };
      setData(newData); saveData(newData); setIsEditUnitModalOpen(false);
      showToast('Data unit berhasil diperbarui');
    });
  };

  const handleAddUnit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      const area = formData.get('area') as string;
      if (!hasWriteAccessToArea(area)) {
        showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
        return;
      }

      const newUnit: RentalUnit = {
        id: Math.random().toString(36).substr(2, 9),
        name: formData.get('name') as string,
        area: area,
        monthlyPrice: Number(formData.get('price')),
        status: UnitStatus.VACANT
      };
      const newData = { ...data, units: [...data.units, newUnit] };
      setData(newData); saveData(newData); setIsAddUnitModalOpen(false);
      showToast('Unit baru berhasil ditambahkan');
    });
  };

  // --- TENANT ACTIONS ---
  const handleAddTenant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUnit) return;
    withLoading(() => {
      if (!hasWriteAccessToArea(selectedUnit.area)) {
        showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
        return;
      }

      const formData = new FormData(e.currentTarget);
      const newTenant: Tenant = {
        id: Math.random().toString(36).substr(2, 9),
        name: formData.get('name') as string,
        unitId: selectedUnit.id,
        moveInDate: formData.get('moveInDate') as string,
        dueDay: Number(formData.get('dueDay')),
        contact: formData.get('contact') as string,
        documentUrl: uploadedFileBase64 || undefined
      };
      const newData: AppData = {
        ...data,
        tenants: [...data.tenants, newTenant],
        units: data.units.map(u => u.id === selectedUnit.id ? { ...u, status: UnitStatus.OCCUPIED } : u)
      };
      setData(newData); saveData(newData); setIsAddTenantModalOpen(false); setUploadedFileBase64(null);
      showToast('Penyewa berhasil ditambahkan');
    });
  };

  const handleEditTenantInit = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setUploadedFileBase64(tenant.documentUrl || null);
    setIsEditTenantModalOpen(true);
  };

  const handleUpdateTenant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTenant) return;
    withLoading(() => {
      const unit = data.units.find(u => u.id === selectedTenant.unitId);
      if (!unit || !hasWriteAccessToArea(unit.area)) {
        showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
        return;
      }

      const formData = new FormData(e.currentTarget);
      const updatedTenant: Tenant = {
        ...selectedTenant,
        name: formData.get('name') as string,
        dueDay: Number(formData.get('dueDay')),
        contact: formData.get('contact') as string,
        documentUrl: uploadedFileBase64 || undefined
      };
      const newData = { ...data, tenants: data.tenants.map(t => t.id === selectedTenant.id ? updatedTenant : t) };
      setData(newData); saveData(newData); setIsEditTenantModalOpen(false); setUploadedFileBase64(null);
      showToast('Data penyewa berhasil diperbarui');
    });
  };

  const handleDeleteTenant = (tenantId: string) => {
    const tenant = data.tenants.find(t => t.id === tenantId);
    if (!tenant) return;
    const unit = data.units.find(u => u.id === tenant.unitId);
    if (!unit || !hasWriteAccessToArea(unit.area)) {
      showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
      return;
    }

    openConfirmModal('Keluarkan penyewa?', () => {
      withLoading(() => {
        const newData: AppData = {
          ...data,
          tenants: data.tenants.filter(t => t.id !== tenantId),
          units: data.units.map(u => u.id === tenant.unitId ? { ...u, status: UnitStatus.VACANT } : u)
        };
        setData(newData); saveData(newData);
        showToast('Penyewa berhasil dikeluarkan');
      });
    });
  };

  const handleViewTenantHistory = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setIsTenantHistoryModalOpen(true);
  };

  // --- AREA ACTIONS ---
  const handleAddArea = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (currentUser?.role !== 'admin') {
      showToast('Hanya admin yang dapat menambah wilayah', 'error');
      return;
    }
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      const newAreaName = (formData.get('areaName') as string).trim();
      if (!newAreaName) return;
      if (data.areas.includes(newAreaName)) { showToast('Wilayah sudah ada!', 'error'); return; }
      const newData = { ...data, areas: [...data.areas, newAreaName] };
      setData(newData); saveData(newData); setIsAddAreaModalOpen(false);
      showToast('Wilayah berhasil ditambahkan');
    });
  };

  const handleEditAreaInit = (area: string) => {
    setSelectedArea(area);
    setIsEditAreaModalOpen(true);
  };

  const handleUpdateArea = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (currentUser?.role !== 'admin') {
      showToast('Hanya admin yang dapat mengedit wilayah', 'error');
      return;
    }
    if (!selectedArea) return;
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      const newName = (formData.get('areaName') as string).trim();
      if (!newName || newName === selectedArea) { setIsEditAreaModalOpen(false); return; }
      const newData = {
        ...data,
        areas: data.areas.map(a => a === selectedArea ? newName : a),
        units: data.units.map(u => u.area === selectedArea ? { ...u, area: newName } : u)
      };
      setData(newData); saveData(newData); setIsEditAreaModalOpen(false);
      showToast('Nama wilayah berhasil diperbarui');
    });
  };

  const handleDeleteArea = (area: string) => {
    if (currentUser?.role !== 'admin') {
      showToast('Hanya admin yang dapat menghapus wilayah', 'error');
      return;
    }

    openConfirmModal(`Hapus wilayah "${area}"?`, () => {
      withLoading(() => {
        const newData = {
          ...data,
          areas: data.areas.filter(a => a !== area),
          units: data.units.map(u => u.area === area ? { ...u, area: '' } : u)
        };
        setData(newData); saveData(newData);
        showToast('Wilayah berhasil dihapus');
      });
    });
  };

  // --- PAYMENT ACTIONS ---
  const handleAddPayment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUnit) return;
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      
      const dateStr = formData.get('date') as string;
      if (isPeriodClosed(new Date(dateStr))) {
        showToast('Periode untuk tanggal ini sudah ditutup buku', 'error');
        return;
      }

      if (!hasWriteAccessToArea(selectedUnit.area)) {
        showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
        return;
      }

      const tenant = data.tenants.find(t => t.unitId === selectedUnit.id);
      if (!tenant) return;
      const newPayment: Payment = {
        id: Math.random().toString(36).substr(2, 9),
        tenantId: tenant.id,
        unitId: selectedUnit.id,
        amount: Number(formData.get('amount')),
        date: formData.get('date') as string,
        periodCovered: formData.get('period') as string,
        notes: formData.get('notes') as string,
        isInstallment: formData.get('isInstallment') === 'on',
        createdAt: new Date().toISOString()
      };
      const newData = { ...data, payments: [...data.payments, newPayment] };
      setData(newData); saveData(newData); setIsPaymentModalOpen(false);
      showToast('Pembayaran berhasil ditambahkan');
    });
  };

  const handleEditPaymentInit = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsEditPaymentModalOpen(true);
  };

  const handleUpdatePayment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPayment) return;
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      
      const dateStr = formData.get('date') as string;
      if (isPeriodClosed(new Date(dateStr))) {
        showToast('Periode untuk tanggal ini sudah ditutup buku', 'error');
        return;
      }

      const unit = data.units.find(u => u.id === selectedPayment.unitId);
      if (!unit || !hasWriteAccessToArea(unit.area)) {
        showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
        return;
      }

      const updatedPayment: Payment = {
        ...selectedPayment,
        amount: Number(formData.get('amount')),
        date: formData.get('date') as string,
        periodCovered: formData.get('period') as string,
        notes: formData.get('notes') as string,
        isInstallment: formData.get('isInstallment') === 'on'
      };
      const newData = { ...data, payments: data.payments.map(p => p.id === selectedPayment.id ? updatedPayment : p) };
      setData(newData); saveData(newData); setIsEditPaymentModalOpen(false); setSelectedPayment(null);
      showToast('Data pembayaran berhasil diperbarui');
    });
  };

  const handleDeletePayment = (paymentId: string) => {
    const payment = data.payments.find(p => p.id === paymentId);
    if (!payment) return;
    const unit = data.units.find(u => u.id === payment.unitId);
    if (!unit || !hasWriteAccessToArea(unit.area)) {
      showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
      return;
    }

    openConfirmModal('Hapus riwayat pembayaran ini?', () => {
      withLoading(() => {
        const newData = { ...data, payments: data.payments.filter(p => p.id !== paymentId) };
        setData(newData); saveData(newData);
        showToast('Pembayaran berhasil dihapus');
      });
    });
  };

  // --- EXPENSE ACTIONS ---
  const handleAddExpense = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      
      const dateStr = formData.get('date') as string;
      if (isPeriodClosed(new Date(dateStr))) {
        showToast('Periode untuk tanggal ini sudah ditutup buku', 'error');
        return;
      }

      const area = formData.get('area') as string;
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'accountant' && !area) {
        showToast('Wilayah wajib diisi', 'error');
        return;
      }
      if (area && !hasWriteAccessToArea(area)) {
        showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
        return;
      }

      const newExpense: Expense = {
        id: Math.random().toString(36).substr(2, 9),
        description: formData.get('description') as string,
        amount: Number(formData.get('amount')),
        date: formData.get('date') as string,
        category: formData.get('category') as string,
        area: area || undefined,
        proofUrl: uploadedFileBase64 || undefined,
        createdAt: new Date().toISOString()
      };
      const newData = { ...data, expenses: [...data.expenses, newExpense] };
      setData(newData); saveData(newData); setIsAddExpenseModalOpen(false); setUploadedFileBase64(null);
      showToast('Pengeluaran berhasil ditambahkan');
    });
  };

  const handleEditExpenseInit = (expense: Expense) => {
    setSelectedExpense(expense);
    setFormEditExpenseArea(expense.area || '');
    setFormEditExpenseCategory(expense.category);
    setUploadedFileBase64(expense.proofUrl || null);
    setIsEditExpenseModalOpen(true);
  };

  const handleUpdateExpense = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedExpense) return;
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      
      const dateStr = formData.get('date') as string;
      if (isPeriodClosed(new Date(dateStr))) {
        showToast('Periode untuk tanggal ini sudah ditutup buku', 'error');
        return;
      }

      const area = formData.get('area') as string;
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'accountant' && !area) {
        showToast('Wilayah wajib diisi', 'error');
        return;
      }
      if (area && !hasWriteAccessToArea(area)) {
        showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
        return;
      }

      const updatedExpense: Expense = {
        ...selectedExpense,
        description: formData.get('description') as string,
        amount: Number(formData.get('amount')),
        date: formData.get('date') as string,
        category: formData.get('category') as string,
        area: area || undefined,
        proofUrl: uploadedFileBase64 || selectedExpense.proofUrl
      };
      const newData = { ...data, expenses: data.expenses.map(ex => ex.id === selectedExpense.id ? updatedExpense : ex) };
      setData(newData); saveData(newData); setIsEditExpenseModalOpen(false); setSelectedExpense(null); setUploadedFileBase64(null);
      showToast('Data pengeluaran berhasil diperbarui');
    });
  };

  const handleDeleteExpense = (expenseId: string) => {
    const expense = data.expenses.find(ex => ex.id === expenseId);
    if (!expense) return;
    if (expense.area && !hasWriteAccessToArea(expense.area)) {
      showToast('Anda tidak memiliki akses ke wilayah ini', 'error');
      return;
    }

    openConfirmModal('Hapus pengeluaran ini?', () => {
      withLoading(() => {
        const newData = { ...data, expenses: data.expenses.filter(ex => ex.id !== expenseId) };
        setData(newData); saveData(newData);
        showToast('Pengeluaran berhasil dihapus');
      });
    });
  };

  // --- OTHER INCOME ACTIONS ---
  const handleEditOtherIncomeInit = (income: OtherIncome) => {
    setSelectedOtherIncome(income);
    setIsEditOtherIncomeModalOpen(true);
  };

  const handleUpdateOtherIncome = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOtherIncome) return;
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      
      const dateStr = formData.get('date') as string;
      if (isPeriodClosed(new Date(dateStr))) {
        showToast('Periode untuk tanggal ini sudah ditutup buku', 'error');
        return;
      }

      const updatedIncome: OtherIncome = {
        ...selectedOtherIncome,
        description: formData.get('description') as string,
        amount: Number(formData.get('amount')),
        date: formData.get('date') as string,
        category: formData.get('category') as string,
        notes: formData.get('notes') as string,
        allocateToWallet: formData.get('allocateToWallet') === 'on'
      };
      
      const newData = { 
        ...data, 
        otherIncomes: (data.otherIncomes || []).map(i => i.id === selectedOtherIncome.id ? updatedIncome : i) 
      };
      setData(newData); saveData(newData); setIsEditOtherIncomeModalOpen(false); setSelectedOtherIncome(null);
      showToast('Data pemasukan lain berhasil diperbarui');
    });
  };

  const handleDeleteOtherIncome = (incomeId: string) => {
    openConfirmModal('Hapus pemasukan lain ini?', () => {
      withLoading(() => {
        const newData = { 
          ...data, 
          otherIncomes: (data.otherIncomes || []).filter(i => i.id !== incomeId) 
        };
        setData(newData); saveData(newData);
        showToast('Pemasukan lain berhasil dihapus');
      });
    });
  };

  const handleAddCategory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      const newCategory = formData.get('categoryName') as string;
      if (newCategory && !data.expenseCategories.includes(newCategory)) {
        const newData = { ...data, expenseCategories: [...data.expenseCategories, newCategory] };
        setData(newData); saveData(newData); setIsAddCategoryModalOpen(false);
        showToast('Kategori berhasil ditambahkan');
      }
    });
  };

  const handleAddUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      const username = formData.get('username') as string;
      const pin = formData.get('pin') as string;
      const role = formData.get('role') as 'admin' | 'user' | 'viewer' | 'accountant';
      
      if (username && pin && role) {
        if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
          showToast('Username sudah digunakan', 'error');
          return;
        }
        const newUser: User = { username, pin, role };
        const newData = { ...data, users: [...data.users, newUser] };
        setData(newData); saveData(newData); setIsAddUserModalOpen(false);
        showToast('User berhasil ditambahkan');
      }
    });
  };

  const handleChangePin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    withLoading(() => {
      const formData = new FormData(e.currentTarget);
      const oldPin = formData.get('oldPin') as string;
      const newPin = formData.get('newPin') as string;
      const confirmPin = formData.get('confirmPin') as string;

      if (!currentUser) return;

      if (oldPin !== currentUser.pin) {
        showToast('PIN lama salah', 'error');
        return;
      }

      if (newPin !== confirmPin) {
        showToast('PIN baru dan konfirmasi PIN tidak cocok', 'error');
        return;
      }

      const updatedUsers = data.users.map(u => 
        u.username === currentUser.username ? { ...u, pin: newPin } : u
      );
      const newData = { ...data, users: updatedUsers };
      setData(newData); 
      saveData(newData); 
      setCurrentUser({ ...currentUser, pin: newPin });
      setIsChangePinModalOpen(false);
      showToast('PIN berhasil diubah');
    });
  };

  const handleResetPin = (username: string) => {
    openConfirmModal(`Reset PIN untuk user ${username} menjadi 1234?`, () => {
      withLoading(() => {
        const updatedUsers = data.users.map(u => 
          u.username === username ? { ...u, pin: '1234' } : u
        );
        const newData = { ...data, users: updatedUsers };
        setData(newData); 
        saveData(newData);
        showToast(`PIN ${username} berhasil direset ke 1234`);
      });
    });
  };

  const totalIncome = data.payments.reduce((acc, p) => acc + p.amount, 0);
  const totalExpenses = data.expenses
    .filter(e => appMode === 'accounting' || e.area)
    .reduce((acc, e) => acc + e.amount, 0);
  const netIncome = totalIncome - totalExpenses;

  // Filter and Paginate Book Closing History
  const filteredBookClosings = (data.bookClosings || [])
    .filter(closing => historyFilterYear === 'all' || closing.periodYear === historyFilterYear)
    .slice().reverse();
  
  const totalHistoryPages = Math.ceil(filteredBookClosings.length / historyItemsPerPage);
  const paginatedBookClosings = filteredBookClosings.slice(
    (historyPage - 1) * historyItemsPerPage,
    historyPage * historyItemsPerPage
  );

  const historyYearOptions = Array.from(new Set((data.bookClosings || []).map(c => c.periodYear))).sort((a: number, b: number) => b - a);

  // Unified Transaction History for Balance Tab
  const unifiedTransactions = useMemo(() => {
    const txs: any[] = [];

    // Add book closings
    (data.bookClosings || []).forEach(closing => {
      const date = new Date(closing.periodYear, closing.periodMonth + 1, 0); // Last day of the month
      txs.push({
        id: `closing-${closing.id}`,
        date: date,
        dateString: `Periode ${monthNames[closing.periodMonth]} ${closing.periodYear}`,
        description: 'Tutup Buku Bulanan',
        zakat: closing.allocation?.zakat || 0,
        cash: closing.allocation?.cash || 0,
        saving: closing.allocation?.saving || 0,
        isManual: false
      });
    });

    // Add manual wallet transactions
    (data.walletTransactions || []).forEach(tx => {
      const txDate = new Date(tx.date);
      txs.push({
        id: `manual-${tx.id}`,
        date: txDate,
        dateString: txDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
        description: tx.description,
        zakat: tx.wallet === 'zakat' ? (tx.type === 'income' ? tx.amount : -tx.amount) : 0,
        cash: tx.wallet === 'cash' ? (tx.type === 'income' ? tx.amount : -tx.amount) : 0,
        saving: tx.wallet === 'saving' ? (tx.type === 'income' ? tx.amount : -tx.amount) : 0,
        isManual: true,
        manualTxId: tx.id,
        walletType: tx.wallet,
        txType: tx.type
      });
    });

    // Sort by date descending
    return txs.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [data.bookClosings, data.walletTransactions]);

  const balanceYearOptions = Array.from(new Set(unifiedTransactions.map(tx => tx.date.getFullYear()))).sort((a: number, b: number) => b - a);

  const filteredUnifiedTxs = useMemo(() => {
    if (balanceFilterYear === 'all') return unifiedTransactions;
    return unifiedTransactions.filter(tx => tx.date.getFullYear() === balanceFilterYear);
  }, [unifiedTransactions, balanceFilterYear]);

  const totalBalancePages = Math.ceil(filteredUnifiedTxs.length / balanceItemsPerPage);
  const paginatedUnifiedTxs = filteredUnifiedTxs.slice(
    (balancePage - 1) * balanceItemsPerPage,
    balancePage * balanceItemsPerPage
  );

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4 transition-colors duration-300">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl w-full max-w-sm space-y-6 border border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <div className="text-center flex flex-col items-center">
            <Logo size="xl" className="mb-2" />
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">AMG Kontrakan</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Sistem Manajemen Terpadu</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Pengguna</label>
              <input 
                type="text" 
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/20 outline-none transition-all"
                placeholder="Masukkan Nama"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PIN</label>
              <input 
                type="password" 
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/20 outline-none transition-all"
                placeholder="Masukkan PIN"
                required
                maxLength={6}
              />
            </div>
            {loginError && <p className="text-rose-500 text-sm text-center">{loginError}</p>}
            <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20">
              Masuk
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (showPortal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4 transition-colors duration-300">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-300 border border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <div className="text-center flex flex-col items-center">
            <Logo size="xl" variant="colored" className="mb-4" />
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Selamat Datang, {currentUser?.username}</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Pilih aplikasi yang ingin Anda akses</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => handleSelectAppMode('transaction')}
              className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all group"
            >
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              </div>
              <span className="font-bold text-slate-700 dark:text-slate-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-400">Transaksi</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-center">Kelola unit, penyewa, dan pembayaran harian</span>
            </button>

            <button 
              onClick={() => handleSelectAppMode('accounting')}
              className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all group"
            >
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              </div>
              <span className="font-bold text-slate-700 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">Pembukuan</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-center">Tutup buku bulanan dan laporan keuangan</span>
            </button>
          </div>

          <button 
            onClick={() => setIsLoggedIn(false)}
            className="w-full text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 text-sm font-medium transition-colors"
          >
            Keluar
          </button>
        </div>
      </div>
    );
  }

  if (appMode === 'accounting') {
    return (
      <div className="h-screen flex bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-300">
        {/* Sidebar - Desktop */}
        <aside className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ease-in-out relative z-40 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="absolute -right-3 top-7 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:border-emerald-200 shadow-sm transition-all z-[60]"
            title={isSidebarCollapsed ? "Expand" : "Collapse"}
          >
            <svg className={`w-4 h-4 transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="h-20 flex items-center px-6 border-b border-slate-50 dark:border-slate-800 overflow-hidden relative">
            <div className="flex items-center gap-3 shrink-0">
              <Logo size="md" variant="colored" />
              <div className={`transition-all duration-300 overflow-hidden ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-32 opacity-100'}`}>
                <h1 className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 whitespace-nowrap">Pembukuan</h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">Sistem Akuntansi AMG</p>
              </div>
            </div>
          </div>
          
          <nav className="flex-1 px-3 space-y-1 mt-6 overflow-y-auto no-scrollbar">
            <button
              onClick={() => setAccountingTab('closing')}
              className={`w-full px-4 py-3 rounded-xl font-medium flex items-center gap-3 transition-all duration-300 ${accountingTab === 'closing' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400'}`}
              title={isSidebarCollapsed ? "Tutup Buku" : ""}
            >
              <span className="shrink-0"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></span>
              {!isSidebarCollapsed && <span>Tutup Buku</span>}
            </button>
            <button
              onClick={() => setAccountingTab('balance')}
              className={`w-full px-4 py-3 rounded-xl font-medium flex items-center gap-3 transition-all duration-300 ${accountingTab === 'balance' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400'}`}
              title={isSidebarCollapsed ? "Saldo" : ""}
            >
              <span className="shrink-0"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></span>
              {!isSidebarCollapsed && <span>Saldo</span>}
            </button>
            {currentUser?.role !== 'viewer' && (
              <button
                onClick={() => setAccountingTab('settings')}
                className={`w-full px-4 py-3 rounded-xl font-medium flex items-center gap-3 transition-all duration-300 ${accountingTab === 'settings' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400'}`}
                title={isSidebarCollapsed ? "Pengaturan" : ""}
              >
                <span className="shrink-0"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></span>
                {!isSidebarCollapsed && <span>Pengaturan</span>}
              </button>
            )}
          </nav>
          <div className="p-4 border-t border-slate-50 dark:border-slate-800 space-y-1">
            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 w-full group`}
              title={isSidebarCollapsed ? (theme === 'light' ? "Mode Gelap" : "Mode Terang") : ""}
            >
              <span className="shrink-0 transition-transform duration-300 group-hover:rotate-12">
                {theme === 'light' ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.95 16.95l.707.707M7.05 7.05l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
                )}
              </span>
              <div className={`overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-40 opacity-100'}`}>
                <span className="font-medium whitespace-nowrap">{theme === 'light' ? "Mode Gelap" : "Mode Terang"}</span>
              </div>
            </button>
            {currentUser?.role !== 'accountant' && (
              <button 
                onClick={() => setShowPortal(true)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 w-full group`}
                title={isSidebarCollapsed ? "Ganti Aplikasi" : ""}
              >
                <span className="shrink-0 transition-transform duration-300 group-hover:scale-110"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></span>
                <div className={`overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-40 opacity-100'}`}>
                  <span className="font-medium whitespace-nowrap">Ganti Aplikasi</span>
                </div>
              </button>
            )}
            <button 
              onClick={() => setIsChangePinModalOpen(true)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 w-full group`}
              title={isSidebarCollapsed ? "Ganti PIN" : ""}
            >
              <span className="shrink-0 transition-transform duration-300 group-hover:scale-110">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </span>
              <div className={`overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-40 opacity-100'}`}>
                <span className="font-medium whitespace-nowrap">Ganti PIN</span>
              </div>
            </button>
            <button 
              onClick={() => {
                setIsLoggedIn(false);
                setCurrentUser(null);
                localStorage.removeItem('amg_isLoggedIn');
                localStorage.removeItem('amg_currentUser');
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 w-full group`}
              title={isSidebarCollapsed ? "Keluar" : ""}
            >
              <span className="shrink-0 transition-transform duration-300 group-hover:translate-x-1"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></span>
              <div className={`overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-40 opacity-100'}`}>
                <span className="font-medium whitespace-nowrap">Keluar</span>
              </div>
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile Header */}
          <header className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex justify-between items-center sticky top-0 z-30 shadow-sm transition-colors duration-300">
            <span className="font-bold text-slate-800 dark:text-white text-lg">Pembukuan</span>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                title={theme === 'light' ? "Mode Gelap" : "Mode Terang"}
              >
                {theme === 'light' ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.95 16.95l.707.707M7.05 7.05l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
                )}
              </button>
              <button 
                onClick={() => setIsChangePinModalOpen(true)}
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                title="Ganti PIN"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </button>
              {currentUser?.role !== 'accountant' && (
                <button 
                  onClick={() => setShowPortal(true)}
                  className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                  title="Ganti Aplikasi"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
              )}
              <button 
                onClick={() => {
                  setIsLoggedIn(false);
                  setCurrentUser(null);
                  localStorage.removeItem('amg_isLoggedIn');
                  localStorage.removeItem('amg_currentUser');
                }}
                className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-colors"
                title="Keluar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
            <header className="hidden md:flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                  {accountingTab === 'closing' ? 'Tutup Buku Bulanan' : 
                   accountingTab === 'balance' ? 'Saldo & Ringkasan' : 
                   'Pengaturan Pembukuan'}
                </h2>
                {accountingTab === 'closing' && (
                  <p className="text-slate-500 dark:text-slate-400">Periode: {monthNames[reportMonth]} {reportYear}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{currentUser?.username} ({currentUser?.role})</span>
                <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                  {currentUser?.username.charAt(0).toUpperCase()}
                </div>
              </div>
            </header>

            {/* Mobile Title */}
            <div className="md:hidden mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                {accountingTab === 'closing' ? 'Tutup Buku' : 
                 accountingTab === 'balance' ? 'Saldo' : 
                 'Pengaturan'}
              </h2>
              {accountingTab === 'closing' && (
                <p className="text-sm text-slate-500 dark:text-slate-400">Periode: {monthNames[reportMonth]} {reportYear}</p>
              )}
            </div>

            {accountingTab === 'closing' ? (
            <div className="space-y-8">
              <div className="space-y-6">
                {unclosedPeriods.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-lg shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-amber-800 dark:text-amber-200">Ada {unclosedPeriods.length} periode yang belum ditutup</h4>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          {unclosedPeriods.slice(0, 3).map(p => `${monthNames[p.month]} ${p.year}`).join(', ')}
                          {unclosedPeriods.length > 3 && ` dan ${unclosedPeriods.length - 3} lainnya`}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        const oldest = unclosedPeriods[unclosedPeriods.length - 1];
                        setReportMonth(oldest.month);
                        setReportYear(oldest.year);
                      }}
                      className="w-full sm:w-auto px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-xl hover:bg-amber-700 transition-colors whitespace-nowrap"
                    >
                      Buka Periode Tertua
                    </button>
                  </div>
                )}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Ringkasan Periode Berjalan</h3>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                      <Dropdown 
                        value={reportMonth}
                        options={monthNames.map((m, i) => ({ label: m, value: i }))}
                        onChange={(val) => setReportMonth(Number(val))}
                        className="w-full sm:w-32"
                      />
                      <Dropdown 
                        value={reportYear}
                        options={Array.from({ length: 5 }).map((_, i) => {
                          const y = new Date().getFullYear() - 2 + i;
                          return { label: y.toString(), value: y };
                        })}
                        onChange={(val) => setReportYear(Number(val))}
                        className="w-full sm:w-24"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 mb-6">
                    {currentUser?.role !== 'viewer' && (
                      <>
                        <button
                          onClick={() => { setIsAddOtherIncomeModalOpen(true); setUploadedFileBase64(null); }}
                          className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 font-medium text-sm flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          Tambah Pemasukan Lain
                        </button>
                        <button
                          onClick={() => { setIsAddExpenseModalOpen(true); setUploadedFileBase64(null); }}
                          className="px-4 py-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 font-medium text-sm flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          Tambah Pengeluaran
                        </button>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                      <p className="text-xs font-bold text-indigo-400 dark:text-indigo-500 uppercase mb-1">Pendapatan</p>
                      <p className="text-xl font-bold text-indigo-700 dark:text-indigo-400">
                        Rp {(data.payments.filter(p => {
                          const d = new Date(p.date);
                          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                        }).reduce((acc, p) => acc + p.amount, 0) + 
                        (data.otherIncomes?.filter(i => {
                          const d = new Date(i.date);
                          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                        }).reduce((acc, i) => acc + i.amount, 0) || 0)).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-100 dark:border-rose-900/30">
                      <p className="text-xs font-bold text-rose-400 dark:text-rose-500 uppercase mb-1">Pengeluaran</p>
                      <p className="text-xl font-bold text-rose-700 dark:text-rose-400">
                        Rp {data.expenses.filter(e => {
                          const d = new Date(e.date);
                          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                        }).reduce((acc, e) => acc + e.amount, 0).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                      <p className="text-xs font-bold text-emerald-400 dark:text-emerald-500 uppercase mb-1">Laba Bersih</p>
                      <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                        Rp {((data.payments.filter(p => {
                          const d = new Date(p.date);
                          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                        }).reduce((acc, p) => acc + p.amount, 0) + 
                        (data.otherIncomes?.filter(i => {
                          const d = new Date(i.date);
                          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                        }).reduce((acc, i) => acc + i.amount, 0) || 0)) - 
                        data.expenses.filter(e => {
                          const d = new Date(e.date);
                          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                        }).reduce((acc, e) => acc + e.amount, 0)).toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    {data.bookClosings?.some(c => c.periodMonth === reportMonth && c.periodYear === reportYear) ? (
                      <div className="w-full sm:w-auto px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200 dark:border-slate-700 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Periode Ini Sudah Ditutup
                      </div>
                    ) : (
                      currentUser?.role !== 'viewer' && (data.payments.some(p => { const d = new Date(p.date); return d.getMonth() === reportMonth && d.getFullYear() === reportYear; }) || 
                       (data.otherIncomes || []).some(i => { const d = new Date(i.date); return d.getMonth() === reportMonth && d.getFullYear() === reportYear; }) ||
                       data.expenses.some(e => { const d = new Date(e.date); return d.getMonth() === reportMonth && d.getFullYear() === reportYear; })) && (
                        <button 
                          onClick={handleBookClosing}
                          className="w-full sm:w-auto px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 dark:shadow-emerald-900/20 flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Tutup Buku Periode Ini
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Income Table */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white">Rincian Pemasukan</h3>
                      <span className="text-xs font-bold px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg">
                        {(data.payments.filter(p => {
                          const d = new Date(p.date);
                          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                        }).length) + 
                        (data.otherIncomes?.filter(i => {
                          const d = new Date(i.date);
                          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                        }).length || 0)} Transaksi
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Tanggal</th>
                            <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Wilayah - Unit/Kategori</th>
                            <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Keterangan</th>
                            <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-right">Jumlah</th>
                            {currentUser?.role !== 'viewer' && <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-center">Aksi</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {/* Rental Payments */}
                          {data.payments.filter(p => {
                            const d = new Date(p.date);
                            return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                          }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => {
                            const unit = data.units.find(u => u.id === p.unitId);
                            const tenant = data.tenants.find(t => t.id === p.tenantId);
                            return (
                              <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(p.date)}</td>
                                <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium">{unit ? `${unit.area} - ${unit.name}` : '-'}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Sewa: {tenant ? tenant.name : '-'}</td>
                                <td className="px-4 py-3 text-right text-indigo-600 dark:text-indigo-400 font-medium">Rp {p.amount.toLocaleString('id-ID')}</td>
                                {currentUser?.role !== 'viewer' && <td className="px-4 py-3 text-center"></td>}
                              </tr>
                            );
                          })}
                          
                          {/* Other Incomes */}
                          {data.otherIncomes?.filter(i => {
                            const d = new Date(i.date);
                            return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                          }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(i => (
                            <tr key={i.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-indigo-50/30 dark:bg-indigo-900/10 transition-colors">
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(i.date)}</td>
                              <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium">{i.category}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{i.description}</td>
                              <td className="px-4 py-3 text-right text-indigo-600 dark:text-indigo-400 font-medium">Rp {i.amount.toLocaleString('id-ID')}</td>
                              {currentUser?.role !== 'viewer' && (
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => handleEditOtherIncomeInit(i)} className="text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" title="Edit">
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </button>
                                    <button onClick={() => handleDeleteOtherIncome(i.id)} className="text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors" title="Hapus">
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}

                          {data.payments.filter(p => {
                            const d = new Date(p.date);
                            return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                          }).length === 0 && (!data.otherIncomes || data.otherIncomes.filter(i => {
                            const d = new Date(i.date);
                            return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                          }).length === 0) && (
                            <tr>
                              <td colSpan={currentUser?.role !== 'viewer' ? 5 : 4} className="px-4 py-8 text-center text-slate-400 dark:text-slate-600 italic">Tidak ada data pemasukan</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Expense Table */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white">Rincian Pengeluaran</h3>
                      <span className="text-xs font-bold px-2 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded-lg">
                        {data.expenses.filter(e => {
                          const d = new Date(e.date);
                          return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                        }).length} Transaksi
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Tanggal</th>
                            <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Wilayah - Unit</th>
                            <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Kategori</th>
                            <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Keterangan</th>
                            <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Bukti</th>
                            <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-right">Jumlah</th>
                            {currentUser?.role !== 'viewer' && <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-center">Aksi</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {data.expenses.filter(e => {
                            const d = new Date(e.date);
                            return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                          }).length > 0 ? (
                            data.expenses.filter(e => {
                              const d = new Date(e.date);
                              return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                            }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(e => (
                              <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(e.date)}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.area || '-'}</td>
                                <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium">{e.category}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 truncate max-w-[150px]" title={e.description}>{e.description}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                  {e.proofUrl ? (
                                    <button 
                                      onClick={() => {
                                        const directUrl = getDirectDriveLink(e.proofUrl);
                                        const win = window.open();
                                        win?.document.write('<html><body style="margin:0; display:flex; align-items:center; justify-content:center; background:#000;"><img src="' + directUrl + '" style="max-width:100%; max-height:100vh; object-fit:contain;"></body></html>');
                                      }} 
                                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline text-xs"
                                    >
                                      Lihat
                                    </button>
                                  ) : '-'}
                                </td>
                                <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400 font-medium">Rp {e.amount.toLocaleString('id-ID')}</td>
                                {currentUser?.role !== 'viewer' && (
                                  <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <button onClick={() => handleEditExpenseInit(e)} className="text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" title="Edit">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                      </button>
                                      <button onClick={() => handleDeleteExpense(e.id)} className="text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors" title="Hapus">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={currentUser?.role !== 'viewer' ? 7 : 6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-600 italic">Tidak ada data pengeluaran</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Riwayat Tutup Buku</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase">Filter Tahun:</span>
                      <Dropdown 
                        value={historyFilterYear}
                        options={[{ label: 'Semua', value: 'all' }, ...historyYearOptions.map(y => ({ label: y.toString(), value: y }))]}
                        onChange={(val) => {
                          setHistoryFilterYear(val === 'all' ? 'all' : Number(val));
                          setHistoryPage(1);
                        }}
                        className="w-32"
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                        <tr>
                          <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">Periode</th>
                          <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-right">Pendapatan</th>
                          <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-right">Pengeluaran</th>
                          <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-right">Laba Bersih</th>
                          <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">Alokasi</th>
                          <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">Tanggal</th>
                          <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {paginatedBookClosings.length > 0 ? (
                          paginatedBookClosings.map(closing => (
                            <tr key={closing.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{monthNames[closing.periodMonth]} {closing.periodYear}</td>
                              <td className="px-6 py-4 text-right text-indigo-600 dark:text-indigo-400 font-medium">Rp {closing.totalIncome.toLocaleString('id-ID')}</td>
                              <td className="px-6 py-4 text-right text-rose-600 dark:text-rose-400 font-medium">Rp {closing.totalExpense.toLocaleString('id-ID')}</td>
                              <td className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400 font-bold">Rp {closing.netIncome.toLocaleString('id-ID')}</td>
                              <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                                {closing.allocation ? (
                                  <div className="space-y-1">
                                    <div className="flex justify-between gap-4"><span>Zakat:</span> <span>{closing.allocation.zakat.toLocaleString('id-ID')}</span></div>
                                    <div className="flex justify-between gap-4"><span>Kas:</span> <span>{closing.allocation.cash.toLocaleString('id-ID')}</span></div>
                                    <div className="flex justify-between gap-4"><span>Saving:</span> <span>{closing.allocation.saving.toLocaleString('id-ID')}</span></div>
                                    <button 
                                      onClick={() => {
                                        setSelectedBookClosing(closing);
                                        setIsClosingDetailModalOpen(true);
                                      }}
                                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium mt-1 underline"
                                    >
                                      Lihat Detail
                                    </button>
                                  </div>
                                ) : '-'}
                              </td>
                              <td className="px-6 py-4 text-slate-400 dark:text-slate-500 text-xs">{formatDateTime(closing.closedAt)}</td>
                              <td className="px-6 py-4 flex items-center gap-2">
                                <button 
                                  onClick={() => exportBookClosingPDF(closing)}
                                  className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-400 p-2 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                                  title="Export PDF"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                </button>
                                {currentUser?.role !== 'viewer' && (
                                  <button 
                                    onClick={() => handleDeleteBookClosing(closing.id)}
                                    className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 p-2 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                                    title="Hapus Riwayat"
                                  >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-slate-400 dark:text-slate-600 italic">Belum ada riwayat tutup buku</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {totalHistoryPages > 1 && (
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Halaman {historyPage} dari {totalHistoryPages}</span>
                      <div className="flex gap-2">
                        <button 
                          disabled={historyPage === 1}
                          onClick={() => setHistoryPage(p => p - 1)}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button 
                          disabled={historyPage === totalHistoryPages}
                          onClick={() => setHistoryPage(p => p + 1)}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : accountingTab === 'balance' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors duration-300">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <svg className="w-24 h-24 text-indigo-600 dark:text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="flex justify-between items-start">
                    <h3 className="text-slate-500 dark:text-slate-400 font-medium mb-2">Total Saldo Zakat</h3>
                    {currentUser?.role !== 'viewer' && (
                      <button type="button" onClick={() => { setSelectedWalletForTransaction('zakat'); setIsWalletTransactionModalOpen(true); }} className="relative z-10 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 p-2 rounded-xl transition-colors shadow-sm border border-indigo-100 dark:border-indigo-900/30 flex items-center gap-1 cursor-pointer" title="Catat Transaksi Zakat">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        <span className="text-xs font-bold">Catat</span>
                      </button>
                    )}
                  </div>
                  <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                    Rp {totalZakat.toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Akumulasi dari seluruh periode & transaksi manual</p>
                </div>
                
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors duration-300">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <svg className="w-24 h-24 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                  <div className="flex justify-between items-start">
                    <h3 className="text-slate-500 dark:text-slate-400 font-medium mb-2">Total Saldo Kas</h3>
                    {currentUser?.role !== 'viewer' && (
                      <button type="button" onClick={() => { setSelectedWalletForTransaction('cash'); setIsWalletTransactionModalOpen(true); }} className="relative z-10 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 p-2 rounded-xl transition-colors shadow-sm border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-1 cursor-pointer" title="Catat Transaksi Kas">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        <span className="text-xs font-bold">Catat</span>
                      </button>
                    )}
                  </div>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    Rp {totalCash.toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Akumulasi dari seluruh periode & transaksi manual</p>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors duration-300">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <svg className="w-24 h-24 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="flex justify-between items-start">
                    <h3 className="text-slate-500 dark:text-slate-400 font-medium mb-2">Total Saldo Saving</h3>
                    {currentUser?.role !== 'viewer' && (
                      <button type="button" onClick={() => { setSelectedWalletForTransaction('saving'); setIsWalletTransactionModalOpen(true); }} className="relative z-10 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 p-2 rounded-xl transition-colors shadow-sm border border-blue-100 dark:border-blue-900/30 flex items-center gap-1 cursor-pointer" title="Catat Transaksi Saving">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        <span className="text-xs font-bold">Catat</span>
                      </button>
                    )}
                  </div>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    Rp {totalSaving.toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Akumulasi dari seluruh periode & transaksi manual</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">Riwayat Transaksi</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase">Filter Tahun:</span>
                    <Dropdown 
                      value={balanceFilterYear}
                      options={[{ label: 'Semua', value: 'all' }, ...balanceYearOptions.map(y => ({ label: y.toString(), value: y }))]}
                      onChange={(val) => {
                        setBalanceFilterYear(val === 'all' ? 'all' : Number(val));
                        setBalancePage(1);
                      }}
                      className="w-32"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                      <tr>
                        <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">Tanggal / Periode</th>
                        <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">Keterangan</th>
                        <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-right">Zakat</th>
                        <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-right">Kas</th>
                        <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-right">Saving</th>
                        {currentUser?.role !== 'viewer' && <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400 text-center">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedUnifiedTxs.length > 0 ? (
                        paginatedUnifiedTxs.map(tx => (
                          <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                              {tx.dateString}
                              {tx.isManual && (
                                <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  tx.walletType === 'zakat' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' :
                                  tx.walletType === 'cash' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                                  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                }`}>
                                  {tx.walletType.toUpperCase()}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{tx.description}</td>
                            <td className={`px-6 py-4 text-right font-medium ${tx.zakat > 0 ? 'text-indigo-600 dark:text-indigo-400' : tx.zakat < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-600'}`}>
                              {tx.zakat > 0 ? '+' : ''}{tx.zakat === 0 ? '-' : `Rp ${tx.zakat.toLocaleString('id-ID')}`}
                            </td>
                            <td className={`px-6 py-4 text-right font-medium ${tx.cash > 0 ? 'text-emerald-600 dark:text-emerald-400' : tx.cash < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-600'}`}>
                              {tx.cash > 0 ? '+' : ''}{tx.cash === 0 ? '-' : `Rp ${tx.cash.toLocaleString('id-ID')}`}
                            </td>
                            <td className={`px-6 py-4 text-right font-medium ${tx.saving > 0 ? 'text-blue-600 dark:text-blue-400' : tx.saving < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-600'}`}>
                              {tx.saving > 0 ? '+' : ''}{tx.saving === 0 ? '-' : `Rp ${tx.saving.toLocaleString('id-ID')}`}
                            </td>
                            {currentUser?.role !== 'viewer' && (
                              <td className="px-6 py-4 text-center">
                                {tx.isManual ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => {
                                      const originalTx = data.walletTransactions?.find(t => t.id === tx.manualTxId);
                                      if (originalTx) {
                                        setEditingWalletTransaction(originalTx);
                                        setSelectedWalletForTransaction(originalTx.wallet);
                                        setIsWalletTransactionModalOpen(true);
                                      }
                                    }} className="text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 transition-colors" title="Edit Transaksi Manual">
                                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button onClick={() => handleDeleteWalletTransaction(tx.manualTxId)} className="text-rose-400 dark:text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 p-1 transition-colors" title="Hapus Transaksi Manual">
                                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-300 dark:text-slate-600 italic">Otomatis</span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={currentUser?.role !== 'viewer' ? 6 : 5} className="px-6 py-8 text-center text-slate-400 dark:text-slate-600 italic">Belum ada riwayat transaksi.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {totalBalancePages > 1 && (
                  <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center transition-colors">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Halaman {balancePage} dari {totalBalancePages}</span>
                    <div className="flex gap-2">
                      <button 
                        disabled={balancePage === 1}
                        onClick={() => setBalancePage(p => p - 1)}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                      </button>
                      <button 
                        disabled={balancePage === totalBalancePages}
                        onClick={() => setBalancePage(p => p + 1)}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : currentUser?.role === 'viewer' ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Akses Terbatas</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-1">Role Viewer tidak memiliki akses ke pengaturan pembukuan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 transition-colors">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-4">Persentase Alokasi Laba</h3>
                
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Zakat</span>
                      <span className="font-bold text-slate-900 dark:text-white">2.5%</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Diambil dari Laba Bersih sebelum alokasi lainnya.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kas (%)</label>
                    <input 
                      type="number" 
                      value={cashPercentage} 
                      onChange={(e) => setCashPercentage(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Saving (%)</label>
                    <input 
                      type="number" 
                      value={savingPercentage} 
                      onChange={(e) => setSavingPercentage(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button 
                      onClick={handleSaveSettings}
                      className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 dark:shadow-none"
                    >
                      Simpan Pengaturan
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 transition-colors">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-4">Penerima Dividen</h3>
                
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input 
                      type="text" 
                      placeholder="Nama Penerima" 
                      value={newRecipientName}
                      onChange={(e) => setNewRecipientName(e.target.value)}
                      className="flex-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                    />
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        placeholder="%" 
                        value={newRecipientPercentage || ''}
                        onChange={(e) => setNewRecipientPercentage(Number(e.target.value))}
                        className="w-20 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                      />
                      <button 
                        onClick={handleAddRecipient}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors flex-1 sm:flex-none flex justify-center items-center shadow-lg shadow-emerald-200 dark:shadow-none"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {dividendRecipients.map(recipient => (
                      <div key={recipient.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 transition-colors">
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-200">{recipient.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{recipient.percentage}% Share</p>
                        </div>
                        <button 
                          onClick={() => handleDeleteRecipient(recipient.id)}
                          className="text-rose-400 dark:text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 p-2 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                    {dividendRecipients.length === 0 && (
                      <p className="text-center text-slate-400 dark:text-slate-600 italic py-4">Belum ada penerima dividen</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Navigation - Mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2 landscape:py-1 flex justify-around items-center z-40 pb-4 landscape:pb-1 transition-colors duration-300">
          <button 
            onClick={() => setAccountingTab('closing')} 
            className={`flex flex-col landscape:flex-row items-center gap-1 landscape:gap-2 p-2 landscape:p-1 rounded-xl transition-colors ${accountingTab === 'closing' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            <svg className="w-6 h-6 landscape:w-5 landscape:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span className="text-[10px] font-bold landscape:text-xs">Tutup Buku</span>
          </button>
          <button 
            onClick={() => setAccountingTab('balance')} 
            className={`flex flex-col landscape:flex-row items-center gap-1 landscape:gap-2 p-2 landscape:p-1 rounded-xl transition-colors ${accountingTab === 'balance' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            <svg className="w-6 h-6 landscape:w-5 landscape:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-[10px] font-bold landscape:text-xs">Saldo</span>
          </button>
          {currentUser?.role !== 'viewer' && (
            <button 
              onClick={() => setAccountingTab('settings')} 
              className={`flex flex-col landscape:flex-row items-center gap-1 landscape:gap-2 p-2 landscape:p-1 rounded-xl transition-colors ${accountingTab === 'settings' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
              <svg className="w-6 h-6 landscape:w-5 landscape:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span className="text-[10px] font-bold landscape:text-xs">Pengaturan</span>
            </button>
          )}
        </nav>

        {/* Alert Modal */}
        {isAlertModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-xl animate-in zoom-in-95 duration-200 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
              <button onClick={() => setIsAlertModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Peringatan</h3>
              </div>
              <p className="text-slate-600 dark:text-slate-400">{alertMessage}</p>
              <div className="pt-2">
                <button 
                  onClick={() => setIsAlertModalOpen(false)} 
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors shadow-md shadow-amber-500/20"
                >
                  Mengerti
                </button>
              </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {isConfirmModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-xl animate-in zoom-in-95 duration-200 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
              <button onClick={() => setIsConfirmModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Konfirmasi</h3>
              <p className="text-slate-600 dark:text-slate-400">{confirmMessage}</p>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsConfirmModalOpen(false)} 
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleConfirm} 
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors shadow-md shadow-rose-600/20"
                >
                  Hapus
                </button>
              </div>
            </div>
            </div>
          </div>
        )}

        {/* Closing Detail Modal */}
        {isClosingDetailModalOpen && selectedBookClosing && selectedBookClosing.allocation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors duration-300">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Detail Alokasi Laba</h3>
                <button onClick={() => setIsClosingDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2 transition-colors">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Periode</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{monthNames[selectedBookClosing.periodMonth]} {selectedBookClosing.periodYear}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Laba Bersih</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">Rp {selectedBookClosing.netIncome.toLocaleString('id-ID')}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">Rincian Alokasi</h4>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <span className="font-medium text-slate-700 dark:text-slate-300">Zakat (2.5%)</span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-white">Rp {selectedBookClosing.allocation.zakat.toLocaleString('id-ID')}</span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <span className="font-medium text-slate-700 dark:text-slate-300">Kas</span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-white">Rp {selectedBookClosing.allocation.cash.toLocaleString('id-ID')}</span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <span className="font-medium text-slate-700 dark:text-slate-300">Saving</span>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-white">Rp {selectedBookClosing.allocation.saving.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">Pembagian Dividen</h4>
                  {selectedBookClosing.allocation.dividends && selectedBookClosing.allocation.dividends.length > 0 ? (
                    <div className="space-y-3">
                      {selectedBookClosing.allocation.dividends.map((div, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-xs">
                              {div.recipientName.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{div.recipientName}</span>
                          </div>
                          <span className="font-bold text-slate-800 dark:text-white">Rp {div.amount.toLocaleString('id-ID')}</span>
                        </div>
                      ))}
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <span className="font-bold text-slate-600 dark:text-slate-400">Total Dividen</span>
                        <span className="font-bold text-purple-600 dark:text-purple-400">
                          Rp {selectedBookClosing.allocation.dividends.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 dark:text-slate-500 italic text-center py-4">Tidak ada pembagian dividen</p>
                  )}
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end transition-colors">
                <button 
                  onClick={() => setIsClosingDetailModalOpen(false)}
                  className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- MODALS FOR ACCOUNTING MODE --- */}

        {/* Add Other Income Modal */}
        {isAddOtherIncomeModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
              <button onClick={() => setIsAddOtherIncomeModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Catat Pemasukan Lain</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                withLoading(() => {
                  const formData = new FormData(e.currentTarget);
                  
                  const dateStr = formData.get('date') as string;
                  if (isPeriodClosed(new Date(dateStr))) {
                    showToast('Periode untuk tanggal ini sudah ditutup buku', 'error');
                    return;
                  }

                  const newIncome: OtherIncome = {
                    id: Date.now().toString(),
                    description: formData.get('description') as string,
                    amount: Number(formData.get('amount')),
                    date: formData.get('date') as string,
                    category: formData.get('category') as string,
                    notes: formData.get('notes') as string,
                    allocateToWallet: formData.get('allocateToWallet') === 'on',
                    createdAt: new Date().toISOString()
                  };
                  
                  const updatedData = { ...data, otherIncomes: [...(data.otherIncomes || []), newIncome] };
                  setData(updatedData);
                  saveData(updatedData);
                  setIsAddOtherIncomeModalOpen(false);
                  showToast('Pemasukan lain berhasil dicatat');
                });
              }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
                  <input type="text" name="category" placeholder="Contoh: Penjualan Aset, Hibah" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
                  <input type="text" name="description" placeholder="Deskripsi pemasukan" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah (Rp)</label>
                  <input type="number" name="amount" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                  <input type="date" name="date" defaultValue={getLocalDateString()} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Catatan Tambahan</label>
                  <textarea name="notes" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" rows={2}></textarea>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <input type="checkbox" name="allocateToWallet" id="allocateToWallet2" defaultChecked className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" />
                  <label htmlFor="allocateToWallet2" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    Masukan ke Alokasi Dompet (Zakat, Kas, Saving)
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Jika tidak dicentang, hanya akan dimasukkan sebagai dividen.</p>
                  </label>
                </div>
                
                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan</button>
              </form>
            </div>
            </div>
          </div>
        )}

        {/* Add Expense Modal */}
        {isAddExpenseModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
              <button onClick={() => setIsAddExpenseModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Catat Pengeluaran</h3>
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
                  <input type="text" name="description" placeholder="Keterangan" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah</label>
                  <input type="number" name="amount" placeholder="Jumlah (Rp)" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                  <input type="date" name="date" required defaultValue={getLocalDateString()} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wilayah {(currentUser?.role === 'admin' || currentUser?.role === 'accountant') ? '(Opsional)' : ''}</label>
                  <Dropdown 
                    name="area" 
                    value={formAddExpenseArea} 
                    onChange={(val) => setFormAddExpenseArea(String(val))} 
                    options={data.areas.map(area => ({ label: area, value: area }))} 
                    placeholder={`Pilih Wilayah ${(currentUser?.role === 'admin' || currentUser?.role === 'accountant') ? '(Opsional)' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Dropdown 
                        name="category" 
                        value={formAddExpenseCategory} 
                        onChange={(val) => setFormAddExpenseCategory(String(val))} 
                        options={data.expenseCategories.map(cat => ({ label: cat, value: cat }))} 
                        placeholder="Pilih Kategori"
                      />
                    </div>
                    <button type="button" onClick={() => setIsAddCategoryModalOpen(true)} className="px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-slate-600 dark:text-slate-400 transition-colors">+</button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bukti Pembayaran</label>
                  <div className="flex items-center gap-4">
                    <div className="relative w-40 h-40 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 group">
                      {uploadedFileBase64 ? (
                        <>
                          <img src={getDirectDriveLink(uploadedFileBase64)} alt="Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={() => {
                              const directUrl = getDirectDriveLink(uploadedFileBase64);
                              const win = window.open();
                              win?.document.write('<html><body style="margin:0; display:flex; align-items:center; justify-content:center; background:#000;"><img src="' + directUrl + '" style="max-width:100%; max-height:100vh; object-fit:contain;"></body></html>');
                            }}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold"
                          >
                            Klik Lihat Full
                          </button>
                        </>
                      ) : (
                        <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      )}
                    </div>
                    <label className={`cursor-pointer bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {isUploading ? 'Mengunggah...' : 'Upload Foto'}
                      <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isUploading} />
                    </label>
                  </div>
                </div>

                <button type="submit" disabled={isUploading} className={`w-full bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition-colors shadow-md shadow-rose-600/20 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>Simpan</button>
                <button type="button" onClick={() => setIsAddExpenseModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
              </form>
            </div>
            </div>
          </div>
        )}

        {/* Add Category Modal */}
        {isAddCategoryModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
              <button onClick={() => setIsAddCategoryModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Kategori Baru</h3>
              <form onSubmit={handleAddCategory} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Kategori</label>
                  <input type="text" name="categoryName" placeholder="Nama Kategori" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan</button>
                <button type="button" onClick={() => setIsAddCategoryModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
              </form>
            </div>
            </div>
          </div>
        )}

        {/* Confirm Close Book Modal */}
        {isConfirmCloseBookModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-6 animate-in zoom-in-95 duration-200 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
                <button onClick={() => setIsConfirmCloseBookModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">Konfirmasi Tutup Buku</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Periode: {monthNames[reportMonth]} {reportYear}</p>
                </div>

                {(() => {
                  // Calculate totals for the current report month/year
                  const rentalIncome = data.payments.filter(p => {
                    const d = new Date(p.date);
                    return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                  }).reduce((acc, p) => acc + p.amount, 0);

                  const currentPeriodOtherIncomes = data.otherIncomes?.filter(i => {
                    const d = new Date(i.date);
                    return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                  }) || [];

                  const allocatedOtherIncome = currentPeriodOtherIncomes
                    .filter(i => i.allocateToWallet !== false)
                    .reduce((acc, i) => acc + i.amount, 0);

                  const dividendOnlyOtherIncome = currentPeriodOtherIncomes
                    .filter(i => i.allocateToWallet === false)
                    .reduce((acc, i) => acc + i.amount, 0);

                  const income = rentalIncome + allocatedOtherIncome + dividendOnlyOtherIncome;

                  const expense = data.expenses.filter(e => {
                    const d = new Date(e.date);
                    return d.getMonth() === reportMonth && d.getFullYear() === reportYear;
                  }).reduce((acc, e) => acc + e.amount, 0);

                  // Operational Net Income (for Zakat, Cash, Saving)
                  const operationalIncome = rentalIncome + allocatedOtherIncome;
                  const operationalNetIncome = operationalIncome - expense;

                  const netIncome = income - expense;

                  // Calculate Allocations
                  const zakatAmount = operationalNetIncome > 0 ? operationalNetIncome * 0.025 : 0;
                  const cashAmount = manualCashAmount !== null ? manualCashAmount : (operationalNetIncome * (cashPercentage / 100));
                  const savingAmount = manualSavingAmount !== null ? manualSavingAmount : (operationalNetIncome * (savingPercentage / 100));
                  const dividendPool = (operationalNetIncome - zakatAmount - cashAmount - savingAmount) + dividendOnlyOtherIncome;

                  return (
                    <div className="space-y-4">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-3 border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Total Pemasukan</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">Rp {income.toLocaleString('id-ID')}</span>
                        </div>
                        {dividendOnlyOtherIncome > 0 && (
                          <div className="flex justify-between text-xs pl-3 border-l-2 border-indigo-200 dark:border-indigo-800 ml-1">
                             <span className="text-slate-500 dark:text-slate-500">Non-Alokasi (Langsung Dividen)</span>
                             <span className="font-medium text-slate-700 dark:text-slate-300">Rp {dividendOnlyOtherIncome.toLocaleString('id-ID')}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Total Pengeluaran</span>
                          <span className="font-bold text-rose-600 dark:text-rose-400">Rp {expense.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between font-bold">
                          <span className="text-slate-800 dark:text-white">Laba Bersih</span>
                          <span className={netIncome >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>Rp {netIncome.toLocaleString('id-ID')}</span>
                        </div>
                      </div>

                      {netIncome > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Alokasi Laba</h4>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                              <p className="text-emerald-600 dark:text-emerald-400 text-xs font-bold mb-1">Zakat (2.5%)</p>
                              <p className="font-bold text-emerald-800 dark:text-emerald-200">Rp {zakatAmount.toLocaleString('id-ID')}</p>
                            </div>
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50 relative group cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors" onClick={() => {
                              setEditAllocationType('cash');
                              setTempAllocationAmount(Math.round(cashAmount).toString());
                              setIsEditAllocationModalOpen(true);
                            }}>
                              <div className="flex justify-between items-start">
                                <p className="text-blue-600 dark:text-blue-400 text-xs font-bold mb-1">Kas ({manualCashAmount !== null ? 'Manual' : `${cashPercentage}%`})</p>
                                <svg className="w-3 h-3 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </div>
                              <p className="font-bold text-blue-800 dark:text-blue-200">Rp {cashAmount.toLocaleString('id-ID')}</p>
                            </div>
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/50 relative group cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors" onClick={() => {
                              setEditAllocationType('saving');
                              setTempAllocationAmount(Math.round(savingAmount).toString());
                              setIsEditAllocationModalOpen(true);
                            }}>
                              <div className="flex justify-between items-start">
                                <p className="text-amber-600 dark:text-amber-400 text-xs font-bold mb-1">Tabungan ({manualSavingAmount !== null ? 'Manual' : `${savingPercentage}%`})</p>
                                <svg className="w-3 h-3 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </div>
                              <p className="font-bold text-amber-800 dark:text-amber-200">Rp {savingAmount.toLocaleString('id-ID')}</p>
                            </div>
                            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800/50">
                              <p className="text-purple-600 dark:text-purple-400 text-xs font-bold mb-1">Dividen</p>
                              <p className="font-bold text-purple-800 dark:text-purple-200">Rp {dividendPool.toLocaleString('id-ID')}</p>
                            </div>
                          </div>
                          
                          {dividendPool > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                              <h5 className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase mb-2">Rincian Dividen</h5>
                              <div className="space-y-1">
                                {dividendRecipients.map(recipient => {
                                   const totalPercentage = dividendRecipients.reduce((acc, r) => acc + r.percentage, 0);
                                   const amount = totalPercentage > 0 ? (recipient.percentage / totalPercentage) * dividendPool : 0;
                                   return (
                                     <div key={recipient.id} className="flex justify-between text-sm">
                                       <span className="text-slate-600 dark:text-slate-400">{recipient.name} ({recipient.percentage}%)</span>
                                       <span className="font-medium text-slate-800 dark:text-slate-200">Rp {amount.toLocaleString('id-ID')}</span>
                                     </div>
                                   );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {netIncome <= 0 && (
                        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 rounded-xl text-sm border border-rose-100 dark:border-rose-800/50 flex items-start gap-2">
                          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          <p>Laba bersih nol atau negatif. Tidak ada alokasi dana yang akan dilakukan.</p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button 
                          onClick={() => setIsConfirmCloseBookModalOpen(false)} 
                          className="flex-1 py-3 px-4 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          Batal
                        </button>
                        <button 
                          onClick={processBookClosing} 
                          className="flex-1 py-3 px-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
                        >
                          Konfirmasi
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Edit Allocation Modal */}
        {isEditAllocationModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 relative animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800 transition-colors duration-300">
                <button onClick={() => setIsEditAllocationModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Edit Alokasi {editAllocationType === 'cash' ? 'Kas' : 'Tabungan'}</h3>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const amount = Number(tempAllocationAmount);
                  if (editAllocationType === 'cash') {
                    setManualCashAmount(amount);
                  } else {
                    setManualSavingAmount(amount);
                  }
                  setIsEditAllocationModalOpen(false);
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah (Rp)</label>
                    <input 
                      type="number" 
                      value={tempAllocationAmount} 
                      onChange={(e) => setTempAllocationAmount(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" 
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => {
                        if (editAllocationType === 'cash') {
                          setManualCashAmount(null);
                        } else {
                          setManualSavingAmount(null);
                        }
                        setIsEditAllocationModalOpen(false);
                      }}
                      className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Reset Default
                    </button>
                    <button type="submit" className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

      {/* Wallet Transaction Modal */}
      {isWalletTransactionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => { setIsWalletTransactionModalOpen(false); setEditingWalletTransaction(null); }} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">{editingWalletTransaction ? 'Edit' : 'Catat'} Transaksi Dompet {selectedWalletForTransaction.toUpperCase()}</h3>
            <form onSubmit={handleSaveWalletTransaction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Jenis Transaksi</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="cursor-pointer">
                    <input type="radio" name="type" value="income" className="peer sr-only" defaultChecked={!editingWalletTransaction || editingWalletTransaction.type === 'income'} />
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-400 transition-all hover:bg-slate-50 dark:hover:bg-slate-700 peer-checked:border-emerald-500 peer-checked:bg-emerald-50 dark:peer-checked:bg-emerald-900/20 peer-checked:text-emerald-700 dark:peer-checked:text-emerald-400">
                      Pemasukan (+)
                    </div>
                  </label>
                  <label className="cursor-pointer">
                    <input type="radio" name="type" value="expense" className="peer sr-only" defaultChecked={editingWalletTransaction?.type === 'expense'} />
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-400 transition-all hover:bg-slate-50 dark:hover:bg-slate-700 peer-checked:border-rose-500 peer-checked:bg-rose-50 dark:peer-checked:bg-rose-900/20 peer-checked:text-rose-700 dark:peer-checked:text-rose-400">
                      Pengeluaran (-)
                    </div>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
                <input type="text" name="description" defaultValue={editingWalletTransaction?.description} placeholder="Contoh: Penyaluran Zakat, Tambahan Kas" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah (Rp)</label>
                <input type="number" name="amount" defaultValue={editingWalletTransaction?.amount} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                <input type="date" name="date" defaultValue={editingWalletTransaction ? getLocalDateString(editingWalletTransaction.date) : getLocalDateString()} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div className="pt-2">
                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan Transaksi</button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Other Income Modal */}
      {isEditOtherIncomeModalOpen && selectedOtherIncome && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsEditOtherIncomeModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Edit Pemasukan Lain</h3>
            <form onSubmit={handleUpdateOtherIncome} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
                <input type="text" name="category" defaultValue={selectedOtherIncome.category} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
                <input type="text" name="description" defaultValue={selectedOtherIncome.description} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah (Rp)</label>
                <input type="number" name="amount" defaultValue={selectedOtherIncome.amount} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                <input type="date" name="date" defaultValue={getLocalDateString(selectedOtherIncome.date)} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Catatan Tambahan</label>
                <textarea name="notes" defaultValue={selectedOtherIncome.notes} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" rows={2}></textarea>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <input type="checkbox" name="allocateToWallet" id="allocateToWalletEdit" defaultChecked={selectedOtherIncome.allocateToWallet} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" />
                <label htmlFor="allocateToWalletEdit" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  Masukan ke Alokasi Dompet (Zakat, Kas, Saving)
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Jika tidak dicentang, hanya akan dimasukkan sebagai dividen.</p>
                </label>
              </div>
              
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan Perubahan</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Edit Expense Modal */}
      {isEditExpenseModalOpen && selectedExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsEditExpenseModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Edit Pengeluaran</h3>
            <form onSubmit={handleUpdateExpense} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
                <input type="text" name="description" defaultValue={selectedExpense.description} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah</label>
                <input type="number" name="amount" defaultValue={selectedExpense.amount} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                <input type="date" name="date" defaultValue={getLocalDateString(selectedExpense.date)} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wilayah {(currentUser?.role === 'admin' || currentUser?.role === 'accountant') ? '(Opsional)' : ''}</label>
                <Dropdown 
                  name="area" 
                  value={formEditExpenseArea} 
                  onChange={(val) => setFormEditExpenseArea(String(val))} 
                  options={data.areas.filter(area => hasWriteAccessToArea(area)).map(area => ({ label: area, value: area }))} 
                  placeholder={`Pilih Wilayah ${(currentUser?.role === 'admin' || currentUser?.role === 'accountant') ? '(Opsional)' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Dropdown 
                      name="category" 
                      value={formEditExpenseCategory} 
                      onChange={(val) => setFormEditExpenseCategory(String(val))} 
                      options={data.expenseCategories.map(cat => ({ label: cat, value: cat }))} 
                      placeholder="Pilih Kategori"
                    />
                  </div>
                  <button type="button" onClick={() => setIsAddCategoryModalOpen(true)} className="px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-slate-600 dark:text-slate-400 transition-colors">+</button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bukti Pembayaran</label>
                <div className="flex items-center gap-4">
                  <div className="relative w-40 h-40 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 group">
                    {(uploadedFileBase64 || selectedExpense.proofUrl) ? (
                      <>
                        <img src={getDirectDriveLink(uploadedFileBase64 || selectedExpense.proofUrl || '')} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => {
                            const directUrl = getDirectDriveLink(uploadedFileBase64 || selectedExpense.proofUrl || '');
                            const win = window.open();
                            win?.document.write('<html><body style="margin:0; display:flex; align-items:center; justify-content:center; background:#000;"><img src="' + directUrl + '" style="max-width:100%; max-height:100vh; object-fit:contain;"></body></html>');
                          }}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold"
                        >
                          Klik Lihat Full
                        </button>
                      </>
                    ) : (
                      <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    )}
                  </div>
                  <label className={`cursor-pointer bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {isUploading ? 'Mengunggah...' : 'Upload Foto'}
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isUploading} />
                  </label>
                </div>
              </div>

              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20">Update</button>
              <button type="button" onClick={() => setIsEditExpenseModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Change PIN Modal */}
      {isChangePinModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsChangePinModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Ganti PIN</h3>
            <form onSubmit={handleChangePin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PIN Lama</label>
                <input type="password" name="oldPin" placeholder="PIN Lama" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PIN Baru</label>
                <input type="password" name="newPin" placeholder="PIN Baru" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Konfirmasi PIN Baru</label>
                <input type="password" name="confirmPin" placeholder="Konfirmasi PIN Baru" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan</button>
              <button type="button" onClick={() => setIsChangePinModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`px-4 py-3 rounded-xl shadow-lg text-white font-medium flex items-center gap-2 animate-in slide-in-from-right-full duration-300 ${
              toast.type === 'success' ? 'bg-emerald-600' : 
              toast.type === 'error' ? 'bg-rose-600' : 'bg-indigo-600'
            }`}
          >
            {toast.type === 'success' && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
            {toast.type === 'error' && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            {toast.message}
          </div>
        ))}
      </div>

      {/* Global Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[200] flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4 border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-bold text-slate-800 dark:text-white">Memproses...</p>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

  const NavItem = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: React.ReactNode }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group relative ${activeTab === id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400'} w-full`}
      title={isSidebarCollapsed ? label : ""}
    >
      <span className="shrink-0 transition-transform duration-300 group-hover:scale-110">{icon}</span>
      <div className={`overflow-hidden transition-all duration-300 flex items-center ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-40 opacity-100'}`}>
        <span className="font-medium whitespace-nowrap ml-1">{label}</span>
      </div>
      {isSidebarCollapsed && activeTab === id && (
        <div className="absolute left-0 w-1 h-6 bg-indigo-600 rounded-r-full" />
      )}
    </button>
  );

  return (
    <div className="h-screen flex bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300">
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ease-in-out relative z-40 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-7 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-all z-[60]"
          title={isSidebarCollapsed ? "Expand" : "Collapse"}
        >
          <svg className={`w-4 h-4 transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="h-20 flex items-center px-6 border-b border-slate-50 dark:border-slate-800 overflow-hidden relative">
          <div className="flex items-center gap-3 shrink-0">
            <Logo size="md" variant="colored" />
            <div className={`transition-all duration-300 overflow-hidden ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-32 opacity-100'}`}>
              <h1 className="text-xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400 whitespace-nowrap">Manajer</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">Kontrakan Pintar AMG</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 px-3 space-y-1 mt-6 overflow-y-auto no-scrollbar">
          <NavItem id="dashboard" label="Dashboard" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" /></svg>} />
          <NavItem id="units" label="Unit & Wilayah" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>} />
          <NavItem id="tenants" label="Penyewa" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>} />
          <NavItem id="transactions" label="Transaksi" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>} />
          <NavItem id="reports" label="Laporan" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} />
        </nav>
        <div className="p-4 border-t border-slate-50 dark:border-slate-800 space-y-1">
          <button 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 w-full group`}
            title={isSidebarCollapsed ? (theme === 'light' ? "Mode Gelap" : "Mode Terang") : ""}
          >
            <span className="shrink-0 transition-transform duration-300 group-hover:rotate-12">
              {theme === 'light' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.95 16.95l.707.707M7.05 7.05l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
              )}
            </span>
            <div className={`overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-40 opacity-100'}`}>
              <span className="font-medium whitespace-nowrap">{theme === 'light' ? "Mode Gelap" : "Mode Terang"}</span>
            </div>
          </button>
          {currentUser?.role !== 'user' && (
            <button 
              onClick={() => setShowPortal(true)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 w-full group`}
              title={isSidebarCollapsed ? "Ganti Aplikasi" : ""}
            >
              <span className="shrink-0 transition-transform duration-300 group-hover:scale-110"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></span>
              <div className={`overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-40 opacity-100'}`}>
                <span className="font-medium whitespace-nowrap">Ganti Aplikasi</span>
              </div>
            </button>
          )}
          <button 
            onClick={() => setIsChangePinModalOpen(true)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 w-full group`}
            title={isSidebarCollapsed ? "Ganti PIN" : ""}
          >
            <span className="shrink-0 transition-transform duration-300 group-hover:scale-110">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </span>
            <div className={`overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-40 opacity-100'}`}>
              <span className="font-medium whitespace-nowrap">Ganti PIN</span>
            </div>
          </button>
          <button 
            onClick={() => {
              setIsLoggedIn(false);
              setCurrentUser(null);
              localStorage.removeItem('amg_isLoggedIn');
              localStorage.removeItem('amg_currentUser');
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 w-full group`}
            title={isSidebarCollapsed ? "Keluar" : ""}
          >
            <span className="shrink-0 transition-transform duration-300 group-hover:translate-x-1"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></span>
            <div className={`overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'w-40 opacity-100'}`}>
              <span className="font-medium whitespace-nowrap">Keluar</span>
            </div>
          </button>
        </div>
      </aside>

      {/* Change PIN Modal */}
      {isChangePinModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsChangePinModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Ganti PIN</h3>
            <form onSubmit={handleChangePin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PIN Lama</label>
                <input type="password" name="oldPin" placeholder="PIN Lama" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PIN Baru</label>
                <input type="password" name="newPin" placeholder="PIN Baru" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Konfirmasi PIN Baru</label>
                <input type="password" name="confirmPin" placeholder="Konfirmasi PIN Baru" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan</button>
              <button type="button" onClick={() => setIsChangePinModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-3 md:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center sticky top-0 z-30 shadow-sm gap-3 sm:gap-2 transition-colors duration-300">
          <div className="flex w-full sm:w-auto justify-between items-center">
            <div className="md:hidden flex items-center gap-1 shrink-0 min-w-0">
              <span className="font-bold text-slate-800 dark:text-white text-base sm:text-lg truncate">KontrakanKu</span>
              <button 
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                title={theme === 'light' ? "Mode Gelap" : "Mode Terang"}
              >
                {theme === 'light' ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.95 16.95l.707.707M7.05 7.05l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
                )}
              </button>
              <button 
                onClick={() => setIsChangePinModalOpen(true)}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                title="Ganti PIN"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </button>
              {currentUser?.role !== 'user' && (
                <button 
                  onClick={() => setShowPortal(true)}
                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                  title="Ganti Aplikasi"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
              )}
              <button 
                onClick={() => {
                  setIsLoggedIn(false);
                  setCurrentUser(null);
                  localStorage.removeItem('amg_isLoggedIn');
                  localStorage.removeItem('amg_currentUser');
                }}
                className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-colors"
                title="Keluar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
            <div className="hidden md:block">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                {activeTab === 'dashboard' ? 'Dashboard' : 
                 activeTab === 'units' ? 'Pintu & Wilayah' :
                 activeTab === 'tenants' ? 'Penyewa' :
                 activeTab === 'transactions' ? 'Transaksi' : 'Laporan Bulanan'}
              </h2>
            </div>
          </div>
          <div className="flex gap-1 sm:gap-2 items-center overflow-x-auto no-scrollbar pb-1 sm:pb-0 w-full sm:w-auto">
             {currentUser?.role !== 'viewer' && (
                <>
                  <button onClick={() => { setIsAddOtherIncomeModalOpen(true); setUploadedFileBase64(null); }} className="bg-indigo-600 text-white p-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md hover:bg-indigo-700 transition-all flex items-center gap-1 sm:gap-2 shrink-0 flex-1 sm:flex-none justify-center" title="Catat Pemasukan Lain">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    <span className="hidden xl:inline">Pemasukan Lain</span>
                  </button>
                  <button onClick={() => { setIsAddExpenseModalOpen(true); setFormAddExpenseArea(''); setFormAddExpenseCategory(''); setUploadedFileBase64(null); }} className="bg-rose-600 text-white p-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md hover:bg-rose-700 transition-all flex items-center gap-1 sm:gap-2 shrink-0 flex-1 sm:flex-none justify-center" title="Catat Pengeluaran">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="hidden xl:inline">Pengeluaran</span>
                  </button>
                </>
             )}
             {currentUser?.role === 'admin' && (
               <>
                <button onClick={() => setIsAddAreaModalOpen(true)} className="bg-emerald-600 text-white p-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md hover:bg-emerald-700 transition-all flex items-center gap-1 sm:gap-2 shrink-0 flex-1 sm:flex-none justify-center" title="Tambah Wilayah">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <span className="hidden xl:inline">Wilayah</span>
                </button>
                <button onClick={() => { setIsAddUnitModalOpen(true); setFormAddUnitArea(''); }} className="bg-indigo-600 text-white p-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md hover:bg-indigo-700 transition-all flex items-center gap-1 sm:gap-2 shrink-0 flex-1 sm:flex-none justify-center" title="Tambah Unit">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                  <span className="hidden xl:inline">Unit</span>
                </button>
               </>
             )}
             {currentUser?.role === 'admin' && (
               <button onClick={() => setIsUserManagementModalOpen(true)} className="bg-slate-600 text-white p-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md hover:bg-slate-700 transition-all flex items-center gap-1 sm:gap-2 shrink-0 flex-1 sm:flex-none justify-center" title="Kelola User">
                 <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                 <span className="hidden xl:inline">User</span>
               </button>
             )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
                <StatCard label="Pendapatan" value={`Rp ${totalIncome.toLocaleString('id-ID')}`} icon={<svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2" /></svg>} color="bg-indigo-600" />
                <StatCard label="Pengeluaran" value={`Rp ${totalExpenses.toLocaleString('id-ID')}`} icon={<svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} color="bg-rose-600" />
                <StatCard label="Bersih" value={`Rp ${netIncome.toLocaleString('id-ID')}`} icon={<svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2" /></svg>} color="bg-emerald-600" />
                <StatCard label="Tunggakan" value={`Rp ${totalArrears.toLocaleString('id-ID')}`} icon={<svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} color="bg-amber-600" />
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Status Unit per Wilayah</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {data.areas.map(area => {
                    const unitsInArea = data.units.filter(u => u.area === area);
                    const total = unitsInArea.length;
                    const occupied = unitsInArea.filter(u => u.status === UnitStatus.OCCUPIED).length;
                    const vacant = total - occupied;
                    
                    return (
                      <div key={area} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-300">
                        <div className="flex justify-between items-start mb-4">
                           <h4 className="font-bold text-slate-700 dark:text-slate-200 text-lg">{area}</h4>
                           <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold px-2 py-1 rounded-lg">{total} Unit</span>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Terisi</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">{occupied}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Kosong</span>
                            <span className="font-bold text-rose-500 dark:text-rose-400">{vacant}</span>
                          </div>
                          
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${total > 0 ? (occupied / total) * 100 : 0}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">Kalender Jatuh Tempo</h3>
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
                    <div className="grid grid-cols-7 mb-2 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                      {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(d => <div key={d}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={i} className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-lg"></div>)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const tenantsDue = tenantsDueOnDay(day);
                        const hasDue = tenantsDue.length > 0;
                        const isAllLunas = hasDue && tenantsDue.every(t => {
                          const unit = data.units.find(u => u.id === t.unitId);
                          return calculateArrears(t, unit) <= 0;
                        });

                        return (
                          <div 
                            key={day} 
                            onClick={() => setSelectedDateInCalendar(day)}
                            className={`h-12 border rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer relative ${day === selectedDateInCalendar ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                          >
                            <span className={`text-xs font-bold ${day === selectedDateInCalendar ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}>{day}</span>
                            {hasDue && <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${isAllLunas ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">Tagihan Tgl {selectedDateInCalendar}</h3>
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm min-h-[150px] transition-colors duration-300">
                    {selectedDateInCalendar && tenantsDueOnDay(selectedDateInCalendar).length > 0 ? (
                      <div className="space-y-3">
                        {tenantsDueOnDay(selectedDateInCalendar).map(t => {
                          const unit = data.units.find(u => u.id === t.unitId);
                          const arrears = calculateArrears(t, unit);
                          const isLunas = arrears <= 0;
                          
                          return (
                            <div key={t.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-2 transition-all hover:bg-slate-100 dark:hover:bg-slate-800">
                              <div className="flex justify-between items-center w-full">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t.name}</span>
                                  {unit && (
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                      {unit.area} - {unit.name}
                                    </span>
                                  )}
                                  {!isLunas && (
                                    <span className="text-[10px] font-medium text-rose-500 dark:text-rose-400">
                                      Tunggakan: Rp {arrears.toLocaleString('id-ID')}
                                    </span>
                                  )}
                                </div>
                                {isLunas ? (
                                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    Lunas
                                  </span>
                                ) : (
                                  currentUser?.role !== 'viewer' && unit && hasWriteAccessToArea(unit.area) && (
                                    <button 
                                      onClick={() => handleUnitAction(unit)} 
                                      className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                                    >
                                      Bayar
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : <p className="text-xs text-slate-400 dark:text-slate-500 italic text-center py-10">Kosong</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'units' && (
            <div className="space-y-10 animate-in fade-in duration-300">
               <div className="flex justify-between items-center">
                 <h3 className="text-xl font-bold text-slate-800 dark:text-white">Unit Wilayah</h3>
               </div>
               
               {data.areas.map(area => (
                 <div key={area} className="space-y-4">
                   <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                      <h4 className="text-lg font-bold text-slate-700 dark:text-slate-200">{area}</h4>
                      {currentUser?.role === 'admin' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleEditAreaInit(area)} className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                          <button onClick={() => handleDeleteArea(area)} className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                      )}
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                     {data.units.filter(u => u.area === area).map(unit => {
                       const tenant = data.tenants.find(t => t.unitId === unit.id);
                       const arrears = tenant ? calculateArrears(tenant, unit) : 0;
                       return (
                         <UnitCard 
                          key={unit.id} 
                          unit={unit} 
                          tenant={tenant}
                          arrears={arrears}
                          onAction={handleUnitAction} 
                          onEdit={handleEditUnitInit} 
                          onDelete={handleDeleteUnit} 
                          onEditTenant={handleEditTenantInit} 
                          onDeleteTenant={handleDeleteTenant} 
                          userRole={currentUser?.role}
                          canEdit={hasWriteAccessToArea(area)}
                         />
                       );
                     })}
                   </div>
                 </div>
               ))}
            </div>
          )}

          {activeTab === 'tenants' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in duration-300 transition-colors duration-300">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('name')}>
                        <div className="flex items-center gap-1">
                          Penyewa
                          {sortConfig?.key === 'name' && (
                            <svg className={`w-3 h-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Wilayah - Unit</th>
                      <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('moveInDate')}>
                        <div className="flex items-center gap-1">
                          Tgl Masuk
                          {sortConfig?.key === 'moveInDate' && (
                            <svg className={`w-3 h-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('duration')}>
                        <div className="flex items-center gap-1">
                          Lama Sewa
                          {sortConfig?.key === 'duration' && (
                            <svg className={`w-3 h-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('dueDay')}>
                        <div className="flex items-center gap-1">
                          Tgl Tempo
                          {sortConfig?.key === 'dueDay' && (
                            <svg className={`w-3 h-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Tunggakan</th>
                      {currentUser?.role !== 'viewer' && (
                        <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase text-right">Aksi</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {sortedTenants.map(t => (
                      <tr key={t.id} onClick={() => handleViewTenantHistory(t)} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-700 dark:text-slate-200">{t.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{(() => { const u = data.units.find(u => u.id === t.unitId); return u ? `${u.area} - ${u.name}` : '-'; })()}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatDate(t.moveInDate)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{getDuration(t.moveInDate)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{t.dueDay}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(() => {
                            const unit = data.units.find(u => u.id === t.unitId);
                            const arrears = calculateArrears(t, unit);
                            return arrears > 0 ? <span className="text-rose-600 dark:text-rose-400 font-bold">Rp {arrears.toLocaleString('id-ID')}</span> : <span className="text-emerald-600 dark:text-emerald-400 font-bold">Lunas</span>;
                          })()}
                        </td>
                        {currentUser?.role !== 'viewer' && (
                          <td className="px-4 py-3 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                             <div className="flex justify-end gap-2">
                              {(() => {
                                const unit = data.units.find(u => u.id === t.unitId);
                                if (!unit || !hasWriteAccessToArea(unit.area)) return null;
                                return (
                                  <>
                                    <button onClick={() => handleEditTenantInit(t)} className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                    <button onClick={() => handleDeleteTenant(t.id)} className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                  </>
                                );
                              })()}
                             </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center gap-4 transition-colors duration-300">
                <div className="flex flex-col md:flex-row gap-2 md:gap-4 w-full md:w-auto">
                  <div className="flex gap-2 w-full md:w-auto">
                    <Dropdown 
                      value={transactionFilterMonth}
                      options={monthNames.map((m, i) => ({ label: m, value: i }))}
                      onChange={(val) => setTransactionFilterMonth(Number(val))}
                      className="flex-1 md:flex-none min-w-[120px]"
                    />
                    <Dropdown 
                      value={transactionFilterYear}
                      options={Array.from({ length: 5 }).map((_, i) => {
                        const y = new Date().getFullYear() - 2 + i;
                        return { label: y.toString(), value: y };
                      })}
                      onChange={(val) => setTransactionFilterYear(Number(val))}
                      className="flex-1 md:flex-none min-w-[100px]"
                    />
                  </div>
                  <MultiSelectDropdown
                    value={transactionSelectedAreas}
                    options={data.areas.map(a => ({ label: a, value: a }))}
                    onChange={setTransactionSelectedAreas}
                    placeholder="Semua Wilayah"
                    className="w-full md:w-auto md:min-w-[150px]"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Pemasukan</h3>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Tgl Input</th>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Wilayah - Unit</th>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Penyewa</th>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Periode</th>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Tanggal</th>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Jumlah</th>
                          {currentUser?.role !== 'viewer' && (
                            <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase text-right">Aksi</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                        {data.payments.slice().reverse().filter(p => {
                          const d = new Date(p.date);
                          const matchesDate = d.getMonth() === transactionFilterMonth && d.getFullYear() === transactionFilterYear;
                          if (!matchesDate) return false;
                          
                          if (transactionSelectedAreas.length > 0) {
                            const unit = data.units.find(u => u.id === p.unitId);
                            return unit && transactionSelectedAreas.includes(unit.area);
                          }
                          return true;
                        }).map(p => {
                          const unit = data.units.find(u => u.id === p.unitId);
                          return (
                          <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">{p.createdAt ? formatDateTime(p.createdAt) : '-'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">{unit ? `${unit.area} - ${unit.name}` : '-'}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-700 dark:text-slate-200">{data.tenants.find(t => t.id === p.tenantId)?.name}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{p.periodCovered}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatDate(p.date)}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">Rp {p.amount.toLocaleString('id-ID')}</td>
                            {currentUser?.role !== 'viewer' && (
                              <td className="px-4 py-3 whitespace-nowrap text-right">
                                <div className="flex justify-end gap-2">
                                  {(!unit || hasWriteAccessToArea(unit.area)) && (
                                    <>
                                      <button onClick={() => handleEditPaymentInit(p)} className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                      <button onClick={() => handleDeletePayment(p.id)} className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                        })}
                        {data.payments.filter(p => {
                          const d = new Date(p.date);
                          const matchesDate = d.getMonth() === transactionFilterMonth && d.getFullYear() === transactionFilterYear;
                          if (!matchesDate) return false;
                          
                          if (transactionSelectedAreas.length > 0) {
                            const unit = data.units.find(u => u.id === p.unitId);
                            return unit && transactionSelectedAreas.includes(unit.area);
                          }
                          return true;
                        }).length === 0 && (
                          <tr><td colSpan={currentUser?.role === 'viewer' ? 6 : 7} className="px-6 py-8 text-center text-slate-400 dark:text-slate-500 italic">Tidak ada data pemasukan untuk periode ini</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Pengeluaran</h3>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Tgl Input</th>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Wilayah</th>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Keterangan</th>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Kategori</th>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Tanggal</th>
                          <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Jumlah</th>
                          {currentUser?.role !== 'viewer' && (
                            <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase text-right">Aksi</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                        {data.expenses.slice().reverse().filter(ex => {
                          const d = new Date(ex.date);
                          const matchesDate = d.getMonth() === transactionFilterMonth && d.getFullYear() === transactionFilterYear;
                          if (!matchesDate) return false;

                          // Hide expenses without area in transaction mode
                          if (appMode !== 'accounting' && !ex.area) return false;

                          if (transactionSelectedAreas.length > 0) {
                            return ex.area && transactionSelectedAreas.includes(ex.area);
                          }
                          return true;
                        }).map(ex => (
                          <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">{ex.createdAt ? formatDateTime(ex.createdAt) : '-'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">{ex.area || '-'}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-700 dark:text-slate-200">{ex.description}</td>
                            <td className="px-4 py-3 whitespace-nowrap"><span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs text-slate-600 dark:text-slate-400">{ex.category}</span></td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">{formatDate(ex.date)}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-bold text-rose-600 dark:text-rose-400">Rp {ex.amount.toLocaleString('id-ID')}</td>
                            {currentUser?.role !== 'viewer' && (
                              <td className="px-4 py-3 whitespace-nowrap text-right">
                                <div className="flex justify-end gap-2">
                                  {ex.proofUrl && (
                                    <button onClick={() => {
                                      const directUrl = getDirectDriveLink(ex.proofUrl);
                                      const win = window.open();
                                      win?.document.write('<html><body style="margin:0; display:flex; align-items:center; justify-content:center; background:#000;"><img src="' + directUrl + '" style="max-width:100%; max-height:100vh; object-fit:contain;"></body></html>');
                                    }} className="p-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400" title="Lihat Bukti">
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    </button>
                                  )}
                                  {currentUser?.role !== 'viewer' && (
                                    <>
                                      {(!ex.area || hasWriteAccessToArea(ex.area)) && (
                                        <>
                                          <button onClick={() => handleEditExpenseInit(ex)} className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                          <button onClick={() => handleDeleteExpense(ex.id)} className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                        </>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                        {data.expenses.filter(ex => {
                          const d = new Date(ex.date);
                          const matchesDate = d.getMonth() === transactionFilterMonth && d.getFullYear() === transactionFilterYear;
                          if (!matchesDate) return false;
                          
                          // Hide expenses without area in transaction mode
                          if (appMode !== 'accounting' && !ex.area) return false;

                          if (transactionSelectedAreas.length > 0) {
                            return ex.area && transactionSelectedAreas.includes(ex.area);
                          }
                          return true;
                        }).length === 0 && (
                          <tr><td colSpan={currentUser?.role === 'viewer' ? 6 : 7} className="px-6 py-8 text-center text-slate-400 italic">Tidak ada data pengeluaran untuk periode ini</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-white dark:bg-slate-900 p-4 md:p-6 lg:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4 transition-colors duration-300">
                <div className="flex flex-col lg:flex-row gap-2 md:gap-4 w-full xl:w-auto">
                  <div className="flex gap-2 w-full lg:w-auto">
                    <Dropdown 
                      value={reportMonth}
                      options={monthNames.map((m, i) => ({ label: m, value: i }))}
                      onChange={(val) => setReportMonth(Number(val))}
                      className="flex-1 md:flex-none min-w-[120px] md:w-40 lg:w-48 text-sm md:text-base"
                    />
                    <Dropdown 
                      value={reportYear}
                      options={Array.from({ length: 5 }).map((_, i) => {
                        const y = new Date().getFullYear() - 2 + i;
                        return { label: y.toString(), value: y };
                      })}
                      onChange={(val) => setReportYear(Number(val))}
                      className="flex-1 md:flex-none min-w-[100px] md:w-32 lg:w-40 text-sm md:text-base"
                    />
                  </div>
                  <MultiSelectDropdown
                    value={reportSelectedAreas}
                    options={data.areas.map(a => ({ label: a, value: a }))}
                    onChange={setReportSelectedAreas}
                    placeholder="Semua Wilayah"
                    className="w-full lg:w-auto md:min-w-[200px] lg:min-w-[250px] text-sm md:text-base"
                  />
                </div>
                <button onClick={handleExportPDF} className="w-full xl:w-auto justify-center flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors text-sm md:text-base lg:text-lg shadow-md hover:shadow-lg">
                  <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Ekspor PDF
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                <div className="bg-white dark:bg-slate-900 p-4 md:p-6 lg:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300">
                  <h4 className="text-xs md:text-sm lg:text-base font-bold text-slate-400 dark:text-slate-500 uppercase mb-1 md:mb-2 tracking-wider">Total Pendapatan</h4>
                  <p className="text-xl md:text-2xl lg:text-3xl font-bold text-indigo-600 dark:text-indigo-400 truncate">Rp {getReportData.totalIncome.toLocaleString('id-ID')}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 md:p-6 lg:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300">
                  <h4 className="text-xs md:text-sm lg:text-base font-bold text-slate-400 dark:text-slate-500 uppercase mb-1 md:mb-2 tracking-wider">Total Pengeluaran</h4>
                  <p className="text-xl md:text-2xl lg:text-3xl font-bold text-rose-600 dark:text-rose-400 truncate">Rp {getReportData.totalExpense.toLocaleString('id-ID')}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 md:p-6 lg:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300 md:col-span-2 xl:col-span-1">
                  <h4 className="text-xs md:text-sm lg:text-base font-bold text-slate-400 dark:text-slate-500 uppercase mb-1 md:mb-2 tracking-wider">Bersih</h4>
                  <p className={`text-xl md:text-2xl lg:text-3xl font-bold truncate ${getReportData.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    Rp {getReportData.net.toLocaleString('id-ID')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
                  <div className="p-4 md:p-5 lg:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 font-bold text-slate-700 dark:text-slate-200 text-sm md:text-base lg:text-lg">Rincian Pendapatan</div>
                  <div className="overflow-x-auto max-h-[400px] md:max-h-[500px]">
                    <table className="w-full text-left text-sm md:text-base">
                      <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Tgl</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Wilayah - Unit</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Penyewa</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Ket</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-right font-semibold text-slate-600 dark:text-slate-400">Jml</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {getReportData.income.length > 0 ? getReportData.income.map(p => {
                          const unit = data.units.find(u => u.id === p.unitId);
                          const unitName = unit ? `${unit.area} - ${unit.name}` : '-';
                          const tenantName = data.tenants.find(t => t.id === p.tenantId)?.name || '-';
                          return (
                            <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">{formatDate(p.date)}</td>
                              <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">{unitName}</td>
                              <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-slate-700 dark:text-slate-300">{tenantName}</td>
                              <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">{p.notes}</td>
                              <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-right font-bold text-emerald-600 dark:text-emerald-400">{p.amount.toLocaleString('id-ID')}</td>
                            </tr>
                          );
                        }) : <tr><td colSpan={5} className="px-4 py-8 md:py-12 text-center text-slate-400 dark:text-slate-600 italic">Tidak ada data</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
                  <div className="p-4 md:p-5 lg:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 font-bold text-slate-700 dark:text-slate-200 text-sm md:text-base lg:text-lg">Rincian Pengeluaran</div>
                  <div className="overflow-x-auto max-h-[400px] md:max-h-[500px]">
                    <table className="w-full text-left text-sm md:text-base">
                      <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Tgl</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Wilayah</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Kategori</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Ket</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-right font-semibold text-slate-600 dark:text-slate-400">Jml</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {getReportData.expenses.length > 0 ? getReportData.expenses.map(e => (
                          <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">{formatDate(e.date)}</td>
                            <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">{e.area || '-'}</td>
                            <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap"><span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs md:text-sm text-slate-700 dark:text-slate-300">{e.category}</span></td>
                            <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">{e.description}</td>
                            <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-right font-bold text-rose-600 dark:text-rose-400">{e.amount.toLocaleString('id-ID')}</td>
                          </tr>
                        )) : <tr><td colSpan={5} className="px-4 py-8 md:py-12 text-center text-slate-400 dark:text-slate-600 italic">Tidak ada data</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden lg:col-span-2 transition-colors duration-300">
                  <div className="p-4 md:p-5 lg:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 font-bold text-slate-700 dark:text-slate-200 text-sm md:text-base lg:text-lg">Rincian Tunggakan</div>
                  <div className="overflow-x-auto max-h-[400px] md:max-h-[500px]">
                    <table className="w-full text-left text-sm md:text-base">
                      <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Wilayah - Unit</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Penyewa</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">Kontak</th>
                          <th className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-right font-semibold text-slate-600 dark:text-slate-400">Jml Tunggakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {(() => {
                          const arrearsList = data.tenants.map(t => {
                            const unit = data.units.find(u => u.id === t.unitId);
                            const amount = calculateArrears(t, unit);
                            return { ...t, unit, amount };
                          }).filter(t => t.amount > 0 && (!reportSelectedAreas.length || (t.unit && reportSelectedAreas.includes(t.unit.area))));

                          if (arrearsList.length === 0) {
                            return <tr><td colSpan={4} className="px-4 py-8 md:py-12 text-center text-slate-400 dark:text-slate-600 italic">Tidak ada tunggakan</td></tr>;
                          }

                          return arrearsList.map(t => (
                            <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">{t.unit ? `${t.unit.area} - ${t.unit.name}` : '-'}</td>
                              <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-slate-700 dark:text-slate-300">{t.name}</td>
                              <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">{t.contact}</td>
                              <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap text-right font-bold text-amber-600 dark:text-amber-400">Rp {t.amount.toLocaleString('id-ID')}</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Navigation - Mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2 landscape:py-1 flex justify-between items-center z-40 pb-4 landscape:pb-1 transition-colors duration-300">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <svg className="w-6 h-6 landscape:w-5 landscape:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" /></svg> },
            { id: 'units', label: 'Unit', icon: <svg className="w-6 h-6 landscape:w-5 landscape:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
            { id: 'tenants', label: 'Penyewa', icon: <svg className="w-6 h-6 landscape:w-5 landscape:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
            { id: 'transactions', label: 'Transaksi', icon: <svg className="w-6 h-6 landscape:w-5 landscape:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
            { id: 'reports', label: 'Laporan', icon: <svg className="w-6 h-6 landscape:w-5 landscape:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> }
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              className={`flex flex-col landscape:flex-row items-center gap-1 landscape:gap-2 p-2 landscape:p-1 rounded-xl transition-colors ${activeTab === tab.id ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            >
              {tab.icon}
              <span className="text-[10px] font-bold landscape:text-xs">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* --- ALL MODALS (FIXED) --- */}

      {/* Payment Modal (Add) */}
      {isPaymentModalOpen && selectedUnit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsPaymentModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Pembayaran: {data.tenants.find(t => t.unitId === selectedUnit.id)?.name}</h3>
              <p className="text-slate-500 dark:text-slate-400">{selectedUnit.area} - {selectedUnit.name}</p>
            </div>
            <form onSubmit={handleAddPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah</label>
                <input type="number" name="amount" defaultValue={selectedUnit.monthlyPrice} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" placeholder="Jumlah" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                <input type="date" name="date" required defaultValue={getLocalDateString()} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Periode</label>
                <input type="text" name="period" defaultValue={currentPeriod} placeholder="Periode" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><input type="checkbox" name="isInstallment" className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500" /> Cicilan</label>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Catatan</label>
                <textarea name="notes" placeholder="Catatan" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all h-20"></textarea>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan</button>
              <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {isEditPaymentModalOpen && selectedPayment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsEditPaymentModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Edit Riwayat Pembayaran</h3>
            <form onSubmit={handleUpdatePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah</label>
                <input type="number" name="amount" defaultValue={selectedPayment.amount} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                <input type="date" name="date" defaultValue={getLocalDateString(selectedPayment.date)} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Periode</label>
                <input type="text" name="period" defaultValue={selectedPayment.periodCovered} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><input type="checkbox" name="isInstallment" defaultChecked={selectedPayment.isInstallment} className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500" /> Cicilan</label>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Catatan</label>
                <textarea name="notes" defaultValue={selectedPayment.notes} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all h-20"></textarea>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Update</button>
              <button type="button" onClick={() => setIsEditPaymentModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Add Unit Modal */}
      {isAddUnitModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsAddUnitModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Unit Baru</h3>
            <form onSubmit={handleAddUnit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Unit / No. Pintu</label>
                <input type="text" name="name" placeholder="Nama/No Pintu" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wilayah</label>
                <Dropdown 
                  name="area" 
                  value={formAddUnitArea} 
                  onChange={(val) => setFormAddUnitArea(String(val))} 
                  options={data.areas.map(a => ({ label: a, value: a }))} 
                  placeholder="Pilih Wilayah"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Harga per Bulan</label>
                <input type="number" name="price" placeholder="Harga/Bulan" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan</button>
              <button type="button" onClick={() => setIsAddUnitModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Edit Unit Modal */}
      {isEditUnitModalOpen && selectedUnit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsEditUnitModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Edit Unit: {selectedUnit.name}</h3>
            <form onSubmit={handleUpdateUnit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Unit / No. Pintu</label>
                <input type="text" name="name" defaultValue={selectedUnit.name} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wilayah</label>
                <Dropdown 
                  name="area" 
                  value={formEditUnitArea} 
                  onChange={(val) => setFormEditUnitArea(String(val))} 
                  options={data.areas.map(a => ({ label: a, value: a }))} 
                  placeholder="Pilih Wilayah"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Harga per Bulan</label>
                <input type="number" name="price" defaultValue={selectedUnit.monthlyPrice} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Update</button>
              <button type="button" onClick={() => setIsEditUnitModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Add Tenant Modal */}
      {isAddTenantModalOpen && selectedUnit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsAddTenantModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Penyewa: {selectedUnit.name}</h3>
            <form onSubmit={handleAddTenant} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Penyewa</label>
                <input type="text" name="name" placeholder="Nama" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal Masuk</label>
                  <input type="date" name="moveInDate" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tgl Jatuh Tempo</label>
                  <input type="number" name="dueDay" placeholder="Tgl Tempo" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kontak / No. HP</label>
                <input type="text" name="contact" placeholder="Kontak" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Foto Identitas</label>
                <div className="flex items-center gap-4">
                  <div className="relative w-40 h-40 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 group">
                    {uploadedFileBase64 ? (
                      <>
                        <img src={getDirectDriveLink(uploadedFileBase64)} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => {
                            const directUrl = getDirectDriveLink(uploadedFileBase64);
                            const win = window.open();
                            win?.document.write('<html><body style="margin:0; display:flex; align-items:center; justify-content:center; background:#000;"><img src="' + directUrl + '" style="max-width:100%; max-height:100vh; object-fit:contain;"></body></html>');
                          }}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold"
                        >
                          Klik Lihat Full
                        </button>
                      </>
                    ) : (
                      <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    )}
                  </div>
                  <label className={`cursor-pointer bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {isUploading ? 'Mengunggah...' : 'Upload Foto'}
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isUploading} />
                  </label>
                </div>
              </div>

              <button type="submit" disabled={isUploading} className={`w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-600/20 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>Daftarkan</button>
              <button type="button" onClick={() => setIsAddTenantModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Edit Tenant Modal */}
      {isEditTenantModalOpen && selectedTenant && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsEditTenantModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Edit Penyewa: {selectedTenant.name}</h3>
            <form onSubmit={handleUpdateTenant} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Penyewa</label>
                <input type="text" name="name" defaultValue={selectedTenant.name} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tgl Jatuh Tempo</label>
                <input type="number" name="dueDay" defaultValue={selectedTenant.dueDay} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kontak / No. HP</label>
                <input type="text" name="contact" defaultValue={selectedTenant.contact} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Foto Identitas</label>
                <div className="flex items-center gap-4">
                  <div className="relative w-40 h-40 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 group">
                    {(uploadedFileBase64 || selectedTenant.documentUrl) ? (
                      <>
                        <img src={getDirectDriveLink(uploadedFileBase64 || selectedTenant.documentUrl || '')} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => {
                            const directUrl = getDirectDriveLink(uploadedFileBase64 || selectedTenant.documentUrl || '');
                            const win = window.open();
                            win?.document.write('<html><body style="margin:0; display:flex; align-items:center; justify-content:center; background:#000;"><img src="' + directUrl + '" style="max-width:100%; max-height:100vh; object-fit:contain;"></body></html>');
                          }}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold"
                        >
                          Klik Lihat Full
                        </button>
                      </>
                    ) : (
                      <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    )}
                  </div>
                  <label className={`cursor-pointer bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {isUploading ? 'Mengunggah...' : 'Upload Foto'}
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isUploading} />
                  </label>
                </div>
              </div>

              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Update</button>
              <button type="button" onClick={() => setIsEditTenantModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Add Other Income Modal */}
      {isAddOtherIncomeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsAddOtherIncomeModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Catat Pemasukan Lain</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              withLoading(() => {
                const formData = new FormData(e.currentTarget);
                
                const dateStr = formData.get('date') as string;
                if (isPeriodClosed(new Date(dateStr))) {
                  showToast('Periode untuk tanggal ini sudah ditutup buku', 'error');
                  return;
                }

                const newIncome: OtherIncome = {
                  id: Date.now().toString(),
                  description: formData.get('description') as string,
                  amount: Number(formData.get('amount')),
                  date: formData.get('date') as string,
                  category: formData.get('category') as string,
                  notes: formData.get('notes') as string,
                  allocateToWallet: formData.get('allocateToWallet') === 'on',
                  createdAt: new Date().toISOString()
                };
                
                const updatedData = { ...data, otherIncomes: [...(data.otherIncomes || []), newIncome] };
                setData(updatedData);
                saveData(updatedData);
                setIsAddOtherIncomeModalOpen(false);
                showToast('Pemasukan lain berhasil dicatat');
              });
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
                <input type="text" name="category" placeholder="Contoh: Penjualan Aset, Hibah" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
                <input type="text" name="description" placeholder="Deskripsi pemasukan" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah (Rp)</label>
                <input type="number" name="amount" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                <input type="date" name="date" defaultValue={getLocalDateString()} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Catatan Tambahan</label>
                <textarea name="notes" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" rows={2}></textarea>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <input type="checkbox" name="allocateToWallet" id="allocateToWallet3" defaultChecked className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" />
                <label htmlFor="allocateToWallet3" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  Masukan ke Alokasi Dompet (Zakat, Kas, Saving)
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Jika tidak dicentang, hanya akan dimasukkan sebagai dividen.</p>
                </label>
              </div>
              
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Edit Other Income Modal */}
      {isEditOtherIncomeModalOpen && selectedOtherIncome && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsEditOtherIncomeModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Edit Pemasukan Lain</h3>
            <form onSubmit={handleUpdateOtherIncome} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
                <input type="text" name="category" defaultValue={selectedOtherIncome.category} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
                <input type="text" name="description" defaultValue={selectedOtherIncome.description} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah (Rp)</label>
                <input type="number" name="amount" defaultValue={selectedOtherIncome.amount} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                <input type="date" name="date" defaultValue={getLocalDateString(selectedOtherIncome.date)} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Catatan Tambahan</label>
                <textarea name="notes" defaultValue={selectedOtherIncome.notes} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" rows={2}></textarea>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <input type="checkbox" name="allocateToWallet" id="allocateToWalletEdit" defaultChecked={selectedOtherIncome.allocateToWallet} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" />
                <label htmlFor="allocateToWalletEdit" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  Masukan ke Alokasi Dompet (Zakat, Kas, Saving)
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Jika tidak dicentang, hanya akan dimasukkan sebagai dividen.</p>
                </label>
              </div>
              
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan Perubahan</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Add Area Modal */}
      {isAddAreaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsAddAreaModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Wilayah Baru</h3>
            <form onSubmit={handleAddArea} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Wilayah</label>
                <input type="text" name="areaName" placeholder="Nama Wilayah" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Simpan</button>
              <button type="button" onClick={() => setIsAddAreaModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Edit Area Modal */}
      {isEditAreaModalOpen && selectedArea && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsEditAreaModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Edit Wilayah: {selectedArea}</h3>
            <form onSubmit={handleUpdateArea} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Wilayah</label>
                <input type="text" name="areaName" defaultValue={selectedArea} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20">Update</button>
              <button type="button" onClick={() => setIsEditAreaModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isTenantHistoryModalOpen && selectedTenant && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl flex flex-col p-6 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsTenantHistoryModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-xl font-bold text-slate-800 dark:text-white">Riwayat: {selectedTenant.name}</h3>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 dark:border-slate-800">
                    <tr className="text-slate-500 dark:text-slate-400"><th className="py-2">Periode</th><th className="py-2">Jumlah</th><th className="py-2 text-right">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.payments.filter(p => p.tenantId === selectedTenant.id).reverse().map(p => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 text-slate-700 dark:text-slate-300">{p.periodCovered}</td>
                        <td className="py-3 font-bold text-slate-800 dark:text-white">Rp {p.amount.toLocaleString('id-ID')}</td>
                        <td className="py-3 text-right">
                          <button onClick={() => handleDeletePayment(p.id)} className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 transition-colors">Hapus</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-xl animate-in zoom-in-95 duration-200 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsConfirmModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Konfirmasi</h3>
            <p className="text-slate-600 dark:text-slate-400">{confirmMessage}</p>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setIsConfirmModalOpen(false)} 
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={handleConfirm} 
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors shadow-sm shadow-rose-600/20"
              >
                Hapus
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {isAddExpenseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsAddExpenseModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Catat Pengeluaran</h3>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
                <input type="text" name="description" placeholder="Keterangan" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah</label>
                <input type="number" name="amount" placeholder="Jumlah (Rp)" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                <input type="date" name="date" required defaultValue={getLocalDateString()} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wilayah {(currentUser?.role === 'admin' || currentUser?.role === 'accountant') ? '(Opsional)' : ''}</label>
                <Dropdown 
                  name="area" 
                  value={formAddExpenseArea} 
                  onChange={(val) => setFormAddExpenseArea(String(val))} 
                  options={data.areas.filter(area => hasWriteAccessToArea(area)).map(area => ({ label: area, value: area }))} 
                  placeholder={`Pilih Wilayah ${(currentUser?.role === 'admin' || currentUser?.role === 'accountant') ? '(Opsional)' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Dropdown 
                      name="category" 
                      value={formAddExpenseCategory} 
                      onChange={(val) => setFormAddExpenseCategory(String(val))} 
                      options={data.expenseCategories.map(cat => ({ label: cat, value: cat }))} 
                      placeholder="Pilih Kategori"
                    />
                  </div>
                  <button type="button" onClick={() => setIsAddCategoryModalOpen(true)} className="px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-slate-600 dark:text-slate-400 transition-colors">+</button>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bukti Pembayaran</label>
                <div className="flex items-center gap-4">
                  <div className="relative w-40 h-40 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 group transition-colors">
                    {uploadedFileBase64 ? (
                      <>
                        <img src={getDirectDriveLink(uploadedFileBase64)} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => {
                            const directUrl = getDirectDriveLink(uploadedFileBase64);
                            const win = window.open();
                            win?.document.write('<html><body style="margin:0; display:flex; align-items:center; justify-content:center; background:#000;"><img src="' + directUrl + '" style="max-width:100%; max-height:100vh; object-fit:contain;"></body></html>');
                          }}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold"
                        >
                          Klik Lihat Full
                        </button>
                      </>
                    ) : (
                      <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    )}
                  </div>
                  <label className={`cursor-pointer bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {isUploading ? 'Mengunggah...' : 'Upload Foto'}
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isUploading} />
                  </label>
                </div>
              </div>

              <button type="submit" className="w-full bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition-colors shadow-md shadow-rose-600/20">Simpan</button>
              <button type="button" onClick={() => setIsAddExpenseModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Edit Expense Modal */}
      {isEditExpenseModalOpen && selectedExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsEditExpenseModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Edit Pengeluaran</h3>
            <form onSubmit={handleUpdateExpense} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
                <input type="text" name="description" defaultValue={selectedExpense.description} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah</label>
                <input type="number" name="amount" defaultValue={selectedExpense.amount} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
                <input type="date" name="date" defaultValue={getLocalDateString(selectedExpense.date)} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Wilayah {(currentUser?.role === 'admin' || currentUser?.role === 'accountant') ? '(Opsional)' : ''}</label>
                <Dropdown 
                  name="area" 
                  value={formEditExpenseArea} 
                  onChange={(val) => setFormEditExpenseArea(String(val))} 
                  options={data.areas.filter(area => hasWriteAccessToArea(area)).map(area => ({ label: area, value: area }))} 
                  placeholder={`Pilih Wilayah ${(currentUser?.role === 'admin' || currentUser?.role === 'accountant') ? '(Opsional)' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Dropdown 
                      name="category" 
                      value={formEditExpenseCategory} 
                      onChange={(val) => setFormEditExpenseCategory(String(val))} 
                      options={data.expenseCategories.map(cat => ({ label: cat, value: cat }))} 
                      placeholder="Pilih Kategori"
                    />
                  </div>
                  <button type="button" onClick={() => setIsAddCategoryModalOpen(true)} className="px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-slate-600 dark:text-slate-400 transition-colors">+</button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bukti Pembayaran</label>
                <div className="flex items-center gap-4">
                  <div className="relative w-40 h-40 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 group">
                    {(uploadedFileBase64 || selectedExpense.proofUrl) ? (
                      <>
                        <img src={getDirectDriveLink(uploadedFileBase64 || selectedExpense.proofUrl || '')} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => {
                            const directUrl = getDirectDriveLink(uploadedFileBase64 || selectedExpense.proofUrl || '');
                            const win = window.open();
                            win?.document.write('<html><body style="margin:0; display:flex; align-items:center; justify-content:center; background:#000;"><img src="' + directUrl + '" style="max-width:100%; max-height:100vh; object-fit:contain;"></body></html>');
                          }}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold"
                        >
                          Klik Lihat Full
                        </button>
                      </>
                    ) : (
                      <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    )}
                  </div>
                  <label className={`cursor-pointer bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {isUploading ? 'Mengunggah...' : 'Upload Foto'}
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isUploading} />
                  </label>
                </div>
              </div>

              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20">Update</button>
              <button type="button" onClick={() => setIsEditExpenseModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {isAddCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsAddCategoryModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Kategori Baru</h3>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Kategori</label>
                <input type="text" name="categoryName" placeholder="Nama Kategori" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20">Simpan</button>
              <button type="button" onClick={() => setIsAddCategoryModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <button onClick={() => setIsAddUserModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Tambah User</h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
                <input type="text" name="username" placeholder="Username" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PIN (6 digit)</label>
                <input type="password" name="pin" placeholder="123456" maxLength={6} required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
                <select name="role" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all">
                  <option value="user">User (Edit)</option>
                  <option value="viewer">Viewer (Lihat Saja)</option>
                  <option value="accountant">Accountant (Pembukuan)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20">Simpan</button>
              <button type="button" onClick={() => setIsAddUserModalOpen(false)} className="w-full text-slate-400 dark:text-slate-500 py-2 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Batal</button>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* User Management Modal */}
      {isUserManagementModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 relative border border-slate-200 dark:border-slate-800 transition-colors duration-300">
              <button onClick={() => setIsUserManagementModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Kelola Pengguna</h3>
                <button onClick={() => { setIsUserManagementModalOpen(false); setIsAddUserModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Tambah User
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Username</th>
                      <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Role</th>
                      <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Wilayah Akses</th>
                      <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.users.map((user, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{user.username}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            user.role === 'admin' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 
                            user.role === 'viewer' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 
                            user.role === 'accountant' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                            'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {user.role === 'admin' ? (
                            <span className="text-xs text-slate-500 dark:text-slate-500 italic">Semua Wilayah</span>
                          ) : (
                            <MultiSelectDropdown
                              value={user.allowedAreas || []}
                              options={data.areas.map(a => ({ label: a, value: a }))}
                              onChange={(newAreas) => {
                                withLoading(() => {
                                  const updatedUsers = [...data.users];
                                  updatedUsers[idx] = { ...user, allowedAreas: newAreas };
                                  const newData = { ...data, users: updatedUsers };
                                  setData(newData); saveData(newData);
                                  showToast(`Wilayah akses ${user.username} diperbarui`);
                                });
                              }}
                              placeholder="Pilih Wilayah"
                              className="w-48 text-xs"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right flex justify-end gap-2">
                          {user.username !== currentUser?.username && (
                            <>
                              <select 
                                value={user.role}
                                onChange={(e) => {
                                  const newRole = e.target.value as 'admin' | 'user' | 'viewer' | 'accountant';
                                  withLoading(() => {
                                    const updatedUsers = [...data.users];
                                    updatedUsers[idx] = { ...user, role: newRole };
                                    const newData = { ...data, users: updatedUsers };
                                    setData(newData); saveData(newData);
                                    showToast(`Role ${user.username} berhasil diubah`);
                                  });
                                }}
                                className="text-xs font-bold px-2 py-1 border border-slate-200 dark:border-slate-700 rounded outline-none bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/50 transition-all"
                              >
                                <option value="user">User</option>
                                <option value="viewer">Viewer</option>
                                <option value="accountant">Accountant</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button 
                                onClick={() => handleResetPin(user.username)}
                                className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 text-xs font-bold px-2 py-1 border border-amber-200 dark:border-amber-900/50 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                              >
                                Reset PIN
                              </button>
                              <button 
                                onClick={() => openConfirmModal(`Hapus user ${user.username}?`, () => {
                                  withLoading(() => {
                                    const updatedUsers = data.users.filter((_, i) => i !== idx);
                                    const newData = { ...data, users: updatedUsers };
                                    setData(newData); saveData(newData);
                                    showToast('User berhasil dihapus');
                                  });
                                })}
                                className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 text-xs font-bold px-2 py-1 border border-rose-200 dark:border-rose-900/50 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                              >
                                Hapus
                              </button>
                            </>
                          )}
                          {user.username === currentUser?.username && <span className="text-slate-400 dark:text-slate-500 text-xs italic">Akun Anda</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Closing Detail Modal */}
      {isClosingDetailModalOpen && selectedBookClosing && selectedBookClosing.allocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">Detail Alokasi Laba</h3>
              <button onClick={() => setIsClosingDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2 border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Periode</span>
                  <span className="font-semibold text-slate-800 dark:text-white">{monthNames[selectedBookClosing.periodMonth]} {selectedBookClosing.periodYear}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Laba Bersih</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Rp {selectedBookClosing.netIncome.toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">Rincian Alokasi</h4>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <span className="font-medium text-slate-700 dark:text-slate-300">Zakat (2.5%)</span>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-white">Rp {selectedBookClosing.allocation.zakat.toLocaleString('id-ID')}</span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      </div>
                      <span className="font-medium text-slate-700 dark:text-slate-300">Kas</span>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-white">Rp {selectedBookClosing.allocation.cash.toLocaleString('id-ID')}</span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <span className="font-medium text-slate-700 dark:text-slate-300">Saving</span>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-white">Rp {selectedBookClosing.allocation.saving.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">Pembagian Dividen</h4>
                {selectedBookClosing.allocation.dividends && selectedBookClosing.allocation.dividends.length > 0 ? (
                  <div className="space-y-3">
                    {selectedBookClosing.allocation.dividends.map((div, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-xs">
                            {div.recipientName.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{div.recipientName}</span>
                        </div>
                        <span className="font-bold text-slate-800 dark:text-white">Rp {div.amount.toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <span className="font-bold text-slate-600 dark:text-slate-400">Total Dividen</span>
                      <span className="font-bold text-purple-600 dark:text-purple-400">
                        Rp {selectedBookClosing.allocation.dividends.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 italic text-center py-4">Tidak ada pembagian dividen</p>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
              <button 
                onClick={() => setIsClosingDetailModalOpen(false)}
                className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
        {/* Export Note Modal */}
        {isExportNoteModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 space-y-4 relative animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800 transition-colors duration-300">
                <button onClick={() => setIsExportNoteModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Catatan Tunggakan</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Terdapat tunggakan pada periode ini. Tambahkan catatan untuk disertakan dalam laporan PDF (opsional).</p>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  setIsExportNoteModalOpen(false);
                  generateReportPDF(exportNote);
                }} className="space-y-4">
                  <div>
                    <textarea 
                      value={exportNote} 
                      onChange={(e) => setExportNote(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none min-h-[100px] resize-y focus:ring-2 focus:ring-emerald-500/50 transition-all" 
                      placeholder="Contoh: Penyewa A berjanji akan melunasi minggu depan..."
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsExportNoteModalOpen(false);
                        generateReportPDF('');
                      }}
                      className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Lewati
                    </button>
                    <button type="submit" className="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20">Lanjutkan Export</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`px-4 py-3 rounded-xl shadow-lg text-white font-medium flex items-center gap-2 animate-in slide-in-from-right-full duration-300 ${
              toast.type === 'success' ? 'bg-emerald-600' : 
              toast.type === 'error' ? 'bg-rose-600' : 'bg-indigo-600'
            }`}
          >
            {toast.type === 'success' && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
            {toast.type === 'error' && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            {toast.message}
          </div>
        ))}
      </div>

      {/* Global Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[200] flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4 border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-bold text-slate-800 dark:text-white">Memproses...</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
