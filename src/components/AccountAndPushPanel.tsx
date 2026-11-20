import { useState } from 'react';
import {
  AlertCircle,
  Bell,
  BellOff,
  BellRing,
  Check,
  Cloud,
  Download,
  Globe,
  LogOut,
  Send,
  Smartphone,
  Trash2,
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
    cloudGatherings,
    signInWithGoogle,
    signOutUser,
  } = useFirebase();

  const { language, setLanguage, t } = useLanguage();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);

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

      {/* 1. Google Account Registration & Cloud Sync */}
      <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 dark:shadow-[0_0_28px_-12px_rgba(139,92,246,0.22)] rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900 dark:text-slate-50">
              {t.account.googleTitle}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t.account.googleSubtitle}
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-slate-950/70">
              <div className="flex items-center gap-3.5 min-w-0">
                {user.photoURL && !avatarError ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || t.account.connectedAccount}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-violet-400/50 shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-emerald-600 dark:bg-violet-600 text-white font-display font-bold flex items-center justify-center shrink-0">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                    {user.displayName || t.account.connectedAccount}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {user.email} · {t.account.verifiedGoogle}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={signOutUser}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-rose-300 dark:hover:border-rose-500/50 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>{t.account.signOut}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={isSigningIn}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 min-h-[48px] px-5 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-violet-500/45 text-sm font-semibold text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-900 dark:shadow-[0_0_20px_-6px_rgba(139,92,246,0.45)] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>
                  {isSigningIn ? t.account.connectingGoogle : t.account.signInGoogle}
                </span>
              </button>

              {authError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{authError}</span>
                </div>
              )}
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
