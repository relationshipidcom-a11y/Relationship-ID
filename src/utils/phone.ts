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

export const countryFromLegacyValue = (value?: string): CountryCode => {
  if (!value) return 'SA';
  const code = value.trim().split(/\s+/)[0].toUpperCase();
  if (code === 'UK') return 'GB';
  return supportedCountries.some((country) => country.iso === code) ? (code as CountryCode) : 'SA';
};

export const legacyCountryValue = (country: CountryCode): string => {
  const normalized = country === 'GB' ? 'UK' : country;
  return `${normalized} +${getCountryCallingCode(country)}`;
};

export const preprocessPhoneInput = (iso: CountryCode, rawInput: string): string => {
  if (!rawInput) return '';
  // Convert Arabic-Indic (\u0660-\u0669) and Persian (\u06F0-\u06F9) digits to ASCII digits
  let cleaned = rawInput
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

  // Remove spaces, dashes, parentheses, non-breaking spaces
  cleaned = cleaned.replace(/[\s\-\(\)\u00A0]/g, '');

  if (!cleaned) return '';

  // Handle leading 00 -> +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  // If doesn't start with +, check if it starts with the country calling code
  if (!cleaned.startsWith('+')) {
    try {
      const callingCode = getCountryCallingCode(iso);
      if (cleaned.startsWith(callingCode)) {
        cleaned = '+' + cleaned;
      }
    } catch {
      // ignore
    }
  }

  return cleaned;
};

export const normalizePhoneNumber = (country: CountryCode, rawInput: string): string | null => {
  if (!rawInput) return null;
  const preprocessed = preprocessPhoneInput(country, rawInput);
  if (!preprocessed) return null;

  try {
    const phone = preprocessed.startsWith('+')
      ? parsePhoneNumberFromString(preprocessed)
      : parsePhoneNumberFromString(preprocessed, country);
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
