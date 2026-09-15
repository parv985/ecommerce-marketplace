#!/usr/bin/env bash
# E2E: commission + settlements — settings, idempotent generation, lifecycle, seller view.
set -u
BASE="http://localhost:5000/api/v1"
PASS=0; FAIL=0
TS=$(date +%s)
MONTH=$(date -u +%Y-%m)

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

# --- seller + product ---
SELLER_EMAIL="sseller${TS}@test.com"
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Settle Seller\",\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Settle Traders\",\"gstin\":\"27ZYXWV${TS: -4}F1ZV\",\"pan\":\"ZYXWV${TS: -4}F\",\"bankAccountHolderName\":\"Settle Seller\",\"bankAccountNumber\":\"123456789012\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Main Rd\",\"city\":\"Pune\",\"state\":\"MH\",\"pincode\":\"411001\"}" > /dev/null
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@1234"}' | json 'd["data"]["accessToken"]')
SELLER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
PROFILE_ID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['id'] for s in d['data']['items'] if s['gstin'].startswith('27ZYXWV')][0])")
curl -s -X PATCH "$BASE/admin/sellers/$PROFILE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null
PRODUCT_ID=$(curl -s -X POST "$BASE/products" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Settle Widget","price":1000,"stock":10,"status":"ACTIVE"}' | json 'd["data"]["id"]')

# --- buyer delivers + pays one order ---
BUYER_EMAIL="sbuyer${TS}@test.com"
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Settle Buyer\",\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
BUYER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
ADDR=$(curl -s -X POST "$BASE/users/me/addresses" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipientName":"Settle Buyer","phone":"9876543210","addressLine1":"10 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | json 'd["data"]["id"]')
ORDER_ID=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$ADDR\"}" | json 'd["data"][0]["id"]')
for S in CONFIRMED SHIPPED DELIVERED; do
  curl -s -X PATCH "$BASE/orders/$ORDER_ID/status" -H "Authorization: Bearer $SELLER_TOKEN" \
    -H "Content-Type: application/json" -d "{\"status\":\"$S\"}" > /dev/null
done
curl -s -X POST "$BASE/orders/$ORDER_ID/pay" -H "Authorization: Bearer $SELLER_TOKEN" > /dev/null

# --- commission settings ---
check "commission rate 400" "400" "$(status -X PATCH "$BASE/admin/settings/commission" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"rate":150}')"
check "set commission 15" "15" "$(curl -s -X PATCH "$BASE/admin/settings/commission" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"rate":15}' | json 'd["data"]["rate"]')"

# --- generate + idempotency (filter to THIS run's seller; the dev DB
# may already hold settlements for other sellers from earlier runs) ---
SELLER_USER_ID=$(curl -s "$BASE/users/me" -H "Authorization: Bearer $SELLER_TOKEN" | json 'd["data"]["id"]')
GEN=$(curl -s -X POST "$BASE/admin/settlements/generate" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d "{\"month\":\"$MONTH\"}")
SETT_ID=$(echo "$GEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['id'] for s in d['data'] if s['sellerId']=='$SELLER_USER_ID'][0])")
check "settlement created for seller" "True" "$([ -n "$SETT_ID" ] && echo True)"
check "totalSales 1000" "1000" "$(echo "$GEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['totalSales'] for s in d['data'] if s['sellerId']=='$SELLER_USER_ID'][0])")"
check "commission 150 at 15%" "150" "$(echo "$GEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['totalCommission'] for s in d['data'] if s['sellerId']=='$SELLER_USER_ID'][0])")"
check "payable 850" "850" "$(echo "$GEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['totalPayable'] for s in d['data'] if s['sellerId']=='$SELLER_USER_ID'][0])")"
check "status PENDING" "PENDING" "$(echo "$GEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['status'] for s in d['data'] if s['sellerId']=='$SELLER_USER_ID'][0])")"
GEN2=$(curl -s -X POST "$BASE/admin/settlements/generate" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d "{\"month\":\"$MONTH\"}")
check "regenerate idempotent" "True" "$([ "$(echo "$GEN2" | python -c "import sys,json;d=json.load(sys.stdin);print([s['id'] for s in d['data'] if s['sellerId']=='$SELLER_USER_ID'][0])")" = "$SETT_ID" ] && echo True)"

# --- seller view + authorization ---
check "seller sees own settlement" "$SETT_ID" "$(curl -s "$BASE/sellers/settlement?month=$MONTH" -H "Authorization: Bearer $SELLER_TOKEN" | json 'd["data"]["id"]')"
check "seller blocked from admin list" "403" "$(status "$BASE/admin/settlements" -H "Authorization: Bearer $SELLER_TOKEN")"
check "buyer blocked from generate" "403" "$(status -X POST "$BASE/admin/settlements/generate" -H "Authorization: Bearer $BUYER_TOKEN" -H "Content-Type: application/json" -d "{\"month\":\"$MONTH\"}")"

# --- lifecycle ---
check "process" "PROCESSING" "$(curl -s -X POST "$BASE/admin/settlements/$SETT_ID/process" -H "Authorization: Bearer $ADMIN_TOKEN" | json 'd["data"]["status"]')"
check "mark paid" "PAID" "$(curl -s -X POST "$BASE/admin/settlements/$SETT_ID/mark-paid" -H "Authorization: Bearer $ADMIN_TOKEN" | json 'd["data"]["status"]')"
check "paidAt set" "True" "$(curl -s "$BASE/admin/settlements/$SETT_ID" -H "Authorization: Bearer $ADMIN_TOKEN" | json 'd["data"]["paidAt"]' | grep -q 'T' && echo True)"
check "invalid transition 400" "400" "$(status -X POST "$BASE/admin/settlements/$SETT_ID/cancel" -H "Authorization: Bearer $ADMIN_TOKEN")"

# --- commission frozen after rate change ---
curl -s -X PATCH "$BASE/admin/settings/commission" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"rate":5}' > /dev/null
check "historical rate frozen at 15" "15" "$(curl -s "$BASE/admin/settlements/$SETT_ID" -H "Authorization: Bearer $ADMIN_TOKEN" | json 'd["data"]["commissionRate"]')"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
