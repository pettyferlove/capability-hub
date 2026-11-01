import { userAvatarStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { avatarDesign, avatarPalettes } from './user-avatar.js';

/**
 * 由账号标识生成的点阵头像；同一 `identity` 恒定得到同一图案，无需上传图片。
 * `color` 非法或缺失时回退到 {@link avatarPalettes} 首项，因为账号里可能存着已下线的配色。
 * 默认 `decorative`：旁边通常已有用户名文字，重复朗读只会干扰；单独作为身份信息展示时才设为假。
 */
export function UserAvatar({
  identity,
  name,
  color,
  size = 36,
  decorative = true,
  className = '',
}: {
  /** 决定点阵的稳定标识（如用户 id），不要用可能变化的显示名。 */
  identity: string;
  /** 仅 `decorative` 为假时用于拼无障碍名称，缺省「用户」。 */
  name?: string;
  /** 配色 id；非法/缺省落到首项。 */
  color?: string;
  /** 边长像素，默认 36；SVG 内部按 80×80 坐标系等比缩放。 */
  size?: number;
  /** 为真时对辅助技术隐藏（默认），页面需要单独朗读头像时置假。 */
  decorative?: boolean;
  className?: string;
}) {
  const design = avatarDesign(identity);
  const palette = avatarPalettes.find((entry) => entry.id === color) ?? avatarPalettes[0];
  return (
    <svg
      className={cn(userAvatarStyles, className)}
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      style={{ color: palette.color }}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${name ?? '用户'}的头像`}
      focusable="false"
    >
      <circle cx="40" cy="40" r="40" fill="color-mix(in srgb, currentColor 9%, var(--paper))" />
      {design.map((active, index) => (
        <rect
          key={index}
          x={16 + (index % 5) * 10}
          y={16 + Math.floor(index / 5) * 10}
          width="8"
          height="8"
          rx="2.5"
          fill={active ? 'currentColor' : 'color-mix(in srgb, currentColor 18%, var(--paper))'}
        />
      ))}
    </svg>
  );
}
