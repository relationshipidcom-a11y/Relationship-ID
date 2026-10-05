import crypto from 'node:crypto';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { countryFromLegacyValue } from './phone';

export interface NormalizedContactResult {
  canonical: string;
  isValid: boolean;
}

export interface ContactReservationDoc {
  recordId: string;
  contactHash: string;
  updatedAt: string;
}

/**
 * Normalizes an email address according to canonical business rules:
 * - Genuinely absent (null, undefined, or empty string): valid and canonical is empty string.
 * - Non-empty string: trimmed, lowercased, and verified against standard email syntax.
 * - Invalid format: isValid is false.
 */
export function normalizeCanonicalEmail(email?: string | null): NormalizedContactResult {
  if (email === undefined || email === null) {
    return { canonical: '', isValid: true };
  }
  const trimmed = email.trim();
  if (trimmed === '') {
    return { canonical: '', isValid: true };
  }
  // Standard RFC 5322 simplified email check: local@domain.tld without whitespace
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { canonical: '', isValid: false };
  }
  return { canonical: trimmed.toLowerCase(), isValid: true };
}

/**
 * Normalizes a phone or WhatsApp number according to canonical business rules:
 * - Genuinely absent (null, undefined, or empty string): valid and canonical is empty string.
 * - Non-empty string: parsed using libphonenumber-js with the specified country code.
 * - Saudi national numbers (e.g. 055...) and international numbers (+96655...) resolve to identical E.164.
 * - Invalid numbers: isValid is false.
 */
export function normalizeCanonicalPhone(
  rawInput?: string | null,
  countryStr?: string | null
): NormalizedContactResult {
  if (rawInput === undefined || rawInput === null) {
    return { canonical: '', isValid: true };
  }
  const trimmed = rawInput.trim();
  if (trimmed === '') {
    return { canonical: '', isValid: true };
  }

  try {
    const iso: CountryCode = countryStr ? countryFromLegacyValue(countryStr) : 'SA';
    const parsed = trimmed.startsWith('+')
      ? parsePhoneNumberFromString(trimmed)
      : parsePhoneNumberFromString(trimmed, iso);

    if (parsed && parsed.isValid()) {
      return { canonical: parsed.number, isValid: true };
    }
  } catch {
    // ignore parse error
  }

  return { canonical: '', isValid: false };
}

/**
 * Computes the HMAC-SHA256 hash of a canonical contact string using CONTACT_HASH_SECRET.
 * Used as the document key in the contact_reservations collection.
 */
export function hashContact(canonical: string): string {
  const secret = process.env.CONTACT_HASH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('CONTACT_HASH_SECRET must be set and at least 32 characters long');
  }
  return crypto.createHmac('sha256', secret).update(canonical.trim().toLowerCase()).digest('hex');
}

export interface PartnerContactInputs {
  email?: string | null;
  phoneNumber?: string | null;
  phoneE164?: string | null;
  phoneCountry?: string | null;
  whatsappNumber?: string | null;
  whatsappE164?: string | null;
  whatsappCountry?: string | null;
}

/**
 * Extracts and normalizes all distinct canonical contact strings from partner inputs.
 * Returns both the canonical strings and their corresponding SHA-256 hashes.
 */
export function extractCanonicalContacts(
  p1?: PartnerContactInputs | null,
  p2?: PartnerContactInputs | null
): { canonicals: string[]; hashes: string[]; invalidContacts: string[] } {
  const canonicalSet = new Set<string>();
  const invalidContacts: string[] = [];

  const check = (result: NormalizedContactResult, rawDesc: string) => {
    if (!result.isValid) {
      invalidContacts.push(rawDesc);
    } else if (result.canonical) {
      canonicalSet.add(result.canonical);
    }
  };

  if (p1) {
    if (p1.email) check(normalizeCanonicalEmail(p1.email), `p1.email: ${p1.email}`);
    const p1Phone = p1.phoneE164 || p1.phoneNumber;
    if (p1Phone) check(normalizeCanonicalPhone(p1Phone, p1.phoneCountry), `p1.phone: ${p1Phone}`);
    const p1Wa = p1.whatsappE164 || p1.whatsappNumber;
    if (p1Wa) check(normalizeCanonicalPhone(p1Wa, p1.whatsappCountry || p1.phoneCountry), `p1.whatsapp: ${p1Wa}`);
  }

  if (p2) {
    if (p2.email) check(normalizeCanonicalEmail(p2.email), `p2.email: ${p2.email}`);
    const p2Phone = p2.phoneE164 || p2.phoneNumber;
    if (p2Phone) check(normalizeCanonicalPhone(p2Phone, p2.phoneCountry), `p2.phone: ${p2Phone}`);
    const p2Wa = p2.whatsappE164 || p2.whatsappNumber;
    if (p2Wa) check(normalizeCanonicalPhone(p2Wa, p2.whatsappCountry || p2.phoneCountry), `p2.whatsapp: ${p2Wa}`);
  }

  const canonicals = Array.from(canonicalSet);
  const hashes = canonicals.map(hashContact);

  return { canonicals, hashes, invalidContacts };
}

/**
 * Checks whether a specific canonical contact is still used by any other field
 * across both partners in a relationship.
 */
export function isContactStillUsedByRelationship(
  canonical: string,
  p1: PartnerContactInputs | null | undefined,
  p2: PartnerContactInputs | null | undefined,
  excludeField?: { partner: 'p1' | 'p2'; field: 'phone' | 'whatsapp' | 'email' }
): boolean {
  if (!canonical) return false;

  const compare = (val: string | null | undefined, partner: 'p1' | 'p2', field: 'phone' | 'whatsapp' | 'email') => {
    if (excludeField && excludeField.partner === partner && excludeField.field === field) {
      return false;
    }
    return val === canonical;
  };

  if (p1) {
    if (compare(normalizeCanonicalEmail(p1.email).canonical, 'p1', 'email')) return true;
    if (compare(normalizeCanonicalPhone(p1.phoneE164 || p1.phoneNumber, p1.phoneCountry).canonical, 'p1', 'phone')) return true;
    if (compare(normalizeCanonicalPhone(p1.whatsappE164 || p1.whatsappNumber, p1.whatsappCountry).canonical, 'p1', 'whatsapp')) return true;
  }

  if (p2) {
    if (compare(normalizeCanonicalEmail(p2.email).canonical, 'p2', 'email')) return true;
    if (compare(normalizeCanonicalPhone(p2.phoneE164 || p2.phoneNumber, p2.phoneCountry).canonical, 'p2', 'phone')) return true;
    if (compare(normalizeCanonicalPhone(p2.whatsappE164 || p2.whatsappNumber, p2.whatsappCountry).canonical, 'p2', 'whatsapp')) return true;
  }

  return false;
}

export type PublicStage = 'Dating' | 'Engaged' | 'Married';

export const PUBLIC_CONTACT_INDEX_COL = 'public_contact_index';

export function toCanonicalStage(type: unknown): PublicStage | null {
  if (type === 'marriage') return 'Married';
  if (type === 'engagement') return 'Engaged';
  if (type === 'dating') return 'Dating';
  return null;
}

export interface PublicContactIndexDoc {
  recordId: string;
  contactHash: string;
  stage: PublicStage;
  updatedAt: string;
}

export interface VerifyContactResponse {
  found: boolean;
  stage: PublicStage | null;
}

export interface MinimalDocSnapshot<T = any> {
  exists: boolean;
  id?: string;
  data(): T | undefined;
}

export interface MinimalCollectionRef<T = any> {
  doc(id: string): {
    get(): Promise<MinimalDocSnapshot<T>>;
  };
}

export interface ContactVerifyDb {
  collection(name: string): MinimalCollectionRef;
}

/**
 * Executes a bounded exact contact verification lookup:
 * - At most 1 exact index read against `public_contact_index`
 * - At most 1 authoritative read against `relationships` (if index exists)
 * - Zero collection scans or queries.
 * - Enforces active status, both partner consent flags, contact membership, and valid canonical stage.
 * - Always returns exactly { found: boolean, stage: PublicStage | null }.
 */
export async function verifyContactByQuery(
  db: ContactVerifyDb,
  query: unknown
): Promise<VerifyContactResponse> {
  if (!query || typeof query !== 'string') {
    return { found: false, stage: null };
  }

  const clean = query.trim();
  if (!clean) {
    return { found: false, stage: null };
  }

  const isEmail = clean.includes('@');
  const norm = isEmail ? normalizeCanonicalEmail(clean) : normalizeCanonicalPhone(clean, 'SA');

  if (!norm.isValid || !norm.canonical) {
    return { found: false, stage: null };
  }

  const targetHash = hashContact(norm.canonical);

  // 1. Exact hashed index lookup (1 bounded read)
  const indexDoc = await db.collection(PUBLIC_CONTACT_INDEX_COL).doc(targetHash).get();
  if (!indexDoc.exists) {
    return { found: false, stage: null };
  }

  const indexData = indexDoc.data() as Partial<PublicContactIndexDoc> | undefined;
  const recordId = indexData?.recordId;
  if (!recordId) {
    return { found: false, stage: null };
  }

  // 2. Authoritative relationship verification (1 bounded read)
  const relDoc = await db.collection('relationships').doc(recordId).get();
  if (!relDoc.exists) {
    return { found: false, stage: null };
  }

  const record = relDoc.data() as any;
  if (!record || record.status !== 'active') {
    return { found: false, stage: null };
  }

  // Both partners MUST have given explicit consent for public contact search
  const consentP1 = Boolean(record.settings?.publicContactSearchP1);
  const consentP2 = Boolean(record.settings?.publicContactSearchP2);
  if (!consentP1 || !consentP2) {
    return { found: false, stage: null };
  }

  // Ensure contact is currently an active member of this relationship (protect against stale index)
  const { canonicals } = extractCanonicalContacts(record.partner1, record.partner2);
  if (!canonicals.includes(norm.canonical)) {
    return { found: false, stage: null };
  }

  // Must map to a valid canonical stage; never default an invalid stage to Dating
  const validStage = toCanonicalStage(record.type);
  if (!validStage) {
    return { found: false, stage: null };
  }

  return {
    found: true,
    stage: validStage
  };
}

