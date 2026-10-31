#!/bin/sh
set -eu
ssh-keygen -A >/dev/null
mkdir -p /tmp/fixture/scripts
cat > /tmp/fixture/SKILL.md <<'SKILL'
---
name: fixture-skill
description: 固定 Git 提交的测试资源
---

# Git 测试资源

读取 [脚本](scripts/check.sh)，不执行内容。
SKILL
cat > /tmp/fixture/scripts/check.sh <<'SCRIPT'
#!/bin/sh
printf 'uploaded content must not execute' > /tmp/content-was-executed
SCRIPT
git -C /tmp/fixture init --initial-branch=main >/dev/null
git -C /tmp/fixture -c user.name=Fixture -c user.email=fixture@example.test add .
git -C /tmp/fixture -c user.name=Fixture -c user.email=fixture@example.test commit -m fixture >/dev/null
git -C /tmp/fixture checkout -b invalid-utf8 >/dev/null 2>&1
invalid_name=$(printf '\377.txt')
printf 'invalid UTF-8 path' > "/tmp/fixture/$invalid_name"
git -C /tmp/fixture add .
git -C /tmp/fixture -c user.name=Fixture -c user.email=fixture@example.test commit -m invalid-path >/dev/null
git -C /tmp/fixture checkout main >/dev/null 2>&1
git clone --bare /tmp/fixture /repositories/fixture.git >/dev/null 2>&1
chown -R git:git /repositories
exec /usr/sbin/sshd -D -e -p 2222 -o PidFile=/run/sshd.pid -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o PermitRootLogin=no -o StrictModes=no -o AllowUsers=git
