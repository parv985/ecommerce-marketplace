#!/usr/bin/env bash
# E2E: returns — request, eligibility, lifecycle, stock restore, ownership.
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

# --- seller + buyer ---
SELLER_EMAIL="rseller${TS}@test.com"
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Return Seller\",\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Return Traders\",\"gstin\":\"27KLMNO${TS: -4}F1ZV\",\"pan\":\"KLMNO${TS: -4}F\",\"bankAccountHolderName\":\"Return Seller\",\"bankAccountNumber\":\"123456789012\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Main Rd\",\"city\":\"Pune\",\"state\":\"MH\",\"pincode\":\"411001\"}" > /dev/null
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@1234"}' | json 'd["data"]["accessToken"]')
SELLER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
PROFILE_ID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['id'] for s in d['data']['items'] if s['gstin'].startswith('27KLMNO')][0])")
curl -s -X PATCH "$BASE/admin/sellers/$PROFILE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null

BUYER_EMAIL="rbuyer${TS}@test.com"
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Return Buyer\",\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
BUYER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
ADDR_ID=$(curl -s -X POST "$BASE/users/me/addresses" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipientName":"Return Buyer","phone":"9876543210","addressLine1":"10 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | json 'd["data"]["id"]')

PRODUCT_ID=$(curl -s -X POST "$BASE/products" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Returnable Widget","price":500,"stock":3,"status":"ACTIVE"}' | json 'd["data"]["id"]')

curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
ORDER_ID=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$ADDR_ID\"}" | json 'd["data"][0]["id"]')

# --- return before delivery rejected ---
BEFORE=$(curl -s -X POST "$BASE/returns" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"$ORDER_ID\",\"reason\":\"Item arrived damaged\"}" | json 'd["code"]')
check "return before delivery rejected" "RETURN_NOT_ELIGIBLE" "$BEFORE"

# deliver the order
for S in CONFIRMED SHIPPED DELIVERED; do
  curl -s -X PATCH "$BASE/orders/$ORDER_ID/status" -H "Authorization: Bearer $SELLER_TOKEN" \
    -H "Content-Type: application/json" -d "{\"status\":\"$S\"}" > /dev/null
done
# COD payment is recorded as received after delivery, so there is real
# money to refund when the return is approved.
curl -s -X POST "$BASE/orders/$ORDER_ID/pay" -H "Authorization: Bearer $SELLER_TOKEN" > /dev/null
PAID=$(curl -s "$BASE/orders/$ORDER_ID" -H "Authorization: Bearer $BUYER_TOKEN" | json 'd["data"]["paymentStatus"]')
check "cod payment marked received" "PAID" "$PAID"

STOCK_AFTER=$(curl -s "$BASE/products/$PRODUCT_ID" | json 'd["data"]["stock"]')
check "stock decremented at checkout (3->2)" "2" "$STOCK_AFTER"

# --- request return ---
RET=$(curl -s -X POST "$BASE/returns" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"$ORDER_ID\",\"reason\":\"Item arrived damaged\"}")
check "return request 201" "201" "$(echo "$RET" | python -c "import sys,json;print(201 if json.load(sys.stdin).get('success') else 400)")"
RETURN_ID=$(echo "$RET" | json 'd["data"]["id"]')
check "return status PENDING" "PENDING" "$(echo "$RET" | json 'd["data"]["status"]')"

# duplicate rejected
DUP=$(curl -s -X POST "$BASE/returns" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"$ORDER_ID\",\"reason\":\"Item arrived damaged again\"}" | json 'd["code"]')
check "duplicate return rejected" "RETURN_ALREADY_REQUESTED" "$DUP"

# buyer cannot approve
check "buyer cannot approve 403" "403" "$(status -X PATCH "$BASE/returns/$RETURN_ID/status" -H "Authorization: Bearer $BUYER_TOKEN" -H "Content-Type: application/json" -d '{"status":"APPROVED"}')"

# seller approves -> refund + rollbacks
APPROVE_RES=$(curl -s -X PATCH "$BASE/returns/$RETURN_ID/status" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}')
check "seller approves" "APPROVED" "$(echo "$APPROVE_RES" | json 'd["data"]["status"]')"
check "refund processed" "PROCESSED" "$(echo "$APPROVE_RES" | json 'd["data"]["refund"]["status"]')"
check "refunded amount equals paid total" "500" "$(echo "$APPROVE_RES" | python -c "import sys,json;print(int(json.load(sys.stdin)['data']['refund']['amount']))")"
check "cod refund recorded offline" "OFFLINE" "$(echo "$APPROVE_RES" | json 'd["data"]["refund"]["method"]')"

ORDER_STATE=$(curl -s "$BASE/orders/$ORDER_ID" -H "Authorization: Bearer $BUYER_TOKEN")
check "order closed as returned" "RETURNED" "$(echo "$ORDER_STATE" | json 'd["data"]["status"]')"
check "order payment refunded" "REFUNDED" "$(echo "$ORDER_STATE" | json 'd["data"]["paymentStatus"]')"

STOCK_RESTORED=$(curl -s "$BASE/products/$PRODUCT_ID" | json 'd["data"]["stock"]')
check "stock restored on approval (2->3)" "3" "$STOCK_RESTORED"

# approving twice never refunds or restocks twice
APPROVE_AGAIN=$(curl -s -X PATCH "$BASE/returns/$RETURN_ID/status" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}')
check "re-approval still 200" "True" "$(echo "$APPROVE_AGAIN" | python -c "import sys,json;print(json.load(sys.stdin).get('success'))")"
check "re-approval keeps one refund" "PROCESSED" "$(echo "$APPROVE_AGAIN" | json 'd["data"]["refund"]["status"]')"
STOCK_AGAIN=$(curl -s "$BASE/products/$PRODUCT_ID" | json 'd["data"]["stock"]')
check "stock not restored twice" "3" "$STOCK_AGAIN"

# buyer sees the refund notification
NOTIFY=$(curl -s "$BASE/notifications" -H "Authorization: Bearer $BUYER_TOKEN" \
  | python -c "import sys,json;print(any(n['message']=='Your return has been approved and your refund has been processed successfully.' for n in json.load(sys.stdin)['data']['items']))")
check "buyer refund notification" "True" "$NOTIFY"

COMPLETED=$(curl -s -X PATCH "$BASE/returns/$RETURN_ID/status" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"COMPLETED"}' | json 'd["data"]["status"]')
check "seller completes" "COMPLETED" "$COMPLETED"

STOCK_AFTER_COMPLETE=$(curl -s "$BASE/products/$PRODUCT_ID" | json 'd["data"]["stock"]')
check "completion does not restore stock again" "3" "$STOCK_AFTER_COMPLETE"

# A completed return closes the order - re-request is rejected.
RET2=$(curl -s -X POST "$BASE/returns" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"$ORDER_ID\",\"reason\":\"Changed my mind\"}")
check "re-request after completion rejected" "RETURN_ALREADY_REQUESTED" "$(echo "$RET2" | json 'd["code"]')"

# --- second order for rejection + cancellation flows ---
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
ORDER2_ID=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$ADDR_ID\"}" | json 'd["data"][0]["id"]')
for S in CONFIRMED SHIPPED DELIVERED; do
  curl -s -X PATCH "$BASE/orders/$ORDER2_ID/status" -H "Authorization: Bearer $SELLER_TOKEN" \
    -H "Content-Type: application/json" -d "{\"status\":\"$S\"}" > /dev/null
done

RET3=$(curl -s -X POST "$BASE/returns" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"$ORDER2_ID\",\"reason\":\"Changed my mind\"}")
RETURN3_ID=$(echo "$RET3" | json 'd["data"]["id"]')
NOREASON=$(status -X PATCH "$BASE/returns/$RETURN3_ID/status" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"REJECTED"}')
check "reject without reason 400" "400" "$NOREASON"
REJECTED=$(curl -s -X PATCH "$BASE/returns/$RETURN3_ID/status" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"REJECTED","reason":"Outside policy"}' | json 'd["data"]["status"]')
check "reject with reason" "REJECTED" "$REJECTED"

# re-request after rejection is allowed (within the window)
RET4=$(curl -s -X POST "$BASE/returns" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"$ORDER2_ID\",\"reason\":\"Wrong item size\"}")
check "re-request after rejection allowed" "201" "$(echo "$RET4" | python -c "import sys,json;print(201 if json.load(sys.stdin).get('success') else 400)")"
RETURN4_ID=$(echo "$RET4" | json 'd["data"]["id"]')
CANCELLED=$(curl -s -X POST "$BASE/returns/$RETURN4_ID/cancel" -H "Authorization: Bearer $BUYER_TOKEN" | json 'd["data"]["status"]')
check "buyer cancels pending return" "CANCELLED" "$CANCELLED"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
