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

export const normalizePhoneNumber = (country: CountryCode, rawInput: string): string | null => {
  const raw = rawInput.trim();
  if (!raw) return null;

  try {
    const phone = raw.startsWith('+')
      ? parsePhoneNumberFromString(raw)
      : parsePhoneNumberFromString(raw, country);
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
