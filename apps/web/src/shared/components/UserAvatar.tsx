import { userAvatarStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { useId } from 'react';
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
  const id = 'portrait-' + useId().replace(/:/g, '');
  const design = avatarDesign(identity);
  const palette = avatarPalettes.find((entry) => entry.id === color) ?? avatarPalettes[0];
  const accent = palette.accents[design.accent];
  const headX = 48 - design.headWidth / 2;
  return (
    <svg
      className={cn(userAvatarStyles, className)}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${name ?? '用户'}的头像`}
      focusable="false"
    >
      <defs>
        <clipPath id={id + '-clip'}>
          <circle cx="48" cy="48" r="48" />
        </clipPath>
        <linearGradient
          id={id + '-background'}
          x1="16"
          y1="0"
          x2="80"
          y2="96"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={palette.glow} />
          <stop offset="1" stopColor={palette.background} />
        </linearGradient>
        <linearGradient
          id={id + '-shell'}
          x1="36"
          y1="28"
          x2="64"
          y2="74"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={palette.light} />
          <stop offset="0.45" stopColor={palette.shell} />
          <stop offset="1" stopColor={palette.shade} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <path d="M0 0h96v96H0z" fill={`url(#${id}-background)`} />
        <g transform={`rotate(${design.orbit} 48 48)`} stroke={palette.shade}>
          <circle cx="48" cy="48" r="36" opacity="0.14" strokeWidth="1" />
          <path
            d="M14 38a36 36 0 0 1 38-26M77 69a36 36 0 0 1-20 14"
            opacity="0.35"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M18 21v6m-3-3h6M77 30v4m-2-2h4"
            opacity="0.5"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="81" cy="55" r="2.5" fill={accent} stroke="none" />
          <circle cx="32" cy="13" r="1.5" fill={palette.shade} stroke="none" opacity="0.6" />
        </g>
        <path d="M12 101c1-17 12-25 29-25h14c17 0 28 8 29 25" fill={palette.suit} />
        <path
          d="M22 88c6-5 12-7 18-7m16 0c7 0 13 3 18 7"
          stroke={palette.shell}
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path d="m38 77 10 11 10-11" fill={palette.shade} />
        <path d="M48 88v8" stroke={palette.shell} strokeWidth="2" />
        {design.badge === 0 ? (
          <path d="m65 84 4 5-4 5-4-5z" fill={accent} />
        ) : design.badge === 1 ? (
          <circle cx="65" cy="89" r="4" fill={accent} />
        ) : (
          <path d="M62 85h6v8h-6z" fill={accent} />
        )}
        <rect x="42" y="68" width="12" height="13" rx="4" fill={palette.shade} />
        <g transform={`rotate(${design.tilt} 48 54)`}>
          <g transform={design.mirrored ? 'translate(96 0) scale(-1 1)' : undefined}>
            {design.antenna === 0 ? (
              <>
                <path d="M48 31V20" stroke={palette.shade} strokeWidth="3" strokeLinecap="round" />
                <circle cx="48" cy="18" r="4" fill={accent} />
                <circle cx="47" cy="17" r="1" fill={palette.glow} />
              </>
            ) : design.antenna === 1 ? (
              <>
                <path
                  d="M40 31v-8l-7-4"
                  stroke={palette.shade}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="32" cy="18" r="4" fill={accent} />
              </>
            ) : design.antenna === 2 ? (
              <>
                <path
                  d="m42 30-4-10m16 10 4-10"
                  stroke={palette.shade}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <rect x="34" y="17" width="7" height="6" rx="2" fill={accent} />
                <rect x="55" y="17" width="7" height="6" rx="2" fill={accent} />
              </>
            ) : (
              <>
                <path
                  d="M44 30v-8h8v8"
                  stroke={palette.shade}
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
                <path d="M44 22h8" stroke={accent} strokeWidth="4" strokeLinecap="round" />
              </>
            )}
          </g>
          <rect
            x={headX - 7}
            y="43"
            width="10"
            height="18"
            rx={design.ears === 0 ? 5 : 3}
            fill={palette.shade}
          />
          <rect
            x={93 - headX}
            y="43"
            width="10"
            height="18"
            rx={design.ears === 0 ? 5 : 3}
            fill={palette.shade}
          />
          {design.ears === 2 && (
            <path
              d={`M${headX - 3} 48v7M${99 - headX} 48v7`}
              stroke={accent}
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
          <rect
            x={headX}
            y="28"
            width={design.headWidth}
            height="45"
            rx={design.headRadius}
            fill={`url(#${id}-shell)`}
            stroke={palette.shade}
            strokeWidth="1.5"
          />
          <path
            d={`M${headX + 9} 34h12`}
            stroke={palette.glow}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.7"
          />
          <rect x="45" y="31" width="9" height="3" rx="1.5" fill={accent} />
          <rect
            x="29"
            y="39"
            width="38"
            height="25"
            rx={design.eye === 2 ? 9 : 11}
            fill={palette.visor}
          />
          <path
            d="M35 42h15"
            stroke={palette.light}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.16"
          />
          {[48 - design.eyeGap / 2, 48 + design.eyeGap / 2].map((x, index) => (
            <g key={index}>
              {design.eye === 0 ? (
                <circle cx={x} cy="49" r="3.2" fill={palette.light} />
              ) : design.eye === 1 ? (
                <rect x={x - 2.5} y="45" width="5" height="8" rx="2.5" fill={palette.light} />
              ) : design.eye === 2 || index === 1 ? (
                <path
                  d={`M${x - 3} 50q3-6 6 0`}
                  stroke={palette.light}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              ) : (
                <circle cx={x} cy="49" r="3.2" fill={palette.light} />
              )}
            </g>
          ))}
          {design.mouth === 0 ? (
            <path d="M44 57q4 4 8 0" stroke={accent} strokeWidth="2" strokeLinecap="round" />
          ) : design.mouth === 1 ? (
            <path d="M45 58h6" stroke={accent} strokeWidth="2" strokeLinecap="round" />
          ) : design.mouth === 2 ? (
            <circle cx="48" cy="58" r="2" fill={accent} />
          ) : (
            <path
              d="M43 57v2m5-2v2m5-2v2"
              stroke={accent}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          )}
          <circle cx={headX + 7} cy="64" r="2" fill={palette.light} opacity="0.6" />
          <circle cx={89 - headX} cy="64" r="2" fill={palette.light} opacity="0.6" />
        </g>
      </g>
    </svg>
  );
}
