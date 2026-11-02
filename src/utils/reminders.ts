import { RelationshipRecord } from '../types';

export interface OccasionItem {
  type: 'user_birthday' | 'partner_birthday' | 'relationship_anniversary';
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  date: string; // YYYY-MM-DD
  recordId?: string;
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function getLocalDateParts(timeZone: string, date: Date = new Date()): { year: number; month: number; day: number; hour: number; isoDate: string } {
  const safeTz = isValidIanaTimezone(timeZone) ? timeZone : 'UTC';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '1970', 10);
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10);
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);
    let hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    if (hour === 24) hour = 0;
    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { year, month, day, hour, isoDate };
  } catch {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { year, month, day, hour, isoDate };
  }
}

/**
 * Checks if a month/day occurrence matches today's target local month/day in targetYear.
 * February 29 policy:
 * - If birth/start month is 2 and day is 29:
 *   - In leap targetYear: triggers on Feb 29 (month 2, day 29).
 *   - In non-leap targetYear: triggers on Feb 28 (month 2, day 28).
 */
export function isOccasionToday(
  birthOrStartMonth: number,
  birthOrStartDay: number,
  targetMonth: number,
  targetDay: number,
  targetYear: number
): boolean {
  if (!birthOrStartMonth || !birthOrStartDay || birthOrStartMonth < 1 || birthOrStartMonth > 12 || birthOrStartDay < 1 || birthOrStartDay > 31) {
    return false;
  }

  // Feb 29 handling
  if (birthOrStartMonth === 2 && birthOrStartDay === 29) {
    if (isLeapYear(targetYear)) {
      return targetMonth === 2 && targetDay === 29;
    } else {
      return targetMonth === 2 && targetDay === 28;
    }
  }

  return targetMonth === birthOrStartMonth && targetDay === birthOrStartDay;
}

export interface CalculateOccasionsParams {
  userBirthDay?: string | number | null;
  userBirthMonth?: string | number | null;
  userBirthYear?: string | number | null;
  partnerBirthDay?: string | number | null;
  partnerBirthMonth?: string | number | null;
  partnerBirthYear?: string | number | null;
  relationshipStartDateIso?: string | null;
  relationshipStatus?: string | null;
  relationshipRecordId?: string | null;
  timeZone: string;
  referenceDate?: Date;
}

export function calculateActiveOccasions(params: CalculateOccasionsParams): OccasionItem[] {
  const refDate = params.referenceDate || new Date();
  const local = getLocalDateParts(params.timeZone, refDate);
  const occasions: OccasionItem[] = [];

  // 1. User Birthday (independent of relationship status)
  const uDay = typeof params.userBirthDay === 'string' ? parseInt(params.userBirthDay, 10) : Number(params.userBirthDay || 0);
  const uMonth = typeof params.userBirthMonth === 'string' ? parseInt(params.userBirthMonth, 10) : Number(params.userBirthMonth || 0);
  const uYear = typeof params.userBirthYear === 'string' ? parseInt(params.userBirthYear, 10) : Number(params.userBirthYear || 0);

  if (uDay > 0 && uMonth > 0 && uYear > 0 && uYear <= local.year) {
    if (isOccasionToday(uMonth, uDay, local.month, local.day, local.year)) {
      occasions.push({
        type: 'user_birthday',
        titleAr: 'عيد ميلادك اليوم! 🎂',
        titleEn: 'Today is your birthday! 🎂',
        messageAr: 'نتمنى لك يوماً سعيداً وعاماً مليئاً بالخير والمحبة.',
        messageEn: 'Wishing you a happy birthday and a wonderful year ahead.',
        date: local.isoDate
      });
    }
  }

  // Partner birthday and anniversary require MUTUALLY ACCEPTED ACTIVE RELATIONSHIP
  const isRelationshipActive = params.relationshipStatus === 'active';

  if (isRelationshipActive) {
    // 2. Partner Birthday
    const pDay = typeof params.partnerBirthDay === 'string' ? parseInt(params.partnerBirthDay, 10) : Number(params.partnerBirthDay || 0);
    const pMonth = typeof params.partnerBirthMonth === 'string' ? parseInt(params.partnerBirthMonth, 10) : Number(params.partnerBirthMonth || 0);
    const pYear = typeof params.partnerBirthYear === 'string' ? parseInt(params.partnerBirthYear, 10) : Number(params.partnerBirthYear || 0);

    if (pDay > 0 && pMonth > 0 && pYear > 0 && pYear <= local.year) {
      if (isOccasionToday(pMonth, pDay, local.month, local.day, local.year)) {
        occasions.push({
          type: 'partner_birthday',
          titleAr: 'عيد ميلاد شريكك اليوم! 🎉',
          titleEn: "Today is your partner's birthday! 🎉",
          messageAr: 'يوم مميز لشريكك، نتمنى لكما يوماً مليئاً بالفرح.',
          messageEn: 'A special day for your partner! Wishing you both a joyous celebration.',
          date: local.isoDate,
          recordId: params.relationshipRecordId || undefined
        });
      }
    }

    // 3. Relationship Anniversary
    if (params.relationshipStartDateIso) {
      const match = params.relationshipStartDateIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const startYear = parseInt(match[1], 10);
        const startMonth = parseInt(match[2], 10);
        const startDay = parseInt(match[3], 10);

        // Anniversaries begin after ONE FULL YEAR (startYear < local.year)
        if (startYear > 0 && local.year - startYear >= 1) {
          if (isOccasionToday(startMonth, startDay, local.month, local.day, local.year)) {
            const yearsElapsed = local.year - startYear;
            occasions.push({
              type: 'relationship_anniversary',
              titleAr: `الذكرى السنوية لتوثيق علاقتكما! 💍 (${yearsElapsed} ${yearsElapsed === 1 ? 'سنة' : 'سنوات'})`,
              titleEn: `Happy Relationship Anniversary! 💍 (${yearsElapsed} ${yearsElapsed === 1 ? 'year' : 'years'})`,
              messageAr: 'نحتفل معكما بمرور عام آخر على وثيقة ارتباطكما المعتمدة.',
              messageEn: 'Celebrating another year of your verified relationship record together.',
              date: local.isoDate,
              recordId: params.relationshipRecordId || undefined
            });
          }
        }
      }
    }
  }

  return occasions;
}
