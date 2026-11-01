import { useEffect, useState } from 'react';
import {
  appRoute,
  handlePageLink,
  navigationEvent,
} from '../shared/navigation/history-navigation.js';

/**
 * 订阅浏览器历史和站内导航事件得到当前路由视图；只有 `popstate` 与
 * {@link navigationEvent} 会触发重算，因为 `navigate` 用 pushState 改地址但不发 `popstate`。
 * 挂载期间同时接管页面内链接点击，未加修饰键的同源链接走客户端跳转；返回的新视图不是稳定引用，
 * 每次导航都会重新解析 `location`。
 */
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
