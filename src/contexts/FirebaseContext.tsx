import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
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
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import type { Gathering, PaymentDetails } from '../types/expense';
import type { NotificationPrefs } from '../hooks/usePushNotifications';

export interface CloudNotificationItem {
  id: string;
  title: string;
  body: string;
  type: 'expense' | 'settlement' | 'system';
  read: boolean;
  createdAtIso: string;
}

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  cloudGatherings: Gathering[];
  cloudPaymentDetails: PaymentDetails | null;
  cloudNotifyPrefs: NotificationPrefs | null;
  cloudNotifications: CloudNotificationItem[];
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
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

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [cloudGatherings, setCloudGatherings] = useState<Gathering[]>([]);
  const [cloudPaymentDetails, setCloudPaymentDetails] = useState<PaymentDetails | null>(null);
  const [cloudNotifyPrefs, setCloudNotifyPrefs] = useState<NotificationPrefs | null>(null);
  const [cloudNotifications, setCloudNotifications] = useState<CloudNotificationItem[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (nextUser) {
        try {
          const userRef = doc(db, 'users', nextUser.uid);
          const userSnap = await getDoc(userRef);
          const displayName = (nextUser.displayName || 'Usuario CuentasClaras').slice(0, 120);
          const photoURL = (nextUser.photoURL || '').slice(0, 512);

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: nextUser.uid,
              displayName,
              ...(photoURL ? { photoURL } : {}),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(userRef, {
              displayName,
              ...(photoURL ? { photoURL } : {}),
              updatedAt: serverTimestamp(),
            });
          }

          const privateRef = doc(db, 'users', nextUser.uid, 'private', 'profile');
          const privateSnap = await getDoc(privateRef);
          if (!privateSnap.exists()) {
            await setDoc(privateRef, {
              ownerId: nextUser.uid,
              email: (nextUser.email || 'sin-email@cuentasclaras.app').slice(0, 254),
              aliasOrCbu: '',
              accountHolder: displayName,
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

  const signInWithGoogle = useCallback(async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Cerraste la ventana de Google antes de completar el ingreso.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('El navegador bloqueó la ventana emergente de Google. Permití popups para continuar.');
      } else {
        setAuthError(error instanceof Error ? error.message : 'No se pudo iniciar sesión con Google.');
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

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
        const payload = {
          email: (user.email || 'sin-email@cuentasclaras.app').slice(0, 254),
          aliasOrCbu: paymentDetails.aliasOrCbu.slice(0, 120),
          accountHolder: paymentDetails.accountHolder.slice(0, 120),
          notifyEnabled: Boolean(notifyPrefs.notifyEnabled),
          notifyNewExpense: Boolean(notifyPrefs.notifyNewExpense),
          notifySettlementReminder: Boolean(notifyPrefs.notifySettlementReminder),
          updatedAt: serverTimestamp(),
        };
        if (!snap.exists()) {
          await setDoc(ref, { ownerId: user.uid, ...payload });
        } else {
          await updateDoc(ref, payload);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user]
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
        cloudGatherings,
        cloudPaymentDetails,
        cloudNotifyPrefs,
        cloudNotifications,
        signInWithGoogle,
        signOutUser,
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
