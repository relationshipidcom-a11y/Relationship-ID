import { auth, withAppCheckHeaders } from '../lib/firebase';
import { Language } from '../types';

export { withAppCheckHeaders };

export interface DiagnosticErrorEntry {
  status: number;
  routeTemplate: string;
  errorCode: string;
}

export const ALLOWED_ERROR_CODES = new Set([
  'AUTH_REQUIRED',
  'INVALID_AUTH_TOKEN',
  'UNAUTHORIZED',
  'DATABASE_UNAVAILABLE',
  'INVALID_RELATIONSHIP_DRAFT',
  'INVALID_START_DATE',
  'VERIFIED_PHONE_REQUIRED',
  'ACTIVE_RELATIONSHIP_LOCKED',
  'RELATIONSHIP_DRAFT_NOT_FOUND',
  'ACTIVE_RELATIONSHIP_EXISTS',
  'PARTNER_NAME_REQUIRED',
  'PARTNER_CONTACT_REQUIRED',
  'PENDING_INVITATION_EXISTS',
  'INVITATION_NOT_FOUND',
  'INVITATION_EXPIRED',
  'INVITATION_ALREADY_ACCEPTED',
  'INVITATION_CANCELLED',
  'INVITATION_DECLINED',
  'INVITATION_NOT_LOADED',
  'PARTNER2_PROFILE_REQUIRED',
  'CANNOT_ACCEPT_OWN_INVITE',
  'ALREADY_IN_ACTIVE_RELATIONSHIP',
  'P2_ALREADY_IN_ACTIVE_RELATIONSHIP',
  'CONTACT_IN_ACTIVE_RELATIONSHIP',
  'RELATIONSHIP_NOT_FOUND',
  'ACTIVE_RELATIONSHIP_NOT_FOUND',
  'NOT_RELATIONSHIP_PARTICIPANT',
  'NO_PARTNER_TO_APPROVE',
  'INVALID_REQUEST_PARAMETERS',
  'INVALID_RELATIONSHIP_TYPE',
  'VALUE_UNCHANGED',
  'CANNOT_EDIT_PARTNER_INFO',
  'NAME_REQUIRED',
  'INVALID_CHANGE_FIELD',
  'PENDING_CHANGE_REQUEST_EXISTS',
  'CHANGE_REQUEST_NOT_FOUND',
  'CANNOT_APPROVE_OWN_REQUEST',
  'CANNOT_DECLINE_OWN_REQUEST',
  'CHANGE_REQUEST_ALREADY_RESOLVED',
  'RELATIONSHIP_MISMATCH',
  'NOTIFICATION_NOT_FOUND',
  'ACCEPTANCE_FAILED_OR_INACTIVE',
  'ACCOUNT_DELETION_PENDING',
  'RELATIONSHIP_DELETION_PENDING',
  'INVITATION_IDENTITY_MISMATCH',
  'CANNOT_ACCEPT_OWN_INVITATION',
  'INVITER_CANNOT_DECLINE_AS_P2',
  'NOT_INVITATION_RECIPIENT',
  'AUTH_DELETION_FAILED',
  'WHATSAPP_VERIFY_UNAVAILABLE',
  'WHATSAPP_VERIFY_RATE_LIMITED',
  'INVALID_VERIFICATION_CODE',
  'INVALID_CODE',
  'RATE_LIMITED',
  'DATABASE_ERROR',
  'INVALID_REQUEST',
  'NOT_FOUND',
  'CONFLICT',
  'SERVER_ERROR',
  'API_ERROR'
]);

export const ERROR_MESSAGES: Record<string, { en: string; ar: string }> = {
  AUTH_REQUIRED: {
    en: 'Authentication required. Please sign in.',
    ar: 'تسجيل الدخول مطلوب. يرجى تسجيل الدخول.'
  },
  INVALID_AUTH_TOKEN: {
    en: 'Session expired. Please sign in again.',
    ar: 'انتهت الجلسة. يرجى تسجيل الدخول مجدداً.'
  },
  UNAUTHORIZED: {
    en: 'You are not authorized to perform this action.',
    ar: 'غير مصرح لك بإجراء هذه العملية.'
  },
  DATABASE_UNAVAILABLE: {
    en: 'Service is temporarily unavailable. Please try again later.',
    ar: 'الخدمة غير متوفرة حالياً. يرجى المحاولة لاحقاً.'
  },
  VERIFIED_PHONE_REQUIRED: {
    en: 'A verified phone number is required.',
    ar: 'رقم هاتف موثّق مطلوب للمتابعة.'
  },
  ACTIVE_RELATIONSHIP_LOCKED: {
    en: 'Active relationship is locked from direct edits.',
    ar: 'سجل العلاقة النشط مقفل ولا يمكن تعديله مباشرة.'
  },
  ACTIVE_RELATIONSHIP_EXISTS: {
    en: 'An active relationship already exists.',
    ar: 'يوجد سجل علاقة نشط بالفعل.'
  },
  RELATIONSHIP_DRAFT_NOT_FOUND: {
    en: 'Draft relationship not found.',
    ar: 'لم يتم العثور على مسودة العلاقة.'
  },
  INVITATION_NOT_FOUND: {
    en: 'Invitation not found or no longer valid.',
    ar: 'الدعوة غير موجودة أو لم تعد صالحة.'
  },
  INVITATION_EXPIRED: {
    en: 'This invitation has expired.',
    ar: 'انتهت صلاحية هذه الدعوة.'
  },
  INVITATION_NOT_LOADED: {
    en: 'Invitation not loaded.',
    ar: 'لم يتم تحميل بيانات الدعوة.'
  },
  CANNOT_ACCEPT_OWN_INVITE: {
    en: 'You cannot accept your own invitation.',
    ar: 'لا يمكنك قبول دعوتك الخاصة.'
  },
  ALREADY_IN_ACTIVE_RELATIONSHIP: {
    en: 'You already have an active relationship record.',
    ar: 'لديك سجل علاقة نشط بالفعل.'
  },
  P2_ALREADY_IN_ACTIVE_RELATIONSHIP: {
    en: 'This user is already associated with an active relationship.',
    ar: 'هذا المستخدم مرتبط بسجل علاقة نشط بالفعل.'
  },
  CONTACT_IN_ACTIVE_RELATIONSHIP: {
    en: 'This contact is already associated with an active relationship.',
    ar: 'جهة الاتصال هذه مرتبطة بسجل علاقة نشط بالفعل.'
  },
  PARTNER_NAME_REQUIRED: {
    en: 'Partner name is required.',
    ar: 'اسم الشريك مطلوب.'
  },
  PARTNER_CONTACT_REQUIRED: {
    en: 'Partner email or phone number is required.',
    ar: 'البريد الإلكتروني أو رقم هاتف الشريك مطلوب.'
  },
  INVALID_START_DATE: {
    en: 'Please provide a valid relationship start date.',
    ar: 'يرجى إدخال تاريخ بداية صالح للعلاقة.'
  },
  NOT_RELATIONSHIP_PARTICIPANT: {
    en: 'You are not a participant in this relationship.',
    ar: 'أنت لست طرفاً في هذه العلاقة.'
  },
  ACTIVE_RELATIONSHIP_NOT_FOUND: {
    en: 'Active relationship not found.',
    ar: 'لم يتم العثور على سجل علاقة نشط.'
  },
  PENDING_CHANGE_REQUEST_EXISTS: {
    en: 'A pending change request is already awaiting review.',
    ar: 'يوجد طلب تعديل قيد الانتظار بالفعل.'
  },
  CHANGE_REQUEST_NOT_FOUND: {
    en: 'Change request not found.',
    ar: 'طلب التعديل غير موجود.'
  },
  CANNOT_APPROVE_OWN_REQUEST: {
    en: 'You cannot approve your own change request.',
    ar: 'لا يمكنك قبول طلب التعديل الذي أنشأته.'
  },
  CANNOT_DECLINE_OWN_REQUEST: {
    en: 'You cannot decline your own change request.',
    ar: 'لا يمكنك رفض طلب التعديل الذي أنشأته.'
  },
  ACCEPTANCE_FAILED_OR_INACTIVE: {
    en: 'Relationship acceptance could not be completed.',
    ar: 'تعذر إتمام قبول العلاقة.'
  },
  ACCOUNT_DELETION_PENDING: {
    en: 'Your account deletion is currently being processed.',
    ar: 'يجري حالياً معالجة حذف الحساب.'
  },
  RELATIONSHIP_DELETION_PENDING: {
    en: 'This relationship is currently being ended.',
    ar: 'يجري حالياً إنهاء هذه العلاقة.'
  },
  INVITATION_IDENTITY_MISMATCH: {
    en: 'You are not the intended recipient of this invitation.',
    ar: 'أنت لست المستلم المقصود لهذه الدعوة.'
  },
  CANNOT_ACCEPT_OWN_INVITATION: {
    en: 'You cannot accept your own invitation.',
    ar: 'لا يمكنك قبول دعوتك الخاصة.'
  },
  INVITER_CANNOT_DECLINE_AS_P2: {
    en: 'You cannot decline your own invitation.',
    ar: 'لا يمكنك رفض دعوتك الخاصة.'
  },
  NOT_INVITATION_RECIPIENT: {
    en: 'You are not authorized to respond to this invitation.',
    ar: 'غير مصرح لك بالرد على هذه الدعوة.'
  },
  AUTH_DELETION_FAILED: {
    en: 'Account authentication deletion failed. Please retry.',
    ar: 'فشل حذف مصادقة الحساب. يرجى إعادة المحاولة.'
  },
  WHATSAPP_VERIFY_UNAVAILABLE: {
    en: 'WhatsApp verification is currently unavailable.',
    ar: 'خدمة التحقق من واتساب غير متاحة حالياً.'
  },
  WHATSAPP_VERIFY_RATE_LIMITED: {
    en: 'Too many verification attempts. Please try again in an hour.',
    ar: 'محاولات تحقق كثيرة جداً. يرجى المحاولة بعد ساعة.'
  },
  INVALID_VERIFICATION_CODE: {
    en: 'Invalid or expired verification code.',
    ar: 'رمز التحقق غير صالح أو منتهي الصلاحية.'
  },
  INVALID_CODE: {
    en: 'Invalid or expired verification code.',
    ar: 'رمز التحقق غير صالح أو منتهي الصلاحية.'
  },
  RATE_LIMITED: {
    en: 'Too many requests. Please wait a minute and try again.',
    ar: 'طلبات كثيرة. يرجى الانتظار دقيقة ثم المحاولة مرة أخرى.'
  },
  DATABASE_ERROR: {
    en: 'A database error occurred. Please try again.',
    ar: 'حدث خطأ في قاعدة البيانات. يرجى المحاولة لاحقاً.'
  },
  NOT_FOUND: {
    en: 'Requested resource not found.',
    ar: 'العنصر المطلوب غير موجود.'
  },
  CONFLICT: {
    en: 'A conflict occurred with the current state.',
    ar: 'حدث تعارض مع الحالة الحالية.'
  },
  INVALID_REQUEST: {
    en: 'Invalid request. Please check your information.',
    ar: 'طلب غير صالح. يرجى التحقق من البيانات.'
  },
  SERVER_ERROR: {
    en: 'A server error occurred. Please try again.',
    ar: 'حدث خطأ في الخادم. يرجى المحاولة لاحقاً.'
  },
  API_ERROR: {
    en: 'An error occurred. Please try again.',
    ar: 'حدث خطأ. يرجى المحاولة لاحقاً.'
  }
};

const MAX_BUFFER_SIZE = 25;
const diagnosticBuffer: DiagnosticErrorEntry[] = [];

/**
 * Maps a concrete request URL or path to a static route template.
 * This guarantees no dynamic IDs, tokens, or query strings enter the diagnostics buffer.
 */
export function getRouteTemplate(urlOrPath: string): string {
  if (!urlOrPath) return '/api/unknown';
  let path = '';
  try {
    const parsed = new URL(urlOrPath, 'http://localhost');
    path = parsed.pathname;
  } catch {
    path = (urlOrPath.split('?')[0] || '').trim();
  }

  if (/^\/api\/invitations\/[^/]+\/accept\/?$/.test(path)) return '/api/invitations/:inviteId/accept';
  if (/^\/api\/invitations\/[^/]+\/cancel\/?$/.test(path)) return '/api/invitations/:inviteId/cancel';
  if (/^\/api\/invitations\/[^/]+\/decline\/?$/.test(path)) return '/api/invitations/:inviteId/decline';
  if (/^\/api\/invitations\/[^/]+\/?$/.test(path)) return '/api/invitations/:inviteId';
  if (/^\/api\/change-requests\/[^/]+\/approve\/?$/.test(path)) return '/api/change-requests/:requestId/approve';
  if (/^\/api\/change-requests\/[^/]+\/decline\/?$/.test(path)) return '/api/change-requests/:requestId/decline';
  if (/^\/api\/notifications\/[^/]+\/dismiss\/?$/.test(path)) return '/api/notifications/:notifId/dismiss';
  if (/^\/api\/verify\/[^/]+\/?$/.test(path)) return '/api/verify/:ref';
  if (path === '/api/record/settings') return '/api/record/settings';
  if (path === '/api/record') return '/api/record';
  if (path === '/api/invite/create') return '/api/invite/create';
  if (path === '/api/change-requests') return '/api/change-requests';
  if (path === '/api/profile/me') return '/api/profile/me';
  if (path === '/api/relationship/end') return '/api/relationship/end';
  if (path === '/api/account/export') return '/api/account/export';
  if (path === '/api/account/delete') return '/api/account/delete';
  if (path === '/api/notifications') return '/api/notifications';
  if (path === '/api/whatsapp/verify/status') return '/api/whatsapp/verify/status';
  if (path === '/api/whatsapp/verify/start') return '/api/whatsapp/verify/start';
  if (path === '/api/whatsapp/verify/check') return '/api/whatsapp/verify/check';
  if (path === '/api/health') return '/api/health';
  if (path.startsWith('/api/')) return '/api/other';
  return '/api/unknown';
}

function getStatusFallbackCode(status: number): string {
  if (status === 400) return 'INVALID_REQUEST';
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status >= 500 && status < 600) return 'SERVER_ERROR';
  return 'API_ERROR';
}

/**
 * Appends a minimal, structured diagnostic entry to the in-memory ring buffer.
 */
export function recordDiagnosticError(entry: DiagnosticErrorEntry): void {
  if (diagnosticBuffer.length >= MAX_BUFFER_SIZE) {
    diagnosticBuffer.shift();
  }
  diagnosticBuffer.push(Object.freeze({ ...entry }));
}

/**
 * Retrieves a copy of the diagnostic entries.
 */
export function getDiagnosticLogs(): readonly DiagnosticErrorEntry[] {
  return [...diagnosticBuffer];
}

/**
 * Clears the diagnostic error buffer.
 */
export function clearDiagnosticLogs(): void {
  diagnosticBuffer.length = 0;
}

/**
 * Translates an allowlisted error code or Error object into a safe, localized message.
 */
export function getLocalizedErrorMessage(codeOrError: unknown, language: Language = 'ar'): string {
  const code = typeof codeOrError === 'string'
    ? codeOrError
    : codeOrError instanceof Error
    ? codeOrError.message
    : 'API_ERROR';

  const entry = ERROR_MESSAGES[code];
  if (entry) {
    return entry[language] || entry.en;
  }
  return ERROR_MESSAGES.API_ERROR[language] || ERROR_MESSAGES.API_ERROR.en;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (!auth?.currentUser) {
    throw new Error('AUTH_REQUIRED');
  }

  const token = await auth.currentUser.getIdToken(true);
  const headers = await withAppCheckHeaders(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}

/**
 * Parses JSON API responses and enforces allowlisted, privacy-safe error codes.
 * Logs minimal, structured diagnostics (status, route template, allowlisted code) to a client-side buffer.
 * Never leaks raw server details, response bodies, arbitrary strings, or PII.
 */
export async function parseApiError(response: Response, explicitTemplate?: string): Promise<any> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawError = typeof data?.error === 'string' ? data.error.trim() : '';
    const errorCode = ALLOWED_ERROR_CODES.has(rawError)
      ? rawError
      : getStatusFallbackCode(response.status);

    const routeTemplate = explicitTemplate || getRouteTemplate(response.url);

    recordDiagnosticError({
      status: response.status,
      routeTemplate,
      errorCode
    });

    throw new Error(errorCode);
  }
  return data;
}


