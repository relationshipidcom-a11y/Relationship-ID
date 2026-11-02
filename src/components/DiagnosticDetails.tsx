import React, { useId } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Diagnostics } from '../utils/diagnostics';

interface Props {
  diagnostics: Diagnostics;
  initStatus: 'ready' | 'failed' | 'not completed' | 'unknown';
  failureCategory: 'render_failure' | 'persistence_initialization_failure' | 'none';
  authPersistence: 'pending' | 'ready' | 'error' | 'unknown';
  isRtl: boolean;
}

export const DiagnosticDetails: React.FC<Props> = ({ 
  diagnostics, 
  initStatus, 
  failureCategory, 
  authPersistence, 
  isRtl 
}) => {
  const panelId = useId();
  const [showDetails, setShowDetails] = React.useState(false);

  const t = {
    title: isRtl ? 'التفاصيل التقنية' : 'Technical Details',
    initStatus: isRtl ? 'تهيئة التطبيق' : 'Application initialization',
    failureCategory: isRtl ? 'فئة الخطأ' : 'Failure category',
    authPersistence: isRtl ? 'حفظ المصادقة' : 'Authentication persistence',
    secureContext: isRtl ? 'سياق آمن' : 'Secure context',
    localStorage: 'localStorage',
    sessionStorage: 'sessionStorage',
    indexedDB: 'IndexedDB',
    status: {
      ready: isRtl ? 'جاهز' : 'ready',
      failed: isRtl ? 'فشل' : 'failed',
      notCompleted: isRtl ? 'لم يكتمل' : 'not completed',
      unknown: isRtl ? 'غير معروف' : 'unknown',
      renderFailure: isRtl ? 'خطأ في العرض' : 'render failure',
      persistenceFailure: isRtl ? 'خطأ في تهيئة الحفظ' : 'persistence initialization failure',
      none: isRtl ? 'لا يوجد' : 'none',
      yes: isRtl ? 'نعم' : 'yes',
      no: isRtl ? 'لا' : 'no',
      available: isRtl ? 'متاح' : 'available',
      blocked: isRtl ? 'محظور' : 'blocked',
      error: isRtl ? 'خطأ' : 'error',
      failedStatus: isRtl ? 'فشل' : 'failed',
      unsupported: isRtl ? 'غير مدعوم' : 'unsupported',
      notTested: isRtl ? 'غير مختبر' : 'not tested',
      pending: isRtl ? 'قيد الانتظار' : 'pending',
      readyStatus: isRtl ? 'جاهز' : 'ready'
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available': return t.status.available;
      case 'blocked': return t.status.blocked;
      case 'failed': return t.status.failedStatus;
      case 'unsupported': return t.status.unsupported;
      case 'error': return t.status.error;
      case 'pending': return t.status.pending;
      case 'ready': return t.status.readyStatus;
      default: return t.status.unknown;
    }
  };

  const getInitStatusLabel = (status: Props['initStatus']) => {
    switch (status) {
      case 'ready': return t.status.ready;
      case 'failed': return t.status.failed;
      case 'not completed': return t.status.notCompleted;
      default: return t.status.unknown;
    }
  };

  const getFailureCategoryLabel = (category: Props['failureCategory']) => {
    switch (category) {
      case 'render_failure': return t.status.renderFailure;
      case 'persistence_initialization_failure': return t.status.persistenceFailure;
      case 'none': return t.status.none;
      default: return t.status.unknown;
    }
  };

  const getSecureContextLabel = (val: Diagnostics['secureContext']) => {
    switch (val) {
      case 'yes': return t.status.yes;
      case 'no': return t.status.no;
      default: return t.status.unknown;
    }
  };

  return (
    <div className="mb-6 text-start">
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        aria-expanded={showDetails}
        aria-controls={panelId}
        className="w-full min-h-[44px] flex items-center justify-between text-sm font-medium text-[#B8BCE6] bg-[#252D52] p-3.5 sm:p-4 rounded-xl border border-[#A0A9D1] hover:bg-[#252D52] focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 transition-colors cursor-pointer"
      >
        <span>{t.title}</span>
        {showDetails ? <ChevronUp className="w-5 h-5 flex-shrink-0" aria-hidden="true" /> : <ChevronDown className="w-5 h-5 flex-shrink-0" aria-hidden="true" />}
      </button>
      {showDetails && (
        <div id={panelId} className="mt-3 p-4 bg-[#252D52] rounded-xl border border-[#A0A9D1] text-xs text-[#D6DAED] space-y-2 font-mono">
          <div>{t.initStatus}: {getInitStatusLabel(initStatus)}</div>
          <div>{t.failureCategory}: {getFailureCategoryLabel(failureCategory)}</div>
          <div>{t.authPersistence}: {getStatusLabel(authPersistence)}</div>
          <div>{t.secureContext}: {getSecureContextLabel(diagnostics.secureContext)}</div>
          <div>{t.localStorage}: {getStatusLabel(diagnostics.localStorage)}</div>
          <div>{t.sessionStorage}: {getStatusLabel(diagnostics.sessionStorage)}</div>
          <div>{t.indexedDB}: {t.status.notTested}</div>
        </div>
      )}
    </div>
  );
};
