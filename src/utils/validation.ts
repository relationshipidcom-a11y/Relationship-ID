export const EMAIL_VALIDATION_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export function validateEmailAddress(email?: string | null): boolean {
  if (typeof email !== 'string') return false;
  const trimmedLower = email.trim().toLowerCase();
  return EMAIL_VALIDATION_REGEX.test(trimmedLower);
}

export const NAME_VALIDATION_REGEX = /^[\p{Script=Arabic}a-zA-Z\s'\u2019\-.]+$/u;

export function validateFullName(name?: string | null): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  if (/[0-9<>]/.test(trimmed)) return false;
  return NAME_VALIDATION_REGEX.test(trimmed);
}
