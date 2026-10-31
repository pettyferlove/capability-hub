#!/bin/sh
set -eu
bucket="${CAPABILITY_HUB_MINIO_BUCKET}"
case "$bucket" in ''|*[!a-z0-9.-]*) echo 'Invalid bucket name' >&2; exit 1;; esac
if [ "$CAPABILITY_HUB_MINIO_ACCESS_KEY" = "$MINIO_ROOT_USER" ]; then
  echo 'Application and administrator accounts must differ' >&2
  exit 1
fi
attempt=0
until mc alias set storage http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 && mc ready storage >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then echo 'MinIO readiness timed out' >&2; exit 1; fi
  sleep 1
done
# 仅用于首次配置，已有账号和策略需通过独立运维流程维护。
policy="capability-hub-$bucket"
if mc admin user info storage "$CAPABILITY_HUB_MINIO_ACCESS_KEY" >/dev/null 2>&1; then
  echo 'Application user already exists; skip bootstrap or provision the existing user explicitly' >&2
  exit 1
fi
if mc admin policy info storage "$policy" >/dev/null 2>&1; then
  echo 'Scoped policy already exists; refusing to replace it' >&2
  exit 1
fi
mc mb --ignore-existing "storage/$bucket" >/dev/null
mc anonymous set private "storage/$bucket" >/dev/null
cat > /tmp/policy.json <<POLICY
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket"],"Resource":["arn:aws:s3:::$bucket"]},{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject"],"Resource":["arn:aws:s3:::$bucket/blobs/*"]}]}
POLICY
mc admin user add storage "$CAPABILITY_HUB_MINIO_ACCESS_KEY" "$CAPABILITY_HUB_MINIO_SECRET_KEY" >/dev/null
mc admin policy create storage "$policy" /tmp/policy.json >/dev/null
mc admin policy attach storage "$policy" --user "$CAPABILITY_HUB_MINIO_ACCESS_KEY" >/dev/null
