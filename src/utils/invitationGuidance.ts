import { Language } from '../types';

export function getInvitationInstruction(
  requirement: 'email' | 'mobile' | 'both' | undefined | null,
  language: Language
): string | null {
  if (requirement === 'mobile') {
    return language === 'ar'
      ? 'سجّل الدخول، ثم أكّد ملكيتك لرقم الجوال الذي أُرسلت إليه الدعوة عبر واتساب.'
      : 'Sign in, then verify the mobile number this invitation was sent to through WhatsApp.';
  }
  if (requirement === 'email') {
    return language === 'ar'
      ? 'سجّل الدخول باستخدام البريد الإلكتروني الذي أُرسلت إليه هذه الدعوة.'
      : 'Sign in using the email address this invitation was sent to.';
  }
  if (requirement === 'both') {
    return language === 'ar'
      ? 'سجّل الدخول بالبريد الإلكتروني المحدد في الدعوة، ثم أكّد ملكيتك لرقم الجوال المحدد عبر واتساب.'
      : 'Sign in using the invited email address, then verify the invited mobile number through WhatsApp.';
  }
  return null;
}
