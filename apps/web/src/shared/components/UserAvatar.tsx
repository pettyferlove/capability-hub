import { userAvatarStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { avatarDesign, avatarPalettes } from './user-avatar.js';

export function UserAvatar({
  identity,
  name,
  color,
  size = 36,
  decorative = true,
  className = '',
}: {
  identity: string;
  name?: string;
  color?: string;
  size?: number;
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
