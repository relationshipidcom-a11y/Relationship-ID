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
import { authFetch } from './utils/api';
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
import { LayoutGrid, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

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
  if (inviteAuthMatch) return { screen: 'p2_auth', inviteId: inviteAuthMatch[1] };
  const inviteDetailsMatch = path.match(/^\/invite\/([a-zA-Z0-9_-]+)\/(?:details|complete)/);
  if (inviteDetailsMatch) return { screen: 'p2_details', inviteId: inviteDetailsMatch[1] };
  const inviteLandingMatch = path.match(/^\/invite\/([a-zA-Z0-9_-]+)/);
  if (inviteLandingMatch) return { screen: 'p2_landing', inviteId: inviteLandingMatch[1] };
  const certMatch = path.match(/^\/(?:cert|certificate)(?:\/([a-zA-Z0-9_-]+))?/);
  if (certMatch) return { screen: 'official_certificate', certRef: certMatch[1] };
  const verifyMatch = path.match(/^\/verify(?:\/([a-zA-Z0-9_-]+))?/);
  if (verifyMatch) return { screen: 'verify_portal', certRef: verifyMatch[1] };
  if (path === '/review') return { screen: 'review_controls' };
  if (path === '/waiting') return { screen: 'p1_waiting' };
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

const parseApiError = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
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
  const hasAutoNavigatedRef = useRef(false);

  const allowScreenExplorer = useMemo(
    () => import.meta.env.DEV && import.meta.env.VITE_ENABLE_SCREEN_EXPLORER === 'true',
    []
  );

  const navigateTo = (screen: ScreenId, path?: string) => {
    if (screen === 'p1_waiting') {
      hasAutoNavigatedRef.current = false;
    }
    setCurrentScreen(screen);
    if (path && window.location.pathname !== path) window.history.pushState(null, '', path);
  };

  const loadPrivateRecord = async (routeAfterLoad = false) => {
    if (!auth?.currentUser) return null;
    try {
      const response = await authFetch('/api/record');
      const data = await parseApiError(response);
      const loadedRecord = data.record as RelationshipRecord | null;
      const loadedInvitation = data.invitation as Invitation | null;

      if (loadedRecord) setRecord(loadedRecord);
      else setRecord(initialRecord);
      if (loadedInvitation) setInvitation(loadedInvitation);
      else setInvitation(initialInvitation);

      if (routeAfterLoad) {
        if (!loadedRecord) {
          navigateTo('p1_details', '/');
        } else if (loadedRecord.status === 'active') {
          navigateTo('review_controls', '/review');
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
      setAppError(error instanceof Error ? error.message : 'Unable to load relationship');
      return null;
    }
  };

  const loadInvitation = async (inviteId: string) => {
    try {
      const response = await fetch(`/api/invitations/${inviteId}`);
      const data = await parseApiError(response);
      if (data.invitation) setInvitation(data.invitation);
      if (data.record) setRecord(data.record);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Unable to load invitation');
    }
  };

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    if (auth) auth.languageCode = language;
  }, [language]);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(toAuthUser(user.uid, user.email, user.displayName));
        const route = getRouteState();
        if (!route.inviteId) void loadPrivateRecord(route.screen === 'auth');
      } else {
        setAuthUser(null);
        setRecord(initialRecord);
        setInvitation(initialInvitation);
        hasAutoNavigatedRef.current = false;
      }
    });
  }, []);

  useEffect(() => {
    const route = getRouteState();
    if (route.inviteId) void loadInvitation(route.inviteId);
    else if (auth?.currentUser) void loadPrivateRecord();
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const route = getRouteState();
      setCurrentScreen(route.screen);
      if (route.inviteId) void loadInvitation(route.inviteId);
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
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.activeRecordId && data.activeRecordId !== record.id) {
            void loadPrivateRecord();
          }
        }
      },
      (error) => {
        // Safe logger: permissions or network limitations do not crash the app
        console.debug('Realtime user subscription notice:', error.message);
      }
    );
    return () => unsub();
  }, [authUser?.id, record.id]);

  // Real-time listener for active relationship document (/relationships/{recordId})
  useEffect(() => {
    if (!db || !record.id || !authUser?.id) return;
    const unsub = onSnapshot(
      doc(db, 'relationships', record.id),
      (relSnap) => {
        if (relSnap.exists()) {
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
      }
    );
    return () => unsub();
  }, [db, record.id, authUser?.id, currentScreen]);

  // Real-time listener for invitation document (/invitations/{inviteId})
  useEffect(() => {
    if (!db || !invitation.id || !authUser?.id) return;
    const unsub = onSnapshot(
      doc(db, 'invitations', invitation.id),
      (invSnap) => {
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
    try {
      await signOut(auth);
      setAuthUser(null);
      setRecord(initialRecord);
      setInvitation(initialInvitation);
      navigateTo('auth', '/');
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Unable to sign out');
    }
  };

  const handleP1SaveAndNext = async (p1Data: PartnerData, relType: RelationshipType, startDateIso: string) => {
    setAppError('');
    const response = await authFetch('/api/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner1: p1Data, type: relType, startDate: startDateIso })
    });
    const data = await parseApiError(response);
    setRecord(data.record);
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
    if (data.record) setRecord(data.record);
    navigateTo('invite_success');
  };

  const handleCancelInvitation = async () => {
    if (!invitation.id) return;
    setAppError('');
    try {
      const response = await authFetch(`/api/invitations/${invitation.id}/cancel`, { method: 'POST' });
      const data = await parseApiError(response);
      if (data.invitation) setInvitation(data.invitation);
      if (data.record) setRecord(data.record);
      navigateTo('p1_invite_create');
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Unable to cancel invitation');
    }
  };

  const handleDeclineInvitation = async () => {
    if (!invitation.id) return;
    if (!auth?.currentUser) {
      setP2PendingAction('decline');
      navigateTo('p2_auth', `/invite/${invitation.id}/auth`);
      return;
    }
    const response = await authFetch(`/api/invitations/${invitation.id}/decline`, { method: 'POST' });
    const data = await parseApiError(response);
    setInvitation(data.invitation);
    navigateTo('p2_landing', `/invite/${invitation.id}`);
  };

  const handleP2Authenticated = async (user: AuthUser) => {
    setAuthUser(user);
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
    if (!invitation.id) throw new Error('INVITATION_NOT_LOADED');
    setAppError('');
    const response = await authFetch(`/api/invitations/${invitation.id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner2: p2Data })
    });
    const data = await parseApiError(response);
    setInvitation(data.invitation);
    setRecord(data.record);
    navigateTo('official_certificate', `/certificate/${data.record.verificationRef}`);
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
    { id: 'verify_portal', labelAr: '11. التحقق', labelEn: '11. Verify' }
  ];

  return (
    <div className="min-h-screen bg-[#110d21] text-slate-100 flex flex-col justify-start items-center p-0 sm:py-6 selection:bg-[#9b6682] selection:text-white">
      <div className="w-full max-w-[430px] min-h-[844px] bg-[#1a1530] sm:rounded-[36px] shadow-2xl flex flex-col relative overflow-hidden border-0 sm:border sm:border-white/15">
        <TopBar
          language={language}
          onToggleLanguage={handleToggleLanguage}
          currentScreen={currentScreen}
          onNavigate={(screen) => navigateTo(screen)}
          onOpenVerifyModal={() => setShowVerifyModal(true)}
          signedIn={Boolean(authUser)}
          onSignOut={() => void handleSignOut()}
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
            />
          )}

          {currentScreen === 'p1_details' && (
            <P1RegistrationScreen
              language={language}
              initialData={{ ...record.partner1, email: record.partner1.email || authUser?.email || '' }}
              relationshipType={record.type}
              initialStartDate={record.startDateIso || ''}
              onSaveAndNext={handleP1SaveAndNext}
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
              onDecline={() => void handleDeclineInvitation().catch((error) => setAppError(error instanceof Error ? error.message : 'Unable to decline invitation'))}
              onViewCertificate={() => navigateTo('official_certificate', `/certificate/${record.verificationRef}`)}
            />
          )}

          {currentScreen === 'p2_auth' && (
            <AuthScreen
              language={language}
              isP2InvitationFlow
              inviterName={invitation.inviterName}
              onAuthSuccess={(user) => void handleP2Authenticated(user)}
            />
          )}

          {currentScreen === 'p2_details' && (
            <P2RegistrationScreen
              language={language}
              record={{ ...record, partner2: { ...record.partner2, email: record.partner2.email || authUser?.email || '' } }}
              onAcceptRelationship={handleAcceptRelationship}
              onBackToInvite={() => navigateTo('p2_landing', `/invite/${invitation.id}`)}
            />
          )}

          {currentScreen === 'review_controls' && (
            <ReviewControlsScreen
              language={language}
              record={record}
              onUpdateSettings={(settings) => void handleUpdateSettings(settings).catch((error) => setAppError(error instanceof Error ? error.message : 'Unable to update settings'))}
              onEditDetails={() => navigateTo('p1_details')}
              onViewCertificate={() => navigateTo('official_certificate', `/certificate/${record.verificationRef}`)}
            />
          )}

          {currentScreen === 'official_certificate' && (
            <CertificateScreen language={language} record={record} onBackToControls={() => navigateTo('review_controls', '/review')} />
          )}

          {currentScreen === 'verify_portal' && (
            <div className="flex-1 p-4 flex flex-col items-center justify-center">
              <button type="button" onClick={() => setShowVerifyModal(true)} className="w-full py-4 px-4 rounded-xl bg-[#9b6682] text-white font-bold text-sm shadow-lg border border-white/20">
                {language === 'ar' ? 'فتح بوابة التحقق' : 'Open Verification Portal'}
              </button>
            </div>
          )}
        </div>

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
            if (currentScreen === 'verify_portal') navigateTo(authUser ? 'review_controls' : 'auth', authUser ? '/review' : '/');
          }}
          record={record}
          initialRef={currentScreen === 'verify_portal' ? getRouteState().certRef : undefined}
        />
      </div>
    </div>
  );
}
