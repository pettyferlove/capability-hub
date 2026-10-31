import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4100',
      '/auth': 'http://127.0.0.1:4100',
      '/skills': 'http://127.0.0.1:4100',
      '/mcp-servers': 'http://127.0.0.1:4100',
      '/mcp': 'http://127.0.0.1:4100',
      '/connect/mcp': 'http://127.0.0.1:4100',
      '/INSTALL.md': 'http://127.0.0.1:4100',
    },
  },
  build: { target: 'es2022', emptyOutDir: true },
});
