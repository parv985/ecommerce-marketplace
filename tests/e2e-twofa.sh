#!/usr/bin/env bash
# E2E: TOTP 2FA — setup, enable, two-step login, recovery codes, disable.
set -u
BASE="http://localhost:5000/api/v1"
PASS=0; FAIL=0
TS=$(date +%s)

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS+1)); echo "PASS: $label"
  else
    FAIL=$((FAIL+1)); echo "FAIL: $label (expected '$expected', got '$actual')"
  fi
}

json() { python -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# RFC 6238 TOTP (6 digits, HMAC-SHA1, 30s step) — mirrors src/utils/totp.ts.
totp() {
  python -c "
import hmac, base64, struct, hashlib, time, sys
secret = sys.argv[1]
key = base64.b32decode(secret)
counter = int(time.time()) // 30
msg = struct.pack('>Q', counter)
h = hmac.new(key, msg, hashlib.sha1).digest()
o = h[-1] & 0x0f
code = (struct.unpack('>I', h[o:o+4])[0] & 0x7fffffff) % 1000000
print(f'{code:06d}')
" "$1"
}

# --- seller ---
SELLER_EMAIL="tfseller${TS}@test.com"
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"TwoFA Seller\",\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"TwoFA Traders\",\"gstin\":\"27UVWXY${TS: -4}F1ZV\",\"pan\":\"UVWXY${TS: -4}F\",\"bankAccountHolderName\":\"TwoFA Seller\",\"bankAccountNumber\":\"123456789012\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Main Rd\",\"city\":\"Pune\",\"state\":\"MH\",\"pincode\":\"411001\"}" > /dev/null
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@1234"}' | json 'd["data"]["accessToken"]')
SELLER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
PROFILE_ID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['id'] for s in d['data']['items'] if s['gstin'].startswith('27UVWXY')][0])")
curl -s -X PATCH "$BASE/admin/sellers/$PROFILE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null
check "login before 2FA is direct" "True" "$([ -n "$SELLER_TOKEN" ] && echo True)"

# --- setup ---
SETUP=$(curl -s -X POST "$BASE/auth/2fa/setup" -H "Authorization: Bearer $SELLER_TOKEN")
SECRET=$(echo "$SETUP" | json 'd["data"]["secret"]')
RECOVERY=$(echo "$SETUP" | json 'd["data"]["recoveryCodes"][0]')
check "setup returns secret" "True" "$([ -n "$SECRET" ] && echo True)"
check "setup returns 8 recovery codes" "8" "$(echo "$SETUP" | json 'len(d["data"]["recoveryCodes"])')"
OTPAUTH=$(echo "$SETUP" | json 'd["data"]["otpauthUrl"]')
check "otpauth url" "True" "$(echo "$OTPAUTH" | grep -q '^otpauth://' && echo True)"

# --- enable with wrong then right TOTP ---
CODE=$(totp "$SECRET")
check "enable wrong code 400" "400" "$(status -X POST "$BASE/auth/2fa/enable" -H "Authorization: Bearer $SELLER_TOKEN" -H "Content-Type: application/json" -d '{"code":"000000"}')"
check "enable 200" "200" "$(status -X POST "$BASE/auth/2fa/enable" -H "Authorization: Bearer $SELLER_TOKEN" -H "Content-Type: application/json" -d "{\"code\":\"$CODE\"}")"

# --- two-step login ---
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}")
check "login requires 2FA" "True" "$(echo "$LOGIN" | json 'd["data"]["twoFactorRequired"]')"
LOGIN_TOKEN=$(echo "$LOGIN" | json 'd["data"]["loginToken"]')
check "no access token yet" "True" "$([ "$(echo "$LOGIN" | json 'd["data"].get("accessToken")')" = "None" ] && echo True)"
CODE=$(totp "$SECRET")
check "verify wrong code 401" "401" "$(status -X POST "$BASE/auth/2fa/verify" -H "Content-Type: application/json" -d "{\"loginToken\":\"$LOGIN_TOKEN\",\"code\":\"000000\"}")"
VERIFIED=$(curl -s -X POST "$BASE/auth/2fa/verify" -H "Content-Type: application/json" -d "{\"loginToken\":\"$LOGIN_TOKEN\",\"code\":\"$CODE\"}")
FINAL_TOKEN=$(echo "$VERIFIED" | json 'd["data"]["accessToken"]')
check "verify issues access token" "True" "$([ -n "$FINAL_TOKEN" ] && echo True)"
check "token works on protected endpoint" "200" "$(status "$BASE/users/me" -H "Authorization: Bearer $FINAL_TOKEN")"

# --- recovery code: works once, then rejected ---
LOGIN2=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["loginToken"]')
check "recovery code completes login" "200" "$(status -X POST "$BASE/auth/2fa/verify" -H "Content-Type: application/json" -d "{\"loginToken\":\"$LOGIN2\",\"code\":\"$RECOVERY\"}")"
LOGIN3=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["loginToken"]')
check "recovery code reuse rejected" "401" "$(status -X POST "$BASE/auth/2fa/verify" -H "Content-Type: application/json" -d "{\"loginToken\":\"$LOGIN3\",\"code\":\"$RECOVERY\"}")"

# --- disable restores direct login ---
CODE=$(totp "$SECRET")
check "disable 200" "200" "$(status -X POST "$BASE/auth/2fa/disable" -H "Authorization: Bearer $SELLER_TOKEN" -H "Content-Type: application/json" -d "{\"code\":\"$CODE\"}")"
DIRECT=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}")
check "direct login restored" "True" "$([ -n "$(echo "$DIRECT" | json 'd["data"]["accessToken"]')" ] && echo True)"

# --- buyer unaffected + unauthenticated setup blocked ---
BUYER_EMAIL="tfbuyer${TS}@test.com"
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"TwoFA Buyer\",\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
BUYER_LOGIN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}")
check "buyer login is direct" "True" "$([ -n "$(echo "$BUYER_LOGIN" | json 'd["data"]["accessToken"]')" ] && echo True)"
check "setup requires auth" "401" "$(status -X POST "$BASE/auth/2fa/setup")"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
