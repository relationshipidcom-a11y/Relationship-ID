import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  Language,
  AuthUser,
  PartnerData,
  RelationshipType,
  RelationshipRecord,
  Invitation,
  CertificateSettings,
  ScreenId
} from './types';
import { auth, db } from './lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { authFetch, parseApiError, getLocalizedErrorMessage, ALLOWED_ERROR_CODES, withAppCheckHeaders } from './utils/api';
import { getAccountMenuItems, classifyRelationshipSnapshot } from './utils/relationshipState';
import { TopBar } from './components/TopBar';
import { AuthScreen } from './components/AuthScreen';
import { P1RegistrationScreen } from './components/P1RegistrationScreen';
import { P1InviteScreen } from './components/P1InviteScreen';
import { InviteSuccessScreen } from './components/InviteSuccessScreen';
import { WaitingScreen } from './components/WaitingScreen';
import { P2LandingScreen } from './components/P2LandingScreen';
import { P2RegistrationScreen } from './components/P2RegistrationScreen';
import { ReviewControlsScreen } from './components/ReviewControlsScreen';
import { CertificateScreen } from './components/CertificateScreen';
import { VerifyPortalModal } from './components/VerifyPortalModal';
import { AccountActionModals } from './components/AccountActionModals';
import { ChangeRequestModal } from './components/ChangeRequestModal';
import { BlockedPeopleModal } from './components/BlockedPeopleModal';
import { LegalPage } from './components/LegalPage';
import { LegalFooter } from './components/LegalFooter';
import { LEGAL_VERSION } from './content/legal';
import { ChangeRequest, AppNotification } from './types';
import { LayoutGrid, RefreshCw, ChevronLeft, ChevronRight, Bell, HeartOff, X } from 'lucide-react';

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

const getRouteState = (): { screen: ScreenId; inviteId?: string; certRef?: string } => {
  if (typeof window === 'undefined') return { screen: 'auth' };
  const path = window.location.pathname;
  const inviteAuthMatch = path.match(/^\/invite\/([a-zA-Z0-9_-]+)\/auth/);
  if (inviteAuthMatch && inviteAuthMatch[1] !== 'current') return { screen: 'p2_auth', inviteId: inviteAuthMatch[1] };
  const inviteDetailsMatch = path.match(/^\/invite\/([a-zA-Z0-9_-]+)\/(?:details|complete)/);
  if (inviteDetailsMatch && inviteDetailsMatch[1] !== 'current') return { screen: 'p2_details', inviteId: inviteDetailsMatch[1] };
  const inviteLandingMatch = path.match(/^\/invite\/([a-zA-Z0-9_-]+)/);
  if (inviteLandingMatch && inviteLandingMatch[1] !== 'current') return { screen: 'p2_landing', inviteId: inviteLandingMatch[1] };
  const certMatch = path.match(/^\/(?:cert|certificate)(?:\/([a-zA-Z0-9_-]+))?/);
  if (certMatch) return { screen: 'official_certificate', certRef: certMatch[1] };
  const verifyMatch = path.match(/^\/verify(?:\/([a-zA-Z0-9_-]+))?/);
  if (verifyMatch) return { screen: 'verify_portal', certRef: verifyMatch[1] };
  if (path === '/review') return { screen: 'review_controls' };
  if (path === '/waiting') return { screen: 'p1_waiting' };
  if (path === '/p2') return { screen: 'p2_details' };
  if (path === '/privacy') return { screen: 'privacy' };
  if (path === '/terms') return { screen: 'terms' };
  return { screen: 'auth' };
};

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
  const [record, setRecord] = useState<RelationshipRecord>(initialRecord);
  const [invitation, setInvitation] = useState<Invitation>(initialInvitation);
  const [showScreenSwitcher, setShowScreenSwitcher] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [appError, setAppError] = useState('');
  const [p2PendingAction, setP2PendingAction] = useState<'accept' | 'decline'>('accept');
  const [showExitModal, setShowExitModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [accountActionError, setAccountActionError] = useState('');
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);
  const hasAutoNavigatedRef = useRef(false);
  const activeAuthUidRef = useRef<string | null>(null);
  const clearedRecordIdRef = useRef<string | null>(null);
  const privateRecordRequestIdRef = useRef(0);
  const invitationRequestIdRef = useRef(0);
  const changeRequestsRequestIdRef = useRef(0);

  const allowScreenExplorer = useMemo(
    () => import.meta.env.DEV && import.meta.env.VITE_ENABLE_SCREEN_EXPLORER === 'true',
    []
  );

  const fetchNotifications = async () => {
    if (!auth?.currentUser) return;
    try {
      const res = await authFetch('/api/notifications');
      const data = await parseApiError(res);
      if (Array.isArray(data.notifications) && data.notifications.length > 0) {
        const latest = data.notifications[0];
        setActiveNotification(latest);
        if (latest.type === 'relationship_ended') {
          // Sync local state: clear active relationship
          setRecord((prev) => ({
            ...initialRecord,
            partner1: authUser?.id === prev.p2Uid ? prev.partner2 : prev.partner1
          }));
          setInvitation(initialInvitation);
        }
      }
    } catch {
      // ignore background notification poll errors
    }
  };

  const handleDismissNotification = async (notifId: string) => {
    try {
      await authFetch(`/api/notifications/${notifId}/dismiss`, { method: 'POST' });
    } catch {
      // ignore
    }
    setActiveNotification(null);
    navigateTo('p1_details', '/');
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
    const requestId = ++privateRecordRequestIdRef.current;
    activeAuthUidRef.current = requestUid;
    try {
      const response = await authFetch('/api/record');
      const data = await parseApiError(response);

      // Guard against stale async responses after sign-out, account switch, or superseded requests
      if (
        privateRecordRequestIdRef.current !== requestId ||
        activeAuthUidRef.current !== requestUid ||
        !auth?.currentUser ||
        auth.currentUser.uid !== requestUid
      ) {
        return null;
      }

      const loadedRecord = data.record as RelationshipRecord | null;
      const loadedInvitation = data.invitation as Invitation | null;

      if (loadedRecord) setRecord(loadedRecord);
      else setRecord(initialRecord);

      if (loadedInvitation) setInvitation(loadedInvitation);
      else setInvitation(initialInvitation);

      if (routeAfterLoad) {
        // Navigation guard: check activeAuthUidRef against auth.currentUser.uid before triggering navigateTo
        if (
          !auth?.currentUser ||
          activeAuthUidRef.current !== auth.currentUser.uid ||
          activeAuthUidRef.current !== requestUid
        ) {
          return null;
        }
        if (!loadedRecord) {
          navigateTo('p1_details', '/');
        } else if (loadedRecord.status === 'active') {
          if (loadedRecord.p2Uid === requestUid) {
            const p2InviteId = (loadedRecord.inviteId && loadedRecord.inviteId !== 'current')
              ? loadedRecord.inviteId
              : (loadedInvitation?.id && loadedInvitation.id !== 'current' ? loadedInvitation.id : '');
            navigateTo('p2_details', p2InviteId ? `/invite/${p2InviteId}/details` : '/p2');
          } else {
            navigateTo('p1_details', '/');
          }
        } else if (loadedRecord.status === 'pending_partner' && loadedInvitation?.id) {
          navigateTo('p1_waiting', '/waiting');
        } else if (loadedRecord.partner1.fullName) {
          navigateTo('p1_invite_create', '/');
        } else {
          navigateTo('p1_details', '/');
        }
      }
      return data;
    } catch (error) {
      if (
        privateRecordRequestIdRef.current === requestId &&
        activeAuthUidRef.current === requestUid &&
        auth?.currentUser?.uid === requestUid
      ) {
        setAppError(getLocalizedErrorMessage(error, language));
      }
      return null;
    }
  };

  const loadInvitation = async (inviteId: string, skipRecordOverwrite = false) => {
    if (!inviteId || inviteId === 'current') return;
    const requestUid = auth?.currentUser?.uid || null;
    const requestId = ++invitationRequestIdRef.current;
    try {
      const headers = await withAppCheckHeaders();
      const response = auth?.currentUser
        ? await authFetch(`/api/invitations/${inviteId}`)
        : await fetch(`/api/invitations/${inviteId}`, { headers });
      const data = await parseApiError(response);

      // Guard against stale asynchronous responses after sign-out, account switch, or superseded requests
      if (
        invitationRequestIdRef.current !== requestId ||
        activeAuthUidRef.current !== requestUid ||
        (auth?.currentUser?.uid || null) !== requestUid
      ) {
        return;
      }

      if (data.invitation) setInvitation(data.invitation);

      // A public invitation preview must never replace an authorized private active record
      if (!skipRecordOverwrite && data.record) {
        setRecord((prev) => {
          if (prev.status === 'active' && prev.p1Uid && (prev.p1Uid === requestUid || prev.p2Uid === requestUid)) {
            return prev;
          }
          return data.record;
        });
      }
    } catch (error) {
      if (
        invitationRequestIdRef.current === requestId &&
        activeAuthUidRef.current === requestUid &&
        (auth?.currentUser?.uid || null) === requestUid
      ) {
        setAppError(getLocalizedErrorMessage(error, language));
      }
    }
  };

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    if (auth) auth.languageCode = language;
  }, [language]);

  // Single coordinated authority for initial startup, login, and logout lifecycle
  useEffect(() => {
    if (!auth) {
      const route = getRouteState();
      if (route.inviteId && route.inviteId !== 'current') {
        void loadInvitation(route.inviteId);
      }
      return;
    }
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        activeAuthUidRef.current = user.uid;
        setAuthUser(toAuthUser(user.uid, user.email, user.displayName));
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
        }
      } else {
        activeAuthUidRef.current = null;
        privateRecordRequestIdRef.current += 1;
        invitationRequestIdRef.current += 1;
        setAuthUser(null);
        setRecord(initialRecord);
        setInvitation(initialInvitation);
        hasAutoNavigatedRef.current = false;
        const route = getRouteState();
        if (route.inviteId && route.inviteId !== 'current') {
          void loadInvitation(route.inviteId);
        }
      }
    });
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
          }
        });
      } else if (route.inviteId && route.inviteId !== 'current') {
        void loadInvitation(route.inviteId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Real-time listener for current user document (/users/{uid})
  useEffect(() => {
    if (!db || !authUser?.id) return;
    const unsub = onSnapshot(
      doc(db, 'users', authUser.id),
      (userSnap) => {
        // Navigation guard: check activeAuthUidRef against auth.currentUser.uid before updating state or triggering navigateTo
        if (
          !auth?.currentUser ||
          activeAuthUidRef.current !== auth.currentUser.uid ||
          auth.currentUser.uid !== authUser.id
        ) {
          return;
        }
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.activeRecordId && data.activeRecordId !== record.id) {
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
    return () => unsub();
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
    const unsub = onSnapshot(
      doc(db, 'relationships', currentRelId),
      (relSnap) => {
        // Navigation guard: check activeAuthUidRef against auth.currentUser.uid before updating state or triggering navigateTo
        if (
          !auth?.currentUser ||
          activeAuthUidRef.current !== auth.currentUser.uid ||
          auth.currentUser.uid !== authUser.id
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
        if (error.code !== 'permission-denied' && (error as any).code !== 'not-found') {
          return;
        }
        const requestUid = auth?.currentUser?.uid || null;
        if (!requestUid) return;
        const requestId = ++privateRecordRequestIdRef.current;
        void (async () => {
          try {
            const response = await authFetch('/api/record');
            const data = await parseApiError(response);
            if (
              privateRecordRequestIdRef.current !== requestId ||
              activeAuthUidRef.current !== requestUid ||
              !auth?.currentUser ||
              auth.currentUser.uid !== requestUid
            ) {
              return;
            }
            if (!data.record || data.record.id !== currentRelId) {
              resetAfterRelationshipCleared(currentRelId);
            } else {
              setRecord(data.record as RelationshipRecord);
            }
          } catch (serverErr) {
            setAppError(getLocalizedErrorMessage(serverErr, language));
          }
        })();
      }
    );
    return () => unsub();
  }, [db, record.id, authUser?.id, currentScreen, language]);

  // Real-time listener for invitation document (/invitations/{inviteId})
  useEffect(() => {
    if (!db || !invitation.id || !authUser?.id) return;
    const unsub = onSnapshot(
      doc(db, 'invitations', invitation.id),
      (invSnap) => {
        // Navigation guard: check activeAuthUidRef against auth.currentUser.uid before updating state or triggering navigateTo
        if (
          !auth?.currentUser ||
          activeAuthUidRef.current !== auth.currentUser.uid ||
          auth.currentUser.uid !== authUser.id
        ) {
          return;
        }
        if (invSnap.exists()) {
          const updated = invSnap.data() as Invitation;
          setInvitation(updated);
          if (updated.status === 'accepted' && currentScreen === 'p1_waiting') {
            if (!hasAutoNavigatedRef.current) {
              hasAutoNavigatedRef.current = true;
              navigateTo('review_controls', '/review');
            }
          } else if (updated.status === 'cancelled' && currentScreen === 'p1_waiting') {
            if (!hasAutoNavigatedRef.current) {
              hasAutoNavigatedRef.current = true;
              navigateTo('p1_invite_create', '/');
            }
          }
        }
      },
      (error) => {
        console.debug('Realtime invitation subscription notice:', error.message);
      }
    );
    return () => unsub();
  }, [db, invitation.id, authUser?.id, currentScreen]);

  const handleToggleLanguage = () => setLanguage((prev) => (prev === 'ar' ? 'en' : 'ar'));

  const handleNormalAuthSuccess = (user: AuthUser) => {
    setAuthUser(user);
    void loadPrivateRecord(true);
  };

  const handleSignOut = async () => {
    if (!auth) return;
    setAppError('');
    activeAuthUidRef.current = null;
    privateRecordRequestIdRef.current += 1;
    invitationRequestIdRef.current += 1;
    changeRequestsRequestIdRef.current += 1;
    try {
      await signOut(auth);
      setAuthUser(null);
      setRecord(initialRecord);
      setInvitation(initialInvitation);
      setChangeRequests([]);
      setActiveNotification(null);
      navigateTo('auth', '/');
    } catch (error) {
      setAppError(getLocalizedErrorMessage(error, language));
    }
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
    setAccountActionLoading(true);
    setAccountActionError('');
    privateRecordRequestIdRef.current += 1;
    invitationRequestIdRef.current += 1;
    changeRequestsRequestIdRef.current += 1;
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
      setShowExitModal(false);
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
    setAccountActionLoading(true);
    setAccountActionError('');
    privateRecordRequestIdRef.current += 1;
    invitationRequestIdRef.current += 1;
    changeRequestsRequestIdRef.current += 1;
    try {
      const res = await authFetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipId: record.id })
      });
      const data = await parseApiError(res);
      privateRecordRequestIdRef.current += 1;
      invitationRequestIdRef.current += 1;
      changeRequestsRequestIdRef.current += 1;
      let noticeText = '';
      if (res.status === 202 && data?.status === 'DELETION_PENDING') {
        noticeText = language === 'ar' ? (data.messageAr || data.messageEn || '') : (data.messageEn || data.messageAr || '');
      }
      setShowDeleteModal(false);
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

  const handleDownloadMyData = async () => {
    setAppError('');
    try {
      const res = await authFetch('/api/account/export');
      const data = await parseApiError(res);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const yyyyMmDd = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relationship-id-export-${yyyyMmDd}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setAppError(getLocalizedErrorMessage(err, language));
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

  const handleSavePersonalInfo = async (personalData: { socialHandle?: string; fullNameEn?: string; whatsappNumber?: string; whatsappCountry?: string }) => {
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
    setAppError('');
    const response = await authFetch('/api/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner1: p1Data,
        type: relType,
        startDate: startDateIso,
        acceptedLegalVersion: LEGAL_VERSION
      })
    });
    const data = await parseApiError(response);
    applyServerRecord(data.record);
    navigateTo('p1_invite_create');
  };

  const handleCreateInvite = async (p2Data: {
    partner2Name: string;
    partner2Email?: string;
    partner2Phone?: string;
    partner2PhoneCountry?: string;
    partner2Whatsapp?: string;
    partner2WhatsappCountry?: string;
  }) => {
    setAppError('');
    const response = await authFetch('/api/invite/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p2Data)
    });
    const data = await parseApiError(response);
    setInvitation(data.invitation);
    if (data.record) applyServerRecord(data.record);
    navigateTo('invite_success');
  };

  const handleCancelInvitation = async () => {
    if (!invitation.id) return;
    setAppError('');
    try {
      const response = await authFetch(`/api/invitations/${invitation.id}/cancel`, { method: 'POST' });
      const data = await parseApiError(response);
      if (data.invitation) setInvitation(data.invitation);
      if (data.record) applyServerRecord(data.record);
      navigateTo('p1_invite_create');
    } catch (error) {
      setAppError(getLocalizedErrorMessage(error, language));
    }
  };

  const handleDeclineInvitation = async (block = false) => {
    if (!invitation.id) return;
    if (!auth?.currentUser) {
      setP2PendingAction('decline');
      navigateTo('p2_auth', `/invite/${invitation.id}/auth`);
      return;
    }
    const response = await authFetch(`/api/invitations/${invitation.id}/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block })
    });
    const data = await parseApiError(response);
    setInvitation(data.invitation);
    navigateTo('p2_landing', `/invite/${invitation.id}`);
  };

  const handleP2Authenticated = async (user: AuthUser) => {
    setAuthUser(user);
    if (invitation.id && invitation.id !== 'current') {
      try {
        await loadInvitation(invitation.id);
      } catch (err) {
        console.error('Failed to load private invitation details after login', err);
      }
    }
    if (p2PendingAction === 'decline') {
      try {
        await handleDeclineInvitation();
      } finally {
        setP2PendingAction('accept');
      }
      return;
    }
    navigateTo('p2_details', `/invite/${invitation.id}/complete`);
  };

  const handleAcceptRelationship = async (p2Data: PartnerData) => {
    if (!auth?.currentUser) throw new Error('AUTH_REQUIRED');
    if (!invitation.id) throw new Error('INVITATION_NOT_LOADED');

    const requestUid = auth.currentUser.uid;
    const targetInviteId = invitation.id;
    setAppError('');

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

  return (
    <div className="min-h-screen bg-[#110d21] text-slate-100 flex flex-col justify-start items-center p-0 sm:py-6 selection:bg-[#9b6682] selection:text-white">
      <div className="w-full max-w-[430px] min-h-[844px] bg-[#1a1530] sm:rounded-[36px] shadow-2xl flex flex-col relative overflow-hidden border-0 sm:border sm:border-white/15">
        <TopBar
          language={language}
          onToggleLanguage={handleToggleLanguage}
          currentScreen={currentScreen}
          onNavigate={(screen) => navigateTo(screen)}
          onOpenVerifyModal={() => setShowVerifyModal(true)}
          onOpenBlockedModal={authUser ? () => setShowBlockedModal(true) : undefined}
          signedIn={Boolean(authUser)}
          onSignOut={() => void handleSignOut()}
          onAdjustInfo={handleAdjustInfo}
          onHome={authUser ? handleGoHome : undefined}
          isAtHome={isAtHome}
          onExitRelationship={accountMenuItems.endRelationship ? () => {
            setAccountActionError('');
            setShowExitModal(true);
          } : undefined}
          onDeleteAccount={accountMenuItems.deleteAccount ? () => {
            setAccountActionError('');
            setShowDeleteModal(true);
          } : undefined}
          onDownloadMyData={accountMenuItems.deleteAccount ? handleDownloadMyData : undefined}
        />

        {appError && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-xl border border-rose-400/30 bg-rose-500/10 text-[10px] text-rose-200 break-words" dir="ltr">
            {appError}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between overflow-y-auto">
          {currentScreen === 'auth' && (
            <AuthScreen
              language={language}
              onAuthSuccess={handleNormalAuthSuccess}
              onNavigate={(screen) => navigateTo(screen, screen === 'privacy' ? '/privacy' : screen === 'terms' ? '/terms' : undefined)}
            />
          )}

          {currentScreen === 'p1_details' && (
            <P1RegistrationScreen
              language={language}
              initialData={{ ...record.partner1, email: record.partner1.email || authUser?.email || '' }}
              relationshipType={record.type}
              initialStartDate={record.startDateIso || ''}
              onSaveAndNext={handleP1SaveAndNext}
              isActive={hasActiveRelationship}
              record={record}
              onRequestChange={handleAdjustInfo}
              onViewControls={() => navigateTo('review_controls', '/review')}
              onOpenPrivacy={() => navigateTo('privacy', '/privacy')}
              onOpenTerms={() => navigateTo('terms', '/terms')}
            />
          )}

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
            <P2LandingScreen
              language={language}
              invitation={invitation}
              onAccept={() => {
                setP2PendingAction('accept');
                if (auth?.currentUser) navigateTo('p2_details', `/invite/${invitation.id}/complete`);
                else navigateTo('p2_auth', `/invite/${invitation.id}/auth`);
              }}
              onDecline={(block) => void handleDeclineInvitation(block).catch((error) => setAppError(getLocalizedErrorMessage(error, language)))}
              onViewCertificate={hasActiveRelationship ? () => navigateTo('official_certificate', `/certificate/${record.verificationRef}`) : undefined}
              onNavigate={(screen) => navigateTo(screen, screen === 'privacy' ? '/privacy' : screen === 'terms' ? '/terms' : undefined)}
            />
          )}

          {currentScreen === 'p2_auth' && (
            <AuthScreen
              language={language}
              isP2InvitationFlow
              inviterName={invitation.inviterName}
              onAuthSuccess={(user) => void handleP2Authenticated(user)}
              onNavigate={(screen) => navigateTo(screen, screen === 'privacy' ? '/privacy' : screen === 'terms' ? '/terms' : undefined)}
            />
          )}

          {currentScreen === 'p2_details' && (
            <P2RegistrationScreen
              language={language}
              record={{ ...record, partner2: { ...record.partner2, email: record.partner2.email || authUser?.email || '' } }}
              onAcceptRelationship={handleAcceptRelationship}
              onRequestChange={handleAdjustInfo}
              onViewControls={() => navigateTo('review_controls', '/review')}
              onOpenPrivacy={() => navigateTo('privacy', '/privacy')}
              onOpenTerms={() => navigateTo('terms', '/terms')}
            />
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
              <CertificateScreen language={language} record={record} onHome={handleGoHome} />
            ) : (
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
                <p className="text-xs text-[#b6afd4]">
                  {language === 'ar' ? 'لا توجد شهادة نشطة لعرضها.' : 'No active certificate to display.'}
                </p>
                <button
                  type="button"
                  onClick={handleGoHome}
                  className="mt-4 px-4 py-2 rounded-xl bg-[#9b6682] text-white text-xs font-semibold cursor-pointer"
                >
                  {language === 'ar' ? 'الرئيسية' : 'Home'}
                </button>
              </div>
            )
          )}

          {currentScreen === 'verify_portal' && (
            <div className="flex-1 p-4 flex flex-col items-center justify-center">
              <button type="button" onClick={() => setShowVerifyModal(true)} className="w-full py-4 px-4 rounded-xl bg-[#9b6682] text-white font-bold text-sm shadow-lg border border-white/20">
                {language === 'ar' ? 'فتح بوابة التحقق' : 'Open Verification Portal'}
              </button>
            </div>
          )}

          {(currentScreen === 'privacy' || currentScreen === 'terms') && (
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
          )}
        </div>

        <LegalFooter
          language={language}
          onNavigate={(screen) => navigateTo(screen, screen === 'privacy' ? '/privacy' : '/terms')}
        />

        {allowScreenExplorer && showScreenSwitcher && (
          <aside aria-label="Screen explorer" className="absolute inset-x-0 bottom-0 top-[65px] bg-[#141124]/95 backdrop-blur-md z-40 p-4 overflow-y-auto flex flex-col justify-between border-t border-white/10">
            <div className="grid grid-cols-1 gap-1.5">
              {screensOrder.map((s, idx) => (
                <button key={s.id} type="button" onClick={() => { navigateTo(s.id); setShowScreenSwitcher(false); }} className={`flex items-center justify-between p-2.5 rounded-xl text-xs border ${currentScreen === s.id ? 'bg-[#9b6682] text-white border-white/30' : 'bg-[#211c38] text-[#b6afd4] border-white/5'}`}>
                  <span>{language === 'ar' ? s.labelAr : s.labelEn}</span><span>#{idx + 1}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {allowScreenExplorer && (
          <div className="px-4 py-2.5 bg-[#141124] border-t border-white/10 flex items-center justify-between text-[10px] text-[#b6afd4]">
            <button type="button" onClick={() => setShowScreenSwitcher(!showScreenSwitcher)} className="flex items-center gap-1.5 text-[#f3c4db] bg-transparent border-none cursor-pointer"><LayoutGrid className="w-3.5 h-3.5" /> Screen Index</button>
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
            <div className="w-full max-w-sm rounded-2xl bg-[#1a1530] border border-white/20 p-5 shadow-2xl relative text-start space-y-4 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                    <HeartOff className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                    {language === 'ar' ? 'إشعار إنهاء العلاقة' : 'Relationship Ended'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDismissNotification(activeNotification.id)}
                  className="p-1 text-[#b6afd4] hover:text-white rounded-lg bg-transparent border-none cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">
                  {language === 'ar' ? activeNotification.messageAr : activeNotification.messageEn}
                </p>
                {activeNotification.secondaryAr && (
                  <p className="text-xs text-[#b6afd4]">
                    {language === 'ar' ? activeNotification.secondaryAr : activeNotification.secondaryEn}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => void handleDismissNotification(activeNotification.id)}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#9b6682] to-[#7d4865] text-xs font-semibold text-white transition shadow-sm cursor-pointer hover:opacity-95 active:scale-[0.98]"
                >
                  {language === 'ar' ? 'فهمت ذلك ومتابعة' : 'Understood'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
