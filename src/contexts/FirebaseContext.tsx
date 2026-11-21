import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { useLanguage } from '../contexts/LanguageContext';
import type { Gathering, PaymentDetails } from '../types/expense';
import type { NotificationPrefs } from '../hooks/usePushNotifications';

const STORAGE_DEVICE_SESSION_KEY = 'cuentasclaras_device_session_v1';
const INTERNAL_AUTH_DOMAIN = 'auth.cuentasclaras.app';

export interface CloudNotificationItem {
  id: string;
  title: string;
  body: string;
  type: 'expense' | 'settlement' | 'system';
  read: boolean;
  createdAtIso: string;
}

interface RegisterParams {
  email: string;
  username: string;
  password: string;
}

interface LoginParams {
  username: string;
  password: string;
}

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  cloudUsername: string | null;
  cloudUserEmail: string | null;
  cloudGatherings: Gathering[];
  cloudPaymentDetails: PaymentDetails | null;
  cloudNotifyPrefs: NotificationPrefs | null;
  cloudNotifications: CloudNotificationItem[];
  registerAccount: (params: RegisterParams) => Promise<boolean>;
  loginWithUsername: (params: LoginParams) => Promise<boolean>;
  clearAuthError: () => void;
  saveGatheringToCloud: (gathering: Gathering) => Promise<void>;
  deleteGatheringFromCloud: (gatheringId: string) => Promise<void>;
  savePrivateProfileToCloud: (
    paymentDetails: PaymentDetails,
    notifyPrefs: NotificationPrefs
  ) => Promise<void>;
  logNotificationToCloud: (item: {
    id: string;
    title: string;
    body: string;
    type: 'expense' | 'settlement' | 'system';
  }) => Promise<void>;
  markNotificationReadInCloud: (notificationId: string) => Promise<void>;
  deleteNotificationFromCloud: (notificationId: string) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `id-${Date.now()}`;
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidUsernameFormat(usernameLower: string): boolean {
  return (
    usernameLower.length >= 3 &&
    usernameLower.length <= 30 &&
    /^[a-z0-9_-][a-z0-9_.-]{1,28}[a-z0-9_-]$/.test(usernameLower) &&
    !/\.\./.test(usernameLower)
  );
}

function isValidEmailFormat(email: string): boolean {
  return email.length >= 3 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function isValidPasswordFormat(password: string): boolean {
  return (
    password.length >= 6 &&
    password.length <= 15 &&
    /^[A-Za-z0-9]+$/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

function toInternalAuthEmail(usernameLower: string): string {
  return `${usernameLower}@${INTERNAL_AUTH_DOMAIN}`;
}

function isInternalAuthEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${INTERNAL_AUTH_DOMAIN}`));
}

function writeDeviceSessionMarker(username: string): void {
  try {
    localStorage.setItem(
      STORAGE_DEVICE_SESSION_KEY,
      JSON.stringify({
        username,
        persistedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Ignore storage errors
  }
}

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [cloudUsername, setCloudUsername] = useState<string | null>(null);
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null);
  const [cloudGatherings, setCloudGatherings] = useState<Gathering[]>([]);
  const [cloudPaymentDetails, setCloudPaymentDetails] = useState<PaymentDetails | null>(null);
  const [cloudNotifyPrefs, setCloudNotifyPrefs] = useState<NotificationPrefs | null>(null);
  const [cloudNotifications, setCloudNotifications] = useState<CloudNotificationItem[]>([]);

  const isRegisteringRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (nextUser) {
        if (isRegisteringRef.current) {
          return;
        }

        try {
          const fallbackDisplay = (nextUser.displayName || 'usuario').slice(0, 120);
          const derivedUsernameLower = isValidUsernameFormat(normalizeUsername(fallbackDisplay))
            ? normalizeUsername(fallbackDisplay)
            : nextUser.email && isInternalAuthEmail(nextUser.email)
              ? normalizeUsername(nextUser.email.split('@')[0] || '')
              : '';

          writeDeviceSessionMarker(derivedUsernameLower || fallbackDisplay);

          const userRef = doc(db, 'users', nextUser.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: nextUser.uid,
              ...(derivedUsernameLower && isValidUsernameFormat(derivedUsernameLower)
                ? { username: derivedUsernameLower }
                : {}),
              displayName: fallbackDisplay,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            const existingData = userSnap.data();
            const existingUsername =
              typeof existingData.username === 'string'
                ? existingData.username
                : typeof existingData.displayName === 'string'
                  ? existingData.displayName
                  : fallbackDisplay;
            setCloudUsername(existingUsername);
            await updateDoc(userRef, {
              displayName:
                typeof existingData.displayName === 'string' && existingData.displayName
                  ? existingData.displayName
                  : fallbackDisplay,
              updatedAt: serverTimestamp(),
            });
          }

          const privateRef = doc(db, 'users', nextUser.uid, 'private', 'profile');
          const privateSnap = await getDoc(privateRef);
          if (!privateSnap.exists()) {
            const safeEmail =
              nextUser.email && !isInternalAuthEmail(nextUser.email)
                ? nextUser.email.slice(0, 254)
                : 'sin-email@cuentasclaras.app';
            await setDoc(privateRef, {
              ownerId: nextUser.uid,
              ...(derivedUsernameLower && isValidUsernameFormat(derivedUsernameLower)
                ? { username: derivedUsernameLower }
                : {}),
              email: safeEmail,
              aliasOrCbu: '',
              accountHolder: fallbackDisplay,
              notifyEnabled: false,
              notifyNewExpense: true,
              notifySettlementReminder: true,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (error) {
          console.error('Error initializing user profile in Firestore:', error);
        }
      } else {
        setCloudUsername(null);
        setCloudUserEmail(null);
        setCloudGatherings([]);
        setCloudPaymentDetails(null);
        setCloudNotifyPrefs(null);
        setCloudNotifications([]);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

    const privatePath = `users/${user.uid}/private/profile`;
    const unsubPrivate = onSnapshot(
      doc(db, 'users', user.uid, 'private', 'profile'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.username === 'string' && data.username) {
            setCloudUsername(data.username);
          }
          if (
            typeof data.email === 'string' &&
            data.email &&
            !isInternalAuthEmail(data.email) &&
            data.email !== 'sin-email@cuentasclaras.app'
          ) {
            setCloudUserEmail(data.email);
          }
          setCloudPaymentDetails({
            aliasOrCbu: typeof data.aliasOrCbu === 'string' ? data.aliasOrCbu : '',
            accountHolder: typeof data.accountHolder === 'string' ? data.accountHolder : '',
          });
          setCloudNotifyPrefs({
            notifyEnabled: Boolean(data.notifyEnabled),
            notifyNewExpense: data.notifyNewExpense !== false,
            notifySettlementReminder: data.notifySettlementReminder !== false,
          });
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, privatePath)
    );

    const gatheringsPath = `users/${user.uid}/gatherings`;
    const gatheringsQuery = query(
      collection(db, 'users', user.uid, 'gatherings'),
      where('ownerId', '==', user.uid)
    );
    const unsubGatherings = onSnapshot(
      gatheringsQuery,
      (snapshot) => {
        const items: Gathering[] = snapshot.docs
          .map((d) => {
            const data = d.data();
            const updatedTs = data.updatedAt as { toDate?: () => Date } | undefined;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              title: typeof data.title === 'string' ? data.title : 'Juntada',
              date: typeof data.date === 'string' ? data.date : new Date().toISOString().slice(0, 10),
              participants: Array.isArray(data.participants) ? data.participants : [],
              expenses: Array.isArray(data.expenses) ? data.expenses : [],
              settledTransferIds: Array.isArray(data.settledTransferIds)
                ? data.settledTransferIds
                : [],
              updatedAt: updatedTs?.toDate ? updatedTs.toDate().toISOString() : new Date().toISOString(),
            };
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setCloudGatherings(items);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, gatheringsPath)
    );

    const notificationsPath = `users/${user.uid}/notifications`;
    const notificationsQuery = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('ownerId', '==', user.uid)
    );
    const unsubNotifications = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const items: CloudNotificationItem[] = snapshot.docs
          .map((d) => {
            const data = d.data();
            const createdTs = data.createdAt as { toDate?: () => Date } | undefined;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              title: typeof data.title === 'string' ? data.title : 'Alerta',
              body: typeof data.body === 'string' ? data.body : '',
              type:
                data.type === 'expense' || data.type === 'settlement' ? data.type : 'system',
              read: Boolean(data.read),
              createdAtIso: createdTs?.toDate
                ? createdTs.toDate().toISOString()
                : new Date().toISOString(),
            };
          })
          .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
        setCloudNotifications(items);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, notificationsPath)
    );

    return () => {
      unsubPrivate();
      unsubGatherings();
      unsubNotifications();
    };
  }, [authReady, user]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const registerAccount = useCallback(
    async ({ email, username, password }: RegisterParams): Promise<boolean> => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanUsername = username.trim();
      const usernameLower = normalizeUsername(cleanUsername);

      if (!isValidEmailFormat(cleanEmail)) {
        setAuthError(t.account.errInvalidEmail);
        return false;
      }
      if (!isValidUsernameFormat(usernameLower)) {
        setAuthError(t.account.errInvalidUsername);
        return false;
      }
      if (!isValidPasswordFormat(password)) {
        setAuthError(t.account.errWeakPassword);
        return false;
      }

      setIsSigningIn(true);
      setAuthError(null);
      isRegisteringRef.current = true;

      let createdUser: User | null = null;

      try {
        await setPersistence(auth, browserLocalPersistence);
        const cred = await createUserWithEmailAndPassword(
          auth,
          toInternalAuthEmail(usernameLower),
          password
        );
        createdUser = cred.user;

        await updateProfile(cred.user, { displayName: cleanUsername.slice(0, 120) });

        const batch = writeBatch(db);
        batch.set(doc(db, 'usernames', usernameLower), {
          uid: cred.user.uid,
          username: usernameLower,
          createdAt: serverTimestamp(),
        });
        batch.set(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          username: usernameLower,
          displayName: cleanUsername.slice(0, 120),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'users', cred.user.uid, 'private', 'profile'), {
          ownerId: cred.user.uid,
          username: usernameLower,
          email: cleanEmail.slice(0, 254),
          aliasOrCbu: '',
          accountHolder: cleanUsername.slice(0, 120),
          notifyEnabled: false,
          notifyNewExpense: true,
          notifySettlementReminder: true,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();

        writeDeviceSessionMarker(usernameLower);
        setCloudUsername(cleanUsername);
        setCloudUserEmail(cleanEmail);
        return true;
      } catch (error) {
        if (createdUser) {
          await createdUser.delete().catch(() => {});
          await signOut(auth).catch(() => {});
        }
        const code = (error as { code?: string })?.code || '';
        if (code === 'auth/email-already-in-use') {
          setAuthError(t.account.errUsernameTaken);
        } else if (code === 'auth/weak-password') {
          setAuthError(t.account.errWeakPassword);
        } else if (code === 'auth/operation-not-allowed') {
          setAuthError(t.account.errProviderDisabled);
        } else if (code === 'auth/network-request-failed') {
          setAuthError(t.account.errNetwork);
        } else {
          setAuthError(error instanceof Error ? error.message : t.account.errGenericRegister);
        }
        return false;
      } finally {
        isRegisteringRef.current = false;
        setIsSigningIn(false);
      }
    },
    [t]
  );

  const loginWithUsername = useCallback(
    async ({ username, password }: LoginParams): Promise<boolean> => {
      const cleanUsername = username.trim();
      const usernameLower = normalizeUsername(cleanUsername);

      if (!isValidUsernameFormat(usernameLower)) {
        setAuthError(t.account.errInvalidUsername);
        return false;
      }
      if (!password) {
        setAuthError(t.account.errPasswordRequired);
        return false;
      }

      setIsSigningIn(true);
      setAuthError(null);

      try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailAndPassword(auth, toInternalAuthEmail(usernameLower), password);
        writeDeviceSessionMarker(usernameLower);
        setCloudUsername(cleanUsername);
        return true;
      } catch (error) {
        const code = (error as { code?: string })?.code || '';
        if (
          code === 'auth/invalid-credential' ||
          code === 'auth/user-not-found' ||
          code === 'auth/wrong-password'
        ) {
          setAuthError(t.account.errInvalidCredentials);
        } else if (code === 'auth/too-many-requests') {
          setAuthError(t.account.errTooManyRequests);
        } else if (code === 'auth/operation-not-allowed') {
          setAuthError(t.account.errProviderDisabled);
        } else if (code === 'auth/network-request-failed') {
          setAuthError(t.account.errNetwork);
        } else {
          setAuthError(error instanceof Error ? error.message : t.account.errGenericLogin);
        }
        return false;
      } finally {
        setIsSigningIn(false);
      }
    },
    [t]
  );

  const saveGatheringToCloud = useCallback(
    async (gathering: Gathering) => {
      if (!user) return;
      const safeId = sanitizeId(gathering.id);
      const path = `users/${user.uid}/gatherings/${safeId}`;
      const docRef = doc(db, 'users', user.uid, 'gatherings', safeId);

      try {
        const existingSnap = await getDoc(docRef);
        const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(gathering.date)
          ? gathering.date
          : new Date().toISOString().slice(0, 10);
        const safeTitle = (gathering.title.trim() || 'Juntada').slice(0, 140);
        const safeParticipants = gathering.participants.slice(0, 30);
        const safeExpenses = gathering.expenses.slice(0, 100);
        const safeSettled = gathering.settledTransferIds.slice(0, 50);

        if (!existingSnap.exists()) {
          await setDoc(docRef, {
            id: safeId,
            ownerId: user.uid,
            title: safeTitle,
            date: safeDate,
            participants: safeParticipants,
            expenses: safeExpenses,
            settledTransferIds: safeSettled,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(docRef, {
            title: safeTitle,
            date: safeDate,
            participants: safeParticipants,
            expenses: safeExpenses,
            settledTransferIds: safeSettled,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user]
  );

  const deleteGatheringFromCloud = useCallback(
    async (gatheringId: string) => {
      if (!user) return;
      const safeId = sanitizeId(gatheringId);
      const path = `users/${user.uid}/gatherings/${safeId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'gatherings', safeId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const savePrivateProfileToCloud = useCallback(
    async (paymentDetails: PaymentDetails, notifyPrefs: NotificationPrefs) => {
      if (!user) return;
      const path = `users/${user.uid}/private/profile`;
      const ref = doc(db, 'users', user.uid, 'private', 'profile');
      try {
        const snap = await getDoc(ref);
        const resolvedEmail =
          cloudUserEmail ||
          (user.email && !isInternalAuthEmail(user.email)
            ? user.email
            : 'sin-email@cuentasclaras.app');
        const payload = {
          aliasOrCbu: paymentDetails.aliasOrCbu.slice(0, 120),
          accountHolder: paymentDetails.accountHolder.slice(0, 120),
          notifyEnabled: Boolean(notifyPrefs.notifyEnabled),
          notifyNewExpense: Boolean(notifyPrefs.notifyNewExpense),
          notifySettlementReminder: Boolean(notifyPrefs.notifySettlementReminder),
          updatedAt: serverTimestamp(),
        };
        if (!snap.exists()) {
          await setDoc(ref, {
            ownerId: user.uid,
            email: resolvedEmail.slice(0, 254),
            ...payload,
          });
        } else {
          await updateDoc(ref, payload);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user, cloudUserEmail]
  );

  const logNotificationToCloud = useCallback(
    async (item: {
      id: string;
      title: string;
      body: string;
      type: 'expense' | 'settlement' | 'system';
    }) => {
      if (!user) return;
      const safeId = sanitizeId(item.id);
      const path = `users/${user.uid}/notifications/${safeId}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'notifications', safeId), {
          id: safeId,
          ownerId: user.uid,
          title: item.title.slice(0, 140),
          body: item.body.slice(0, 500),
          type: item.type,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [user]
  );

  const markNotificationReadInCloud = useCallback(
    async (notificationId: string) => {
      if (!user) return;
      const safeId = sanitizeId(notificationId);
      const path = `users/${user.uid}/notifications/${safeId}`;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'notifications', safeId), {
          read: true,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const deleteNotificationFromCloud = useCallback(
    async (notificationId: string) => {
      if (!user) return;
      const safeId = sanitizeId(notificationId);
      const path = `users/${user.uid}/notifications/${safeId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'notifications', safeId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user]
  );

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        isSigningIn,
        authError,
        cloudUsername,
        cloudUserEmail,
        cloudGatherings,
        cloudPaymentDetails,
        cloudNotifyPrefs,
        cloudNotifications,
        registerAccount,
        loginWithUsername,
        clearAuthError,
        saveGatheringToCloud,
        deleteGatheringFromCloud,
        savePrivateProfileToCloud,
        logNotificationToCloud,
        markNotificationReadInCloud,
        deleteNotificationFromCloud,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase debe usarse dentro de FirebaseProvider');
  }
  return ctx;
}
