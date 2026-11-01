import { Icon, type IconifyIcon, type IconProps as IconifyProps } from '@iconify/react/offline';
import type { ComponentType } from 'react';

/**
 * 图标组件的通用属性：`size` 是边长像素（默认 16），同时作为宽高；
 * `icon`/`children`/`mode` 被移除，因为图标内容由 {@link AppIcon} 或 {@link createIcon} 固定。
 */
export type IconProps = Omit<IconifyProps, 'icon' | 'width' | 'height' | 'children' | 'mode'> & {
  size?: number;
};

/** 固定图标的组件类型；所有图标共用同一签名，因此可以直接放进映射表或数组渲染。 */
export type IconComponent = ComponentType<IconProps>;

/**
 * 静态图标数据随应用交付；保持直接 SVG 子节点，避免影响现有间距与动画。
 * 只有调用方提供 `aria-label`/`aria-labelledby` 时才作为图片朗读，否则一律 `aria-hidden`——
 * 图标多为装饰，漏传标签不会产生一串无意义的朗读。
 * `strokeWidth` 非 2 时把数据里的 `stroke-width="2"` 改成 `inherit`，因此只有用 2 绘制描边的图标集能正确套用其它宽度。
 */
export function AppIcon({
  icon,
  size = 16,
  strokeWidth = 2,
  ...props
}: IconProps & { icon: IconifyIcon }) {
  const labelled = !!(props['aria-label'] || props['aria-labelledby']);
  return (
    <Icon
      aria-hidden={!labelled}
      role={labelled ? 'img' : undefined}
      {...props}
      icon={
        strokeWidth === 2
          ? icon
          : { ...icon, body: icon.body.replaceAll('stroke-width="2"', 'stroke-width="inherit"') }
      }
      mode="svg"
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      focusable="false"
    />
  );
}

/**
 * 把一份 Iconify 数据包成固定图标的组件；返回的组件已绑定 `icon`，调用方只传 `size` 等展示属性。
 * 必须在模块顶层创建并复用：在渲染期调用会得到新的组件类型，导致每次渲染都卸载重建子树。
 */
export function createIcon(icon: IconifyIcon): IconComponent {
  return function AppSymbol(props) {
    return <AppIcon {...props} icon={icon} />;
  };
}
