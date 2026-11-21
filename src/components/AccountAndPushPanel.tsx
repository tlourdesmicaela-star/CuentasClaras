import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Bell,
  BellOff,
  BellRing,
  Check,
  Cloud,
  Download,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LogIn,
  Mail,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  User,
  UserPlus,
} from 'lucide-react';
import { useFirebase, type CloudNotificationItem } from '../contexts/FirebaseContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGE_OPTIONS } from '../i18n/translations';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { NotificationPermissionState, NotificationPrefs } from '../hooks/usePushNotifications';
import { formatCurrency } from '../utils/currency';
import type { Transfer } from '../types/expense';

interface AccountAndPushPanelProps {
  permission: NotificationPermissionState;
  swReady: boolean;
  prefs: NotificationPrefs;
  onUpdatePrefs: (next: NotificationPrefs) => void;
  onRequestPermission: () => Promise<NotificationPermissionState>;
  onSendPush: (opts: {
    title: string;
    body: string;
    type: 'expense' | 'settlement' | 'system';
  }) => Promise<void>;
  localNotifications: CloudNotificationItem[];
  onMarkRead: (id: string) => void;
  onDeleteNotification: (id: string) => void;
  pendingTransfers: Transfer[];
  gatheringTitle: string;
}

type AuthMode = 'register' | 'login';

export function AccountAndPushPanel({
  permission,
  swReady,
  prefs,
  onUpdatePrefs,
  onRequestPermission,
  onSendPush,
  localNotifications,
  onMarkRead,
  onDeleteNotification,
  pendingTransfers,
  gatheringTitle,
}: AccountAndPushPanelProps) {
  const {
    user,
    authReady,
    isSigningIn,
    authError,
    cloudUsername,
    cloudUserEmail,
    cloudGatherings,
    registerAccount,
    loginWithUsername,
    clearAuthError,
  } = useFirebase();

  const { language, setLanguage, t } = useLanguage();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<AuthMode>('register');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSwitchMode = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    clearAuthError();
  };

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (authMode === 'register') {
      const ok = await registerAccount({ email, username, password });
      if (ok) {
        setPassword('');
      }
    } else {
      const ok = await loginWithUsername({ username, password });
      if (ok) {
        setPassword('');
      }
    }
  };

  const handleEnablePush = async () => {
    setPushFeedback(null);
    const result = await onRequestPermission();
    if (result === 'granted') {
      setPushFeedback(t.account.enabledFeedback);
    } else if (result === 'denied') {
      setPushFeedback(t.account.deniedFeedback);
    } else if (result === 'unsupported') {
      setPushFeedback(t.account.unsupportedFeedback);
    }
  };

  const handleTestPush = async () => {
    setPushFeedback(null);
    await onSendPush({
      title: t.account.testTitle,
      body: t.account.testBody,
      type: 'system',
    });
    setPushFeedback(t.account.testSentFeedback);
  };

  const handleSendPendingReminder = async () => {
    setPushFeedback(null);
    if (pendingTransfers.length === 0) {
      await onSendPush({
        title: `${gatheringTitle || t.defaults.pushDefaultGathering} ${t.defaults.pushUpToDateSuffix}`,
        body: t.defaults.pushNoPendingBody,
        type: 'settlement',
      });
      setPushFeedback(t.account.settledFeedback);
      return;
    }

    const summaryLines = pendingTransfers
      .slice(0, 3)
      .map((tr) => `${tr.fromName} → ${tr.toName}: ${formatCurrency(tr.amount)}`)
      .join(' · ');
    const extra =
      pendingTransfers.length > 3
        ? ` (+${pendingTransfers.length - 3} ${t.defaults.pushMoreSuffix})`
        : '';

    await onSendPush({
      title: `${t.defaults.pushReminderPrefix} · ${gatheringTitle || t.defaults.pushDefaultGathering}`,
      body: `${summaryLines}${extra}`,
      type: 'settlement',
    });
    setPushFeedback(t.account.reminderSentFeedback);
  };

  const isNotificationsActive = permission === 'granted' && prefs.notifyEnabled;
  const activeDisplayUsername = cloudUsername || user?.displayName || t.account.connectedAccount;
  const activeEmail =
    cloudUserEmail ||
    (user?.email && !user.email.toLowerCase().endsWith('@auth.cuentasclaras.app')
      ? user.email
      : null);

  return (
    <div className="space-y-5">
      {/* 0. Language Selector Card */}
      <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 dark:shadow-[0_0_28px_-12px_rgba(139,92,246,0.22)] rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-violet-500/15 border border-emerald-200 dark:border-violet-500/30 text-emerald-700 dark:text-violet-300 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-display font-bold text-slate-900 dark:text-slate-50">
              {t.account.languageSectionTitle}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t.account.languageSectionDesc}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = language === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => setLanguage(opt.code)}
                className={`min-h-[44px] px-3 py-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  active
                    ? 'border-emerald-600 dark:border-violet-400 bg-emerald-50 dark:bg-violet-500/15 text-emerald-900 dark:text-violet-100 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{opt.nativeName}</div>
                  <div className="text-[10px] opacity-75 truncate">{opt.label}</div>
                </div>
                {active && (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-violet-300 shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* 1. Account Registration (Email + Username + Password) & Persistent Session */}
      <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 dark:shadow-[0_0_28px_-12px_rgba(139,92,246,0.22)] rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900 dark:text-slate-50">
              {t.account.accountTitle}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t.account.accountSubtitle}
            </p>
          </div>
          {user && (
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-violet-300 shrink-0">
              <Cloud className="w-4 h-4" aria-hidden="true" />
              <span>{cloudGatherings.length} {t.account.inCloud}</span>
            </div>
          )}
        </div>

        <div className="mt-5">
          {!authReady ? (
            <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : user ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-slate-950/70">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-emerald-600 dark:bg-violet-600 text-white font-display font-bold flex items-center justify-center shrink-0">
                    {activeDisplayUsername.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                      @{activeDisplayUsername}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {activeEmail ? `${activeEmail} · ` : ''}
                      {t.account.sessionPersistedBadge}
                    </div>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-violet-500/15 border border-emerald-200 dark:border-violet-500/30 text-xs font-semibold text-emerald-800 dark:text-violet-200 shrink-0">
                  <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t.account.sessionPersistedBadge}</span>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed px-1">
                {t.account.sessionPersistedNote}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mode Switcher: Create Account vs Sign In */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950/80 border border-slate-200/70 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('register')}
                  className={`inline-flex items-center justify-center gap-2 min-h-[42px] px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-violet-200 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t.account.tabRegister}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSwitchMode('login')}
                  className={`inline-flex items-center justify-center gap-2 min-h-[42px] px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-violet-200 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t.account.tabLogin}</span>
                </button>
              </div>

              {authMode === 'login' && (
                <div className="rounded-xl border border-emerald-200/80 dark:border-violet-500/25 bg-emerald-50/70 dark:bg-violet-500/[0.08] px-3.5 py-2.5 text-xs text-emerald-900 dark:text-violet-200 leading-relaxed">
                  {t.account.loginUninstallHint}
                </div>
              )}

              <form onSubmit={(e) => void handleAuthSubmit(e)} className="space-y-3.5">
                {authMode === 'register' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                      {t.account.emailLabel}
                    </label>
                    <div className="relative">
                      <Mail
                        className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (authError) clearAuthError();
                        }}
                        placeholder={t.account.emailPlaceholder}
                        className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/70 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 dark:focus:border-violet-400"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    {t.account.usernameLabel}
                  </label>
                  <div className="relative">
                    <User
                      className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (authError) clearAuthError();
                      }}
                      placeholder={t.account.usernamePlaceholder}
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/70 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 dark:focus:border-violet-400"
                    />
                  </div>
                  {authMode === 'register' && (
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {t.account.usernameHint}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    {t.account.passwordLabel}
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      maxLength={15}
                      autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (authError) clearAuthError();
                      }}
                      placeholder={t.account.passwordPlaceholder}
                      className="w-full min-h-[44px] pl-10 pr-11 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/70 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 dark:focus:border-violet-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? t.account.hidePassword : t.account.showPassword}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {authMode === 'register' && (
                    <div className="mt-1.5 space-y-1">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t.account.passwordHint}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                        <span
                          className={
                            password.length >= 6 && password.length <= 15
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-slate-400 dark:text-slate-500'
                          }
                        >
                          • {t.account.passwordRuleLength} ({password.length}/15)
                        </span>
                        <span
                          className={
                            /[A-Z]/.test(password)
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-slate-400 dark:text-slate-500'
                          }
                        >
                          • {t.account.passwordRuleUpper}
                        </span>
                        <span
                          className={
                            password.length > 0 &&
                            /^[A-Za-z0-9]+$/.test(password) &&
                            /[A-Za-z]/.test(password) &&
                            /[0-9]/.test(password)
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-slate-400 dark:text-slate-500'
                          }
                        >
                          • {t.account.passwordRuleAlnum}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {authError && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200">
                    <AlertCircle
                      className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSigningIn}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 dark:bg-violet-600 text-white text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-violet-500 dark:shadow-[0_0_20px_-6px_rgba(139,92,246,0.55)] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
                >
                  {authMode === 'register' ? (
                    <UserPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    {isSigningIn
                      ? authMode === 'register'
                        ? t.account.registeringBtn
                        : t.account.loggingInBtn
                      : authMode === 'register'
                        ? t.account.registerBtn
                        : t.account.loginBtn}
                  </span>
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* 2. Push Notifications Controls & Notification Feed */}
      <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 dark:shadow-[0_0_28px_-12px_rgba(139,92,246,0.22)] rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-violet-500/15 border border-emerald-200 dark:border-violet-500/30 text-emerald-700 dark:text-violet-300 flex items-center justify-center shrink-0">
              {isNotificationsActive ? (
                <BellRing className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Bell className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-slate-900 dark:text-slate-50">
                {t.account.pushTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.account.statusLabel}{' '}
                <span className="font-semibold text-slate-800 dark:text-violet-300">
                  {permission === 'granted'
                    ? prefs.notifyEnabled
                      ? t.account.statusActive
                      : t.account.statusPaused
                    : permission === 'denied'
                      ? t.account.statusDenied
                      : permission === 'unsupported'
                        ? t.account.statusUnsupported
                        : t.account.statusPending}
                </span>
                {swReady ? ` ${t.account.swReady}` : ''}
              </p>
            </div>
          </div>

          {permission !== 'granted' ? (
            <button
              type="button"
              onClick={handleEnablePush}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 dark:bg-violet-600 text-white text-xs sm:text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-violet-500 dark:shadow-[0_0_20px_-6px_rgba(139,92,246,0.55)] transition-all cursor-pointer shrink-0"
            >
              <Bell className="w-4 h-4" aria-hidden="true" />
              <span>{t.account.enablePushBtn}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onUpdatePrefs({ ...prefs, notifyEnabled: !prefs.notifyEnabled })}
              className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border text-xs sm:text-sm font-semibold transition-colors cursor-pointer shrink-0 ${
                prefs.notifyEnabled
                  ? 'border-emerald-300 dark:border-violet-500/40 bg-emerald-50 dark:bg-violet-500/15 text-emerald-800 dark:text-violet-200'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              {prefs.notifyEnabled ? (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>{t.account.enabledBtn}</span>
                </>
              ) : (
                <>
                  <BellOff className="w-4 h-4" aria-hidden="true" />
                  <span>{t.account.resumeBtn}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Granular Preferences */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.notifyNewExpense}
              onChange={(e) => onUpdatePrefs({ ...prefs, notifyNewExpense: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-emerald-600 dark:text-violet-500 focus:ring-emerald-600 dark:focus:ring-violet-500 dark:bg-slate-900"
            />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.account.prefNewExpenseTitle}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.account.prefNewExpenseDesc}
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.notifySettlementReminder}
              onChange={(e) =>
                onUpdatePrefs({ ...prefs, notifySettlementReminder: e.target.checked })
              }
              className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-emerald-600 dark:text-violet-500 focus:ring-emerald-600 dark:focus:ring-violet-500 dark:bg-slate-900"
            />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.account.prefReminderTitle}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.account.prefReminderDesc}
              </div>
            </div>
          </label>
        </div>

        {/* Trigger Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={handleSendPendingReminder}
            className="flex-1 inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-violet-600 text-white text-xs sm:text-sm font-semibold hover:bg-slate-800 dark:hover:bg-violet-500 transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span>{t.account.notifyPendingBtn} ({pendingTransfers.length})</span>
          </button>

          <button
            type="button"
            onClick={handleTestPush}
            className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <BellRing className="w-4 h-4 dark:text-violet-300" aria-hidden="true" />
            <span>{t.account.testPushBtn}</span>
          </button>
        </div>

        {pushFeedback && (
          <div className="rounded-xl border border-emerald-200 dark:border-violet-500/30 bg-emerald-50 dark:bg-violet-500/10 px-3.5 py-2.5 text-xs text-emerald-900 dark:text-violet-200 font-medium">
            {pushFeedback}
          </div>
        )}

        {/* Recent Alerts Feed */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
            {t.account.recentTitle} ({localNotifications.length})
          </h3>
          {localNotifications.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
              {t.account.noAlerts}
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {localNotifications.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition-colors ${
                    item.read
                      ? 'border-slate-100 dark:border-slate-800/70 bg-slate-50/60 dark:bg-slate-950/40 opacity-75'
                      : 'border-emerald-200 dark:border-violet-500/35 bg-emerald-50/40 dark:bg-violet-500/[0.08]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onMarkRead(item.id)}
                    className="text-left min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 break-words">
                      {item.body}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteNotification(item.id)}
                    aria-label={t.account.deleteNotifAria}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 3. PWA App Install Section (when installable or iOS) */}
      {!isInstalled && (isInstallable || isIOS) && (
        <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-violet-500/15 text-slate-700 dark:text-violet-300 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-display font-bold text-slate-900 dark:text-slate-50">
                {t.account.installTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.account.installDesc}
              </p>
            </div>
          </div>

          {isInstallable ? (
            <button
              type="button"
              onClick={install}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 dark:bg-violet-600 text-white text-xs font-semibold hover:bg-emerald-700 dark:hover:bg-violet-500 transition-colors cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>{t.account.installBtn}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowIOSGuide(true)}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>{t.account.installIosBtn}</span>
            </button>
          )}
        </section>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-violet-500/30 p-6 shadow-xl">
            <h3 className="text-base font-display font-bold text-slate-900 dark:text-slate-50">
              {t.account.iosGuideTitle}
            </h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.account.iosStep1Prefix} <strong>{t.account.iosShare}</strong> {t.account.iosStep1Suffix}
              <br />
              {t.account.iosStep2Prefix} <strong>{t.account.iosAddHome}</strong> {t.account.iosStep2Suffix}
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-violet-600 text-white text-xs font-semibold cursor-pointer"
            >
              {t.account.understood}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
