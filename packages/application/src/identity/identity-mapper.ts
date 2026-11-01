import type { UserRecord } from '@capability-hub/domain/models';
import { userLoginProvider } from '@capability-hub/domain/identity';

/** 账号响应只列出允许公开的字段，新增持久化字段不会自动进入接口。 */
export function toUserSummary(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    auth_provider: userLoginProvider(user),
    display_name: user.display_name,
    active: user.active,
    revision: user.revision,
    created_at: user.created_at,
    avatar_color: user.avatar_color,
    title: user.title,
    bio: user.bio,
    email: user.email,
  };
}
