import { hubPageFor } from '@capability-hub/contracts/web-pages';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Connect } from 'vite';

/** 开发与预览只为有效的页面地址返回入口文件，其他请求继续走代理或静态文件服务。 */
function registerPageRoutes({ middlewares }: { middlewares: Connect.Server }) {
  middlewares.use((req, _res, next) => {
    const accept = req.headers.accept;
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      (!accept || accept.includes('text/html') || accept.includes('*/*')) &&
      hubPageFor(req.url ?? '')
    )
      req.url = '/index.html';
    next();
  });
}

// 开发服务器把后端路由整体代理到本地 API（4100），因此前端代码里的路径始终写成以 `/` 开头的绝对路径；
// 新增后端顶层路由时要同步加到这里，否则仅生产环境可用，开发时会 404。
export default defineConfig({
  appType: 'mpa',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'hub-pages',
      configureServer: registerPageRoutes,
      configurePreviewServer: registerPageRoutes,
    },
  ],
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
