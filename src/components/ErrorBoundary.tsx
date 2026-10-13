import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { withAppCheckHeaders } from '../lib/firebase';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  private hasReported = false;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error): State {
    return {
      hasError: true,
      errorMessage: 'UNEXPECTED_RENDER_ERROR'
    };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Sanitized render error caught');

    if (this.hasReported) {
      return;
    }
    this.hasReported = true;

    try {
      const payload = {
        errorCategory: 'render_error',
        pageCategory: typeof window !== 'undefined' ? 'client' : 'ssr',
        eventId: Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10),
        appVersion: '2026-10-01'
      };

      withAppCheckHeaders().then(async (headers) => {
        if (!headers.has('X-Firebase-AppCheck') && !headers.has('x-firebase-appcheck')) {
          return;
        }
        headers.set('Content-Type', 'application/json');
        await fetch('/api/error-report', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }).catch(() => {});
      }).catch(() => {
        // Quietly skip if obtaining App Check token fails; never send unverified fallback
      });
    } catch {
      // Best effort reporting failure must never prevent recovery screen or throw
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-screen w-full flex items-center justify-center p-4 bg-rid-gradient text-white select-none"
          style={{ fontFamily: "'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
        >
          <div className="w-full max-w-md bg-[#30264D] border border-[#51465F] rounded-[24px] p-6 sm:p-8 shadow-2xl text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300">
              <AlertTriangle className="w-8 h-8" aria-hidden="true" />
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-[#F7F4FA] mb-2 leading-tight">
              {isRtl ? 'حدث خطأ غير متوقع' : 'An Unexpected Error Occurred'}
            </h1>
            <p className="text-sm sm:text-base text-[#B7ACC8] mb-6 leading-relaxed">
              {isRtl
                ? 'تعذر عرض هذه الصفحة بشكل صحيح. يمكنك إعادة تحميل الصفحة بأمان أو العودة إلى الصفحة الرئيسية.'
                : 'This page could not be displayed properly. You can safely reload the page or return to the home screen.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-[#804E6A] to-[#8D5775] text-[#F7F4FA] font-semibold text-sm sm:text-base hover:from-[#895472] hover:to-[#945E7D] transition-colors shadow-md active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>{isRtl ? 'إعادة تحميل الصفحة' : 'Reload Page'}</span>
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#3D305A] border border-[#51465F] text-[#F7F4FA] font-semibold text-sm sm:text-base hover:bg-[#4D3E70] transition-colors shadow-sm active:scale-95 cursor-pointer"
              >
                <Home className="w-4 h-4" aria-hidden="true" />
                <span>{isRtl ? 'الصفحة الرئيسية' : 'Homepage'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
