#!/usr/bin/env bash
#
# Deploy the Recipe App fetch proxy as an AWS Lambda + public Function URL.
#
# Usage:
#   ./deploy.sh                                  # sensible defaults
#   REGION=eu-west-1 ./deploy.sh
#   PROXY_TOKEN=hunter2 ./deploy.sh              # require ?token= on every request
#   ALLOWED_HOSTS="seriouseats.com,bbcgoodfood.com" ./deploy.sh
#   ROLE_ARN=arn:aws:iam::123456789012:role/my-role ./deploy.sh
#   DESTROY=1 ./deploy.sh                        # tear the function down again
#
# Requires: aws CLI v2 (configured credentials), zip.
# See README.md for the console-only path and the app-side switch.

set -euo pipefail

# The AWS CLI isn't always on PATH (e.g. /usr/local/bin on Intel macOS, which is
# how it's installed on this machine) — make sure we can find it.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

FUNCTION_NAME="${FUNCTION_NAME:-recipe-fetch-proxy}"
REGION="${REGION:-${AWS_REGION:-us-east-1}}"
ROLE_NAME="${ROLE_NAME:-${FUNCTION_NAME}-role}"
ROLE_ARN="${ROLE_ARN:-}"
RUNTIME="nodejs20.x"
TIMEOUT="${TIMEOUT:-20}"          # seconds; keep above FETCH_TIMEOUT_MS, below the app's 25 s abort
MEMORY="${MEMORY:-256}"           # MB
PROXY_TOKEN="${PROXY_TOKEN:-}"
ALLOWED_HOSTS="${ALLOWED_HOSTS:-}"

HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$HERE/build"
ZIP_PATH="$BUILD_DIR/proxy.zip"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v aws >/dev/null 2>&1 || die "aws CLI not found (install AWS CLI v2: https://aws.amazon.com/cli/)"
command -v zip >/dev/null 2>&1 || die "zip not found"

say "Checking AWS credentials…"
aws sts get-caller-identity --region "$REGION" --output json >/dev/null \
  || die "no usable AWS credentials (run 'aws login' or 'aws configure')"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "$REGION")"
say "  account $ACCOUNT_ID · region $REGION"

if [ "${DESTROY:-0}" = "1" ]; then
  say "Deleting function $FUNCTION_NAME…"
  aws lambda delete-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1 || true
  say "Deleted. IAM role ${ROLE_NAME} (if created by this script) was left in place — remove it manually if you like."
  exit 0
fi

# ---------------------------------------------------------------- IAM role ---
if [ -z "$ROLE_ARN" ]; then
  say "Resolving execution role…"
  ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || true)"
  if [ -z "$ROLE_ARN" ] || [ "$ROLE_ARN" = "None" ]; then
    say "  creating role $ROLE_NAME"
    aws iam create-role --role-name "$ROLE_NAME" \
      --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
      >/dev/null
    aws iam attach-role-policy --role-name "$ROLE_NAME" \
      --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
    ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)"
    say "  waiting for IAM propagation…"
    sleep 10
  fi
  say "  role: $ROLE_ARN"
fi

# ------------------------------------------------------------------- build ---
say "Packaging…"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp "$HERE/index.mjs" "$BUILD_DIR/index.mjs"
# -j: junk paths, so the zip root holds index.mjs (handler is index.handler)
(cd "$BUILD_DIR" && zip -q -j proxy.zip index.mjs)
say "  $ZIP_PATH ($(wc -c < "$ZIP_PATH" | tr -d ' ') bytes)"

# ---------------------------------------------------------- env + function ---
ENV_VARS="{"
SEP=""
if [ -n "$PROXY_TOKEN" ]; then ENV_VARS+="\"PROXY_TOKEN\":\"$PROXY_TOKEN\""; SEP=","; fi
if [ -n "$ALLOWED_HOSTS" ]; then ENV_VARS+="$SEP\"ALLOWED_HOSTS\":\"$ALLOWED_HOSTS\""; SEP=","; fi
ENV_VARS+="}"

if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  say "Updating existing function $FUNCTION_NAME…"
  aws lambda update-function-code --function-name "$FUNCTION_NAME" --region "$REGION" \
    --zip-file "fileb://$ZIP_PATH" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" --region "$REGION" \
    --runtime "$RUNTIME" --handler index.handler --timeout "$TIMEOUT" --memory-size "$MEMORY" \
    --environment "{\"Variables\":$ENV_VARS}" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
else
  say "Creating function $FUNCTION_NAME…"
  aws lambda create-function --function-name "$FUNCTION_NAME" --region "$REGION" \
    --runtime "$RUNTIME" --handler index.handler --timeout "$TIMEOUT" --memory-size "$MEMORY" \
    --role "$ROLE_ARN" --environment "{\"Variables\":$ENV_VARS}" \
    --zip-file "fileb://$ZIP_PATH" >/dev/null
  aws lambda wait function-active --function-name "$FUNCTION_NAME" --region "$REGION"
fi

# ------------------------------------------------------------- function URL ---
FUNCTION_URL="$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" \
  --query FunctionUrl --output text 2>/dev/null || true)"
if [ -z "$FUNCTION_URL" ] || [ "$FUNCTION_URL" = "None" ]; then
  say "Creating Function URL (auth: NONE, CORS handled in code)…"
  FUNCTION_URL="$(aws lambda create-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" \
    --auth-type NONE --query FunctionUrl --output text)"
fi
# Idempotent resource policy. Since October 2025 a *new* function URL needs BOTH
# statements — lambda:InvokeFunctionUrl AND lambda:InvokeFunction — or every
# request gets a 403 even with auth type NONE.
add_permission() {
  local out
  if ! out="$(aws lambda add-permission --function-name "$FUNCTION_NAME" --region "$REGION" "$@" 2>&1)"; then
    case "$out" in
      *ResourceConflictException*) return 0 ;; # already granted
      *) printf 'error: add-permission failed: %s\n' "$out" >&2; return 1 ;;
    esac
  fi
}

add_permission --statement-id FunctionURLPublicAccess \
  --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE
add_permission --statement-id FunctionURLInvokeFunction \
  --action lambda:InvokeFunction --principal "*" --invoked-via-function-url

# ----------------------------------------------------------------- verify ----
PROXY_URL="${FUNCTION_URL}?url="
[ -n "$PROXY_TOKEN" ] && PROXY_URL="${FUNCTION_URL}?token=${PROXY_TOKEN}&url="

say "Smoke test…"
TEST_URL="${FUNCTION_URL}?url=https%3A%2F%2Fexample.com%2F"
[ -n "$PROXY_TOKEN" ] && TEST_URL="${FUNCTION_URL}?token=${PROXY_TOKEN}&url=https%3A%2F%2Fexample.com%2F"
TEST_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "$TEST_URL" || true)"
if [ "$TEST_STATUS" = "200" ]; then
  say "  HTTP 200 ✔"
else
  say "  HTTP $TEST_STATUS — expected 200."
  say "  A 403 here usually means the resource policy hasn't propagated yet;"
  say "  wait ~10s and retry, or check: aws lambda get-policy --function-name $FUNCTION_NAME --region $REGION"
fi

cat <<EOF

$(say "Done.")
Paste this into The Recipe App → Settings → General → CORS proxy:

    $PROXY_URL

Then import a recipe to confirm. Logs: aws logs tail /aws/lambda/$FUNCTION_NAME --follow --region $REGION
EOF
