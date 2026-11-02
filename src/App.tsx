import React, { useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { onAuthStateChanged, signOut, reauthenticateWithPopup, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import {
  Language,
  AuthUser,
  PartnerData,
  RelationshipType,
  RelationshipRecord,
  Invitation,
  InvitationAuthorization,
  CertificateSettings,
  ScreenId
} from './types';
import { auth, db, googleProvider } from './lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { authFetch, fetchWithTimeout, parseApiError, getLocalizedErrorMessage, ALLOWED_ERROR_CODES, withAppCheckHeaders } from './utils/api';
import {
  getAccountMenuItems,
  classifyRelationshipSnapshot,
  evaluateP2Authorization,
  shouldRenderP2RegistrationScreen,
  evaluateP2AuthNavigation,
  executeInvitationLoad,
  executePrivateRecordLoad,
  executeRelationshipSnapshotRecovery,
  handleRelationshipSubscriptionError,
  executeNotificationsFetch
} from './utils/relationshipState';
import { TopBar } from './components/TopBar';
import { AuthScreen } from './components/AuthScreen';
import { P1RegistrationScreen } from './components/P1RegistrationScreen';
import { P1InviteScreen } from './components/P1InviteScreen';
import { InviteSuccessScreen } from './components/InviteSuccessScreen';
import { WaitingScreen } from './components/WaitingScreen';
import { P2LandingScreen } from './components/P2LandingScreen';
import { P2RegistrationScreen } from './components/P2RegistrationScreen';
import { ReviewControlsScreen } from './components/ReviewControlsScreen';
import { VerifyPortalModal } from './components/VerifyPortalModal';
import { AccountActionModals } from './components/AccountActionModals';
import { ChangeRequestModal } from './components/ChangeRequestModal';
import { BlockedPeopleModal } from './components/BlockedPeopleModal';
import { ReminderBanner } from './components/ReminderBanner';
import { ReminderSettingsModal } from './components/ReminderSettingsModal';
import { OccasionItem } from './utils/reminders';
import { LegalFooter } from './components/LegalFooter';
import { FormSkeleton } from './components/FormSkeleton';
import { LEGAL_VERSION } from './content/legal';

const CertificateScreen = lazy(() => import('./components/CertificateScreen').then(m => ({ default: m.CertificateScreen })));
const LegalPage = lazy(() => import('./components/LegalPage').then(m => ({ default: m.LegalPage })));
import { ChangeRequest, AppNotification, SocialAccount } from './types';
import { getRouteState } from './utils/routing';
import { updateSeoMetadata } from './utils/seo';
import { LayoutGrid, RefreshCw, ChevronLeft, ChevronRight, Bell, HeartOff, X, Loader2, Home } from 'lucide-react';

const emptyPartner = (): PartnerData => ({
  fullName: '',
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  email: '',
  phoneCountry: 'SA +966',
  phoneNumber: '',
  whatsappCountry: 'SA +966',
  whatsappNumber: ''
});

const initialRecord: RelationshipRecord = {
  id: '',
  recordNumber: '',
  verificationRef: '',
  type: 'dating',
  startDate: '',
  startDateAr: '',
  startDateIso: '',
  status: 'draft',
  activeSinceDays: 0,
  partner1: emptyPartner(),
  partner2: emptyPartner(),
  issuedDate: '',
  issuedDateAr: '',
  createdAt: new Date().toISOString(),
  settings: {
    showSocialHandles: true,
    showContactDetails: false,
    showQrMatrix: true
  }
};

const initialInvitation: Invitation = {
  id: '',
  recordId: '',
  inviterName: '',
  partner2Name: '',
  relationshipType: 'dating',
  startDate: '',
  startDateAr: '',
  startDateIso: '',
  status: 'pending',
  createdAt: '',
  expiresAt: '',
  reminderCount: 0
};

export { getRouteState };

const toAuthUser = (uid: string, email: string | null, displayName: string | null): AuthUser => ({
  id: uid,
  email: email || '',
  name: displayName || email?.split('@')[0] || 'Relationship ID User'
});

const formatStartDate = (iso: string, locale: 'en' | 'ar') => {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
};

export default function App() {
  const [language, setLanguage] = useState<Language>('ar');
  const [currentScreen, setCurrentScreen] = useState<ScreenId>(() => getRouteState().screen);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [invitationNotFound, setInvitationNotFound] = useState(false);
  const [record, setRecord] = useState<RelationshipRecord>(initialRecord);
  const [invitation, setInvitation] = useState<Invitation>(initialInvitation);
  const [invitationAuth, setInvitationAuth] = useState<InvitationAuthorization | null>(null);
  const [showScreenSwitcher, setShowScreenSwitcher] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [appError, setAppError] = useState('');
  const [p2PendingAction, setP2PendingAction] = useState<'accept' | 'decline'>('accept');
  const [showExitModal, setShowExitModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showReminderSettingsModal, setShowReminderSettingsModal] = useState(false);
  const [activeOccasions, setActiveOccasions] = useState<OccasionItem[]>([]);
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [accountActionError, setAccountActionError] = useState('');
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);
  const hasAutoNavigatedRef = useRef(false);
  const activeAuthUidRef = useRef<string | null>(null);
  const clearedRecordIdRef = useRef<string | null>(null);
  const privateRecordRequestIdRef = useRef(0);
  const privateRecordInFlightRef = useRef<{
    uid: string;
    requestId: number;
    promise: Promise<any>;
    routeAfterLoad: boolean;
  } | null>(null);
  const invitationRequestIdRef = useRef(0);
  const changeRequestsRequestIdRef = useRef(0);
  const notificationsRequestIdRef = useRef(0);
  const isSubmittingRef = useRef(false);
  const [privateRecordLoading, setPrivateRecordLoading] = useState(false);
  const [privateRecordError, setPrivateRecordError] = useState<string | null>(null);
  const [p2Profile, setP2Profile] = useState<PartnerData | null>(null);
  const [p2ProfileLoading, setP2ProfileLoading] = useState(false);
  const [p2ProfileError, setP2ProfileError] = useState<string | null>(null);
  const [p2Verification, setP2Verification] = useState<{
    whatsappTrusted: boolean;
    whatsappE164: string | null;
  } | null>(null);
  const p2ProfileRequestIdRef = useRef(0);
  const hasAttemptedP2ProfileLoadRef = useRef(false);
  const p1DraftRef = useRef<{
    uid: string;
    partner1: Partial<PartnerData>;
    relationshipType?: RelationshipType;
    startDate?: string;
  } | null>(null);
  const p2DraftRef = useRef<{
    uid: string;
    contextId: string;
    partner2: Partial<PartnerData>;
    editedFields: string[];
  } | null>(null);

  const allowScreenExplorer = useMemo(
    () => import.meta.env.DEV && import.meta.env.VITE_ENABLE_SCREEN_EXPLORER === 'true',
    []
  );

  const fetchNotifications = async () => {
    if (!auth?.currentUser) return;
    const requestUid = auth.currentUser.uid;
    const requestId = ++notificationsRequestIdRef.current;
    await executeNotificationsFetch({
      requestUid,
      requestId,
      getCurrentRequestId: () => notificationsRequestIdRef.current,
      getActiveAuthUid: () => activeAuthUidRef.current,
      getCurrentAuthUid: () => auth?.currentUser?.uid || null,
      fetchNotifications: async () => {
        const res = await authFetch('/api/notifications');
        return parseApiError(res);
      },
      setActiveNotification,
      onRelationshipEnded: (uid) => {
        p1DraftRef.current = null;
        p2DraftRef.current = null;
        setP2Profile(null);
        setP2ProfileError(null);
        setRecord((prev) => ({
          ...initialRecord,
          partner1: uid === prev.p2Uid ? prev.partner2 : prev.partner1
        }));
        setInvitation(initialInvitation);
      }
    });
  };

  const handleDismissNotification = async (notifId: string) => {
    const isRelationshipEnded = activeNotification?.type === 'relationship_ended';
    try {
      await authFetch(`/api/notifications/${notifId}/dismiss`, { method: 'POST' });
    } catch {
      // ignore
    }
    setActiveNotification(null);
    if (isRelationshipEnded) {
      navigateTo('p1_details', '/');
    }
  };

  const fetchActiveOccasions = async () => {
    if (!auth?.currentUser) return;
    try {
      const res = await authFetch('/api/reminders/active');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.occasions)) {
          setActiveOccasions(data.occasions);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleDismissOccasion = async (occ: OccasionItem) => {
    try {
      await authFetch('/api/reminders/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: occ.type,
          occurrenceDate: occ.date,
          relationshipId: occ.recordId
        })
      });
    } catch {
      // ignore
    }
    setActiveOccasions((prev) => prev.filter((o) => !(o.type === occ.type && o.date === occ.date)));
  };

  const navigateTo = (screen: ScreenId, path?: string) => {
    // Navigation guard: check activeAuthUidRef against auth.currentUser.uid before updating currentScreen
    if (auth?.currentUser && activeAuthUidRef.current !== auth.currentUser.uid) {
      return;
    }
    if (screen === 'p1_waiting') {
      hasAutoNavigatedRef.current = false;
    }
    setCurrentScreen(screen);
    if (path && window.location.pathname !== path) window.history.pushState(null, '', path);
  };

  const loadPrivateRecord = async (routeAfterLoad = false) => {
    if (!auth?.currentUser) return null;
    const requestUid = auth.currentUser.uid;

    // Deduplicate in-flight profile requests for the same user to prevent callback races
    if (
      privateRecordInFlightRef.current &&
      privateRecordInFlightRef.current.uid === requestUid
    ) {
      if (routeAfterLoad) {
        privateRecordInFlightRef.current.routeAfterLoad = true;
      }
      return privateRecordInFlightRef.current.promise;
    }

    const requestId = ++privateRecordRequestIdRef.current;
    activeAuthUidRef.current = requestUid;
    setPrivateRecordLoading(true);
    setPrivateRecordError(null);

    const promise = (async () => {
      try {
        const res = await executePrivateRecordLoad({
          requestUid,
          requestId,
          getCurrentRequestId: () => privateRecordRequestIdRef.current,
          getActiveAuthUid: () => activeAuthUidRef.current,
          getCurrentAuthUid: () => auth?.currentUser?.uid || null,
          fetchRecord: async () => {
            const response = await authFetch('/api/record');
            return parseApiError(response);
          },
          setRecord,
          setInvitation,
          setAppError: (msg) => {
            setAppError(msg);
            if (msg) setPrivateRecordError(msg);
          },
          formatErrorMessage: (err) => getLocalizedErrorMessage(err, language),
          routeAfterLoad: () => Boolean(privateRecordInFlightRef.current?.routeAfterLoad || routeAfterLoad),
          onNavigate: navigateTo,
          initialRecord,
          initialInvitation
        });
        return res;
      } catch (err) {
        if (privateRecordRequestIdRef.current === requestId && activeAuthUidRef.current === requestUid) {
          const localized = getLocalizedErrorMessage(err, language);
          setPrivateRecordError(localized);
          setAppError(localized);
        }
        return null;
      } finally {
        if (privateRecordInFlightRef.current?.requestId === requestId) {
          privateRecordInFlightRef.current = null;
        }
        if (privateRecordRequestIdRef.current === requestId && activeAuthUidRef.current === requestUid) {
          setPrivateRecordLoading(false);
        }
      }
    })();

    privateRecordInFlightRef.current = {
      uid: requestUid,
      requestId,
      promise,
      routeAfterLoad
    };

    return promise;
  };

  const loadP2Profile = async () => {
    if (!auth?.currentUser) return;
    const requestUid = auth.currentUser.uid;
    const requestId = ++p2ProfileRequestIdRef.current;
    hasAttemptedP2ProfileLoadRef.current = true;
    setP2ProfileLoading(true);
    setP2ProfileError(null);
    try {
      const res = await authFetch('/api/profile');
      const data = await parseApiError(res);
      if (
        auth?.currentUser?.uid === requestUid &&
        activeAuthUidRef.current === requestUid &&
        p2ProfileRequestIdRef.current === requestId
      ) {
        if (data?.verification) {
          setP2Verification({
            whatsappTrusted: Boolean(data.verification.whatsappTrusted),
            whatsappE164: data.verification.whatsappE164 || null
          });
        } else if (data?.profile?.whatsappTrusted && data?.profile?.whatsappE164) {
          setP2Verification({
            whatsappTrusted: true,
            whatsappE164: data.profile.whatsappE164
          });
        } else {
          setP2Verification(null);
        }

        if (data?.profile) {
          setP2Profile(data.profile);
        } else {
          // A successful "no saved profile" response is a valid empty-profile result
          setP2Profile(null);
        }
        setP2ProfileError(null);
      }
    } catch (err) {
      if (
        auth?.currentUser?.uid === requestUid &&
        activeAuthUidRef.current === requestUid &&
        p2ProfileRequestIdRef.current === requestId
      ) {
        const localized = getLocalizedErrorMessage(err, language);
        setP2ProfileError(localized);
      }
    } finally {
      if (
        auth?.currentUser?.uid === requestUid &&
        activeAuthUidRef.current === requestUid &&
        p2ProfileRequestIdRef.current === requestId
      ) {
        setP2ProfileLoading(false);
      }
    }
  };

  const renderLoadingScreen = (title: string, subtitle: string) => (
    <main className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-[#39436D]/60 border border-[#B8BCE6]/40 flex items-center justify-center shadow-lg">
        <Loader2 className="w-6 h-6 animate-spin text-[#B8BCE6]" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-white">
          {title}
        </p>
        <p className="text-xs text-[#D6DAED]">
          {subtitle}
        </p>
      </div>
    </main>
  );

  const loadInvitation = async (inviteId: string, skipRecordOverwrite = false) => {
    if (!inviteId || inviteId === 'current') return null;
    const requestUid = auth?.currentUser?.uid || null;
    const requestId = ++invitationRequestIdRef.current;
    return executeInvitationLoad({
      inviteId,
      skipRecordOverwrite,
      requestUid,
      requestId,
      getCurrentRequestId: () => invitationRequestIdRef.current,
      getActiveAuthUid: () => activeAuthUidRef.current,
      getCurrentAuthUid: () => auth?.currentUser?.uid || null,
      fetchInvitation: async () => {
        const headers = await withAppCheckHeaders();
        const response = auth?.currentUser
          ? await authFetch(`/api/invitations/${inviteId}`)
          : await fetchWithTimeout(`/api/invitations/${inviteId}`, { headers });
        return parseApiError(response);
      },
      forceRefreshToken: async () => {
        if (auth?.currentUser) {
          await auth.currentUser.getIdToken(true);
        }
      },
      setInvitation,
      setInvitationAuth,
      setInvitationNotFound,
      resetInvitation: () => setInvitation(initialInvitation),
      setRecord,
      setAppError: (msg) => setAppError(msg),
      setInvitationLoading,
      formatErrorMessage: (err) => getLocalizedErrorMessage(err, language)
    });
  };

  useEffect(() => {
    updateSeoMetadata(currentScreen, language);
    if (auth) auth.languageCode = language;
  }, [currentScreen, language]);

  // Register service worker for push notifications on supported browsers
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.debug('Service worker registration notice:', err);
      });
    }
  }, []);

  // Single coordinated authority for initial startup, login, and logout lifecycle
  useEffect(() => {
    if (!auth) {
      setAuthInitialized(true);
      const route = getRouteState();
      if (route.inviteId && route.inviteId !== 'current') {
        void loadInvitation(route.inviteId);
      }
      return;
    }
    return onAuthStateChanged(auth, async (user) => {
      setAuthInitialized(true);
      if (user) {
        activeAuthUidRef.current = user.uid;
        hasAttemptedP2ProfileLoadRef.current = false;
        setAuthUser(toAuthUser(user.uid, user.email, user.displayName));
        setInvitationAuth(null);
        void fetchActiveOccasions();
        const route = getRouteState();

        // Always load private record for authenticated users regardless of route
        const privateData = await loadPrivateRecord(route.screen === 'auth');
        // Navigation guard: check activeAuthUidRef against auth.currentUser.uid before continuing
        if (
          !privateData ||
          activeAuthUidRef.current !== user.uid ||
          !auth?.currentUser ||
          auth.currentUser.uid !== user.uid
        ) {
          return;
        }
        const activeRecord = privateData.record as RelationshipRecord | null;

        // If route has an inviteId:
        if (route.inviteId && route.inviteId !== 'current') {
          const isAlreadyActive = Boolean(activeRecord && activeRecord.status === 'active');
          void loadInvitation(route.inviteId, isAlreadyActive);
          void loadP2Profile();
        }
      } else {
        activeAuthUidRef.current = null;
        privateRecordInFlightRef.current = null;
        p1DraftRef.current = null;
        p2DraftRef.current = null;
        setP2Profile(null);
        setP2Verification(null);
        setP2ProfileError(null);
        setP2ProfileLoading(false);
        p2ProfileRequestIdRef.current += 1;
        hasAttemptedP2ProfileLoadRef.current = false;
        setPrivateRecordLoading(false);
        setPrivateRecordError(null);
        privateRecordRequestIdRef.current += 1;
        invitationRequestIdRef.current += 1;
        changeRequestsRequestIdRef.current += 1;
        notificationsRequestIdRef.current += 1;
        setAuthUser(null);
        setRecord(initialRecord);
        setInvitation(initialInvitation);
        setInvitationAuth(null);
        setChangeRequests([]);
        setActiveNotification(null);
        setInvitationLoading(false);
        setInvitationNotFound(false);
        hasAutoNavigatedRef.current = false;
        const route = getRouteState();
        if (route.inviteId && route.inviteId !== 'current') {
          void loadInvitation(route.inviteId);
        }
      }
    });
  }, []);

  // One-time cleanup: safely clear obsolete analytics consent & remember_me keys without affecting any other storage
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        if (window.localStorage) {
          window.localStorage.removeItem('rid_analytics_consent');
          window.localStorage.removeItem('rid_remember_me');
        }
        if (window.sessionStorage) {
          window.sessionStorage.removeItem('rid_remember_me');
        }
      }
    } catch {
      // safe ignore
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const route = getRouteState();
      // Navigation guard: check activeAuthUidRef against auth.currentUser.uid before updating currentScreen or triggering navigateTo
      if (auth?.currentUser && activeAuthUidRef.current !== auth.currentUser.uid) {
        return;
      }
      setCurrentScreen(route.screen);
      if (auth?.currentUser) {
        void loadPrivateRecord().then((data) => {
          if (
            !data ||
            !auth?.currentUser ||
            activeAuthUidRef.current !== auth.currentUser.uid
          ) {
            return;
          }
          const rec = data.record as RelationshipRecord | null;
          const isActive = rec?.status === 'active';
          if (route.inviteId && route.inviteId !== 'current') {
            void loadInvitation(route.inviteId, isActive);
            void loadP2Profile();
          }
        });
      } else if (route.inviteId && route.inviteId !== 'current') {
        void loadInvitation(route.inviteId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Ensure Partner 2 profile is loaded when visiting p2_details, and refreshed on return from terms/privacy
  const prevScreenForP2ProfileRef = useRef<ScreenId>(currentScreen);
  useEffect(() => {
    const prev = prevScreenForP2ProfileRef.current;
    prevScreenForP2ProfileRef.current = currentScreen;

    if (currentScreen === 'p2_details' && auth?.currentUser) {
      const isReturning = prev === 'terms' || prev === 'privacy' || prev === 'review_controls';
      if (!hasAttemptedP2ProfileLoadRef.current || isReturning) {
        void loadP2Profile();
      }
    }
  }, [currentScreen, auth?.currentUser?.uid]);

  // Real-time listener for current user document (/users/{uid})
  useEffect(() => {
    if (!db || !authUser?.id) return;
    let isSubscribed = true;
    const unsub = onSnapshot(
      doc(db, 'users', authUser.id),
      (userSnap) => {
        // Navigation guard: check activeAuthUidRef against auth.currentUser.uid before updating state or triggering navigateTo
        if (
          !isSubscribed ||
          !auth?.currentUser ||
          activeAuthUidRef.current !== auth.currentUser.uid ||
          auth.currentUser.uid !== authUser.id
        ) {
          return;
        }
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.activeRecordId && data.activeRecordId !== record.id && record.id) {
            void loadPrivateRecord();
          } else if (!data.activeRecordId && (record.status === 'active' || (record.status as string) === 'deleting' || Boolean(record.id))) {
            // Relationship was ended by partner
            setRecord((prev) => ({
              ...initialRecord,
              partner1: authUser?.id === prev.p2Uid ? prev.partner2 : prev.partner1
            }));
            setInvitation(initialInvitation);
            setChangeRequests([]);
            void fetchNotifications();
            navigateTo('p1_details', '/');
          }
        }
      },
      (error) => {
        // Safe logger: permissions or network limitations do not crash the app
        console.debug('Realtime user subscription notice:', error.message);
      }
    );
    return () => {
      isSubscribed = false;
      unsub();
    };
  }, [authUser?.id, record.id, record.status]);

  const applyServerRecord = (nextRecord: RelationshipRecord | null | undefined) => {
    if (!nextRecord) return;
    if (nextRecord.id && nextRecord.id === clearedRecordIdRef.current) return;
    if (!auth?.currentUser || activeAuthUidRef.current !== auth.currentUser.uid) return;
    setRecord(nextRecord);
  };

  const resetAfterRelationshipCleared = (recordId: string) => {
    if (clearedRecordIdRef.current === recordId) return;
    clearedRecordIdRef.current = recordId;
    setRecord((prev) => ({
      ...initialRecord,
      partner1: authUser?.id === prev.p2Uid ? prev.partner2 : prev.partner1
    }));
    setInvitation(initialInvitation);
    setChangeRequests([]);
    void fetchNotifications();
    navigateTo('p1_details', '/');
  };

  // Real-time listener for active relationship document (/relationships/{recordId})
  useEffect(() => {
    if (!db || !record.id || !authUser?.id) return;
    const currentRelId = record.id;
    const subscriptionUid = authUser.id;
    let isSubscribed = true;
    const unsub = onSnapshot(
      doc(db, 'relationships', currentRelId),
      (relSnap) => {
        // Navigation guard: check activeAuthUidRef against auth.currentUser.uid before updating state or triggering navigateTo
        if (
          !isSubscribed ||
          !auth?.currentUser ||
          activeAuthUidRef.current !== auth.currentUser.uid ||
          auth.currentUser.uid !== subscriptionUid
        ) {
          return;
        }
        const outcome = classifyRelationshipSnapshot({
          exists: relSnap.exists(),
          status: relSnap.data()?.status
        });
        if (outcome === 'cleared') {
          resetAfterRelationshipCleared(currentRelId);
        } else {
          const updated = relSnap.data() as RelationshipRecord;
          setRecord(updated);
          // When P2 accepts and status becomes active, advance P1 waiting screen automatically once
          if (updated.status === 'active' && currentScreen === 'p1_waiting') {
            if (!hasAutoNavigatedRef.current) {
              hasAutoNavigatedRef.current = true;
              navigateTo('review_controls', '/review');
            }
          }
        }
      },
      (error) => {
        console.debug('Realtime relationship subscription notice:', error.message);
        void handleRelationshipSubscriptionError({
          error,
          currentRelId,
          subscriptionUid,
          isSubscribed: () => isSubscribed,
          getActiveAuthUid: () => activeAuthUidRef.current,
          getCurrentAuthUid: () => auth?.currentUser?.uid || null,
          incrementRequestId: () => ++privateRecordRequestIdRef.current,
          getCurrentRequestId: () => privateRecordRequestIdRef.current,
          fetchRecord: async () => {
            const response = await authFetch('/api/record');
            return parseApiError(response);
          },
          onRelationshipCleared: resetAfterRelationshipCleared,
          setRecord: (rec) => setRecord(rec),
          setAppError: (msg) => setAppError(msg),
          formatErrorMessage: (err) => getLocalizedErrorMessage(err, language)
        });
      }
    );
    return () => {
      isSubscribed = false;
      unsub();
    };
  }, [db, record.id, authUser?.id, currentScreen, language]);

  // Real-time listener for invitation document (/invitations/{inviteId})
  useEffect(() => {
    if (!db || !invitation.id || !authUser?.id) return;
    let isSubscribed = true;
    const unsub = onSnapshot(
      doc(db, 'invitations', invitation.id),
      (invSnap) => {
        // Navigation guard: check activeAuthUidRef against auth.currentUser.uid before updating state or triggering navigateTo
        if (
          !isSubscribed ||
          !auth?.currentUser ||
          activeAuthUidRef.current !== auth.currentUser.uid ||
          auth.currentUser.uid !== authUser.id
        ) {
          return;
        }
        if (invSnap.exists()) {
          const updated = invSnap.data() as Invitation;
          setInvitation(updated);
          if (updated.status === 'accepted' || updated.status === 'declined') {
            void fetchNotifications();
          }
          if (updated.status === 'accepted' && currentScreen === 'p1_waiting') {
            if (!hasAutoNavigatedRef.current) {
              hasAutoNavigatedRef.current = true;
              navigateTo('review_controls', '/review');
            }
          } else if (updated.status === 'cancelled' && currentScreen === 'p1_waiting') {
            if (!hasAutoNavigatedRef.current) {
              hasAutoNavigatedRef.current = true;
              navigateTo('p1_details', '/');
            }
          }
        }
      },
      (error) => {
        console.debug('Realtime invitation subscription notice:', error.message);
      }
    );
    return () => {
      isSubscribed = false;
      unsub();
    };
  }, [db, invitation.id, authUser?.id, currentScreen]);

  const handleToggleLanguage = () => setLanguage((prev) => (prev === 'ar' ? 'en' : 'ar'));

  const handleNormalAuthSuccess = (user: AuthUser) => {
    setAuthUser(user);
    void loadPrivateRecord(true);
  };

  const cleanupPushRegistrationOnDevice = async () => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await authFetch('/api/reminders/push-subscription', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: sub.endpoint })
            }).catch(() => {});
            await sub.unsubscribe().catch(() => {});
          }
        }
      } catch {
        // Safe fallback
      }
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    setAppError('');
    await cleanupPushRegistrationOnDevice();
    activeAuthUidRef.current = null;
    privateRecordInFlightRef.current = null;
    p1DraftRef.current = null;
    p2DraftRef.current = null;
    setP2Profile(null);
    setPrivateRecordLoading(false);
    setPrivateRecordError(null);
    privateRecordRequestIdRef.current += 1;
    invitationRequestIdRef.current += 1;
    changeRequestsRequestIdRef.current += 1;
    notificationsRequestIdRef.current += 1;
    try {
      await signOut(auth);
      setAuthUser(null);
      setRecord(initialRecord);
      setInvitation(initialInvitation);
      setInvitationAuth(null);
      setChangeRequests([]);
      setActiveNotification(null);
      setInvitationLoading(false);
      navigateTo('auth', '/');
    } catch (error) {
      setAppError(getLocalizedErrorMessage(error, language));
    }
  };

  const handleSwitchAccount = async (targetInviteId?: string) => {
    await cleanupPushRegistrationOnDevice();
    activeAuthUidRef.current = null;
    p1DraftRef.current = null;
    p2DraftRef.current = null;
    setP2Profile(null);
    setPrivateRecordLoading(false);
    setPrivateRecordError(null);
    privateRecordRequestIdRef.current += 1;
    invitationRequestIdRef.current += 1;
    changeRequestsRequestIdRef.current += 1;
    notificationsRequestIdRef.current += 1;
    if (auth?.currentUser) {
      try {
        await signOut(auth);
      } catch (e) {
        console.error('Error signing out on account switch:', e);
        setAppError(getLocalizedErrorMessage(e, language));
        return;
      }
    }
    setAuthUser(null);
    setRecord(initialRecord);
    setInvitation(initialInvitation);
    setInvitationAuth(null);
    setChangeRequests([]);
    setActiveNotification(null);
    setInvitationLoading(false);
    const invitePath = targetInviteId && targetInviteId !== 'current' ? `/invite/${targetInviteId}/auth` : '/';
    navigateTo('p2_auth', invitePath);
  };

  const fetchChangeRequests = async () => {
    const requestId = ++changeRequestsRequestIdRef.current;
    try {
      const res = await authFetch('/api/change-requests');
      const data = await parseApiError(res);
      if (changeRequestsRequestIdRef.current !== requestId) {
        return;
      }
      if (Array.isArray(data.changeRequests)) {
        setChangeRequests(data.changeRequests);
      }
    } catch (err) {
      console.error('Failed to fetch change requests:', err);
    }
  };

  const handleAdjustInfo = () => {
    void fetchChangeRequests();
    setShowChangeRequestModal(true);
  };

  const handleConfirmExitRelationship = async () => {
    if (accountActionLoading) return;
    setAccountActionLoading(true);
    setAccountActionError('');
    privateRecordRequestIdRef.current += 1;
    invitationRequestIdRef.current += 1;
    changeRequestsRequestIdRef.current += 1;
    notificationsRequestIdRef.current += 1;
    try {
      const res = await authFetch('/api/relationship/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipId: record.id })
      });
      await parseApiError(res);
      privateRecordRequestIdRef.current += 1;
      invitationRequestIdRef.current += 1;
      changeRequestsRequestIdRef.current += 1;
      notificationsRequestIdRef.current += 1;
      setShowExitModal(false);
      p1DraftRef.current = null;
      p2DraftRef.current = null;
      setP2Profile(null);
      setP2ProfileError(null);
      // Keep current user's personal profile and reset relationship state
      setRecord((prev) => ({
        ...initialRecord,
        partner1: authUser?.id === prev.p2Uid ? prev.partner2 : prev.partner1
      }));
      setInvitation(initialInvitation);
      setChangeRequests([]);
      setActiveNotification(null);
      navigateTo('p1_details', '/');
    } catch (err) {
      setAccountActionError(getLocalizedErrorMessage(err, language));
    } finally {
      setAccountActionLoading(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (accountActionLoading) return;
    setAccountActionLoading(true);
    setAccountActionError('');
    privateRecordRequestIdRef.current += 1;
    invitationRequestIdRef.current += 1;
    changeRequestsRequestIdRef.current += 1;
    notificationsRequestIdRef.current += 1;
    try {
      let res = await authFetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipId: record.id })
      });

      if (res.status === 401 && auth?.currentUser) {
        // Handle REAUTH_REQUIRED
        const providers = auth.currentUser.providerData.map(p => p.providerId);
        const isGoogle = providers.includes('google.com');

        if (isGoogle) {
          await reauthenticateWithPopup(auth.currentUser, googleProvider);
        } else {
          const pass = window.prompt(
            language === 'ar'
              ? 'تطلب حذف الحساب إعادة المصادقة. يرجى إدخال كلمة المرور:'
              : 'Account deletion requires recent login. Please enter your password:'
          );
          if (!pass) {
            setAccountActionError(
              language === 'ar' ? 'تم إلغاء إعادة المصادقة.' : 'Re-authentication cancelled.'
            );
            return;
          }
          const cred = EmailAuthProvider.credential(auth.currentUser.email || '', pass);
          await reauthenticateWithCredential(auth.currentUser, cred);
        }

        await auth.currentUser.getIdToken(true);
        res = await authFetch('/api/account/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relationshipId: record.id })
        });
      }

      const data = await parseApiError(res);
      privateRecordRequestIdRef.current += 1;
      invitationRequestIdRef.current += 1;
      changeRequestsRequestIdRef.current += 1;
      notificationsRequestIdRef.current += 1;
      let noticeText = '';
      if (res.status === 202 && data?.status === 'DELETION_PENDING') {
        noticeText = language === 'ar' ? (data.messageAr || data.messageEn || '') : (data.messageEn || data.messageAr || '');
      }
      setShowDeleteModal(false);
      p1DraftRef.current = null;
      p2DraftRef.current = null;
      setP2Profile(null);
      setP2ProfileError(null);
      await handleSignOut();
      if (noticeText) {
        setAppError(noticeText);
      }
    } catch (err) {
      setAccountActionError(getLocalizedErrorMessage(err, language));
    } finally {
      setAccountActionLoading(false);
    }
  };


  const handleSubmitChangeRequest = async (field: string, proposedValue: string) => {
    const res = await authFetch('/api/change-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, proposedValue })
    });
    const data = await parseApiError(res);
    if (data.changeRequest) {
      setChangeRequests((prev) => [data.changeRequest, ...prev.filter((c) => c.id !== data.changeRequest.id)]);
    }
  };

  const handleSavePersonalInfo = async (personalData: {
    socialHandle?: string;
    socialAccounts?: SocialAccount[];
    fullNameEn?: string;
    whatsappNumber?: string;
    whatsappCountry?: string;
  }) => {
    const res = await authFetch('/api/profile/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personalData)
    });
    const data = await parseApiError(res);
    if (data.record) {
      applyServerRecord(data.record);
    }
  };

  const handleApproveChangeRequest = async (requestId: string) => {
    const res = await authFetch(`/api/change-requests/${requestId}/approve`, {
      method: 'POST'
    });
    const data = await parseApiError(res);
    if (data.record) {
      applyServerRecord(data.record);
    }
    if (data.changeRequest) {
      setChangeRequests((prev) => prev.map((c) => (c.id === requestId ? data.changeRequest : c)));
    }
  };

  const handleDeclineChangeRequest = async (requestId: string) => {
    const res = await authFetch(`/api/change-requests/${requestId}/decline`, {
      method: 'POST'
    });
    const data = await parseApiError(res);
    if (data.record) {
      applyServerRecord(data.record);
    }
    if (data.changeRequest) {
      setChangeRequests((prev) => prev.map((c) => (c.id === requestId ? data.changeRequest : c)));
    }
  };

  const handleP1SaveAndNext = async (p1Data: PartnerData, relType: RelationshipType, startDateIso: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setAppError('');
    try {
      // 1. Persist the user's profile under authenticated Firebase UID independently
      const profileResponse = await authFetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner1: p1Data })
      });
      const profileData = await parseApiError(profileResponse);

      // 2. Prepare or update the relationship draft through POST /api/record so invite creation succeeds
      const recordResponse = await authFetch('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner1: profileData?.profile || p1Data,
          type: relType,
          startDate: startDateIso,
          acceptedLegalVersion: LEGAL_VERSION
        })
      });
      const recordData = await parseApiError(recordResponse);

      if (recordData.record) {
        applyServerRecord(recordData.record);
      } else {
        setRecord((prev) => ({
          ...prev,
          partner1: { ...prev.partner1, ...(profileData?.profile || p1Data) },
          type: relType,
          startDateIso
        }));
      }

      if (activeAuthUidRef.current) {
        p1DraftRef.current = {
          uid: activeAuthUidRef.current,
          partner1: profileData?.profile || p1Data,
          relationshipType: relType,
          startDate: startDateIso
        };
      }

      navigateTo('p1_invite_create');
    } catch (err) {
      setAppError(getLocalizedErrorMessage(err, language));
      throw err;
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleCreateInvite = async (p2Data: {
    partner2Name: string;
    partner2Email?: string;
    partner2Phone?: string;
    partner2PhoneCountry?: string;
    partner2Whatsapp?: string;
    partner2WhatsappCountry?: string;
  }) => {
    if (isSubmittingRef.current) {
      throw new Error('SUBMISSION_IN_PROGRESS');
    }
    isSubmittingRef.current = true;
    setAppError('');
    try {
      const response = await authFetch('/api/invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p2Data)
      });
      const data = await parseApiError(response);
      if (!data || !data.invitation) {
        throw new Error('INVITATION_NOT_FOUND');
      }
      setInvitation(data.invitation);
      if (data.record) applyServerRecord(data.record);
      navigateTo('invite_success');
    } catch (err) {
      setAppError(getLocalizedErrorMessage(err, language));
      throw err;
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleCancelInvitation = async () => {
    if (!invitation.id) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setAppError('');
    try {
      const response = await authFetch(`/api/invitations/${invitation.id}/cancel`, { method: 'POST' });
      const data = await parseApiError(response);
      p1DraftRef.current = null;
      p2DraftRef.current = null;
      if (data.invitation) setInvitation(data.invitation);
      if (data.record) applyServerRecord(data.record);
      navigateTo('p1_details', '/');
    } catch (error) {
      setAppError(getLocalizedErrorMessage(error, language));
      throw error;
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleDeclineInvitation = async (block = false) => {
    if (!invitation.id) return;
    if (isSubmittingRef.current) return;
    if (!auth?.currentUser) {
      setP2PendingAction('decline');
      navigateTo('p2_auth', `/invite/${invitation.id}/auth`);
      return;
    }
    isSubmittingRef.current = true;
    try {
      const response = await authFetch(`/api/invitations/${invitation.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block })
      });
      const data = await parseApiError(response);
      p2DraftRef.current = null;
      setInvitation(data.invitation);
      navigateTo('p2_landing', `/invite/${invitation.id}`);
    } catch (err) {
      setAppError(getLocalizedErrorMessage(err, language));
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleP2Authenticated = async (user: AuthUser) => {
    activeAuthUidRef.current = user.id;
    setAuthUser(user);
    const routeInviteId = getRouteState().inviteId;
    const targetInviteId = (invitation.id && invitation.id !== 'current')
      ? invitation.id
      : (routeInviteId && routeInviteId !== 'current' ? routeInviteId : '');

    if (!targetInviteId) {
      setAppError(getLocalizedErrorMessage(new Error('INVITATION_NOT_FOUND'), language));
      navigateTo('p2_landing', '/');
      return;
    }

    let loadedData: any = null;
    try {
      loadedData = await loadInvitation(targetInviteId);
    } catch (err) {
      console.error('Failed to load private invitation details after login', err);
      loadedData = null;
    }

    if (p2PendingAction === 'decline') {
      try {
        await handleDeclineInvitation();
      } finally {
        setP2PendingAction('accept');
      }
      return;
    }

    const navDecision = evaluateP2AuthNavigation({
      currentUserId: user.id,
      targetInviteId,
      loadedData,
      existingInvitation: invitation
    });

    if (!navDecision.canNavigateToDetails) {
      setAppError(getLocalizedErrorMessage(new Error(navDecision.error || 'INVITATION_IDENTITY_MISMATCH'), language));
      navigateTo('p2_landing', `/invite/${targetInviteId}`);
      return;
    }

    void loadP2Profile();
    navigateTo('p2_details', `/invite/${targetInviteId}/complete`);
  };

  const handleAcceptRelationship = async (p2Data: PartnerData) => {
    if (!auth?.currentUser) throw new Error('AUTH_REQUIRED');
    if (!invitation.id) throw new Error('INVITATION_NOT_LOADED');
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const requestUid = auth.currentUser.uid;
    const targetInviteId = invitation.id;
    setAppError('');

    try {
      const response = await authFetch(`/api/invitations/${targetInviteId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner2: p2Data, acceptedLegalVersion: LEGAL_VERSION })
      });
      const data = await parseApiError(response);

      // Stale response guard: check UID and invitation identity before applying state changes
      if (
        !auth?.currentUser ||
        auth.currentUser.uid !== requestUid ||
        activeAuthUidRef.current !== requestUid ||
        invitation.id !== targetInviteId
      ) {
        return;
      }

      const confirmedRecord = data.record as RelationshipRecord | null;
      const confirmedInvitation = data.invitation as Invitation | null;

      if (!data.success || !confirmedRecord || confirmedRecord.status !== 'active') {
        const fallbackCode = typeof data.error === 'string' && ALLOWED_ERROR_CODES.has(data.error)
          ? data.error
          : 'ACCEPTANCE_FAILED_OR_INACTIVE';
        throw new Error(fallbackCode);
      }

      if (confirmedInvitation) setInvitation(confirmedInvitation);
      setRecord(confirmedRecord);
      navigateTo('official_certificate', `/certificate/${confirmedRecord.verificationRef}`);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleUpdateSettings = async (newSettings: Partial<CertificateSettings>) => {
    const response = await authFetch('/api/record/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });
    await parseApiError(response);
    setRecord((prev) => ({ ...prev, settings: { ...prev.settings, ...newSettings } }));
  };

  const screensOrder: { id: ScreenId; labelAr: string; labelEn: string }[] = [
    { id: 'auth', labelAr: '1. تسجيل الدخول', labelEn: '1. Auth' },
    { id: 'p1_details', labelAr: '2. بيانات P1', labelEn: '2. P1 Details' },
    { id: 'p1_invite_create', labelAr: '3. دعوة الشريك', labelEn: '3. Partner Invite' },
    { id: 'invite_success', labelAr: '4. نجاح الدعوة', labelEn: '4. Invite Success' },
    { id: 'p1_waiting', labelAr: '5. بانتظار الشريك', labelEn: '5. Waiting' },
    { id: 'p2_landing', labelAr: '6. دعوة P2', labelEn: '6. P2 Invitation' },
    { id: 'p2_auth', labelAr: '7. دخول P2', labelEn: '7. P2 Auth' },
    { id: 'p2_details', labelAr: '8. بيانات P2', labelEn: '8. P2 Details' },
    { id: 'review_controls', labelAr: '9. لوحة العلاقة', labelEn: '9. Relationship' },
    { id: 'official_certificate', labelAr: '10. الشهادة', labelEn: '10. Certificate' },
    { id: 'verify_portal', labelAr: '11. التحقق', labelEn: '11. Verify' },
    { id: 'privacy', labelAr: '12. الخصوصية', labelEn: '12. Privacy' },
    { id: 'terms', labelAr: '13. الشروط', labelEn: '13. Terms' }
  ];

  const hasActiveRelationship = record?.status === 'active';
  const isDeleting = (record?.status as string) === 'deleting';
  const accountMenuItems = getAccountMenuItems({
    signedIn: Boolean(authUser),
    hasActiveRelationship,
    isDeleting
  });
  const isP2User = Boolean(authUser?.id && record?.p2Uid === authUser.id);
  const isParticipant = Boolean(
    authUser?.id &&
    hasActiveRelationship &&
    (record.p1Uid === authUser.id || record.p2Uid === authUser.id)
  );
  const homeScreen: ScreenId = (isP2User && hasActiveRelationship) ? 'p2_details' : 'p1_details';
  const isAtHome = currentScreen === homeScreen;

  const handleGoHome = () => {
    if (isP2User && hasActiveRelationship) {
      const p2InviteId = (record.inviteId && record.inviteId !== 'current')
        ? record.inviteId
        : (invitation.id && invitation.id !== 'current' ? invitation.id : '');
      if (p2InviteId) {
        navigateTo('p2_details', `/invite/${p2InviteId}/details`);
      } else {
        navigateTo('p2_details', '/p2');
      }
    } else {
      navigateTo('p1_details', '/');
    }
  };

  const isP1Registration = currentScreen === 'p1_details' && !hasActiveRelationship;
  const currentRouteInviteId = getRouteState().inviteId;
  const p2TargetInviteId = (invitation.id && invitation.id !== 'current')
    ? invitation.id
    : (currentRouteInviteId && currentRouteInviteId !== 'current' ? currentRouteInviteId : '');
  const isP2Registration = currentScreen === 'p2_details' && record.status !== 'active' && shouldRenderP2RegistrationScreen(
    evaluateP2Authorization({
      authInitialized,
      currentUserId: auth?.currentUser?.uid || authUser?.id || null,
      targetInviteId: p2TargetInviteId,
      invitationAuth,
      invitation,
      record,
      invitationLoading,
      invitationNotFound,
      hasAppError: Boolean(appError)
    })
  );
  const isRegistrationForm = isP1Registration || isP2Registration;

  return (
    <div className="min-h-screen bg-[#2C345F] text-[#F7F8FC] flex flex-col justify-start items-center p-0 sm:py-6 selection:bg-[#B8BCE6] selection:text-[#202747]">
      <div className={`w-full ${isRegistrationForm ? 'max-w-[920px]' : 'max-w-[430px]'} min-h-[844px] bg-[#252D52] sm:rounded-[36px] shadow-2xl flex flex-col relative overflow-hidden border-0 sm:border sm:border-[#A0A9D1] transition-[max-width] duration-200`}>
        <TopBar
          language={language}
          onToggleLanguage={handleToggleLanguage}
          currentScreen={currentScreen}
          onNavigate={(screen) => navigateTo(screen)}
          onOpenVerifyModal={() => setShowVerifyModal(true)}
          onOpenBlockedModal={authUser ? () => setShowBlockedModal(true) : undefined}
          onOpenReminderSettings={authUser ? () => setShowReminderSettingsModal(true) : undefined}
          signedIn={Boolean(authUser)}
          onSignOut={() => void handleSignOut()}
          onAdjustInfo={handleAdjustInfo}
          onHome={authUser ? handleGoHome : (currentScreen === 'not_found' ? () => navigateTo('auth', '/') : undefined)}
          isAtHome={isAtHome}
          onExitRelationship={accountMenuItems.endRelationship ? () => {
            setAccountActionError('');
            setShowExitModal(true);
          } : undefined}
          onDeleteAccount={accountMenuItems.deleteAccount ? () => {
            setAccountActionError('');
            setShowDeleteModal(true);
          } : undefined}
        />

        {appError && (
          <div className="mx-4 mt-2 px-3.5 py-2.5 rounded-xl border border-rose-400/30 bg-rose-500/10 text-sm sm:text-base text-rose-200 break-words leading-relaxed" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            {appError}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between overflow-y-auto">
          {authUser && activeOccasions.length > 0 && (currentScreen === 'p1_details' || currentScreen === 'p2_details' || currentScreen === 'review_controls') && (
            <div className="px-4 pt-3">
              <ReminderBanner
                language={language}
                occasions={activeOccasions}
                onDismiss={handleDismissOccasion}
              />
            </div>
          )}
          {currentScreen === 'auth' && (
            authUser ? (
              privateRecordLoading ? (
                renderLoadingScreen(
                  language === 'ar' ? 'جاري تحميل بيانات السجل...' : 'Loading your relationship record...',
                  language === 'ar' ? 'يرجى الانتظار بينما نتحقق من حسابك' : 'Please wait while we verify your account'
                )
              ) : (
                <main className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-md mx-auto w-full">
                  <div className="w-full p-5 rounded-2xl bg-[#414A75] border border-[#A0A9D1] text-[#F7F8FC] space-y-4 shadow-xl">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
                      <RefreshCw className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="text-base font-semibold text-white">
                        {language === 'ar' ? 'تعذر تحميل بيانات السجل' : 'Unable to Load Registry Record'}
                      </h2>
                      <p className="text-xs text-[#D6DAED] leading-relaxed">
                        {privateRecordError || appError || (language === 'ar' ? 'حدث خطأ مؤقت أثناء تحميل بيانات حسابك. يمكنك المحاولة مرة أخرى.' : 'A temporary issue occurred while loading your account. Please try again.')}
                      </p>
                    </div>
                    <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                      <button
                        type="button"
                        onClick={() => void loadPrivateRecord(true)}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-[#B8BCE6] hover:bg-[#C5C9EC] text-[#202747] text-sm font-medium transition cursor-pointer flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSignOut()}
                        className="py-2.5 px-4 rounded-xl bg-[#39436D] hover:bg-[#4F5A8C] text-[#D6DAED] text-sm font-medium transition cursor-pointer border border-[#A0A9D1]"
                      >
                        <span>{language === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>
                      </button>
                    </div>
                  </div>
                </main>
              )
            ) : (
              <AuthScreen
                language={language}
                onAuthSuccess={handleNormalAuthSuccess}
                onNavigate={(screen) => navigateTo(screen, screen === 'privacy' ? '/privacy' : screen === 'terms' ? '/terms' : screen === 'about' ? '/about' : undefined)}
              />
            )
          )}

          {currentScreen === 'p1_details' && (() => {
            const currentP1Draft = p1DraftRef.current?.uid === authUser?.id ? p1DraftRef.current : null;
            return (
              <P1RegistrationScreen
                language={language}
                initialData={
                  currentP1Draft
                    ? { ...record.partner1, ...currentP1Draft.partner1, email: currentP1Draft.partner1.email || record.partner1.email || authUser?.email || '' }
                    : { ...record.partner1, email: record.partner1.email || authUser?.email || '' }
                }
                relationshipType={
                  currentP1Draft?.relationshipType || record.type
                }
                initialStartDate={
                  currentP1Draft?.startDate || record.startDateIso || ''
                }
                onSaveAndNext={handleP1SaveAndNext}
                isActive={hasActiveRelationship}
                record={record}
                loading={privateRecordLoading && !record.id && !record.partner1.fullName}
                loadingError={privateRecordError}
                onRetryLoading={() => void loadPrivateRecord(false)}
                onDraftChange={(draft) => {
                  if (activeAuthUidRef.current) {
                    p1DraftRef.current = {
                      uid: activeAuthUidRef.current,
                      partner1: { ...(p1DraftRef.current?.partner1 || {}), ...draft },
                      relationshipType: draft.relationshipType,
                      startDate: draft.startDate
                    };
                  }
                }}
                onRequestChange={handleAdjustInfo}
                onViewControls={() => navigateTo('review_controls', '/review')}
                onOpenPrivacy={() => navigateTo('privacy', '/privacy')}
                onOpenTerms={() => navigateTo('terms', '/terms')}
              />
            );
          })()}

          {currentScreen === 'p1_invite_create' && (
            <P1InviteScreen
              language={language}
              defaultPartnerName={invitation.partner2Name}
              defaultPartnerEmail={invitation.partner2Email}
              defaultPartnerPhone={invitation.partner2Phone}
              onCreateInvite={handleCreateInvite}
              onBackToP1={() => navigateTo('p1_details')}
            />
          )}

          {currentScreen === 'invite_success' && (
            <InviteSuccessScreen
              language={language}
              invitation={invitation}
              onGoToWaiting={() => navigateTo('p1_waiting', '/waiting')}
              onCancelInvite={handleCancelInvitation}
              onOpenInvitation={() => window.open(`${window.location.origin}/invite/${invitation.id}`, '_blank', 'noopener,noreferrer')}
            />
          )}

          {currentScreen === 'p1_waiting' && (
            <WaitingScreen
              language={language}
              invitation={invitation}
              record={record}
              onCancelInvite={handleCancelInvitation}
              onOpenInvitation={() => window.open(`${window.location.origin}/invite/${invitation.id}`, '_blank', 'noopener,noreferrer')}
            />
          )}

          {currentScreen === 'p2_landing' && (
            invitationLoading ? (
              renderLoadingScreen(
                language === 'ar' ? 'جاري التحقق من تفاصيل الدعوة...' : 'Verifying invitation authorization...',
                language === 'ar' ? 'يرجى الانتظار بينما نتحقق من صلاحية الدعوة...' : 'Please wait while we verify invitation access...'
              )
            ) : (
              <P2LandingScreen
                language={language}
                invitation={invitation}
                authUser={authUser}
                invitationAuthorization={invitationAuth}
                invitationNotFound={invitationNotFound}
                authInitialized={authInitialized}
                invitationLoading={invitationLoading}
                hasAppError={Boolean(appError)}
                onAccept={() => {
                  setP2PendingAction('accept');
                  if (!auth?.currentUser) {
                    navigateTo('p2_auth', `/invite/${invitation.id}/auth`);
                  } else if (invitationAuth?.isP1 || authUser?.id === invitation.p1Uid) {
                    setAppError(getLocalizedErrorMessage(new Error('CANNOT_ACCEPT_OWN_INVITATION'), language));
                  } else if (!invitationAuth) {
                    setAppError(getLocalizedErrorMessage(new Error('INVITATION_NOT_LOADED'), language));
                  } else if (!invitationAuth.authorized) {
                    if (invitationAuth.reason !== 'VERIFICATION_REQUIRED') {
                      setAppError(getLocalizedErrorMessage(new Error(invitationAuth.reason || 'INVITATION_IDENTITY_MISMATCH'), language));
                    }
                  } else {
                    navigateTo('p2_details', `/invite/${invitation.id}/complete`);
                  }
                }}
                onPhoneVerified={(e164) => {
                  setP2Verification({
                    whatsappTrusted: true,
                    whatsappE164: e164
                  });
                  if (invitation.id) {
                    void loadInvitation(invitation.id);
                  }
                }}
                onSwitchAccount={() => void handleSwitchAccount(invitation.id)}
                onRetry={() => {
                  const routeInviteId = getRouteState().inviteId;
                  const inviteToLoad = invitation.id || (routeInviteId && routeInviteId !== 'current' ? routeInviteId : '');
                  if (inviteToLoad && !invitationLoading) {
                    setAppError('');
                    void loadInvitation(inviteToLoad);
                  }
                }}
                onDecline={(block) => void handleDeclineInvitation(block).catch((error) => setAppError(getLocalizedErrorMessage(error, language)))}
                onViewCertificate={hasActiveRelationship ? () => navigateTo('official_certificate', `/certificate/${record.verificationRef}`) : undefined}
                onNavigate={(screen) => navigateTo(screen, screen === 'privacy' ? '/privacy' : screen === 'terms' ? '/terms' : undefined)}
              />
            )
          )}

          {currentScreen === 'p2_auth' && (
            <AuthScreen
              language={language}
              isP2InvitationFlow
              inviterName={invitation.inviterName}
              contactRequirement={invitation.contactRequirement}
              onAuthSuccess={(user) => void handleP2Authenticated(user)}
              onNavigate={(screen) => navigateTo(screen, screen === 'privacy' ? '/privacy' : screen === 'terms' ? '/terms' : screen === 'about' ? '/about' : undefined)}
            />
          )}

          {currentScreen === 'p2_details' && (
            (() => {
              const currentRouteInviteId = getRouteState().inviteId;
              const targetInviteId = (invitation.id && invitation.id !== 'current')
                ? invitation.id
                : (currentRouteInviteId && currentRouteInviteId !== 'current' ? currentRouteInviteId : '');

              const decision = evaluateP2Authorization({
                authInitialized,
                currentUserId: auth?.currentUser?.uid || authUser?.id || null,
                targetInviteId,
                invitationAuth,
                invitation,
                record,
                invitationLoading,
                invitationNotFound,
                hasAppError: Boolean(appError)
              });

              if (decision.state === 'loading') {
                return renderLoadingScreen(
                  decision.messageKey === 'auth_verifying'
                    ? (language === 'ar' ? 'جاري التحقق من هوية الشريك...' : 'Verifying partner authentication...')
                    : (language === 'ar' ? 'جاري التحقق من صلاحية الدعوة...' : 'Verifying invitation authorization...'),
                  language === 'ar'
                    ? 'يرجى الانتظار بينما نتحقق من صلاحية الدعوة...'
                    : 'Please wait while we verify invitation access...'
                );
              }

              if (shouldRenderP2RegistrationScreen(decision)) {
                const targetContextId = record.status === 'active'
                  ? (record.id || 'active')
                  : targetInviteId;

                const currentP2Draft = (
                  authUser?.id &&
                  targetContextId &&
                  p2DraftRef.current?.uid === authUser.id &&
                  p2DraftRef.current?.contextId === targetContextId
                ) ? p2DraftRef.current : null;

                const isP2Loading = p2ProfileLoading || (invitationLoading && !invitation.id);
                const p2ErrorToDisplay = p2ProfileError || (appError && !invitation.id ? appError : null);

                return (
                  <P2RegistrationScreen
                    language={language}
                    record={record}
                    initialProfile={p2Profile}
                    draft={currentP2Draft?.partner2 || null}
                    draftEditedFields={currentP2Draft?.editedFields || []}
                    loading={isP2Loading}
                    loadingError={p2ErrorToDisplay}
                    onRetryLoading={() => {
                      if (targetInviteId && (!invitation.id || invitation.id !== targetInviteId)) {
                        void loadInvitation(targetInviteId);
                      }
                      void loadP2Profile();
                    }}
                    onDraftChange={(draft, editedFields) => {
                      if (
                        activeAuthUidRef.current &&
                        activeAuthUidRef.current === authUser?.id &&
                        targetContextId
                      ) {
                        p2DraftRef.current = {
                          uid: activeAuthUidRef.current,
                          contextId: targetContextId,
                          partner2: { ...(p2DraftRef.current?.partner2 || {}), ...draft },
                          editedFields: Array.from(new Set([...(p2DraftRef.current?.editedFields || []), ...(editedFields || [])]))
                        };
                      }
                    }}
                    onAcceptRelationship={handleAcceptRelationship}
                    onRequestChange={handleAdjustInfo}
                    onViewControls={() => navigateTo('review_controls', '/review')}
                    onOpenPrivacy={() => navigateTo('privacy', '/privacy')}
                    onOpenTerms={() => navigateTo('terms', '/terms')}
                    serverVerification={p2Verification}
                    onPhoneVerified={(e164) => {
                      setP2Verification({
                        whatsappTrusted: true,
                        whatsappE164: e164
                      });
                      setP2Profile((prev) => prev ? {
                        ...prev,
                        phoneE164: e164,
                        phoneVerified: true,
                        whatsappE164: e164,
                        whatsappTrusted: true
                      } : {
                        ...emptyPartner(),
                        phoneE164: e164,
                        phoneVerified: true,
                        whatsappE164: e164,
                        whatsappTrusted: true
                      });
                    }}
                  />
                );
              }

              // Fail closed: show invitation landing screen with switch account / login
              const fallbackInviteId = targetInviteId || invitation.id;
              return (
                <P2LandingScreen
                  language={language}
                  invitation={invitation}
                  authUser={authUser}
                  invitationAuthorization={invitationAuth}
                  invitationNotFound={invitationNotFound}
                  authInitialized={authInitialized}
                  invitationLoading={invitationLoading}
                  hasAppError={Boolean(appError)}
                  onAccept={() => {
                    if (decision.state === 'p1_rejected') {
                      setAppError(getLocalizedErrorMessage(new Error('CANNOT_ACCEPT_OWN_INVITATION'), language));
                    } else if (decision.state === 'unauthorized') {
                      if (decision.reason !== 'VERIFICATION_REQUIRED') {
                        setAppError(getLocalizedErrorMessage(new Error(decision.reason || 'INVITATION_IDENTITY_MISMATCH'), language));
                      }
                    } else if (!auth?.currentUser) {
                      navigateTo('p2_auth', fallbackInviteId ? `/invite/${fallbackInviteId}/auth` : '/');
                    } else {
                      navigateTo('p2_auth', fallbackInviteId ? `/invite/${fallbackInviteId}/auth` : '/');
                    }
                  }}
                  onPhoneVerified={(e164) => {
                    setP2Verification({
                      whatsappTrusted: true,
                      whatsappE164: e164
                    });
                    if (fallbackInviteId) {
                      void loadInvitation(fallbackInviteId);
                    }
                  }}
                  onSwitchAccount={() => void handleSwitchAccount(fallbackInviteId)}
                  onRetry={() => {
                    const routeInviteId = getRouteState().inviteId;
                    const inviteToLoad = fallbackInviteId || (routeInviteId && routeInviteId !== 'current' ? routeInviteId : '');
                    if (inviteToLoad && !invitationLoading) {
                      setAppError('');
                      void loadInvitation(inviteToLoad);
                    }
                  }}
                  onDecline={(block) => void handleDeclineInvitation(block).catch((error) => setAppError(getLocalizedErrorMessage(error, language)))}
                  onNavigate={(screen) => navigateTo(screen, screen === 'privacy' ? '/privacy' : screen === 'terms' ? '/terms' : undefined)}
                />
              );
            })()
          )}

          {currentScreen === 'review_controls' && (
            <ReviewControlsScreen
              language={language}
              record={record}
              currentUserId={authUser?.id}
              onUpdateSettings={(settings) => void handleUpdateSettings(settings).catch((error) => setAppError(getLocalizedErrorMessage(error, language)))}
              onEditDetails={() => navigateTo(isP2User ? 'p2_details' : 'p1_details')}
              onViewCertificate={() => navigateTo('official_certificate', `/certificate/${record.verificationRef}`)}
              onRecordUpdated={(updated) => setRecord(updated)}
              onExitRelationship={accountMenuItems.endRelationship ? () => {
                setAccountActionError('');
                setShowExitModal(true);
              } : undefined}
            />
          )}

          {currentScreen === 'official_certificate' && (
            isParticipant ? (
              <Suspense fallback={<FormSkeleton type="p1" language={language} />}>
                <CertificateScreen language={language} record={record} onHome={handleGoHome} />
              </Suspense>
            ) : (
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
                <p className="text-sm sm:text-base text-[#D6DAED]">
                  {language === 'ar' ? 'لا توجد شهادة نشطة لعرضها.' : 'No active certificate to display.'}
                </p>
                <button
                  type="button"
                  onClick={handleGoHome}
                  className="mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#B8BCE6] to-[#B8BCE6] hover:from-[#C5C9EC] hover:to-[#C5C9EC] text-[#202747] text-sm font-semibold cursor-pointer"
                >
                  {language === 'ar' ? 'الرئيسية' : 'Home'}
                </button>
              </div>
            )
          )}

          {currentScreen === 'verify_portal' && (
            <div className="flex-1 p-4 flex flex-col items-center justify-center">
              <button type="button" onClick={() => setShowVerifyModal(true)} className="w-full py-4 px-4 rounded-xl bg-gradient-to-r from-[#B8BCE6] to-[#B8BCE6] hover:from-[#C5C9EC] hover:to-[#C5C9EC] text-[#202747] font-bold text-sm shadow-lg border border-[#A0A9D1] cursor-pointer">
                {language === 'ar' ? 'فتح بوابة التحقق' : 'Open Verification Portal'}
              </button>
            </div>
          )}

          {(currentScreen === 'privacy' || currentScreen === 'terms' || currentScreen === 'about') && (
            <Suspense fallback={<FormSkeleton type="p1" language={language} />}>
              <LegalPage
                page={currentScreen}
                language={language}
                onBack={() => {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    navigateTo(authUser ? 'p1_details' : 'auth', '/');
                  }
                }}
              />
            </Suspense>
          )}

          {currentScreen === 'not_found' && (
            <main className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4" role="main">
              <div className="w-16 h-16 rounded-2xl bg-[#39436D]/80 border border-[#A0A9D1] flex items-center justify-center text-[#B8BCE6] mb-1 shadow-lg">
                <span className="text-2xl font-bold font-mono">404</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {language === 'ar' ? 'الصفحة غير موجودة' : 'Page Not Found'}
              </h2>
              <p className="text-base text-[#D6DAED] max-w-sm leading-relaxed">
                {language === 'ar'
                  ? 'عذراً، العنوان المطلوب غير موجود أو تم نقله.'
                  : 'Sorry, the requested address does not exist or has been moved.'}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (authUser) {
                      handleGoHome();
                    } else {
                      navigateTo('auth', '/');
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#B8BCE6] to-[#B8BCE6] hover:from-[#C5C9EC] hover:to-[#C5C9EC] text-[#202747] text-base font-bold transition shadow-lg inline-flex items-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D3D8FF]"
                >
                  <Home className="w-5 h-5" />
                  <span>{language === 'ar' ? 'العودة إلى الرئيسية' : 'Return Home'}</span>
                </button>
              </div>
            </main>
          )}
        </div>

        <LegalFooter
          language={language}
          onNavigate={(screen) =>
            navigateTo(
              screen,
              screen === 'privacy' ? '/privacy' : screen === 'terms' ? '/terms' : '/about'
            )
          }
          showPreferredSource={currentScreen === 'auth'}
        />

        {allowScreenExplorer && showScreenSwitcher && (
          <aside aria-label="Screen explorer" className="absolute inset-x-0 bottom-0 top-[65px] bg-[#2C345F]/95 backdrop-blur-md z-40 p-4 overflow-y-auto flex flex-col justify-between border-t border-white/10">
            <div className="grid grid-cols-1 gap-1.5">
              {screensOrder.map((s, idx) => (
                <button key={s.id} type="button" onClick={() => { navigateTo(s.id); setShowScreenSwitcher(false); }} className={`flex items-center justify-between p-2.5 rounded-xl text-xs border ${currentScreen === s.id ? 'bg-[#B8BCE6] text-[#202747] font-semibold border-[#A0A9D1]' : 'bg-[#414A75] text-[#D6DAED] border-white/5'}`}>
                  <span>{language === 'ar' ? s.labelAr : s.labelEn}</span><span>#{idx + 1}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {allowScreenExplorer && (
          <div className="px-4 py-2.5 bg-[#252D52] border-t border-white/10 flex items-center justify-between text-[10px] text-[#D6DAED]">
            <button type="button" onClick={() => setShowScreenSwitcher(!showScreenSwitcher)} className="flex items-center gap-1.5 text-[#B8BCE6] bg-transparent border-none cursor-pointer"><LayoutGrid className="w-3.5 h-3.5" /> Screen Index</button>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setRecord(initialRecord); setInvitation(initialInvitation); navigateTo('auth', '/'); }} className="p-1 rounded text-white bg-transparent border-none"><RefreshCw className="w-3.5 h-3.5" /></button>
              <ChevronRight className="w-3.5 h-3.5" /><ChevronLeft className="w-3.5 h-3.5" />
            </div>
          </div>
        )}

        <VerifyPortalModal
          language={language}
          isOpen={showVerifyModal || currentScreen === 'verify_portal'}
          onClose={() => {
            setShowVerifyModal(false);
            if (currentScreen === 'verify_portal') {
              const defaultScreen = record?.status === 'active' ? 'review_controls' : 'p1_details';
              const defaultPath = record?.status === 'active' ? '/review' : '/';
              navigateTo(authUser ? defaultScreen : 'auth', authUser ? defaultPath : '/');
            }
          }}
          record={record}
          initialRef={currentScreen === 'verify_portal' ? getRouteState().certRef : undefined}
        />

        <AccountActionModals
          language={language}
          showExitModal={showExitModal}
          showDeleteModal={showDeleteModal}
          loading={accountActionLoading}
          hasActiveRelationship={hasActiveRelationship}
          error={accountActionError}
          onCloseExitModal={() => {
            if (!accountActionLoading) setShowExitModal(false);
          }}
          onCloseDeleteModal={() => {
            if (!accountActionLoading) setShowDeleteModal(false);
          }}
          onConfirmExitRelationship={handleConfirmExitRelationship}
          onConfirmDeleteAccount={handleConfirmDeleteAccount}
        />

        {showChangeRequestModal && (
          <ChangeRequestModal
            language={language}
            record={record}
            currentUserId={authUser?.id}
            changeRequests={changeRequests}
            onClose={() => setShowChangeRequestModal(false)}
            onSubmitChangeRequest={handleSubmitChangeRequest}
            onSavePersonalInfo={handleSavePersonalInfo}
            onApproveRequest={handleApproveChangeRequest}
            onDeclineRequest={handleDeclineChangeRequest}
          />
        )}

        {showBlockedModal && (
          <BlockedPeopleModal
            language={language}
            isOpen={showBlockedModal}
            onClose={() => setShowBlockedModal(false)}
          />
        )}

        {/* Informational Partner Notification Dialog (e.g. Relationship Ended) */}
        {activeNotification && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <div className="w-full max-w-sm rounded-2xl bg-[#414A75] border border-white/20 p-5 shadow-2xl relative text-start space-y-4 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                    {activeNotification.type === 'relationship_ended' ? (
                      <HeartOff className="w-4 h-4" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                    {activeNotification.type === 'relationship_ended'
                      ? (language === 'ar' ? 'إشعار إنهاء العلاقة' : 'Relationship Ended')
                      : activeNotification.type === 'invitation_accepted'
                      ? (language === 'ar' ? 'تم قبول الدعوة' : 'Invitation accepted')
                      : activeNotification.type === 'invitation_declined'
                      ? (language === 'ar' ? 'تم رفض الدعوة' : 'Invitation declined')
                      : (language === 'ar' ? 'إشعار' : 'Notification')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDismissNotification(activeNotification.id)}
                  className="p-1 text-[#D6DAED] hover:text-white rounded-lg bg-transparent border-none cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">
                  {language === 'ar' ? activeNotification.messageAr : activeNotification.messageEn}
                </p>
                {activeNotification.secondaryAr && (
                  <p className="text-xs text-[#D6DAED]">
                    {language === 'ar' ? activeNotification.secondaryAr : activeNotification.secondaryEn}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => void handleDismissNotification(activeNotification.id)}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#B8BCE6] to-[#B8BCE6] hover:from-[#C5C9EC] hover:to-[#C5C9EC] text-sm font-semibold text-[#202747] transition shadow-sm cursor-pointer active:scale-[0.98]"
                >
                  {language === 'ar' ? 'فهمت ذلك ومتابعة' : 'Understood'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showReminderSettingsModal && (
          <ReminderSettingsModal
            language={language}
            onClose={() => setShowReminderSettingsModal(false)}
            userEmailVerified={Boolean(auth?.currentUser?.emailVerified)}
          />
        )}
      </div>
    </div>
  );
}
