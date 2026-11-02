import React, { useState, useEffect } from 'react';
import { Bell, Check, X, ShieldAlert, Smartphone, Mail, AlertCircle, Info, Loader2 } from 'lucide-react';
import { Language } from '../types';
import { getDeviceTimezone } from '../utils/reminders';
import { authFetch } from '../utils/api';

interface ReminderSettingsModalProps {
  language: Language;
  onClose: () => void;
  userEmailVerified?: boolean;
}

export interface ReminderSettingsState {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  timezone: string;
  serverEmailConfigured?: boolean;
  serverPushConfigured?: boolean;
  vapidPublicKey?: string;
}

export const ReminderSettingsModal: React.FC<ReminderSettingsModalProps> = ({
  language,
  onClose,
  userEmailVerified = true
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [inAppEnabled, setInAppEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  const [serverEmailConfigured, setServerEmailConfigured] = useState(true);
  const [serverPushConfigured, setServerPushConfigured] = useState(true);
  const [vapidPublicKey, setVapidPublicKey] = useState('');

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );
  const isPushSupported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
  const isIOS = typeof window !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );

  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await authFetch('/api/reminders/settings');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.settings) {
            setInAppEnabled(Boolean(data.settings.inAppEnabled));
            setEmailEnabled(Boolean(data.settings.emailEnabled));
            setPushEnabled(Boolean(data.settings.pushEnabled));
            setServerEmailConfigured(data.serverEmailConfigured !== false);
            setServerPushConfigured(data.serverPushConfigured !== false);
            if (data.vapidPublicKey) {
              setVapidPublicKey(data.vapidPublicKey);
            }
          }
        }
      } catch {
        if (isMounted) {
          setError(language === 'ar' ? 'فشل تحميل إعدادات التذكيرات.' : 'Failed to load reminder settings.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadSettings();
    return () => {
      isMounted = false;
    };
  }, [language]);

  const handleRequestPushPermission = async () => {
    setError('');
    setSuccess('');
    if (!isPushSupported) {
      setError(language === 'ar' ? 'متصفحك لا يدعم إشعارات الهاتف Web Push.' : 'Web Push notifications are not supported on this browser.');
      return;
    }

    if (!vapidPublicKey) {
      setPushEnabled(false);
      setError(language === 'ar' ? 'مفتاح إشعارات الويب غير مهيأ على الخادم.' : 'Web Push VAPID public key is missing on server.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        // Register service worker if needed
        let reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        }

        // Subscribe user
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource
        });

        const res = await authFetch('/api/reminders/push-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub })
        });

        if (!res.ok) {
          setPushEnabled(false);
          setError(language === 'ar' ? 'فشل حفظ اشتراك الإشعارات لدى الخادم.' : 'Failed to register push subscription on server.');
          return;
        }

        setPushEnabled(true);
        setSuccess(language === 'ar' ? 'تم منح الإذن وتفعيل إشعارات الهاتف بنجاح!' : 'Notification permission granted and push enabled!');
      } else if (permission === 'denied') {
        setPushEnabled(false);
        setError(language === 'ar' ? 'تم رفض إذن الإشعارات من المتصفح.' : 'Notification permission was denied by browser.');
      }
    } catch (err: any) {
      setPushEnabled(false);
      setError(language === 'ar' ? 'فشل إعداد إشعارات الهاتف.' : 'Failed to enable phone notifications.');
    }
  };

  const handleTogglePush = async (newVal: boolean) => {
    setPushEnabled(newVal);
    if (!newVal) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await authFetch('/api/reminders/push-subscription', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: sub.endpoint })
            });
            await sub.unsubscribe();
          }
        }
      } catch {
        // Safe fallback
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await authFetch('/api/reminders/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inAppEnabled,
          emailEnabled,
          pushEnabled,
          timezone: getDeviceTimezone(),
          language
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.messageAr || data.error || 'SAVE_FAILED');
      }

      setSuccess(language === 'ar' ? 'تم حفظ تفضيلات التذكيرات بنجاح!' : 'Reminder settings saved successfully!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(
        language === 'ar'
          ? (err.message || 'فشل حفظ إعدادات التذكيرات.')
          : (err.message || 'Failed to save reminder settings.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-settings-title"
    >
      <div className="w-full max-w-lg bg-[#252D52] border border-[#A0A9D1] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 bg-[#414A75]/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#B8BCE6]/15 text-[#B8BCE6] border border-[#A0A9D1]">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 id="reminder-settings-title" className="text-base sm:text-lg font-bold text-white leading-tight">
                {language === 'ar' ? 'إعدادات التذكيرات والمناسبات' : 'Occasion Reminder Settings'}
              </h3>
              <p className="text-xs text-[#D6DAED] mt-0.5">
                {language === 'ar' ? 'تذكير بأعياد الميلاد والذكرى السنوية لتوثيق العلاقة' : 'Reminders for birthdays & relationship anniversary'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
            className="p-2 rounded-xl hover:bg-white/10 text-[#D6DAED] hover:text-white transition cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-[#D6DAED] gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#B8BCE6]" />
              <p className="text-sm font-medium">{language === 'ar' ? 'جاري تحميل إعدادات التذكيرات...' : 'Loading reminder settings...'}</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs sm:text-sm text-rose-200 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs sm:text-sm text-emerald-200 flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* Channel 1: In-app reminders */}
              <div className="p-4 rounded-2xl bg-[#414A75]/60 border border-[#A0A9D1] space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Bell className="w-4 h-4 text-[#B8BCE6] shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {language === 'ar' ? 'التذكيرات داخل التطبيق' : 'In-App Reminders'}
                      </h4>
                      <p className="text-xs text-[#D6DAED]">
                        {language === 'ar' ? 'إظهار شريط التذكيرات للمناسبات عند فتح التطبيق.' : 'Display occasion reminder banner when the app is open.'}
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={inAppEnabled}
                      onChange={(e) => setInAppEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#252D52] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-[#202747] after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#B8BCE6] border border-[#A0A9D1]"></div>
                  </label>
                </div>
              </div>

              {/* Channel 2: Email reminders */}
              <div className="p-4 rounded-2xl bg-[#414A75]/60 border border-[#A0A9D1] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-[#B8BCE6] shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {language === 'ar' ? 'تذكيرات البريد الإلكتروني' : 'Email Reminders'}
                      </h4>
                      <p className="text-xs text-[#D6DAED]">
                        {language === 'ar' ? 'إرسال تذكير محايد بالبريد الإلكتروني لعنوان حسابك الموثق حتى أثناء إغلاق التطبيق.' : 'Send a neutral reminder email to your verified account email when closed.'}
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={emailEnabled}
                      onChange={(e) => setEmailEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#252D52] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-[#202747] after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#B8BCE6] border border-[#A0A9D1]"></div>
                  </label>
                </div>

                {!userEmailVerified && (
                  <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{language === 'ar' ? 'البريد الإلكتروني غير موثق. يتم إيقاف تذكيرات البريد مؤقتاً لحين توثيقه.' : 'Email is unverified. Email reminders are suspended until verified.'}</span>
                  </div>
                )}

                {!serverEmailConfigured && (
                  <div className="p-2.5 rounded-xl bg-[#252D52] border border-[#A0A9D1] text-xs text-[#D6DAED] flex items-center justify-between">
                    <span>{language === 'ar' ? 'مزود البريد الإلكتروني:' : 'Email Provider Status:'}</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                      {language === 'ar' ? 'تكوين الخدمة مطلوب' : 'Configuration Required'}
                    </span>
                  </div>
                )}
              </div>

              {/* Channel 3: Phone notifications (Web Push) */}
              <div className="p-4 rounded-2xl bg-[#414A75]/60 border border-[#A0A9D1] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-4 h-4 text-[#B8BCE6] shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {language === 'ar' ? 'إشعارات الهاتف (Web Push)' : 'Phone Notifications (Web Push)'}
                      </h4>
                      <p className="text-xs text-[#D6DAED]">
                        {language === 'ar' ? 'إرسال إشعار على هاتفك/متصفحك حتى عند إغلاق التطبيق.' : 'Receive push notifications on your phone even when closed.'}
                      </p>
                    </div>
                  </div>

                  {notificationPermission === 'granted' && isPushSupported ? (
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={pushEnabled}
                        onChange={(e) => void handleTogglePush(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[#252D52] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-[#202747] after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#B8BCE6] border border-[#A0A9D1]"></div>
                    </label>
                  ) : null}
                </div>

                {/* Permission States */}
                {!isPushSupported ? (
                  <div className="p-2.5 rounded-xl bg-[#252D52] border border-[#A0A9D1] text-xs text-[#D6DAED]">
                    {language === 'ar' ? 'إشعارات الهاتف غير مدعومة على هذا المتصفح أو الجهاز.' : 'Phone notifications are not supported on this browser/device.'}
                  </div>
                ) : notificationPermission === 'denied' ? (
                  <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{language === 'ar' ? 'الإشعارات محظورة في متصفحك. يرجى تفعيل إذن الإشعارات من إعدادات المتصفح.' : 'Notifications are blocked in your browser. Allow notifications in browser settings.'}</span>
                  </div>
                ) : notificationPermission === 'default' ? (
                  <button
                    type="button"
                    onClick={() => void handleRequestPushPermission()}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#B8BCE6] to-[#B8BCE6] hover:from-[#C5C9EC] hover:to-[#C5C9EC] text-[#202747] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-[#D3D8FF] min-h-[40px]"
                  >
                    <Bell className="w-4 h-4" />
                    <span>{language === 'ar' ? 'تفعيل إشعارات الهاتف' : 'Enable Phone Notifications'}</span>
                  </button>
                ) : null}

                {!serverPushConfigured && (
                  <div className="p-2.5 rounded-xl bg-[#252D52] border border-[#A0A9D1] text-xs text-[#D6DAED] flex items-center justify-between">
                    <span>{language === 'ar' ? 'خدمة إشعارات الويب VAPID:' : 'Web Push VAPID Status:'}</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                      {language === 'ar' ? 'تكوين الخدمة مطلوب' : 'Configuration Required'}
                    </span>
                  </div>
                )}

                {/* iPhone / iPad PWA Guidance */}
                {isIOS && !isStandalone && (
                  <div className="p-3 rounded-xl bg-[#252D52] border border-[#A0A9D1] space-y-1.5 text-xs text-[#D6DAED]">
                    <div className="flex items-center gap-1.5 text-[#B8BCE6] font-bold">
                      <Info className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'إرشادات مستخدمي iPhone / iPad:' : 'iPhone / iPad Users Note:'}</span>
                    </div>
                    <p className="leading-relaxed">
                      {language === 'ar'
                        ? 'لتفعيل الإشعارات على iPhone: اضغط زر المشاركة ⎋ ثم اختر "إضافة إلى الشاشة الرئيسية" ⊕ وافتح التطبيق المثبت.'
                        : 'To enable notifications on iPhone: Tap Share ⎋, select "Add to Home Screen" ⊕, and open the installed app.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Leap Year Policy Explanation */}
              <div className="p-3.5 rounded-xl bg-[#252D52] border border-[#A0A9D1] text-xs text-[#D6DAED] flex items-start gap-2.5 leading-relaxed">
                <Info className="w-4 h-4 text-[#B8BCE6] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block mb-0.5">
                    {language === 'ar' ? 'سياسة تذكير 29 فبراير:' : 'February 29 Reminder Policy:'}
                  </span>
                  <span>
                    {language === 'ar'
                      ? 'للمناسبات التي تصادف 29 فبراير (مثل أعياد الميلاد أو تواريخ الارتباط): يتم التذكير يوم 28 فبراير في السنوات غير الكبيسة، ويوم 29 فبراير في السنوات الكبيسة.'
                      : 'For occasions occurring on February 29: Reminders trigger on February 28 in non-leap years, and February 29 in leap years.'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-white/10 bg-[#414A75]/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-[#A0A9D1] bg-[#252D52] hover:bg-[#414A75] text-[#D6DAED] hover:text-white text-xs sm:text-sm font-semibold transition cursor-pointer min-h-[40px]"
          >
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>

          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void handleSave()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#B8BCE6] to-[#B8BCE6] hover:from-[#C5C9EC] hover:to-[#C5C9EC] text-[#202747] text-xs sm:text-sm font-semibold disabled:opacity-50 flex items-center gap-2 transition cursor-pointer min-h-[40px]"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{language === 'ar' ? 'حفظ التفضيلات' : 'Save Preferences'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
