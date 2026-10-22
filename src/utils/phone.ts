import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import type { CountryCode } from 'libphonenumber-js';

export type SupportedCountry = {
  iso: CountryCode;
  dialCode: string;
  flag: string;
  nameEn: string;
  nameAr: string;
};

const flagForCountry = (country: CountryCode) =>
  country
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));

const namesEn = new Intl.DisplayNames(['en'], { type: 'region' });
const namesAr = new Intl.DisplayNames(['ar'], { type: 'region' });

const preferredOrder: CountryCode[] = ['SA', 'AE', 'BH', 'KW', 'QA', 'OM', 'JO', 'PS', 'EG', 'US', 'GB'];
const priority = new Map(preferredOrder.map((country, index) => [country, index]));

export const supportedCountries: SupportedCountry[] = getCountries()
  .map((iso) => ({
    iso,
    dialCode: `+${getCountryCallingCode(iso)}`,
    flag: flagForCountry(iso),
    nameEn: namesEn.of(iso) || iso,
    nameAr: namesAr.of(iso) || iso
  }))
  .sort((a, b) => {
    const ap = priority.get(a.iso);
    const bp = priority.get(b.iso);
    if (ap !== undefined || bp !== undefined) {
      if (ap === undefined) return 1;
      if (bp === undefined) return -1;
      return ap - bp;
    }
    return a.nameEn.localeCompare(b.nameEn);
  });

export const countryFromLegacyValue = (value?: string | null): CountryCode | null => {
  if (!value || !value.trim()) return null;
  const code = value.trim().split(/\s+/)[0].toUpperCase();
  if (code === 'UK') return 'GB';
  const found = supportedCountries.some((country) => country.iso === code);
  return found ? (code as CountryCode) : null;
};

export const legacyCountryValue = (country: CountryCode): string => {
  const normalized = country === 'GB' ? 'UK' : country;
  return `${normalized} +${getCountryCallingCode(country)}`;
};

export const preprocessPhoneInput = (iso: CountryCode, rawInput: string): string => {
  if (!rawInput) return '';
  let cleaned = rawInput
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .trim();
  return cleaned;
};

export const normalizePhoneNumber = (country: CountryCode, rawInput: string): string | null => {
  if (!rawInput) return null;
  const cleaned = preprocessPhoneInput(country, rawInput);
  if (!cleaned) return null;

  try {
    // Explicit international input starting with +
    if (cleaned.startsWith('+')) {
      const phone = parsePhoneNumberFromString(cleaned);
      if (!phone || !phone.isValid()) return null;
      return phone.number;
    }

    // Bare country code starting with the selected country's calling code without +
    try {
      const callingCode = getCountryCallingCode(country);
      if (cleaned.startsWith(callingCode) && cleaned.length > callingCode.length) {
        const phone = parsePhoneNumberFromString('+' + cleaned);
        if (phone && phone.isValid()) {
          return phone.number;
        }
      }
    } catch {
      // ignore
    }

    // National number or international dialing prefix interpreted under selected country's rules
    const phone = parsePhoneNumberFromString(cleaned, country);
    if (!phone || !phone.isValid()) return null;
    return phone.number;
  } catch {
    return null;
  }
};

export const nationalNumberForDisplay = (country: CountryCode, e164?: string | null): string => {
  if (!e164) return '';
  try {
    const phone = parsePhoneNumberFromString(e164);
    if (!phone) return '';
    return phone.country === country ? phone.nationalNumber : e164;
  } catch {
    return '';
  }
};
