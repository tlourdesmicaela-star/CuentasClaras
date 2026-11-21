import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  Download,
  Globe,
  Keyboard,
  Mic,
  QrCode,
  UserCircle2,
  X,
} from 'lucide-react';
import { AccountAndPushPanel } from './components/AccountAndPushPanel';
import { ExpenseList } from './components/ExpenseList';
import { HistoryPanel } from './components/HistoryPanel';
import { ManualExpenseForm } from './components/ManualExpenseForm';
import { OffersFinder } from './components/OffersFinder';
import { ParticipantsBar } from './components/ParticipantsBar';
import { ReceiptScanner } from './components/ReceiptScanner';
import { SettlementPanel } from './components/SettlementPanel';
import { TopNav, type ActiveTab } from './components/TopNav';
import { VoiceTextInput, type ParsedExpenseBatchItem } from './components/VoiceTextInput';
import { useFirebase, type CloudNotificationItem } from './contexts/FirebaseContext';
import { useLanguage } from './contexts/LanguageContext';
import { LANGUAGE_OPTIONS, type AppLanguage } from './i18n/translations';
import { usePushNotifications } from './hooks/usePushNotifications';
import { usePWAInstall } from './hooks/usePWAInstall';
import type {
  ExpenseCategory,
  ExpenseItem,
  Gathering,
  Participant,
  PayerContribution,
  PaymentDetails,
  ReceiptScanItem,
} from './types/expense';
import { formatCurrency } from './utils/currency';
import { calculateMinimumSettlement } from './utils/settlement';

const STORAGE_ACTIVE_KEY = 'cuentasclaras_active_v1';
const STORAGE_HISTORY_KEY = 'cuentasclaras_history_v1';
const STORAGE_PAYMENT_KEY = 'cuentasclaras_payment_v1';
const STORAGE_THEME_KEY = 'cuentasclaras_theme_v1';
const STORAGE_NOTIFICATIONS_KEY = 'cuentasclaras_notifications_v1';

type InputMode = 'ia' | 'ocr' | 'manual';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createDefaultGathering(): Gathering {
  const santi: Participant = { id: 'p-santi', name: 'Santi' };
  const marcos: Participant = { id: 'p-marcos', name: 'Marcos' };
  const sofia: Participant = { id: 'p-sofia', name: 'Sofía' };
  const lucia: Participant = { id: 'p-lucia', name: 'Lucía' };
  const lucas: Participant = { id: 'p-lucas', name: 'Lucas' };
  const allIds = [santi.id, marcos.id, sofia.id, lucia.id, lucas.id];

  return {
    id: createId('g'),
    title: 'Asado del viernes',
    date: todayIsoDate(),
    participants: [santi, marcos, sofia, lucia, lucas],
    expenses: [
      {
        id: 'exp-demo-1',
        description: 'Asado de tira, vacío y chorizos',
        amount: 77800,
        category: 'comida',
        payers: [{ participantId: santi.id, amount: 77800 }],
        splitAmongIds: allIds,
        source: 'manual',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'exp-demo-2',
        description: 'Fernet Branca y Coca-Cola (sin alcohol Sofía y Lucía)',
        amount: 19300,
        category: 'bebida',
        payers: [{ participantId: marcos.id, amount: 19300 }],
        splitAmongIds: [santi.id, marcos.id, lucas.id],
        source: 'manual',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'exp-demo-3',
        description: 'Carbón y hielo',
        amount: 4200,
        category: 'comida',
        payers: [{ participantId: lucas.id, amount: 4200 }],
        splitAmongIds: allIds,
        source: 'manual',
        createdAt: new Date().toISOString(),
      },
    ],
    settledTransferIds: [],
    updatedAt: new Date().toISOString(),
  };
}

function createSeedHistory(): Gathering[] {
  const m = { id: 'hp-1', name: 'Marcos' };
  const j = { id: 'hp-2', name: 'Juli' };
  const s = { id: 'hp-3', name: 'Sofía' };
  const l = { id: 'hp-4', name: 'Lucas' };

  return [
    {
      id: 'hist-el-tablao',
      title: 'Cena en El Tablao',
      date: '2026-11-14',
      participants: [m, j, s, l],
      expenses: [
        {
          id: 'he-1',
          description: 'Pizzas y empanadas x12',
          amount: 49000,
          category: 'comida',
          payers: [{ participantId: m.id, amount: 49000 }],
          splitAmongIds: [m.id, j.id, s.id, l.id],
          source: 'ocr',
          createdAt: '2026-11-14T22:00:00.000Z',
        },
        {
          id: 'he-2',
          description: 'Cerveza IPA x3 y aguas',
          amount: 21500,
          category: 'bebida',
          payers: [{ participantId: s.id, amount: 21500 }],
          splitAmongIds: [m.id, s.id],
          source: 'ocr',
          createdAt: '2026-11-14T22:15:00.000Z',
        },
      ],
      settledTransferIds: [],
      updatedAt: '2026-11-14T23:00:00.000Z',
    },
  ];
}

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<ActiveTab>('gastos');
  const [inputMode, setInputMode] = useState<InputMode>('ia');

  const {
    user,
    authReady,
    cloudUsername,
    cloudGatherings,
    cloudPaymentDetails,
    cloudNotifyPrefs,
    cloudNotifications,
    saveGatheringToCloud,
    deleteGatheringFromCloud,
    savePrivateProfileToCloud,
    logNotificationToCloud,
    markNotificationReadInCloud,
    deleteNotificationFromCloud,
  } = useFirebase();

  const {
    permission,
    swReady,
    prefs,
    setPrefs,
    requestPermissionAndEnable,
    triggerSystemPush,
  } = usePushNotifications();

  const { isInstallable, install } = usePWAInstall();

  const [gathering, setGathering] = useState<Gathering>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ACTIVE_KEY);
      if (saved) return JSON.parse(saved) as Gathering;
    } catch {
      // Ignore storage error
    }
    return createDefaultGathering();
  });

  const [history, setHistory] = useState<Gathering[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_HISTORY_KEY);
      if (saved) return JSON.parse(saved) as Gathering[];
    } catch {
      // Ignore storage error
    }
    return createSeedHistory();
  });

  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PAYMENT_KEY);
      if (saved) return JSON.parse(saved) as PaymentDetails;
    } catch {
      // Ignore storage error
    }
    return { aliasOrCbu: 'santi.cuentas.mp', accountHolder: 'Santiago' };
  });

  const [localNotifications, setLocalNotifications] = useState<CloudNotificationItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_NOTIFICATIONS_KEY);
      if (saved) return JSON.parse(saved) as CloudNotificationItem[];
    } catch {
      // Ignore storage error
    }
    return [];
  });

  const [historySavedToast, setHistorySavedToast] = useState(false);
  const [pushSentToast, setPushSentToast] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [prefillExpenseDraft, setPrefillExpenseDraft] = useState<{
    id: number;
    description: string;
    category: ExpenseCategory;
    amount?: number;
  } | null>(null);

  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Ignore storage error
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, theme);
    } catch {
      // Ignore quota error
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(gathering));
    } catch {
      // Ignore quota error
    }
  }, [gathering]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Ignore quota error
    }
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PAYMENT_KEY, JSON.stringify(paymentDetails));
    } catch {
      // Ignore quota error
    }
  }, [paymentDetails]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, JSON.stringify(localNotifications));
    } catch {
      // Ignore quota error
    }
  }, [localNotifications]);

  // Merge cloud gatherings into local history when signed in
  useEffect(() => {
    if (!user || cloudGatherings.length === 0) return;
    setHistory((prev) => {
      const cloudMap = new Map(cloudGatherings.map((g) => [g.id, g]));
      const localOnly = prev.filter((item) => !cloudMap.has(item.id));
      return [...cloudGatherings, ...localOnly];
    });
  }, [user, cloudGatherings]);

  // Hydrate private profile (Alias/CBU & Push prefs) once per sign-in
  const hydratedUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      hydratedUidRef.current = null;
      return;
    }
    if (hydratedUidRef.current === user.uid) return;
    if (!cloudPaymentDetails && !cloudNotifyPrefs) return;

    hydratedUidRef.current = user.uid;
    if (cloudPaymentDetails && (cloudPaymentDetails.aliasOrCbu || cloudPaymentDetails.accountHolder)) {
      setPaymentDetails((prev) => ({
        aliasOrCbu: cloudPaymentDetails.aliasOrCbu || prev.aliasOrCbu,
        accountHolder: cloudPaymentDetails.accountHolder || prev.accountHolder,
      }));
    }
    if (cloudNotifyPrefs) {
      setPrefs((prev) => ({
        notifyEnabled: prev.notifyEnabled || cloudNotifyPrefs.notifyEnabled,
        notifyNewExpense: cloudNotifyPrefs.notifyNewExpense,
        notifySettlementReminder: cloudNotifyPrefs.notifySettlementReminder,
      }));
    }
  }, [user, cloudPaymentDetails, cloudNotifyPrefs, setPrefs]);

  // Persist Alias/CBU and notification preferences to Firestore (debounced)
  useEffect(() => {
    if (!user || hydratedUidRef.current !== user.uid) return;
    const timer = setTimeout(() => {
      void savePrivateProfileToCloud(paymentDetails, prefs);
    }, 650);
    return () => clearTimeout(timer);
  }, [user, paymentDetails, prefs, savePrivateProfileToCloud]);

  const settlement = useMemo(
    () => calculateMinimumSettlement(gathering.participants, gathering.expenses),
    [gathering.participants, gathering.expenses]
  );

  const pendingTransfers = useMemo(
    () => settlement.transfers.filter((t) => !gathering.settledTransferIds.includes(t.id)),
    [settlement.transfers, gathering.settledTransferIds]
  );

  const displayedNotifications = useMemo(() => {
    if (!user) return localNotifications;
    const byId = new Map<string, CloudNotificationItem>();
    for (const item of cloudNotifications) {
      byId.set(item.id, item);
    }
    for (const item of localNotifications) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
    return Array.from(byId.values())
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
      .slice(0, 40);
  }, [user, cloudNotifications, localNotifications]);

  const unreadNotifications = useMemo(
    () => displayedNotifications.filter((n) => !n.read).length,
    [displayedNotifications]
  );

  const dispatchNotification = useCallback(
    async (opts: {
      title: string;
      body: string;
      type: 'expense' | 'settlement' | 'system';
    }) => {
      const id = createId('notif');
      const item: CloudNotificationItem = {
        id,
        title: opts.title,
        body: opts.body,
        type: opts.type,
        read: false,
        createdAtIso: new Date().toISOString(),
      };
      setLocalNotifications((prev) => [item, ...prev].slice(0, 40));

      if (user) {
        void logNotificationToCloud({
          id,
          title: opts.title,
          body: opts.body,
          type: opts.type,
        });
      }

      if (prefs.notifyEnabled && permission === 'granted') {
        await triggerSystemPush({
          title: opts.title,
          body: opts.body,
          tag: `cuentasclaras-${opts.type}`,
        });
      }
    },
    [user, logNotificationToCloud, prefs.notifyEnabled, permission, triggerSystemPush]
  );

  const handleMarkNotificationRead = useCallback(
    (id: string) => {
      setLocalNotifications((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read: true } : item))
      );
      if (user && cloudNotifications.some((n) => n.id === id)) {
        void markNotificationReadInCloud(id);
      }
    },
    [user, cloudNotifications, markNotificationReadInCloud]
  );

  const handleDeleteNotification = useCallback(
    (id: string) => {
      setLocalNotifications((prev) => prev.filter((item) => item.id !== id));
      if (user && cloudNotifications.some((n) => n.id === id)) {
        void deleteNotificationFromCloud(id);
      }
    },
    [user, cloudNotifications, deleteNotificationFromCloud]
  );

  // Switch input mode automatically when navigating via TopNav/BottomNav
  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'escaner') {
      setInputMode('ocr');
    } else if (tab === 'gastos' && inputMode === 'ocr') {
      setInputMode('ia');
    }
  };

  const handleNewGathering = () => {
    const defaultPeople: Participant[] = [
      { id: createId('p'), name: 'Santi' },
      { id: createId('p'), name: 'Marcos' },
      { id: createId('p'), name: 'Sofía' },
    ];
    setGathering({
      id: createId('g'),
      title: t.defaults.newGatheringTitle,
      date: todayIsoDate(),
      participants: defaultPeople,
      expenses: [],
      settledTransferIds: [],
      updatedAt: new Date().toISOString(),
    });
    setActiveTab('gastos');
    setInputMode('ia');
  };

  const handleAddParticipant = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = gathering.participants.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) return;

    const newPerson: Participant = { id: createId('p'), name: trimmed };
    setGathering((prev) => ({
      ...prev,
      participants: [...prev.participants, newPerson],
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleRemoveParticipant = (id: string) => {
    setGathering((prev) => ({
      ...prev,
      participants: prev.participants.filter((p) => p.id !== id),
      expenses: prev.expenses.map((exp) => ({
        ...exp,
        splitAmongIds: exp.splitAmongIds.filter((sid) => sid !== id),
      })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleAddManualExpense = (draft: {
    description: string;
    amount: number;
    category: ExpenseCategory;
    payers: PayerContribution[];
    splitAmongIds: string[];
  }) => {
    const newItem: ExpenseItem = {
      id: createId('exp'),
      description: draft.description,
      amount: draft.amount,
      category: draft.category,
      payers: draft.payers,
      splitAmongIds: draft.splitAmongIds,
      source: 'manual',
      createdAt: new Date().toISOString(),
    };

    setGathering((prev) => ({
      ...prev,
      expenses: [newItem, ...prev.expenses],
      updatedAt: new Date().toISOString(),
    }));

    if (prefs.notifyEnabled && prefs.notifyNewExpense) {
      void dispatchNotification({
        title: `${t.defaults.pushNewExpenseTitle} ${gathering.title || t.defaults.pushDefaultGathering}`,
        body: `${draft.description} · ${formatCurrency(draft.amount)}`,
        type: 'expense',
      });
    }
  };

  const handleApplyParsedBatch = (
    newParticipants: string[],
    parsedExpenses: ParsedExpenseBatchItem[]
  ) => {
    setGathering((prev) => {
      const updatedParticipants = [...prev.participants];
      const ensureParticipantId = (rawName: string): string => {
        const clean = rawName.trim();
        const existing = updatedParticipants.find(
          (p) => p.name.toLowerCase() === clean.toLowerCase()
        );
        if (existing) return existing.id;
        const created: Participant = { id: createId('p'), name: clean };
        updatedParticipants.push(created);
        return created.id;
      };

      for (const np of newParticipants) {
        if (np.trim()) ensureParticipantId(np);
      }

      for (const pe of parsedExpenses) {
        for (const payer of pe.payers) {
          if (payer.name.trim()) ensureParticipantId(payer.name);
        }
        for (const exc of pe.excludedParticipants) {
          if (exc.trim()) ensureParticipantId(exc);
        }
      }

      const allParticipantIds = updatedParticipants.map((p) => p.id);

      const newItems: ExpenseItem[] = parsedExpenses.map((pe) => {
        const payers: PayerContribution[] = pe.payers
          .map((p) => ({
            participantId: ensureParticipantId(p.name),
            amount: Math.round(p.amount),
          }))
          .filter((p) => p.amount > 0);

        const excludedIds = new Set(
          pe.excludedParticipants.map((name) => ensureParticipantId(name))
        );
        const splitAmongIds = allParticipantIds.filter((id) => !excludedIds.has(id));

        return {
          id: createId('exp'),
          description: pe.description,
          amount: Math.round(pe.amount),
          category: pe.category,
          payers:
            payers.length > 0
              ? payers
              : [{ participantId: updatedParticipants[0]?.id || '', amount: Math.round(pe.amount) }],
          splitAmongIds: splitAmongIds.length > 0 ? splitAmongIds : allParticipantIds,
          source: pe.source,
          createdAt: new Date().toISOString(),
        };
      });

      return {
        ...prev,
        participants: updatedParticipants,
        expenses: [...newItems, ...prev.expenses],
        updatedAt: new Date().toISOString(),
      };
    });

    if (prefs.notifyEnabled && prefs.notifyNewExpense && parsedExpenses.length > 0) {
      const totalAdded = parsedExpenses.reduce((acc, item) => acc + Math.round(item.amount), 0);
      void dispatchNotification({
        title:
          parsedExpenses.length === 1
            ? t.defaults.pushAddedSingle
            : `${parsedExpenses.length} ${t.defaults.pushAddedMulti}`,
        body: `${parsedExpenses[0].description} · ${t.defaults.pushTotalAdded} ${formatCurrency(totalAdded)}`,
        type: 'expense',
      });
    }
  };

  const handleImportReceiptItems = (
    items: ReceiptScanItem[],
    payerId: string,
    merchantName: string
  ) => {
    setGathering((prev) => {
      const allIds = prev.participants.map((p) => p.id);
      const imported: ExpenseItem[] = items.map((item) => ({
        id: createId('ocr'),
        description: `${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.name} (${merchantName})`,
        amount: item.totalPrice,
        category: item.category,
        payers: [{ participantId: payerId, amount: item.totalPrice }],
        splitAmongIds: item.splitAmongIds.length > 0 ? item.splitAmongIds : allIds,
        source: 'ocr',
        createdAt: new Date().toISOString(),
      }));

      return {
        ...prev,
        expenses: [...imported, ...prev.expenses],
        updatedAt: new Date().toISOString(),
      };
    });

    if (prefs.notifyEnabled && prefs.notifyNewExpense && items.length > 0) {
      const totalImported = items.reduce((acc, item) => acc + item.totalPrice, 0);
      void dispatchNotification({
        title: `${t.defaults.pushReceiptLoaded} · ${merchantName}`,
        body: `${items.length} ${t.defaults.pushItemsImported} ${formatCurrency(totalImported)}`,
        type: 'expense',
      });
    }

    setActiveTab('gastos');
  };

  const handleToggleParticipantSplit = (expenseId: string, participantId: string) => {
    setGathering((prev) => ({
      ...prev,
      expenses: prev.expenses.map((exp) => {
        if (exp.id !== expenseId) return exp;
        const exists = exp.splitAmongIds.includes(participantId);
        const nextIds = exists
          ? exp.splitAmongIds.filter((id) => id !== participantId)
          : [...exp.splitAmongIds, participantId];
        if (nextIds.length === 0) return exp;
        return { ...exp, splitAmongIds: nextIds };
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleDeleteExpense = (expenseId: string) => {
    setGathering((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== expenseId),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleToggleTransferSettled = (transferId: string) => {
    setGathering((prev) => {
      const exists = prev.settledTransferIds.includes(transferId);
      return {
        ...prev,
        settledTransferIds: exists
          ? prev.settledTransferIds.filter((id) => id !== transferId)
          : [...prev.settledTransferIds, transferId],
      };
    });
  };

  const handleSaveToHistory = () => {
    const snapshot: Gathering = {
      ...gathering,
      updatedAt: new Date().toISOString(),
    };
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== snapshot.id);
      return [snapshot, ...filtered];
    });
    if (user) {
      void saveGatheringToCloud(snapshot);
    }
    setHistorySavedToast(true);
    setTimeout(() => setHistorySavedToast(false), 2200);
  };

  const handleLoadGathering = (item: Gathering) => {
    setGathering(item);
    setActiveTab('gastos');
  };

  const handleDuplicateGroup = (item: Gathering) => {
    setGathering({
      id: createId('g'),
      title: `${item.title} ${t.defaults.copySuffix}`,
      date: todayIsoDate(),
      participants: item.participants.map((p) => ({ id: createId('p'), name: p.name })),
      expenses: [],
      settledTransferIds: [],
      updatedAt: new Date().toISOString(),
    });
    setActiveTab('gastos');
  };

  const handleDeleteHistory = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (user) {
      void deleteGatheringFromCloud(id);
    }
  };

  const handleSendSettlementPush = async () => {
    if (permission === 'default') {
      await requestPermissionAndEnable();
    }
    if (pendingTransfers.length === 0) {
      await dispatchNotification({
        title: `${gathering.title || t.defaults.pushDefaultGathering} ${t.defaults.pushUpToDateSuffix}`,
        body: t.defaults.pushNoPendingBody,
        type: 'settlement',
      });
    } else {
      const summaryLines = pendingTransfers
        .slice(0, 3)
        .map((tr) => `${tr.fromName} → ${tr.toName}: ${formatCurrency(tr.amount)}`)
        .join(' · ');
      const extra =
        pendingTransfers.length > 3
          ? ` (+${pendingTransfers.length - 3} ${t.defaults.pushMoreSuffix})`
          : '';
      await dispatchNotification({
        title: `${t.defaults.pushReminderPrefix} · ${gathering.title || t.defaults.pushDefaultGathering}`,
        body: `${summaryLines}${extra}`,
        type: 'settlement',
      });
    }
    setPushSentToast(true);
    setTimeout(() => setPushSentToast(false), 2200);
  };

  const isPushReady = permission === 'granted' && prefs.notifyEnabled;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090B12] dark:bg-[radial-gradient(ellipse_80%_45%_at_50%_-10%,rgba(139,92,246,0.16),transparent_65%),radial-gradient(ellipse_45%_35%_at_92%_18%,rgba(167,139,250,0.08),transparent_70%)] text-slate-900 dark:text-slate-100 pb-20 md:pb-12 transition-colors">
      <TopNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onNewGathering={handleNewGathering}
        historyCount={history.length}
        unreadNotifications={unreadNotifications}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        {gmpQuotaExceeded && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-100"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
              <p className="leading-snug">
                {t.strip.quotaNoticePrefix}{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline hover:text-amber-700 dark:hover:text-amber-300"
                >
                  {t.strip.quotaNoticeLink}
                </a>
                .
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGmpQuotaExceeded(false)}
              aria-label={t.strip.closeNotice}
              className="p-1 rounded-lg hover:bg-amber-200/50 dark:hover:bg-amber-900/50 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Compact Workspace Account, Push & Language Strip */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/90 dark:border-violet-500/20 bg-white/90 dark:bg-slate-900/75 px-3.5 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {!authReady ? (
              <div className="h-7 w-40 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ) : user ? (
              <button
                type="button"
                onClick={() => handleSelectTab('cuenta')}
                className="inline-flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-full bg-emerald-600 dark:bg-violet-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {(cloudUsername || user.displayName || 'U').charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-emerald-700 dark:group-hover:text-violet-300 transition-colors">
                  <strong className="font-semibold text-slate-900 dark:text-slate-50">
                    @{cloudUsername || user.displayName || t.strip.connectedAccount}
                  </strong>{' '}
                  · {t.strip.cloudSyncActive}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSelectTab('cuenta')}
                className="inline-flex items-center gap-2 min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-violet-500/35 bg-slate-50 dark:bg-violet-500/10 text-xs font-semibold text-slate-800 dark:text-violet-200 hover:border-emerald-600 dark:hover:border-violet-400 transition-colors cursor-pointer"
              >
                <UserCircle2 className="w-4 h-4 text-emerald-600 dark:text-violet-300 shrink-0" aria-hidden="true" />
                <span>{t.strip.signInOrRegister}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Language Selector */}
            <label className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-violet-500/30 bg-slate-50 dark:bg-slate-950/70 text-xs font-semibold text-slate-700 dark:text-violet-200 hover:border-emerald-500 dark:hover:border-violet-400 transition-colors cursor-pointer">
              <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-violet-300 shrink-0" aria-hidden="true" />
              <span className="sr-only">{t.strip.languageLabel}</span>
              <select
                aria-label={t.strip.languageLabel}
                value={language}
                onChange={(e) => setLanguage(e.target.value as AppLanguage)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-violet-200 focus:outline-none cursor-pointer pr-1 dark:[color-scheme:dark]"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {opt.nativeName}
                  </option>
                ))}
              </select>
            </label>

            {permission !== 'granted' ? (
              <button
                type="button"
                onClick={() => void requestPermissionAndEnable()}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 dark:bg-violet-600 text-white text-xs font-semibold hover:bg-emerald-700 dark:hover:bg-violet-500 transition-colors cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.strip.enablePush}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSelectTab('cuenta')}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-violet-500/35 bg-emerald-50/70 dark:bg-violet-500/10 text-xs font-semibold text-emerald-800 dark:text-violet-200 hover:border-emerald-400 dark:hover:border-violet-400 transition-colors cursor-pointer"
              >
                <BellRing className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {isPushReady ? t.strip.pushActive : t.strip.pushPaused}
                  {unreadNotifications > 0 ? ` · ${unreadNotifications}` : ''}
                </span>
              </button>
            )}

            {isInstallable && (
              <button
                type="button"
                onClick={() => void install()}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-violet-400/50 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.strip.installApp}</span>
              </button>
            )}
          </div>
        </div>

        {activeTab === 'ofertas' ? (
          <OffersFinder
            theme={theme}
            participants={gathering.participants}
            onQuickAddExpense={(description, category, amount) => {
              setPrefillExpenseDraft({ id: Date.now(), description, category, amount });
              setInputMode('manual');
              setActiveTab('gastos');
            }}
          />
        ) : activeTab === 'historial' ? (
          <div className="max-w-4xl mx-auto">
            <HistoryPanel
              history={history}
              activeGatheringId={gathering.id}
              onLoadGathering={handleLoadGathering}
              onDuplicateGroup={handleDuplicateGroup}
              onDeleteGathering={handleDeleteHistory}
            />
          </div>
        ) : activeTab === 'cuenta' ? (
          <div className="max-w-4xl mx-auto">
            <AccountAndPushPanel
              permission={permission}
              swReady={swReady}
              prefs={prefs}
              onUpdatePrefs={setPrefs}
              onRequestPermission={requestPermissionAndEnable}
              onSendPush={dispatchNotification}
              localNotifications={displayedNotifications}
              onMarkRead={handleMarkNotificationRead}
              onDeleteNotification={handleDeleteNotification}
              pendingTransfers={pendingTransfers}
              gatheringTitle={gathering.title}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Workspace Column: Participants + Input Modes + Expenses List */}
            <div
              className={`lg:col-span-7 space-y-5 ${
                activeTab === 'liquidacion' ? 'hidden lg:block' : 'block'
              }`}
            >
              <ParticipantsBar
                title={gathering.title}
                date={gathering.date}
                participants={gathering.participants}
                onTitleChange={(title) => setGathering((prev) => ({ ...prev, title }))}
                onDateChange={(date) => setGathering((prev) => ({ ...prev, date }))}
                onAddParticipant={handleAddParticipant}
                onRemoveParticipant={handleRemoveParticipant}
                totalSpentFormatted={formatCurrency(settlement.totalSpent)}
                theme={theme}
                onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              />

              {/* Expense Input Workspace */}
              <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 dark:shadow-[0_0_28px_-12px_rgba(139,92,246,0.22)] rounded-2xl p-4 sm:p-5">
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950/80 border border-transparent dark:border-slate-800 mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('ia');
                      if (activeTab === 'escaner') setActiveTab('gastos');
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[42px] px-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      inputMode === 'ia'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-violet-200 shadow-xs dark:shadow-[0_0_14px_-4px_rgba(139,92,246,0.45)] font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Mic className="w-4 h-4 text-emerald-600 dark:text-violet-400 shrink-0" aria-hidden="true" />
                    <span>{t.modes.voiceAi}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInputMode('ocr')}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[42px] px-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      inputMode === 'ocr'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-violet-200 shadow-xs dark:shadow-[0_0_14px_-4px_rgba(139,92,246,0.45)] font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <QrCode className="w-4 h-4 text-emerald-600 dark:text-violet-400 shrink-0" aria-hidden="true" />
                    <span>{t.modes.qrScanner}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('manual');
                      if (activeTab === 'escaner') setActiveTab('gastos');
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[42px] px-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      inputMode === 'manual'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-violet-200 shadow-xs dark:shadow-[0_0_14px_-4px_rgba(139,92,246,0.45)] font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Keyboard className="w-4 h-4 text-emerald-600 dark:text-violet-400 shrink-0" aria-hidden="true" />
                    <span>{t.modes.manual}</span>
                  </button>
                </div>

                {inputMode === 'ia' && (
                  <VoiceTextInput
                    participantNames={gathering.participants.map((p) => p.name)}
                    onApplyParsedBatch={handleApplyParsedBatch}
                  />
                )}

                {inputMode === 'ocr' && (
                  <ReceiptScanner
                    participants={gathering.participants}
                    onImportItems={handleImportReceiptItems}
                  />
                )}

                {inputMode === 'manual' && (
                  <ManualExpenseForm
                    participants={gathering.participants}
                    prefillDraft={prefillExpenseDraft}
                    onAddExpense={handleAddManualExpense}
                  />
                )}
              </section>

              <ExpenseList
                expenses={gathering.expenses}
                participants={gathering.participants}
                onToggleParticipantSplit={handleToggleParticipantSplit}
                onDeleteExpense={handleDeleteExpense}
              />
            </div>

            {/* Right Summary Column: Minimum Settlement + Balances + WhatsApp */}
            <div
              className={`lg:col-span-5 lg:sticky lg:top-20 ${
                activeTab === 'liquidacion' ? 'block' : 'hidden lg:block'
              }`}
            >
              <SettlementPanel
                title={gathering.title}
                date={gathering.date}
                participants={gathering.participants}
                expenses={gathering.expenses}
                summary={settlement}
                settledTransferIds={gathering.settledTransferIds}
                onToggleTransferSettled={handleToggleTransferSettled}
                paymentDetails={paymentDetails}
                onUpdatePaymentDetails={setPaymentDetails}
                onSaveToHistory={handleSaveToHistory}
                historySavedToast={historySavedToast}
                onSendSettlementPush={() => void handleSendSettlementPush()}
                pushSentToast={pushSentToast}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
