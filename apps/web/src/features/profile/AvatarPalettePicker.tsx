import {
  avatarPalettePickerStyles,
  avatarPaletteOptionsStyles,
  avatarPaletteOptionStyles,
} from './styles.js';
import { UserAvatar } from '../../shared/components/UserAvatar.js';
import { avatarPalettes, type AvatarColor } from '../../shared/components/user-avatar.js';

/**
 * 头像配色单选组：只负责把选中的调色板回传给父级，配色本身的持久化与 `revision` 校验
 * 由调用方（{@link PersonalProfile}）在保存时处理；两个账号的同一配色经
 * {@link UserAvatar} 按身份散列成不同图案，因此配色相同不等于头像相同。
 */
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
