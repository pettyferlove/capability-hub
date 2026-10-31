import {
  avatarPalettePickerStyles,
  avatarPaletteOptionsStyles,
  avatarPaletteOptionStyles,
} from './styles.js';
import { UserAvatar } from '../../shared/components/UserAvatar.js';
import { avatarPalettes, type AvatarColor } from '../../shared/components/user-avatar.js';

export function AvatarPalettePicker({
  identity,
  color,
  onChange,
}: {
  identity: string;
  color: string;
  onChange: (color: AvatarColor) => void;
}) {
  return (
    <fieldset className={avatarPalettePickerStyles}>
      <legend>头像配色</legend>
      <div className={avatarPaletteOptionsStyles}>
        {avatarPalettes.map((palette) => (
          <label className={avatarPaletteOptionStyles} key={palette.id}>
            <input
              type="radio"
              name="avatar_color"
              value={palette.id}
              checked={color === palette.id}
              onChange={() => onChange(palette.id)}
            />
            <UserAvatar identity={identity} color={palette.id} size={36} />
            <span>{palette.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
