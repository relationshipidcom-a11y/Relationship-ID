import { Language } from '../types';

export const getMonthName = (monthStr: string, lang: Language): string => {
  const monthsEn = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthsAr = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  const idx = parseInt(monthStr, 10) - 1;
  if (idx >= 0 && idx < 12) {
    return lang === 'ar' ? monthsAr[idx] : monthsEn[idx];
  }
  return monthStr;
};
