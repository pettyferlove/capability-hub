#!/bin/sh
set -eu
export MC_CONFIG_DIR=/tmp/mc-test
mc alias set test http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc admin user add test hub_test_application "$CAPABILITY_HUB_TEST_APP_SECRET" >/dev/null
cat > /tmp/test-policy.json <<'POLICY'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket"],"Resource":["arn:aws:s3:::hub-test-*"]},{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::hub-test-*/blobs/*"]}]}
POLICY
mc admin policy create test hub-test /tmp/test-policy.json >/dev/null
mc admin policy attach test hub-test --user hub_test_application >/dev/null
