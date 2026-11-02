import { register } from 'node:module';

// Intercept CSS module imports in Node ESM environment for all tests
const cssHook =
  'data:text/javascript,' +
  encodeURIComponent(
    'export function load(url, context, next) { if (url.endsWith(".css")) { return { format: "module", shortCircuit: true, source: "export default {}" }; } return next(url, context); }'
  );
register(cssHook);

if (!process.env.FIREBASE_PROJECT_ID && !process.env.VITE_FIREBASE_PROJECT_ID) {
  process.env.FIREBASE_PROJECT_ID = 'relationship-id';
}
