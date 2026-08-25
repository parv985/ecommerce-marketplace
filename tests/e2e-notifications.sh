#!/usr/bin/env bash
# E2E: notifications — event-driven in-app notifications, preferences, admin broadcast.
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
SELLER_EMAIL="nseller${TS}@test.com"
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Notif Seller\",\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Notif Traders\",\"gstin\":\"27UVWXY${TS: -4}F1ZV\",\"pan\":\"UVWXY${TS: -4}F\",\"bankAccountHolderName\":\"Notif Seller\",\"bankAccountNumber\":\"123456789012\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Main Rd\",\"city\":\"Pune\",\"state\":\"MH\",\"pincode\":\"411001\"}" > /dev/null
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@1234"}' | json 'd["data"]["accessToken"]')
SELLER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
PROFILE_ID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['id'] for s in d['data']['items'] if s['gstin'].startswith('27UVWXY')][0])")
curl -s -X PATCH "$BASE/admin/sellers/$PROFILE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null

# seller got the SELLER_APPROVED notification
SN1=$(curl -s "$BASE/notifications" -H "Authorization: Bearer $SELLER_TOKEN")
check "seller notified on approval" "SELLER_APPROVED" "$(echo "$SN1" | json 'd["data"]["items"][0]["type"]')"

# --- buyer + order flow ---
BUYER_EMAIL="nbuyer${TS}@test.com"
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Notif Buyer\",\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
BUYER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
ADDR_ID=$(curl -s -X POST "$BASE/users/me/addresses" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipientName":"Notif Buyer","phone":"9876543210","addressLine1":"10 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | json 'd["data"]["id"]')
PRODUCT_ID=$(curl -s -X POST "$BASE/products" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Notif Widget","price":100,"stock":5,"status":"ACTIVE"}' | json 'd["data"]["id"]')
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
ORDER_ID=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$ADDR_ID\"}" | json 'd["data"][0]["id"]')
for S in CONFIRMED SHIPPED DELIVERED; do
  curl -s -X PATCH "$BASE/orders/$ORDER_ID/status" -H "Authorization: Bearer $SELLER_TOKEN" \
    -H "Content-Type: application/json" -d "{\"status\":\"$S\"}" > /dev/null
done
curl -s -X POST "$BASE/orders/$ORDER_ID/pay" -H "Authorization: Bearer $SELLER_TOKEN" > /dev/null

BN=$(curl -s "$BASE/notifications" -H "Authorization: Bearer $BUYER_TOKEN")
check "buyer has 3 order notifications" "3" "$(echo "$BN" | json 'd["data"]["total"]')"
check "buyer unread count 3" "3" "$(curl -s "$BASE/notifications/unread-count" -H "Authorization: Bearer $BUYER_TOKEN" | json 'd["data"]["unread"]')"

NOTIF_ID=$(echo "$BN" | json 'd["data"]["items"][0]["id"]')
READ=$(status -X PATCH "$BASE/notifications/$NOTIF_ID/read" -H "Authorization: Bearer $BUYER_TOKEN")
check "mark read 200" "200" "$READ"
check "unread now 2" "2" "$(curl -s "$BASE/notifications/unread-count" -H "Authorization: Bearer $BUYER_TOKEN" | json 'd["data"]["unread"]')"

READALL=$(status -X PATCH "$BASE/notifications/read-all" -H "Authorization: Bearer $BUYER_TOKEN")
check "mark all read 200" "200" "$READALL"
check "unread now 0" "0" "$(curl -s "$BASE/notifications/unread-count" -H "Authorization: Bearer $BUYER_TOKEN" | json 'd["data"]["unread"]')"

# preferences
PREFS=$(curl -s -X PATCH "$BASE/notifications/preferences" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d '{"inApp":true,"emailPromotional":false}')
check "preferences update" "False" "$(echo "$PREFS" | json 'd["data"]["emailPromotional"]')"

# admin broadcast to sellers
BROADCAST=$(curl -s -X POST "$BASE/admin/notifications" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"New seller tools","message":"Check out the new analytics dashboard","audience":"SELLERS","channel":"IN_APP"}')
check "broadcast delivered >= 1" "True" "$(echo "$BROADCAST" | python -c "import sys,json;print(int(json.load(sys.stdin)['data']['deliveredTo']) >= 1)")"
check "seller received admin message" "ADMIN_MESSAGE" "$(curl -s "$BASE/notifications" -H "Authorization: Bearer $SELLER_TOKEN" | json 'd["data"]["items"][0]["type"]')"

# authorization
check "seller cannot broadcast 403" "403" "$(status -X POST "$BASE/admin/notifications" -H "Authorization: Bearer $SELLER_TOKEN" -H "Content-Type: application/json" -d '{"title":"Fake","message":"Trying to impersonate admin","audience":"SELLERS"}')"
check "unauthenticated notifications 401" "401" "$(status "$BASE/notifications")"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
