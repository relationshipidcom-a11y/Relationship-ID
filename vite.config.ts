import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

export default defineConfig(({ command }) => {
  return {
    define: command === 'build' ? {
      'import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN': 'undefined',
    } : {},
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) return 'vendor-lucide';
              if (id.includes('qrcode.react')) return 'vendor-qrcode';
              if (id.includes('libphonenumber-js')) return 'vendor-phone';
              if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
              return 'vendor-misc';
            }
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      hmr: false,
      watch: null,
    },
  };
});

