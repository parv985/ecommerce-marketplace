#!/usr/bin/env bash
# Manual E2E verification for Steps 8-10 (Orders, inventory, COD payment).
set -uo pipefail

BASE=${BASE:-http://localhost:5000/api/v1}
PASS=0
FAIL=0

field() {
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const p=process.argv[1].split('.');let v=j;for(const k of p)v=v?.[k];console.log(v===undefined||v===null?'':typeof v==='object'?JSON.stringify(v):v)})" "$1"
}

status() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

check() {
  local label=$1 expected=$2 actual=$3
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
    echo "  ok  [$expected] $label"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL [$expected != $actual] $label"
  fi
}

ts=$(date +%s)
D4=$(printf "%04d" $(((ts + $$) % 10000)))

reg_seller() {
  local name=$1 email=$2 gstin=$3 pan=$4
  curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" -d "{\"name\":\"$name\",\"email\":\"$email\",\"password\":\"Password123!\",\"businessName\":\"$name Traders\",\"gstin\":\"$gstin\",\"pan\":\"$pan\",\"bankAccountHolderName\":\"$name\",\"bankAccountNumber\":\"$((RANDOM % 9 + 1))23456789012\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Rd\",\"city\":\"Pune\",\"state\":\"MH\",\"pincode\":\"411001\"}" > /dev/null
  curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"password\":\"Password123!\"}" | field data.accessToken
}

reg_buyer() {
  local email=$1
  curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "{\"name\":\"Buyer\",\"email\":\"$email\",\"password\":\"Password123!\"}" > /dev/null
  curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"password\":\"Password123!\"}" | field data.accessToken
}

echo "== Setup =="
SA_TOKEN=$(reg_seller "Seller A" "sa${ts}@test.com" "27ABCDE${D4}F1ZV" "ABCDE${D4}F")
SB_TOKEN=$(reg_seller "Seller B" "sb${ts}@test.com" "27FGHIJ${D4}G1ZW" "FGHIJ${D4}G")
B_TOKEN=$(reg_buyer "ob${ts}@test.com")
B2_TOKEN=$(reg_buyer "ob2${ts}@test.com")
check "tokens ready" "non-empty" "${SA_TOKEN:+${SB_TOKEN:+${B_TOKEN:+non-empty}}}"

# Approve both sellers (approval gate added in V1 Step 12).
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@1234"}' | field data.accessToken)
for GST in "27ABCDE" "27FGHIJ"; do
  SID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const s=(j.data.items||[]).find(x=>x.gstin&&x.gstin.startsWith('$GST'));console.log(s?s.id:'')})")
  if [ -n "$SID" ]; then
    curl -s -X PATCH "$BASE/admin/sellers/$SID/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null
  fi
done
check "sellers approved" "non-empty" "${SA_TOKEN:+${SB_TOKEN:+non-empty}}"

mk_prod() {
  local token=$1 name=$2 price=$3 stock=$4
  curl -s -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d "{\"name\":\"$name\",\"price\":$price,\"stock\":$stock,\"status\":\"ACTIVE\"}" | field data.id
}
A1=$(mk_prod "$SA_TOKEN" "Gadget A1" 100 5)
A2=$(mk_prod "$SA_TOKEN" "Gadget A2" 50 2)
B1=$(mk_prod "$SB_TOKEN" "Gadget B1" 200 3)
LOW=$(mk_prod "$SA_TOKEN" "Low Stock Item" 10 1)
check "products ready" "non-empty" "${A1:+${A2:+${B1:+${LOW:+non-empty}}}}"

echo "== Checkout from cart (multi-seller split) =="
curl -s -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$A1\",\"quantity\":2}" > /dev/null
curl -s -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$B1\",\"quantity\":1}" > /dev/null
ADDR_ID=$(curl -s -X POST "$BASE/users/me/addresses" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d '{"recipientName":"Buyer","phone":"9876543210","addressLine1":"10 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | field data.id)

ORDERS=$(curl -s -X POST "$BASE/orders" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"shippingAddressId\":\"$ADDR_ID\"}")
ORDER_A=$(echo "$ORDERS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const o=j.data.find(x=>x.sellerBusinessName==='Seller A Traders');console.log(o?o.id:'')})")
ORDER_B=$(echo "$ORDERS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const o=j.data.find(x=>x.sellerBusinessName==='Seller B Traders');console.log(o?o.id:'')})")
check "checkout creates 2 orders" "2" "$(echo "$ORDERS" | field data.length)"
check "order A total (2x100)" "200" "$(curl -s "$BASE/orders/$ORDER_A" -H "Authorization: Bearer $B_TOKEN" | field data.total)"
check "order B total (1x200)" "200" "$(curl -s "$BASE/orders/$ORDER_B" -H "Authorization: Bearer $B_TOKEN" | field data.total)"
check "cart cleared after checkout" "0" "$(curl -s "$BASE/cart" -H "Authorization: Bearer $B_TOKEN" | field data.totalItems)"
check "stock decremented A1 (5->3)" "3" "$(curl -s "$BASE/products/$A1" | field data.stock)"
check "stock decremented B1 (3->2)" "2" "$(curl -s "$BASE/products/$B1" | field data.stock)"

echo "== Order access control =="
check "buyer sees own order" "200" "$(status "$BASE/orders/$ORDER_A" -H "Authorization: Bearer $B_TOKEN")"
check "other buyer blocked" "403" "$(status "$BASE/orders/$ORDER_A" -H "Authorization: Bearer $B2_TOKEN")"
check "seller A sees order A" "200" "$(status "$BASE/orders/$ORDER_A" -H "Authorization: Bearer $SA_TOKEN")"
check "seller B blocked from order A" "403" "$(status "$BASE/orders/$ORDER_A" -H "Authorization: Bearer $SB_TOKEN")"
check "seller A lists only own orders" "1" "$(curl -s "$BASE/orders" -H "Authorization: Bearer $SA_TOKEN" | field data.total)"
check "buyer lists own orders" "2" "$(curl -s "$BASE/orders" -H "Authorization: Bearer $B_TOKEN" | field data.total)"
check "orders require auth" "401" "$(status "$BASE/orders")"

echo "== Status transitions =="
check "buyer cannot update status" "403" "$(status -X PATCH "$BASE/orders/$ORDER_A/status" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d '{"status":"CONFIRMED"}')"
check "skip transition rejected" "400" "$(status -X PATCH "$BASE/orders/$ORDER_A/status" -H "Content-Type: application/json" -H "Authorization: Bearer $SA_TOKEN" -d '{"status":"DELIVERED"}')"
check "confirm" "200" "$(status -X PATCH "$BASE/orders/$ORDER_A/status" -H "Content-Type: application/json" -H "Authorization: Bearer $SA_TOKEN" -d '{"status":"CONFIRMED"}')"
check "ship" "200" "$(status -X PATCH "$BASE/orders/$ORDER_A/status" -H "Content-Type: application/json" -H "Authorization: Bearer $SA_TOKEN" -d '{"status":"SHIPPED"}')"
check "deliver" "200" "$(status -X PATCH "$BASE/orders/$ORDER_A/status" -H "Content-Type: application/json" -H "Authorization: Bearer $SA_TOKEN" -d '{"status":"DELIVERED"}')"
check "backward transition rejected" "400" "$(status -X PATCH "$BASE/orders/$ORDER_A/status" -H "Content-Type: application/json" -H "Authorization: Bearer $SA_TOKEN" -d '{"status":"PENDING"}')"

echo "== Payment (COD) =="
check "pay before delivery rejected" "400" "$(status -X POST "$BASE/orders/$ORDER_B/pay" -H "Authorization: Bearer $SB_TOKEN")"
check "pay after delivery" "200" "$(status -X POST "$BASE/orders/$ORDER_A/pay" -H "Authorization: Bearer $SA_TOKEN")"
check "paymentStatus PAID" "PAID" "$(curl -s "$BASE/orders/$ORDER_A" -H "Authorization: Bearer $B_TOKEN" | field data.paymentStatus)"
check "buyer cannot mark paid" "403" "$(status -X POST "$BASE/orders/$ORDER_B/pay" -H "Authorization: Bearer $B_TOKEN")"

echo "== Cancellation restores stock =="
curl -s -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$A2\",\"quantity\":2}" > /dev/null
CANCEL_ORD=$(curl -s -X POST "$BASE/orders" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"shippingAddressId\":\"$ADDR_ID\"}" | field data.0.id)
check "stock after checkout A2 (2->0)" "0" "$(curl -s "$BASE/products/$A2" | field data.stock)"
check "cancel order" "200" "$(status -X POST "$BASE/orders/$CANCEL_ORD/cancel" -H "Authorization: Bearer $B_TOKEN")"
check "status CANCELLED" "CANCELLED" "$(curl -s "$BASE/orders/$CANCEL_ORD" -H "Authorization: Bearer $B_TOKEN" | field data.status)"
check "stock restored A2 (0->2)" "2" "$(curl -s "$BASE/products/$A2" | field data.stock)"
check "cancel again idempotent" "200" "$(status -X POST "$BASE/orders/$CANCEL_ORD/cancel" -H "Authorization: Bearer $B_TOKEN")"
check "stock not double-restored" "2" "$(curl -s "$BASE/products/$A2" | field data.stock)"

echo "== Oversell guard at checkout =="
curl -s -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$LOW\",\"quantity\":1}" > /dev/null
curl -s -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B2_TOKEN" -d "{\"productId\":\"$LOW\",\"quantity\":1}" > /dev/null
LOW_ADDR_B2=$(curl -s -X POST "$BASE/users/me/addresses" -H "Content-Type: application/json" -H "Authorization: Bearer $B2_TOKEN" -d '{"recipientName":"Buyer2","phone":"9876500000","addressLine1":"11 Lake View","city":"Pune","state":"MH","pincode":"411001"}' | field data.id)
check "buyer2 checks out first" "201" "$(status -X POST "$BASE/orders" -H "Content-Type: application/json" -H "Authorization: Bearer $B2_TOKEN" -d "{\"shippingAddressId\":\"$LOW_ADDR_B2\"}")"
check "stock now 0" "0" "$(curl -s "$BASE/products/$LOW" | field data.stock)"
check "buyer1 checkout blocked" "400" "$(status -X POST "$BASE/orders" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"shippingAddressId\":\"$ADDR_ID\"}")"
check "stock stays 0 after failure" "0" "$(curl -s "$BASE/products/$LOW" | field data.stock)"
check "buyer1 cart not cleared" "1" "$(curl -s "$BASE/cart" -H "Authorization: Bearer $B_TOKEN" | field data.totalItems)"

echo "== Validation =="
check "empty cart checkout rejected" "400" "$(status -X POST "$BASE/orders" -H "Content-Type: application/json" -H "Authorization: Bearer $B2_TOKEN" -d "{\"shippingAddressId\":\"$LOW_ADDR_B2\"}")"
check "foreign address rejected" "404" "$(status -X POST "$BASE/orders" -H "Content-Type: application/json" -H "Authorization: Bearer $B2_TOKEN" -d "{\"shippingAddressId\":\"$ADDR_ID\"}")"
check "invalid status value rejected" "400" "$(status -X PATCH "$BASE/orders/$ORDER_A/status" -H "Content-Type: application/json" -H "Authorization: Bearer $SA_TOKEN" -d '{"status":"FROZEN"}')"
check "invalid order id" "400" "$(status "$BASE/orders/not-an-id" -H "Authorization: Bearer $B_TOKEN")"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
