import { Icon, type IconifyIcon, type IconProps as IconifyProps } from '@iconify/react/offline';
import type { ComponentType } from 'react';

export type IconProps = Omit<IconifyProps, 'icon' | 'width' | 'height' | 'children' | 'mode'> & {
  size?: number;
};
export type IconComponent = ComponentType<IconProps>;

/** 静态图标数据随应用交付；保持直接 SVG 子节点，避免影响现有间距与动画。 */
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

export function createIcon(icon: IconifyIcon): IconComponent {
  return function AppSymbol(props) {
    return <AppIcon {...props} icon={icon} />;
  };
}
