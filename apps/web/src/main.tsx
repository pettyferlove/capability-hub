import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { I18nProvider, RouterProvider } from 'react-aria';
import { createRoot } from 'react-dom/client';
import { startLogging } from './shared/logging.js';
import App from './app/App.js';
import { initializeAppearance } from './app/appearance.js';
import { navigate } from './shared/navigation/history-navigation.js';
import './styles/index.css';

startLogging();
initializeAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider locale="zh-CN">
      <RouterProvider navigate={navigate}>
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </RouterProvider>
    </I18nProvider>
  </StrictMode>,
);
