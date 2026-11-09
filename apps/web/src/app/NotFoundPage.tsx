import { DotGrid } from '../shared/components/react-bits/DotGrid.js';
import { ArrowRight, Compass } from '../shared/icons/lucide.js';
import { cn } from '../shared/styles/cn.js';
import { btnPrimaryStyles, btnStyles, eyebrowStyles } from '../shared/styles/recipes.js';
import {
  notFoundActionsStyles,
  notFoundDigitsStyles,
  notFoundDotsStyles,
  notFoundPathStyles,
  notFoundPixelStyles,
  notFoundStyles,
  notFoundTextStyles,
} from './styles.js';

// 5×7 点阵字形，与品牌 Glyph 使用同一种圆角方格。
const digits: Record<string, string[]> = {
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
};
const pixels = [...'404'].flatMap((digit, index) =>
  digits[digit].flatMap((row, y) =>
    [...row].map((bit, x) => ({ x: index * 6 + x, y, on: bit === '1' })),
  ),
);

/** 地址不属于任何页面时的落地页；服务端已为这类导航返回 404 状态。 */
export function NotFoundPage() {
  let revealIndex = 0;
  return (
    <section className={notFoundStyles} aria-labelledby="not-found-title">
      <DotGrid className={notFoundDotsStyles} />
      <svg viewBox="0 0 170 70" role="img" aria-label="404" className={notFoundDigitsStyles}>
        {pixels.map(({ x, y, on }) => (
          <rect
            key={`${x}:${y}`}
            x={x * 10 + 1.5}
            y={y * 10 + 1.5}
            width={7}
            height={7}
            rx={2}
            fill={on ? 'var(--brand)' : 'var(--glyph-off)'}
            className={on ? notFoundPixelStyles : undefined}
            style={on ? { animationDelay: `${revealIndex++ * 18}ms` } : undefined}
          />
        ))}
      </svg>
      <p className={cn(eyebrowStyles, 'font-mono')}>PAGE NOT FOUND</p>
      <h1 id="not-found-title">页面不存在</h1>
      <p className={notFoundTextStyles}>
        没有找到 <code className={notFoundPathStyles}>{location.pathname + location.search}</code>{' '}
        对应的页面，链接可能已失效或地址输入有误。
      </p>
      <div className={notFoundActionsStyles}>
        <a className={cn(btnStyles, btnPrimaryStyles)} href="/discover">
          <Compass size={15} aria-hidden="true" />
          返回资源目录
        </a>
        <a className={btnStyles} href="/connect">
          安装与接入
          <ArrowRight size={15} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
