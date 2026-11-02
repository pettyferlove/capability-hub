import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 开发服务器把后端路由整体代理到本地 API（4100），因此前端代码里的路径始终写成以 `/` 开头的绝对路径；
// 新增后端顶层路由时要同步加到这里，否则仅生产环境可用，开发时会 404。
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
      '/connect/skills': 'http://127.0.0.1:4100',
      '/INSTALL.md': 'http://127.0.0.1:4100',
    },
  },
  build: { target: 'es2022', emptyOutDir: true },
});
