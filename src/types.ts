export type Language = 'ar' | 'en';

export type RelationshipType = 'marriage' | 'engagement' | 'dating';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

export interface PartnerData {
  fullName: string;
  fullNameEn?: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  email: string;
  phoneCountry: string;
  phoneNumber: string;
  phoneE164?: string;
  phoneVerified?: boolean;
  whatsappCountry?: string;
  whatsappNumber?: string;
  whatsappE164?: string;
  whatsappTrusted?: boolean;
  socialHandle?: string;
}

export interface CertificateSettings {
  showSocialHandles: boolean;
  showContactDetails: boolean;
  showQrMatrix: boolean;
}

export interface RelationshipRecord {
  id: string;
  recordNumber: string;
  verificationRef: string;
  issuedDate: string;
  issuedDateAr: string;
  type: RelationshipType;
  startDate: string;
  startDateAr: string;
  startDateIso?: string;
  partner1: PartnerData;
  partner2: PartnerData;
  status: 'draft' | 'pending_partner' | 'active' | 'cancelled' | 'ended';
  activeSinceDays: number;
  settings: CertificateSettings;
  inviteId?: string;
  createdAt: string;
  p1Uid?: string;
  p2Uid?: string | null;
}

export interface Invitation {
  id: string;
  recordId: string;
  inviterName: string;
  partner2Name: string;
  partner2Email?: string;
  partner2Phone?: string;
  partner2PhoneCountry?: string;
  partner2Whatsapp?: string;
  partner2WhatsappCountry?: string;
  relationshipType: RelationshipType;
  startDate: string;
  startDateAr: string;
  startDateIso?: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  reminderCount: number;
  p1Uid?: string;
  p2Uid?: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  token?: string;
}

export type ScreenId =
  | 'auth'
  | 'p1_details'
  | 'p1_invite_create'
  | 'invite_success'
  | 'p1_waiting'
  | 'p2_landing'
  | 'p2_auth'
  | 'p2_details'
  | 'review_controls'
  | 'official_certificate'
  | 'verify_portal';
