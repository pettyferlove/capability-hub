import { fileURLToPath } from 'node:url';

/** 程序随应用分发，临时目录只保存私有口令文件，可以挂载为 noexec。 */
export const sshAskpassPath = fileURLToPath(new URL('./ssh-askpass.sh', import.meta.url));
