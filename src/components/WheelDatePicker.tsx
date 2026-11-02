import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const ITEM_HEIGHT = 40;

export interface WheelDatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  language?: 'ar' | 'en';
  minDate?: string;
  maxDate?: string;
  defaultDate?: string;
  className?: string;
  disabled?: boolean;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

export function getDaysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
  return 31;
}

export function parseIsoDate(val: string): { year: number; month: number; day: number } | null {
  if (!val || typeof val !== 'string') return null;
  const parts = val.split('-');
  if (parts.length !== 3) {
    console.error('Invalid date format:', val);
    return null;
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (
    isNaN(year) || isNaN(month) || isNaN(day) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    year < 1000 || year > 9999
  ) {
    console.error('Invalid date values:', val);
    return null;
  }
  return { year, month, day };
}

export function buildIsoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formatDisplayDate(val: string, language: 'ar' | 'en'): string | null {
  const parsed = parseIsoDate(val);
  if (!parsed) return null;
  const monthName = language === 'ar' ? AR_MONTHS[parsed.month - 1] : EN_MONTHS[parsed.month - 1];
  return `${parsed.day} ${monthName} ${parsed.year}`;
}

export const WheelDatePicker: React.FC<WheelDatePickerProps> = ({
  id,
  value,
  onChange,
  language = 'ar',
  minDate = '1900-01-01',
  maxDate,
  defaultDate,
  className,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const dayColRef = useRef<HTMLDivElement>(null);
  const monthColRef = useRef<HTMLDivElement>(null);
  const yearColRef = useRef<HTMLDivElement>(null);

  const isRtl = language === 'ar';
  const buttonId = id || 'wheel-date-picker-button';

  const parsedMin = minDate ? parseIsoDate(minDate) : null;
  const parsedMax = maxDate ? parseIsoDate(maxDate) : null;

  const minYear = parsedMin ? parsedMin.year : 1900;
  const maxYear = parsedMax ? parsedMax.year : 2100;

  const getInitialPosition = (): { year: number; month: number; day: number } => {
    const fromVal = parseIsoDate(value);
    if (fromVal) return fromVal;

    const fromDef = defaultDate ? parseIsoDate(defaultDate) : null;
    if (fromDef) return fromDef;

    if (parsedMax) return parsedMax;

    return { year: Math.min(2000, maxYear), month: 1, day: 1 };
  };

  const initial = getInitialPosition();
  const [draftYear, setDraftYear] = useState<number>(initial.year);
  const [draftMonth, setDraftMonth] = useState<number>(initial.month);
  const [draftDay, setDraftDay] = useState<number>(initial.day);

  const handleOpen = () => {
    if (disabled) return;
    const pos = getInitialPosition();
    setDraftYear(pos.year);
    setDraftMonth(pos.month);
    setDraftDay(pos.day);
    setIsOpen(true);
  };

  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    years.push(y);
  }

  const minM = parsedMin && draftYear === parsedMin.year ? parsedMin.month : 1;
  const maxM = parsedMax && draftYear === parsedMax.year ? parsedMax.month : 12;
  const months: number[] = [];
  for (let m = minM; m <= maxM; m++) {
    months.push(m);
  }

  const daysInM = getDaysInMonth(draftYear, draftMonth);
  const minD = parsedMin && draftYear === parsedMin.year && draftMonth === parsedMin.month ? parsedMin.day : 1;
  const maxD = parsedMax && draftYear === parsedMax.year && draftMonth === parsedMax.month ? Math.min(daysInM, parsedMax.day) : daysInM;
  const days: number[] = [];
  for (let d = minD; d <= maxD; d++) {
    days.push(d);
  }

  const selectYear = (y: number) => {
    setDraftYear(y);

    const newMinM = parsedMin && y === parsedMin.year ? parsedMin.month : 1;
    const newMaxM = parsedMax && y === parsedMax.year ? parsedMax.month : 12;
    const clampedM = Math.max(newMinM, Math.min(newMaxM, draftMonth));
    if (clampedM !== draftMonth) {
      setDraftMonth(clampedM);
    }

    const daysInNewM = getDaysInMonth(y, clampedM);
    const newMinD = parsedMin && y === parsedMin.year && clampedM === parsedMin.month ? parsedMin.day : 1;
    const newMaxD = parsedMax && y === parsedMax.year && clampedM === parsedMax.month ? Math.min(daysInNewM, parsedMax.day) : daysInNewM;
    const clampedD = Math.max(newMinD, Math.min(newMaxD, draftDay));
    if (clampedD !== draftDay) {
      setDraftDay(clampedD);
    }
  };

  const selectMonth = (m: number) => {
    setDraftMonth(m);

    const daysInThisM = getDaysInMonth(draftYear, m);
    const newMinD = parsedMin && draftYear === parsedMin.year && m === parsedMin.month ? parsedMin.day : 1;
    const newMaxD = parsedMax && draftYear === parsedMax.year && m === parsedMax.month ? Math.min(daysInThisM, parsedMax.day) : daysInThisM;
    const clampedD = Math.max(newMinD, Math.min(newMaxD, draftDay));
    if (clampedD !== draftDay) {
      setDraftDay(clampedD);
    }
  };

  const selectDay = (d: number) => {
    setDraftDay(d);
  };

  useEffect(() => {
    if (isOpen) {
      const dIdx = days.indexOf(draftDay);
      const mIdx = months.indexOf(draftMonth);
      const yIdx = years.indexOf(draftYear);
      if (dayColRef.current && dIdx >= 0) {
        dayColRef.current.scrollTop = dIdx * ITEM_HEIGHT;
      }
      if (monthColRef.current && mIdx >= 0) {
        monthColRef.current.scrollTop = mIdx * ITEM_HEIGHT;
      }
      if (yearColRef.current && yIdx >= 0) {
        yearColRef.current.scrollTop = yIdx * ITEM_HEIGHT;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [isOpen]);

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    const finalIso = buildIsoDate(draftYear, draftMonth, draftDay);
    onChange(finalIso);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const handleCancel = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const onDayKeyDown = (e: React.KeyboardEvent) => {
    const idx = days.indexOf(draftDay);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < days.length - 1) {
        const next = days[idx + 1];
        selectDay(next);
        if (dayColRef.current) dayColRef.current.scrollTop = (idx + 1) * ITEM_HEIGHT;
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) {
        const prev = days[idx - 1];
        selectDay(prev);
        if (dayColRef.current) dayColRef.current.scrollTop = (idx - 1) * ITEM_HEIGHT;
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (days.length > 0) {
        selectDay(days[0]);
        if (dayColRef.current) dayColRef.current.scrollTop = 0;
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      if (days.length > 0) {
        selectDay(days[days.length - 1]);
        if (dayColRef.current) dayColRef.current.scrollTop = (days.length - 1) * ITEM_HEIGHT;
      }
    }
  };

  const onMonthKeyDown = (e: React.KeyboardEvent) => {
    const idx = months.indexOf(draftMonth);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < months.length - 1) {
        const next = months[idx + 1];
        selectMonth(next);
        if (monthColRef.current) monthColRef.current.scrollTop = (idx + 1) * ITEM_HEIGHT;
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) {
        const prev = months[idx - 1];
        selectMonth(prev);
        if (monthColRef.current) monthColRef.current.scrollTop = (idx - 1) * ITEM_HEIGHT;
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (months.length > 0) {
        selectMonth(months[0]);
        if (monthColRef.current) monthColRef.current.scrollTop = 0;
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      if (months.length > 0) {
        selectMonth(months[months.length - 1]);
        if (monthColRef.current) monthColRef.current.scrollTop = (months.length - 1) * ITEM_HEIGHT;
      }
    }
  };

  const onYearKeyDown = (e: React.KeyboardEvent) => {
    const idx = years.indexOf(draftYear);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < years.length - 1) {
        const next = years[idx + 1];
        selectYear(next);
        if (yearColRef.current) yearColRef.current.scrollTop = (idx + 1) * ITEM_HEIGHT;
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) {
        const prev = years[idx - 1];
        selectYear(prev);
        if (yearColRef.current) yearColRef.current.scrollTop = (idx - 1) * ITEM_HEIGHT;
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (years.length > 0) {
        selectYear(years[0]);
        if (yearColRef.current) yearColRef.current.scrollTop = 0;
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      if (years.length > 0) {
        selectYear(years[years.length - 1]);
        if (yearColRef.current) yearColRef.current.scrollTop = (years.length - 1) * ITEM_HEIGHT;
      }
    }
  };

  const onDayScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    const idx = Math.max(0, Math.min(days.length - 1, Math.round(st / ITEM_HEIGHT)));
    const val = days[idx];
    if (val !== undefined && val !== draftDay) {
      selectDay(val);
    }
  };

  const onMonthScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    const idx = Math.max(0, Math.min(months.length - 1, Math.round(st / ITEM_HEIGHT)));
    const val = months[idx];
    if (val !== undefined && val !== draftMonth) {
      selectMonth(val);
    }
  };

  const onYearScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    const idx = Math.max(0, Math.min(years.length - 1, Math.round(st / ITEM_HEIGHT)));
    const val = years[idx];
    if (val !== undefined && val !== draftYear) {
      selectYear(val);
    }
  };

  const displayText = formatDisplayDate(value, language);
  const placeholderText = isRtl ? 'اختر التاريخ' : 'Select date';
  const confirmText = isRtl ? 'تأكيد' : 'Confirm';
  const cancelText = isRtl ? 'إلغاء' : 'Cancel';
  const dayLabel = isRtl ? 'اليوم' : 'Day';
  const monthLabel = isRtl ? 'الشهر' : 'Month';
  const yearLabel = isRtl ? 'السنة' : 'Year';

  return (
    <div className="relative w-full">
      <button
        type="button"
        id={buttonId}
        ref={buttonRef}
        disabled={disabled}
        onClick={handleOpen}
        className={`${className || ''} flex items-center justify-between text-start cursor-pointer`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className={displayText ? 'text-white' : 'text-[#A0A9D1]'}>
          {displayText || placeholderText}
        </span>
        <Calendar className="w-4 h-4 text-[#B8BCE6] shrink-0" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            e.stopPropagation();
            handleCancel();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${buttonId}-picker-title`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-[#202B52] border border-[#A0A9D1] shadow-2xl p-4 flex flex-col gap-3 text-white"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            {/* Header with Cancel, Preview title, Confirm */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <button
                type="button"
                onClick={handleCancel}
                className="text-sm font-semibold text-[#D6DAED] hover:text-white py-1.5 px-3 rounded-lg border border-[#A0A9D1]/40 hover:bg-[#39436D] transition-colors cursor-pointer"
              >
                {cancelText}
              </button>
              <span id={`${buttonId}-picker-title`} className="text-sm font-bold text-white">
                {draftDay} {isRtl ? AR_MONTHS[draftMonth - 1] : EN_MONTHS[draftMonth - 1]} {draftYear}
              </span>
              <button
                type="button"
                onClick={handleConfirm}
                className="text-sm font-semibold text-[#182849] bg-[#B8BCE6] hover:bg-white py-1.5 px-4 rounded-lg transition-colors cursor-pointer"
              >
                {confirmText}
              </button>
            </div>

            {/* Column labels */}
            <div className="flex items-center text-xs font-semibold text-[#B8BCE6] text-center px-1">
              <div className="flex-1">{dayLabel}</div>
              <div className="flex-[1.4]">{monthLabel}</div>
              <div className="flex-1">{yearLabel}</div>
            </div>

            {/* 3 scroll wheel columns */}
            <div className="relative flex items-center gap-1 sm:gap-2 h-[200px] overflow-hidden rounded-xl bg-[#182849]/60 border border-[#A0A9D1]/30">
              {/* Centered selection band */}
              <div
                className="absolute left-1 right-1 top-[80px] h-[40px] pointer-events-none rounded-xl bg-[#B8BCE6]/20 border border-[#B8BCE6]/50 z-20"
                aria-hidden="true"
              />

              {/* Top & Bottom gradient fades */}
              <div className="absolute top-0 left-0 right-0 h-[50px] pointer-events-none bg-gradient-to-b from-[#202B52] to-transparent z-10" />
              <div className="absolute bottom-0 left-0 right-0 h-[50px] pointer-events-none bg-gradient-to-t from-[#202B52] to-transparent z-10" />

              {/* Day Column */}
              <div
                role="listbox"
                tabIndex={0}
                aria-label={dayLabel}
                ref={dayColRef}
                onKeyDown={onDayKeyDown}
                onScroll={onDayScroll}
                className="flex-1 h-full overflow-y-auto snap-y snap-mandatory relative z-0 focus:outline-none focus:ring-1 focus:ring-[#B8BCE6]/40 rounded-lg no-scrollbar"
                style={{ scrollbarWidth: 'none' }}
              >
                <div style={{ height: 80 }} aria-hidden="true" />
                {days.map((d) => {
                  const isSelected = d === draftDay;
                  return (
                    <div
                      key={d}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        selectDay(d);
                        const idx = days.indexOf(d);
                        if (dayColRef.current && idx >= 0) {
                          dayColRef.current.scrollTop = idx * ITEM_HEIGHT;
                        }
                      }}
                      className={`h-[40px] flex items-center justify-center snap-center cursor-pointer select-none text-base transition-colors ${
                        isSelected ? 'font-bold text-white text-lg' : 'text-[#A0A9D1] hover:text-white/80'
                      }`}
                    >
                      {d}
                    </div>
                  );
                })}
                <div style={{ height: 80 }} aria-hidden="true" />
              </div>

              {/* Month Column */}
              <div
                role="listbox"
                tabIndex={0}
                aria-label={monthLabel}
                ref={monthColRef}
                onKeyDown={onMonthKeyDown}
                onScroll={onMonthScroll}
                className="flex-[1.4] h-full overflow-y-auto snap-y snap-mandatory relative z-0 focus:outline-none focus:ring-1 focus:ring-[#B8BCE6]/40 rounded-lg no-scrollbar"
                style={{ scrollbarWidth: 'none' }}
              >
                <div style={{ height: 80 }} aria-hidden="true" />
                {months.map((m) => {
                  const isSelected = m === draftMonth;
                  const monthName = isRtl ? AR_MONTHS[m - 1] : EN_MONTHS[m - 1];
                  return (
                    <div
                      key={m}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        selectMonth(m);
                        const idx = months.indexOf(m);
                        if (monthColRef.current && idx >= 0) {
                          monthColRef.current.scrollTop = idx * ITEM_HEIGHT;
                        }
                      }}
                      className={`h-[40px] flex items-center justify-center snap-center cursor-pointer select-none text-base transition-colors px-1 truncate ${
                        isSelected ? 'font-bold text-white text-lg' : 'text-[#A0A9D1] hover:text-white/80'
                      }`}
                    >
                      {monthName}
                    </div>
                  );
                })}
                <div style={{ height: 80 }} aria-hidden="true" />
              </div>

              {/* Year Column */}
              <div
                role="listbox"
                tabIndex={0}
                aria-label={yearLabel}
                ref={yearColRef}
                onKeyDown={onYearKeyDown}
                onScroll={onYearScroll}
                className="flex-1 h-full overflow-y-auto snap-y snap-mandatory relative z-0 focus:outline-none focus:ring-1 focus:ring-[#B8BCE6]/40 rounded-lg no-scrollbar"
                style={{ scrollbarWidth: 'none' }}
              >
                <div style={{ height: 80 }} aria-hidden="true" />
                {years.map((y) => {
                  const isSelected = y === draftYear;
                  return (
                    <div
                      key={y}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        selectYear(y);
                        const idx = years.indexOf(y);
                        if (yearColRef.current && idx >= 0) {
                          yearColRef.current.scrollTop = idx * ITEM_HEIGHT;
                        }
                      }}
                      className={`h-[40px] flex items-center justify-center snap-center cursor-pointer select-none text-base transition-colors ${
                        isSelected ? 'font-bold text-white text-lg' : 'text-[#A0A9D1] hover:text-white/80'
                      }`}
                    >
                      {y}
                    </div>
                  );
                })}
                <div style={{ height: 80 }} aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
