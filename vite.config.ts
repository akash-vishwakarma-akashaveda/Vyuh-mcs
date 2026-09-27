import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // Two pages: the operator console and the separate Simulator Lab.
      input: { main: path.resolve(__dirname, 'index.html'), simlab: path.resolve(__dirname, 'simlab.html') },
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
