import { describe, it, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { runDiagnostics, Diagnostics } from '../src/utils/diagnostics';
import { DiagnosticDetails } from '../src/components/DiagnosticDetails';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

describe('Diagnostics Unit & Integration Suite', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
      url: 'https://localhost',
      pretendToBeVisual: true
    });
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).IS_REACT_ACT_ENVIRONMENT;
  });

  // 1. Storage probing: Success and happy path
  it('reports available when all operations succeed', () => {
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'available');
    assert.strictEqual(diagnostics.sessionStorage, 'available');
    assert.strictEqual(diagnostics.indexedDB, 'not tested');
  });

  // 2. Storage probing: Throwing operations
  it('reports failed when setItem throws a generic error', () => {
    Object.defineProperty(window, 'localStorage', {
      value: { setItem: () => { throw new Error('disk failure'); }, getItem: () => null, removeItem: () => {} },
      configurable: true,
      writable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'failed');
  });

  it('reports blocked when setItem throws a SecurityError', () => {
    Object.defineProperty(window, 'localStorage', {
      value: { setItem: () => { throw new DOMException('Access denied', 'SecurityError'); }, getItem: () => null, removeItem: () => {} },
      configurable: true,
      writable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'blocked');
  });

  it('attempts cleanup and reports failed when getItem throws', () => {
    let cleanupCalled = false;
    Object.defineProperty(window, 'localStorage', {
      value: { 
        setItem: () => {}, 
        getItem: () => { throw new Error('read error'); }, 
        removeItem: () => { cleanupCalled = true; } 
      },
      configurable: true,
      writable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'failed');
    assert.strictEqual(cleanupCalled, true);
  });

  it('reports failed when removeItem throws', () => {
    Object.defineProperty(window, 'localStorage', {
      value: { setItem: () => {}, getItem: () => '1', removeItem: () => { throw new Error('delete error'); } },
      configurable: true,
      writable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'failed');
  });

  it('reports failed on read mismatch without crashing', () => {
    let removedKey = '';
    Object.defineProperty(window, 'localStorage', {
      value: { 
        setItem: () => {}, 
        getItem: () => 'mismatched_value', 
        removeItem: (k: string) => { removedKey = k; } 
      },
      configurable: true,
      writable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'failed');
    assert.ok(removedKey.startsWith('__probe_'));
  });

  it('reports failed when setItem throws QuotaExceededError (quota exhaustion is failed, not blocked)', () => {
    Object.defineProperty(window, 'localStorage', {
      value: { setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }, getItem: () => null, removeItem: () => {} },
      configurable: true,
      writable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'failed');
  });

  it('reports failed for non-security DOMException like NotFoundError', () => {
    Object.defineProperty(window, 'localStorage', {
      value: { setItem: () => { throw new DOMException('Other error', 'NotFoundError'); }, getItem: () => null, removeItem: () => {} },
      configurable: true,
      writable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'failed');
  });

  // 3. Throwing property getters
  it('reports blocked when window.localStorage getter throws SecurityError', () => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Access denied by policy', 'SecurityError');
      },
      configurable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'blocked');
  });

  it('reports failed when window.localStorage getter throws a generic Error', () => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Random getter failure');
      },
      configurable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'failed');
  });

  it('reports failed when thrown error name getter itself throws', () => {
    Object.defineProperty(window, 'localStorage', {
      value: { 
        setItem: () => { 
          throw { 
            get name() { throw new Error('getter bomb'); } 
          }; 
        } 
      },
      configurable: true,
      writable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'failed');
  });

  // 4. Missing storage APIs
  it('reports unsupported when window is missing', () => {
    delete (global as any).window;
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'unsupported');
    assert.strictEqual(diagnostics.sessionStorage, 'unsupported');
    assert.strictEqual(diagnostics.secureContext, 'unknown');
  });

  it('reports unsupported when storage property is null or undefined', () => {
    Object.defineProperty(window, 'localStorage', {
      value: null,
      configurable: true,
      writable: true
    });
    const diagnostics = runDiagnostics();
    assert.strictEqual(diagnostics.localStorage, 'unsupported');
  });

  // 5. Privacy: No raw errors, stacks, tokens, or PII
  it('ensures diagnostic object contains only allowlisted keys and sanitized values', () => {
    const diagnostics = runDiagnostics();
    const validStatuses = ['available', 'blocked', 'failed', 'unsupported'];
    const validSecure = ['yes', 'no', 'unknown'];

    assert.ok(validStatuses.includes(diagnostics.localStorage));
    assert.ok(validStatuses.includes(diagnostics.sessionStorage));
    assert.ok(validSecure.includes(diagnostics.secureContext));
    assert.strictEqual(diagnostics.indexedDB, 'not tested');

    const json = JSON.stringify(diagnostics);
    assert.equal(json.includes('Error'), false);
    assert.equal(json.includes('token'), false);
    assert.equal(json.includes('stack'), false);
    assert.equal(json.includes('uid'), false);
    assert.equal(json.includes('email'), false);
  });

  // 6. Localization & UI Accessibility in DiagnosticDetails
  it('renders DiagnosticDetails in English with proper accessibility, unique ID, and localized labels', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const sampleDiag: Diagnostics = {
      localStorage: 'available',
      sessionStorage: 'blocked',
      secureContext: 'yes',
      indexedDB: 'not tested'
    };

    await act(async () => {
      root.render(
        React.createElement(DiagnosticDetails, {
          diagnostics: sampleDiag,
          initStatus: 'unknown',
          failureCategory: 'persistence_initialization_failure',
          authPersistence: 'error',
          isRtl: false
        })
      );
    });

    const button = container.querySelector('button');
    assert.ok(button, 'DiagnosticDetails button must render');
    assert.strictEqual(button.getAttribute('type'), 'button');
    assert.strictEqual(button.getAttribute('aria-expanded'), 'false');
    const panelId = button.getAttribute('aria-controls');
    assert.ok(panelId, 'Must have aria-controls matching panel ID');
    assert.ok(button.textContent?.includes('Technical Details'));

    // Details panel should be collapsed initially
    assert.strictEqual(container.querySelector(`#${panelId}`), null);

    // Expand details
    await act(async () => {
      button.click();
    });

    assert.strictEqual(button.getAttribute('aria-expanded'), 'true');
    const panel = container.querySelector(`div[id="${panelId}"]`);
    assert.ok(panel, 'Panel with ID from aria-controls must now be rendered');

    const text = panel.textContent || '';
    assert.ok(text.includes('Application initialization: unknown'));
    assert.ok(text.includes('Failure category: persistence initialization failure'));
    assert.ok(text.includes('Authentication persistence: error'));
    assert.ok(text.includes('Secure context: yes'));
    assert.ok(text.includes('localStorage: available'));
    assert.ok(text.includes('sessionStorage: blocked'));
    assert.ok(text.includes('IndexedDB: not tested'));

    // No raw error leakage
    assert.equal(text.includes('Error:'), false);
    assert.equal(text.includes('undefined'), false);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders DiagnosticDetails in Arabic with RTL, translated labels and status values', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const sampleDiag: Diagnostics = {
      localStorage: 'failed',
      sessionStorage: 'unsupported',
      secureContext: 'no',
      indexedDB: 'not tested'
    };

    await act(async () => {
      root.render(
        React.createElement(DiagnosticDetails, {
          diagnostics: sampleDiag,
          initStatus: 'not completed',
          failureCategory: 'render_failure',
          authPersistence: 'pending',
          isRtl: true
        })
      );
    });

    const button = container.querySelector('button');
    assert.ok(button);
    assert.ok(button.textContent?.includes('التفاصيل التقنية'));

    // Expand
    await act(async () => {
      button.click();
    });

    const panelId = button.getAttribute('aria-controls')!;
    const panel = container.querySelector(`div[id="${panelId}"]`);
    assert.ok(panel);

    const text = panel.textContent || '';
    assert.ok(text.includes('تهيئة التطبيق: لم يكتمل'));
    assert.ok(text.includes('فئة الخطأ: خطأ في العرض'));
    assert.ok(text.includes('حفظ المصادقة: قيد الانتظار'));
    assert.ok(text.includes('سياق آمن: لا'));
    assert.ok(text.includes('localStorage: فشل'));
    assert.ok(text.includes('sessionStorage: غير مدعوم'));
    assert.ok(text.includes('IndexedDB: غير مختبر'));

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('maps unrecognised/arbitrary status values conservatively to unknown', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const sampleDiag: any = {
      localStorage: 'random_corrupt_status',
      sessionStorage: 'unexpected',
      secureContext: 'maybe',
      indexedDB: 'not tested'
    };

    await act(async () => {
      root.render(
        React.createElement(DiagnosticDetails, {
          diagnostics: sampleDiag,
          initStatus: 'unknown' as any,
          failureCategory: 'unknown' as any,
          authPersistence: 'strange_status' as any,
          isRtl: false
        })
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    const panelId = button.getAttribute('aria-controls')!;
    const panel = container.querySelector(`div[id="${panelId}"]`)!;
    const text = panel.textContent || '';

    // Should conservatively display "unknown"
    assert.ok(text.includes('Authentication persistence: unknown'));
    assert.ok(text.includes('localStorage: unknown'));
    assert.ok(text.includes('sessionStorage: unknown'));
    assert.ok(text.includes('Secure context: unknown'));

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  // 7. ErrorBoundary Integration
  it('ErrorBoundary captures diagnostics safely on render crash without throwing', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const BadChild = () => {
      throw new Error('Exploding render component');
    };

    await act(async () => {
      root.render(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(BadChild)
        )
      );
    });

    // Alert banner should appear
    const alert = container.querySelector('[role="alert"]');
    assert.ok(alert, 'ErrorBoundary alert must render');
    assert.ok(alert.textContent?.includes('An Unexpected Error Occurred'));

    // Technical Details button should be present inside ErrorBoundary
    const detailsButton = container.querySelector('button[aria-controls]');
    assert.ok(detailsButton, 'DiagnosticDetails button should be present in ErrorBoundary fallback');

    console.error = originalConsoleError;
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
