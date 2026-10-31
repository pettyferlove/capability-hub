import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// 在每个 workspace 的构建脚本中执行，移除已删除源码遗留的编译文件。
await rm(resolve('dist'), { recursive: true, force: true });
