import {
  appHeaderStyles,
  headerProgressStyles,
  headerInnerStyles,
  brandMarkStyles,
  brandCopyStyles,
  headerNavStyles,
  headerNavLabelStyles,
  navCountStyles,
  headerActionsStyles,
  searchTriggerStyles,
  headerSearchCopyStyles,
  headerSearchWideStyles,
  headerSearchSmallStyles,
} from './styles.js';
import {
  brandStyles,
  activeStyles,
  btnStyles,
  btnPrimaryStyles,
} from '../shared/styles/recipes.js';
import { cn } from '../shared/styles/cn.js';
import { Bot, Compass, Search, ShieldCheck, UploadCloud } from '../shared/icons/lucide.js';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { Glyph } from '../shared/components/Glyph.js';
import type { HubPage } from '@capability-hub/contracts/web-pages';
import { AvatarMenu } from './AvatarMenu.js';
import { useHub } from '../shared/context/HubContext.js';
import { loginHref } from '../shared/navigation/history-route.js';
import { ThemePicker } from './ThemePicker.js';
import type { useTheme } from './theme.js';
import { ShareHubButton } from '../features/connect/ShareHubButton.js';

const navigation = [
  { id: 'discover', label: '发现', icon: Compass },
  { id: 'publish', label: '发布', icon: UploadCloud },
  { id: 'review', label: '审核', icon: ShieldCheck },
  { id: 'connect', label: '接入 Agent', icon: Bot },
] as const;

/**
 * 顶栏：品牌、主导航、命令面板入口、主题与账号入口。
 * 导航项按登录状态裁剪（未登录只留目录与接入），
 * 因此传入的 `page` 可能对应一个当前不可见的导航项。
 */
export function AppHeader({
  page,
  reviewCount,
  theme,
  searchOpen,
  onSearch,
  returnTo = '/discover',
}: {
  page: HubPage;
  /** 待审核数量；0 时隐藏角标，只表示前端已知的数量，不代表全部队列。 */
  reviewCount: number;
  theme: ReturnType<typeof useTheme>;
  /** 命令面板是否展开，用于 `aria-expanded`；展开状态由父组件持有。 */
  searchOpen: boolean;
  onSearch: () => void;
  /** 登录链接的回跳地址，默认回到 `/discover`；只影响未登录时的登录按钮。 */
  returnTo?: string;
}) {
  const { me } = useHub();
  const [scrolled, setScrolled] = useState(false);
  const progressLine = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = window.scrollY;
      setScrolled(offset > 12);
      const root = document.documentElement;
      const range = root.scrollHeight - root.clientHeight;
      const progress = range > 0 ? Math.min(1, Math.max(0, offset / range)) : 0;
      if (progressLine.current) progressLine.current.style.transform = `scaleX(${progress})`;
    };
    const scroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', scroll);
    const observer = new ResizeObserver(scroll);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', scroll);
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <header className={appHeaderStyles} data-scrolled={scrolled}>
      <span ref={progressLine} aria-hidden="true" className={headerProgressStyles} />
      <div className={headerInnerStyles}>
        <a href="/discover" className={brandStyles}>
          <span className={brandMarkStyles} aria-hidden="true">
            <Glyph seed="capability-hub" kind="skill" size={29} animate={false} />
          </span>
          <span className={brandCopyStyles}>
            Capability Hub<small>能力共享中心</small>
          </span>
        </a>
        <nav className={headerNavStyles} aria-label="主导航">
          {navigation
            .filter((item) => me || item.id === 'discover' || item.id === 'connect')
            .map((item) => (
              <a
                key={item.id}
                href={'/' + item.id}
                className={page === item.id ? activeStyles : ''}
                aria-current={page === item.id ? 'page' : undefined}
                title={item.label}
              >
                <item.icon size={16} aria-hidden="true" />
                <span className={headerNavLabelStyles}>{item.label}</span>
                {item.id === 'review' && reviewCount > 0 && (
                  <span className={navCountStyles}>{reviewCount}</span>
                )}
              </a>
            ))}
        </nav>
        <div className={headerActionsStyles}>
          <Button
            type="button"
            aria-label="打开命令面板"
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            className={searchTriggerStyles}
            onPress={onSearch}
          >
            <Search size={18} aria-hidden="true" />
            <span className={headerSearchCopyStyles}>
              <span className={headerSearchWideStyles}>搜索 Skill 与 MCP…</span>
              <span className={headerSearchSmallStyles}>搜索能力</span>
            </span>
            <kbd aria-hidden="true">
              <span>⌘</span>
              <span>K</span>
            </kbd>
          </Button>
          <ShareHubButton />
          <ThemePicker {...theme} />
          {me ? (
            <AvatarMenu />
          ) : (
            <a className={cn(btnStyles, btnPrimaryStyles)} href={loginHref(returnTo)}>
              登录
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
