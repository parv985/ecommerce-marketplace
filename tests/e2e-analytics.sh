#!/usr/bin/env bash
# E2E: seller analytics — dashboard, sales series, top products, customers, revenue.
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

# --- seller ---
SELLER_EMAIL="aseller${TS}@test.com"
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Analytics Seller\",\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Analytics Traders\",\"gstin\":\"27PQRST${TS: -4}F1ZV\",\"pan\":\"PQRST${TS: -4}F\",\"bankAccountHolderName\":\"Analytics Seller\",\"bankAccountNumber\":\"123456789012\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Main Rd\",\"city\":\"Pune\",\"state\":\"MH\",\"pincode\":\"411001\"}" > /dev/null
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@1234"}' | json 'd["data"]["accessToken"]')
SELLER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
PROFILE_ID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['id'] for s in d['data']['items'] if s['gstin'].startswith('27PQRST')][0])")
curl -s -X PATCH "$BASE/admin/sellers/$PROFILE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null

PRODUCT_ID=$(curl -s -X POST "$BASE/products" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Analytics Widget","price":1000,"stock":10,"status":"ACTIVE"}' | json 'd["data"]["id"]')

# --- buyer: 2 orders, one delivered+paid, one cancelled ---
BUYER_EMAIL="abuyer${TS}@test.com"
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Analytics Buyer\",\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
BUYER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')

checkout_and_get_id() {
  curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $BUYER_TOKEN" \
    -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
  local addr
  addr=$(curl -s -X POST "$BASE/users/me/addresses" -H "Authorization: Bearer $BUYER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"recipientName":"Analytics Buyer","phone":"9876543210","addressLine1":"10 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | json 'd["data"]["id"]')
  curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $BUYER_TOKEN" \
    -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$addr\"}" | json 'd["data"][0]["id"]'
}

ORDER1=$(checkout_and_get_id)
ORDER2=$(checkout_and_get_id)
for S in CONFIRMED SHIPPED DELIVERED; do
  curl -s -X PATCH "$BASE/orders/$ORDER1/status" -H "Authorization: Bearer $SELLER_TOKEN" \
    -H "Content-Type: application/json" -d "{\"status\":\"$S\"}" > /dev/null
done
curl -s -X POST "$BASE/orders/$ORDER1/pay" -H "Authorization: Bearer $SELLER_TOKEN" > /dev/null
curl -s -X POST "$BASE/orders/$ORDER2/cancel" -H "Authorization: Bearer $BUYER_TOKEN" > /dev/null

# --- assertions ---
DASH=$(curl -s "$BASE/sellers/dashboard" -H "Authorization: Bearer $SELLER_TOKEN")
check "dashboard orders total 2" "2" "$(echo "$DASH" | json 'd["data"]["orders"]["total"]')"
check "dashboard delivered 1" "1" "$(echo "$DASH" | json 'd["data"]["orders"]["delivered"]')"
check "dashboard cancelled 1" "1" "$(echo "$DASH" | json 'd["data"]["orders"]["cancelled"]')"
check "dashboard revenue total 1000" "1000" "$(echo "$DASH" | json 'd["data"]["revenue"]["total"]')"
check "dashboard products total 1" "1" "$(echo "$DASH" | json 'd["data"]["products"]["total"]')"
check "dashboard active products 1" "1" "$(echo "$DASH" | json 'd["data"]["products"]["active"]')"

REV=$(curl -s "$BASE/sellers/revenue" -H "Authorization: Bearer $SELLER_TOKEN")
check "revenue total 1000" "1000" "$(echo "$REV" | json 'd["data"]["totalRevenue"]')"
check "revenue totalOrders 2" "2" "$(echo "$REV" | json 'd["data"]["totalOrders"]')"
check "revenue delivered 1" "1" "$(echo "$REV" | json 'd["data"]["deliveredOrders"]')"
check "revenue cancelled 1" "1" "$(echo "$REV" | json 'd["data"]["cancelledOrders"]')"
check "revenue series non-empty" "True" "$(echo "$REV" | python -c "import sys,json;print(bool(json.load(sys.stdin)['data']['series']))")"

TOP=$(curl -s "$BASE/sellers/analytics/top-products" -H "Authorization: Bearer $SELLER_TOKEN")
check "top product name" "Analytics Widget" "$(echo "$TOP" | json 'd["data"][0]["name"]')"
check "top product quantity 2" "2" "$(echo "$TOP" | json 'd["data"][0]["quantity"]')"
check "top product revenue 1000" "1000" "$(echo "$TOP" | json 'd["data"][0]["revenue"]')"

SERIES=$(curl -s "$BASE/sellers/analytics/sales?groupBy=day" -H "Authorization: Bearer $SELLER_TOKEN")
check "sales series non-empty" "True" "$(echo "$SERIES" | python -c "import sys,json;print(bool(json.load(sys.stdin)['data']))")"

CUST=$(curl -s "$BASE/sellers/customers" -H "Authorization: Bearer $SELLER_TOKEN")
check "customers total 1" "1" "$(echo "$CUST" | json 'd["data"]["total"]')"
check "customer orderCount 2" "2" "$(echo "$CUST" | json 'd["data"]["items"][0]["orderCount"]')"
check "customer totalSpent 1000" "1000" "$(echo "$CUST" | json 'd["data"]["items"][0]["totalSpent"]')"

# authorization
check "buyer blocked from dashboard 403" "403" "$(status "$BASE/sellers/dashboard" -H "Authorization: Bearer $BUYER_TOKEN")"
check "unauthenticated blocked 401" "401" "$(status "$BASE/sellers/customers")"

# invalid date range
check "invalid date range 400" "400" "$(status "$BASE/sellers/revenue?from=2026-09-01&to=2026-01-01" -H "Authorization: Bearer $SELLER_TOKEN")"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
