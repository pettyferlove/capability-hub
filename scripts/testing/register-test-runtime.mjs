import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

// 测试进程显式使用同一份 JSX 编译配置。
register({ tsconfig: fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url)) });
