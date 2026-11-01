/**
 * SSH_ASKPASS 脚本源码，由调用方写入 0700 临时文件后通过环境变量指向它。
 *
 * 用途：私钥带口令时，git 不会去交互式终端问口令，而是执行该脚本；脚本只把
 * `CAPABILITY_SSH_PASSPHRASE_FILE` 指向文件的内容原样输出，因此口令不进入命令行参数
 * （`ps` 可见）也不进入 git 配置。文件路径与文件权限由 `GitRepositoryAdapter` 的临时目录负责。
 */
export const sshAskpass = '#!/bin/sh\nexec /bin/cat "$CAPABILITY_SSH_PASSPHRASE_FILE"\n';
