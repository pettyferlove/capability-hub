import { useEffect, useState } from 'react';
import {
  appRoute,
  handlePageLink,
  navigationEvent,
} from '../shared/navigation/history-navigation.js';

export function useAppRoute() {
  const [view, setView] = useState(() =>
    appRoute(location.pathname, location.search, window.history.state),
  );
  useEffect(() => {
    const changed = () =>
      setView(appRoute(location.pathname, location.search, window.history.state));
    window.addEventListener('popstate', changed);
    window.addEventListener(navigationEvent, changed);
    document.addEventListener('click', handlePageLink);
    return () => {
      window.removeEventListener('popstate', changed);
      window.removeEventListener(navigationEvent, changed);
      document.removeEventListener('click', handlePageLink);
    };
  }, []);
  return view;
}
