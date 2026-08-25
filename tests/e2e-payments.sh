#!/usr/bin/env bash
# E2E: payment gateway — initiate, verify, webhook idempotency, refunds.
# Uses MOCK mode (no Razorpay credentials configured on the dev server).
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

# Mock-mode signing secret (mirrors src/modules/payments/razorpay.service.ts).
sign() {
  python -c "import hmac,hashlib,sys;print(hmac.new(b'mock-payment-signing-secret',sys.argv[1].encode(),hashlib.sha256).hexdigest())" "$1"
}

# --- seller + product ---
SELLER_EMAIL="pseller${TS}@test.com"
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Pay Seller\",\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Pay Traders\",\"gstin\":\"27LMNOP${TS: -4}F1ZV\",\"pan\":\"LMNOP${TS: -4}F\",\"bankAccountHolderName\":\"Pay Seller\",\"bankAccountNumber\":\"123456789012\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Main Rd\",\"city\":\"Pune\",\"state\":\"MH\",\"pincode\":\"411001\"}" > /dev/null
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@1234"}' | json 'd["data"]["accessToken"]')
SELLER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
PROFILE_ID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | python -c "import sys,json;d=json.load(sys.stdin);print([s['id'] for s in d['data']['items'] if s['gstin'].startswith('27LMNOP')][0])")
curl -s -X PATCH "$BASE/admin/sellers/$PROFILE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null
PRODUCT_ID=$(curl -s -X POST "$BASE/products" -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Pay Widget","price":500,"stock":10,"status":"ACTIVE"}' | json 'd["data"]["id"]')

# --- buyer checks out online ---
BUYER_EMAIL="pbuyer${TS}@test.com"
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Pay Buyer\",\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
BUYER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" | json 'd["data"]["accessToken"]')
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
ADDR=$(curl -s -X POST "$BASE/users/me/addresses" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipientName":"Pay Buyer","phone":"9876543210","addressLine1":"10 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | json 'd["data"]["id"]')
ORDER_ID=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$ADDR\",\"paymentMethod\":\"ONLINE\"}" | json 'd["data"][0]["id"]')

check "online order paymentStatus PENDING" "PENDING" "$(curl -s "$BASE/orders/$ORDER_ID" -H "Authorization: Bearer $BUYER_TOKEN" | json 'd["data"]["paymentStatus"]')"

# --- initiate + idempotency ---
INIT1=$(curl -s -X POST "$BASE/payments/orders/$ORDER_ID/initiate" -H "Authorization: Bearer $BUYER_TOKEN")
check "initiate 201" "201" "$(echo "$INIT1" | python -c "import sys,json;print(json.load(sys.stdin)['success'] and 201 or 400)")"
GATEWAY_ORDER=$(echo "$INIT1" | json 'd["data"]["gatewayOrderId"]')
check "gateway order mock" "True" "$(echo "$GATEWAY_ORDER" | grep -q '^mock_order_' && echo True)"
INIT2=$(curl -s -X POST "$BASE/payments/orders/$ORDER_ID/initiate" -H "Authorization: Bearer $BUYER_TOKEN")
check "initiate idempotent" "True" "$([ "$(echo "$INIT2" | json 'd["data"]["id"]')" = "$(echo "$INIT1" | json 'd["data"]["id"]')" ] && echo True)"

# --- verify: bad then good signature ---
check "bad signature 400" "400" "$(status -X POST "$BASE/payments/orders/$ORDER_ID/verify" -H "Authorization: Bearer $BUYER_TOKEN" -H "Content-Type: application/json" -d "{\"paymentId\":\"pay_1\",\"signature\":\"forged\"}")"
SIG=$(sign "${GATEWAY_ORDER}|pay_1")
check "verify 200" "200" "$(status -X POST "$BASE/payments/orders/$ORDER_ID/verify" -H "Authorization: Bearer $BUYER_TOKEN" -H "Content-Type: application/json" -d "{\"paymentId\":\"pay_1\",\"signature\":\"$SIG\"}")"
check "payment PAID" "PAID" "$(curl -s "$BASE/payments/orders/$ORDER_ID/verify" -H "Authorization: Bearer $BUYER_TOKEN" -H "Content-Type: application/json" -d "{\"paymentId\":\"pay_1\",\"signature\":\"$SIG\"}" | json 'd["data"]["status"]')"
check "order PAID" "PAID" "$(curl -s "$BASE/orders/$ORDER_ID" -H "Authorization: Bearer $BUYER_TOKEN" | json 'd["data"]["paymentStatus"]')"

# --- webhook: bad signature, then idempotent processing ---
BAD_PAYLOAD='{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_w1","order_id":"mock","amount":50000,"status":"captured"}}}}'
check "webhook bad signature 400" "400" "$(status -X POST "$BASE/payments/webhook/razorpay" -H "Content-Type: application/json" -H "X-Razorpay-Signature: nope" -d "$BAD_PAYLOAD")"

PAYLOAD=$(python -c "import json;print(json.dumps({'event':'payment.captured','payload':{'payment':{'entity':{'id':'pay_w2_$TS','order_id':'$GATEWAY_ORDER','amount':50000,'status':'captured'}}}}))")
WSIG=$(sign "$PAYLOAD")
check "webhook processed" "True" "$(curl -s -X POST "$BASE/payments/webhook/razorpay" -H "Content-Type: application/json" -H "X-Razorpay-Signature: $WSIG" -d "$PAYLOAD" | json 'd["data"]["processed"]')"
check "webhook duplicate ignored" "False" "$(curl -s -X POST "$BASE/payments/webhook/razorpay" -H "Content-Type: application/json" -H "X-Razorpay-Signature: $WSIG" -d "$PAYLOAD" | json 'd["data"]["processed"]')"

# --- refund: buyer blocked, seller refunds, idempotent ---
check "buyer refund 403" "403" "$(status -X POST "$BASE/payments/orders/$ORDER_ID/refund" -H "Authorization: Bearer $BUYER_TOKEN")"
REFUND=$(curl -s -X POST "$BASE/payments/orders/$ORDER_ID/refund" -H "Authorization: Bearer $SELLER_TOKEN")
check "refund status REFUNDED" "REFUNDED" "$(echo "$REFUND" | json 'd["data"]["status"]')"
check "refund amount 500" "500" "$(echo "$REFUND" | json 'd["data"]["refund"]["amount"]')"
check "order REFUNDED" "REFUNDED" "$(curl -s "$BASE/orders/$ORDER_ID" -H "Authorization: Bearer $BUYER_TOKEN" | json 'd["data"]["paymentStatus"]')"
REFUND2=$(curl -s -X POST "$BASE/payments/orders/$ORDER_ID/refund" -H "Authorization: Bearer $SELLER_TOKEN")
check "refund idempotent" "True" "$([ "$(echo "$REFUND2" | json 'd["data"]["refund"]["gatewayRefundId"]')" = "$(echo "$REFUND" | json 'd["data"]["refund"]["gatewayRefundId"]')" ] && echo True)"

# --- cancel a paid online order -> auto refund + stock restore ---
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
ORDER2=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$ADDR\",\"paymentMethod\":\"ONLINE\"}" | json 'd["data"][0]["id"]')
GO2=$(curl -s -X POST "$BASE/payments/orders/$ORDER2/initiate" -H "Authorization: Bearer $BUYER_TOKEN" | json 'd["data"]["gatewayOrderId"]')
SIG2=$(sign "${GO2}|pay_c")
curl -s -X POST "$BASE/payments/orders/$ORDER2/verify" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"paymentId\":\"pay_c\",\"signature\":\"$SIG2\"}" > /dev/null
CANCEL=$(curl -s -X POST "$BASE/orders/$ORDER2/cancel" -H "Authorization: Bearer $BUYER_TOKEN")
check "cancelled" "CANCELLED" "$(echo "$CANCEL" | json 'd["data"]["status"]')"
check "cancel refunds" "REFUNDED" "$(echo "$CANCEL" | json 'd["data"]["paymentStatus"]')"
# 10 initial - 1 (first order, refunded but not cancelled) - 1 (order2) + 1 (order2 restored) = 9
check "stock restored" "9" "$(curl -s "$BASE/products/$PRODUCT_ID" | json 'd["data"]["stock"]')"

# --- COD flow untouched ---
curl -s -X POST "$BASE/cart/items" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" > /dev/null
ORDER3=$(curl -s -X POST "$BASE/orders" -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" -d "{\"shippingAddressId\":\"$ADDR\"}" | json 'd["data"][0]["id"]')
check "online pay on COD order 400" "400" "$(status -X POST "$BASE/payments/orders/$ORDER3/initiate" -H "Authorization: Bearer $BUYER_TOKEN")"
check "COD mark-paid blocked pre-delivery" "400" "$(status -X POST "$BASE/orders/$ORDER3/pay" -H "Authorization: Bearer $SELLER_TOKEN")"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
