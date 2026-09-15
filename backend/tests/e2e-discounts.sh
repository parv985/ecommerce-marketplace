#!/usr/bin/env bash
# E2E: sales discounts — CRUD, ownership, and checkout price calculation.
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

# --- setup: seller + buyer + product ---
# sellers/register creates the SELLER user itself - a prior auth/register
# with the same email would create a BUYER and block seller registration.
SELLER_EMAIL="dseller${TS}@test.com"
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Discount Seller\",\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Discount Traders\",\"gstin\":\"27ABCDE${TS: -4}F1ZV\",\"pan\":\"ABCDE${TS: -4}F\",\"bankAccountHolderName\":\"Discount Seller\",\"bankAccountNumber\":\"123456789012\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Main Rd\",\"city\":\"Pune\",\"state\":\"MH\",\"pincode\":\"411001\"}" > /dev/null

ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@1234"}' | json 'd["data"]["accessToken"]')

SELLER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')

PROFILE_ID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | json 'd["data"]["items"][0]["id"]')
curl -s -X PATCH "$BASE/admin/sellers/$PROFILE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null

PRODUCT_ID=$(curl -s -X POST "$BASE/products" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Discounted Widget","price":1000,"stock":20,"status":"ACTIVE"}' | json 'd["data"]["id"]')

BUYER_EMAIL="dbuyer${TS}@test.com"
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Discount Buyer\",\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
BUYER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
ADDR_ID=$(curl -s -X POST "$BASE/users/me/addresses" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipientName":"Discount Buyer","phone":"9876543210","addressLine1":"10 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | json 'd["data"]["id"]')

START=$(date -u -d '-1 day' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v-1d +%Y-%m-%dT%H:%M:%S.000Z)
END=$(date -u -d '+30 day' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v+30d +%Y-%m-%dT%H:%M:%S.000Z)

# --- create discount ---
DISC_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/discounts" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"discountValue\":10,\"startAt\":\"$START\",\"endAt\":\"$END\"}")
check "create discount 201" "201" "$DISC_STATUS"

DISCOUNT_ID=$(curl -s "$BASE/discounts" -H "Authorization: Bearer $SELLER_TOKEN" | json 'd["data"]["items"][0]["id"]')

# --- validation failures ---
NO_TARGET=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/discounts" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"discountValue\":10,\"startAt\":\"$START\",\"endAt\":\"$END\"}")
check "reject no target 400" "400" "$NO_TARGET"

BAD_DATES=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/discounts" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"discountValue\":10,\"startAt\":\"$END\",\"endAt\":\"$START\"}")
check "reject end before start 400" "400" "$BAD_DATES"

BAD_PCT=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/discounts" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"discountValue\":150,\"startAt\":\"$START\",\"endAt\":\"$END\"}")
check "reject pct > 100 400" "400" "$BAD_PCT"

# --- ownership: buyer cannot read seller discount ---
OTHER_READ=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/discounts/$DISCOUNT_ID" -H "Authorization: Bearer $BUYER_TOKEN")
check "buyer blocked from seller discount 403" "403" "$OTHER_READ"

# --- checkout with discount ---
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
ORDER=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$ADDR_ID\"}")
check "checkout total 900" "900" "$(echo "$ORDER" | json 'd["data"][0]["total"]')"
check "checkout discountTotal 100" "100" "$(echo "$ORDER" | json 'd["data"][0]["discountTotal"]')"
check "checkout itemsTotal 1000" "1000" "$(echo "$ORDER" | json 'd["data"][0]["itemsTotal"]')"

# --- deactivate stops applying ---
curl -s -X DELETE "$BASE/discounts/$DISCOUNT_ID" -H "Authorization: Bearer $SELLER_TOKEN" > /dev/null
AFTER=$(curl -s "$BASE/discounts/$DISCOUNT_ID" -H "Authorization: Bearer $SELLER_TOKEN" | json 'd["data"]["status"]')
check "discount deactivated" "INACTIVE" "$AFTER"

BUYER2_EMAIL="dbuyer2${TS}@test.com"
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Discount Buyer 2\",\"email\":\"$BUYER2_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
BUYER2_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER2_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
ADDR2_ID=$(curl -s -X POST "$BASE/users/me/addresses" -H "Authorization: Bearer $BUYER2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipientName":"Discount Buyer 2","phone":"9876543210","addressLine1":"10 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | json 'd["data"]["id"]')
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $BUYER2_TOKEN" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
ORDER2=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $BUYER2_TOKEN" \
  -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$ADDR2_ID\"}")
check "deactivated discount not applied (total 1000)" "1000" "$(echo "$ORDER2" | json 'd["data"][0]["total"]')"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
