#!/usr/bin/env bash
# E2E: coupons — CRUD, ownership, checkout application, usage limits, cancel release.
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

START=$(date -u -d '-1 day' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v-1d +%Y-%m-%dT%H:%M:%S.000Z)
END=$(date -u -d '+30 day' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v+30d +%Y-%m-%dT%H:%M:%S.000Z)
# Unique per run (coupons persist in the dev DB across runs).
CODE="PCT${TS: -4}"

# --- seller ---
SELLER_EMAIL="cseller${TS}@test.com"
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Coupon Seller\",\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Coupon Traders\",\"gstin\":\"27FGHIJ${TS: -4}F1ZV\",\"pan\":\"FGHIJ${TS: -4}F\",\"bankAccountHolderName\":\"Coupon Seller\",\"bankAccountNumber\":\"123456789012\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Main Rd\",\"city\":\"Pune\",\"state\":\"MH\",\"pincode\":\"411001\"}" > /dev/null
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@1234"}' | json 'd["data"]["accessToken"]')
SELLER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
PROFILE_ID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['id'] for s in d['data']['items'] if s['gstin'].startswith('27FGHIJ')][0])")
curl -s -X PATCH "$BASE/admin/sellers/$PROFILE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null

PRODUCT_ID=$(curl -s -X POST "$BASE/products" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Coupon Widget","price":1000,"stock":50,"status":"ACTIVE"}' | json 'd["data"]["id"]')

# --- buyers ---
new_buyer() {
  local email="cbuyer${TS}$1@test.com"
  curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
    -d "{\"name\":\"Coupon Buyer $1\",\"email\":\"$email\",\"password\":\"Password123!\"}" > /dev/null
  local token
  token=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
  local addr
  addr=$(curl -s -X POST "$BASE/users/me/addresses" -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d '{"recipientName":"Coupon Buyer","phone":"9876543210","addressLine1":"10 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | json 'd["data"]["id"]')
  echo "$token|$addr"
}

checkout() {
  local token="$1" addr="$2" code="$3"
  curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"shippingAddressId\":\"$addr\",\"couponCode\":\"$code\"}"
}

# --- create coupon ---
CREATED_STATUS=$(status -X POST "$BASE/coupons" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE\",\"type\":\"PERCENTAGE\",\"value\":10,\"startAt\":\"$START\",\"endAt\":\"$END\",\"usageLimit\":2,\"perUserLimit\":1}")
check "create coupon 201" "201" "$CREATED_STATUS"
CREATED=$(curl -s "$BASE/coupons" -H "Authorization: Bearer $SELLER_TOKEN")
COUPON_ID=$(echo "$CREATED" | python -c "import sys,json;d=json.load(sys.stdin);print([c['id'] for c in d['data']['items'] if c['code']=='$CODE'][0])")
check "code normalized uppercase" "$CODE" "$(curl -s "$BASE/coupons/$COUPON_ID" -H "Authorization: Bearer $SELLER_TOKEN" | json 'd["data"]["code"]')"

DUP=$(status -X POST "$BASE/coupons" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"$(echo "$CODE" | tr 'A-Z' 'a-z')\",\"type\":\"PERCENTAGE\",\"value\":10,\"startAt\":\"$START\",\"endAt\":\"$END\"}")
check "duplicate code 409" "409" "$DUP"

BADREST=$(status -X POST "$BASE/coupons" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"BADREST\",\"type\":\"PERCENTAGE\",\"value\":10,\"productIds\":[\"000000000000000000000000\"],\"startAt\":\"$START\",\"endAt\":\"$END\"}")
check "bad product restriction 400" "400" "$BADREST"

# --- checkout with coupon ---
B1=$(new_buyer 1); B1T=${B1%%|*}; B1A=${B1##*|}
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $B1T" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
O1=$(checkout "$B1T" "$B1A" "$CODE")
check "checkout total 900" "900" "$(echo "$O1" | json 'd["data"][0]["total"]')"
check "coupon discount 100" "100" "$(echo "$O1" | json 'd["data"][0]["couponDiscount"]')"
ORDER1_ID=$(echo "$O1" | json 'd["data"][0]["id"]')

# per-user limit: same buyer second use rejected
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $B1T" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
B1A2=$(curl -s -X POST "$BASE/users/me/addresses" -H "Authorization: Bearer $B1T" \
  -H "Content-Type: application/json" \
  -d '{"recipientName":"Coupon Buyer","phone":"9876543210","addressLine1":"11 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | json 'd["data"]["id"]')
SECOND=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $B1T" \
  -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$B1A2\",\"couponCode\":\"$CODE\"}")
check "per-user limit rejected" "COUPON_PER_USER_LIMIT_REACHED" "$(echo "$SECOND" | json 'd["code"]')"

# second buyer uses it (usageLimit=2)
B2=$(new_buyer 2); B2T=${B2%%|*}; B2A=${B2##*|}
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $B2T" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
O2=$(checkout "$B2T" "$B2A" "$CODE")
check "second buyer checkout 201" "201" "$(echo "$O2" | python -c "import sys,json;print(201 if json.load(sys.stdin).get('success') else 400)")"

# third buyer -> total limit reached
B3=$(new_buyer 3); B3T=${B3%%|*}; B3A=${B3##*|}
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $B3T" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
O3=$(checkout "$B3T" "$B3A" "$CODE")
check "usage limit reached (2/2 used)" "COUPON_USAGE_LIMIT_REACHED" "$(echo "$O3" | json 'd["code"]')"

# cancel first order -> releases one slot
CANCEL=$(status -X POST "$BASE/orders/$ORDER1_ID/cancel" -H "Authorization: Bearer $B1T")
check "cancel order 200" "200" "$CANCEL"
O4=$(checkout "$B3T" "$B3A" "$CODE")
check "slot released after cancel" "201" "$(echo "$O4" | python -c "import sys,json;print(201 if json.load(sys.stdin).get('success') else 400)")"

# ownership: buyer blocked from seller coupon list
check "buyer blocked from coupon list 403" "403" "$(status "$BASE/coupons" -H "Authorization: Bearer $B1T")"
check "seller coupon list ok" "200" "$(status "$BASE/coupons" -H "Authorization: Bearer $SELLER_TOKEN")"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
