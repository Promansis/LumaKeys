import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { contentSecurityPolicyMeta } from './src/shared/contentSecurityPolicy';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: 'src/main/index.ts',
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: 'src/main/preload.ts',
        output: {
          format: 'cjs',
          entryFileNames: 'preload.js',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), contentSecurityPolicyMeta()],
    publicDir: '../../public',
    define: {
      IS_WEB: 'false',
    },
    build: {
      rollupOptions: {
        input: 'src/renderer/index.html',
      },
    },
  },
});
