import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { contentSecurityPolicyMeta } from './src/shared/contentSecurityPolicy';

export default defineConfig({
  plugins: [react(), contentSecurityPolicyMeta()],
  root: 'src/renderer',
  publicDir: '../../public',
  define: {
    IS_WEB: 'true',
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3100',
      // The server's sign-in form (token mode).
      '/login': 'http://localhost:3100',
    },
  },
});
