import { useEffect, useState } from 'react';
import { parseHistoryRoute } from '../shared/navigation/history-route.js';
import { handlePageLink, navigationEvent } from '../shared/navigation/history-navigation.js';

export function useAppRoute() {
  const [view, setView] = useState(() => parseHistoryRoute(location.pathname, location.search));
  useEffect(() => {
    const changed = () => setView(parseHistoryRoute(location.pathname, location.search));
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
