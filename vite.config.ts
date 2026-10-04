import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  // rebuildCesium: bundle Cesium as its own lazy chunk instead of a blocking <script> on every page.
  plugins: [react(), cesium({ rebuildCesium: true })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // Two pages: the operator console and the separate Simulator Lab.
      input: { main: path.resolve(__dirname, 'index.html'), simlab: path.resolve(__dirname, 'simlab.html') },
      output: {
        manualChunks(id) {
          // Shared helpers (lazy-import preload, CJS interop) must not land in the cesium chunk, or main would preload it.
          if (id.includes('preload-helper') || id.includes('commonjsHelpers')) return 'react-vendor';
          if (!id.includes('node_modules')) return undefined;
          if (/[\/](cesium|@cesium)[\/]/.test(id)) return 'cesium';
          if (/[\/]uplot[\/]/.test(id)) return 'uplot';
          if (/[\/](recharts|d3-[^\/]+|victory-vendor)[\/]/.test(id)) return 'recharts';
          if (/[\/](react|react-dom|scheduler|zustand|framer-motion)[\/]/.test(id)) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/ws/telemetry': {
        target: 'ws://127.0.0.1:8088',
        ws: true,
        changeOrigin: true,
      },
      '/api/v1': {
        target: 'http://127.0.0.1:8085',
        changeOrigin: true,
      },
    },
  },
});
