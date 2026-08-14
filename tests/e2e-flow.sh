#!/usr/bin/env bash
# End-to-end business flow (Step 21): walks the complete marketplace
# journey from registration through delivery, payment and reviews.
# Requires the API on http://localhost:5000 and a seeded admin
# (npx tsx tests/seed-admin.ts).
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
BUYER_EMAIL="flowbuyer${ts}@test.com"
SELLER_EMAIL="flowseller${ts}@test.com"

echo ""
echo "=== 1. Buyer registers and logs in ==="
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "{\"name\":\"Flow Buyer\",\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
BUYER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)
check "buyer registered + logged in" "non-empty" "${BUYER_TOKEN:+non-empty}"

echo ""
echo "=== 2. Seller registers (PENDING) ==="
SELLER_REG=$(curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" -d "{\"name\":\"Flow Seller\",\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Flow Traders\",\"gstin\":\"27WXYZQ${D4}W1ZV\",\"pan\":\"WXYZQ${D4}W\",\"bankAccountHolderName\":\"Flow\",\"bankAccountNumber\":\"789012345678\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Rd\",\"city\":\"Ahmedabad\",\"state\":\"GJ\",\"pincode\":\"380001\"}")
check "seller registered" "201" "$(echo "$SELLER_REG" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.success?201:j.code)})")"
check "seller starts PENDING" "PENDING" "$(echo "$SELLER_REG" | field data.seller.status)"
SELLER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$SELLER_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)

echo ""
echo "=== 3. Approval gate: seller cannot list products yet ==="
check "pending seller blocked from listing" "403" "$(status -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $SELLER_TOKEN" -d '{"name":"Too Early","price":10,"stock":1}')"

echo ""
echo "=== 4. Admin approves the seller ==="
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"Admin@1234"}' | field data.accessToken)
PROFILE_ID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const s=j.data.items.find(x=>x.gstin.startsWith('27WXYZQ'));console.log(s?s.id:'')})")
check "admin found the seller" "non-empty" "${PROFILE_ID:+non-empty}"
check "admin approves seller" "200" "$(status -X PATCH "$BASE/admin/sellers/$PROFILE_ID/status" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"APPROVED","reason":"Docs verified"}')"

echo ""
echo "=== 5. Seller creates and publishes a product ==="
PROD_JSON=$(curl -s -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $SELLER_TOKEN" -d "{\"name\":\"Premium Notebook $D4\",\"description\":\"A4 dotted notebook\",\"price\":299.5,\"stock\":20,\"status\":\"ACTIVE\"}")
PROD_ID=$(echo "$PROD_JSON" | field data.id)
check "product created" "201" "$(echo "$PROD_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.success?201:j.code)})")"

echo ""
echo "=== 6. Buyer discovers the product via the catalog ==="
check "catalog search finds product" "1" "$(curl -s "$BASE/products?search=$D4" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.data.total)})")"
check "public product detail" "200" "$(status "$BASE/products/$PROD_ID")"

echo ""
echo "=== 7. Buyer saves address, fills cart, checks out ==="
ADDR_ID=$(curl -s -X POST "$BASE/users/me/addresses" -H "Content-Type: application/json" -H "Authorization: Bearer $BUYER_TOKEN" -d '{"recipientName":"Flow Buyer","phone":"9876543210","addressLine1":"12 MG Road","city":"Ahmedabad","state":"GJ","pincode":"380001"}' | field data.id)
curl -s -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $BUYER_TOKEN" -d "{\"productId\":\"$PROD_ID\",\"quantity\":3}" > /dev/null
ORDERS=$(curl -s -X POST "$BASE/orders" -H "Content-Type: application/json" -H "Authorization: Bearer $BUYER_TOKEN" -d "{\"shippingAddressId\":\"$ADDR_ID\"}")
ORDER_ID=$(echo "$ORDERS" | field data.0.id)
check "order created from cart" "201" "$(echo "$ORDERS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.success?201:j.code)})")"
check "order total (3 x 299.5)" "898.5" "$(echo "$ORDERS" | field data.0.total)"
check "cart emptied after checkout" "0" "$(curl -s "$BASE/cart" -H "Authorization: Bearer $BUYER_TOKEN" | field data.totalQuantity)"
check "stock decremented (20->17)" "17" "$(curl -s "$BASE/products/$PROD_ID" | field data.stock)"

echo ""
echo "=== 8. Order lifecycle: confirm -> ship -> deliver -> paid ==="
check "buyer cannot change status" "403" "$(status -X PATCH "$BASE/orders/$ORDER_ID/status" -H "Content-Type: application/json" -H "Authorization: Bearer $BUYER_TOKEN" -d '{"status":"CONFIRMED"}')"
for st in CONFIRMED SHIPPED DELIVERED; do
  check "seller: $st" "200" "$(status -X PATCH "$BASE/orders/$ORDER_ID/status" -H "Content-Type: application/json" -H "Authorization: Bearer $SELLER_TOKEN" -d "{\"status\":\"$st\"}")"
done
check "payment marked received" "200" "$(status -X POST "$BASE/orders/$ORDER_ID/pay" -H "Authorization: Bearer $SELLER_TOKEN")"
check "payment status PAID" "PAID" "$(curl -s "$BASE/orders/$ORDER_ID" -H "Authorization: Bearer $BUYER_TOKEN" | field data.paymentStatus)"

echo ""
echo "=== 9. Buyer reviews the delivered product ==="
check "review after delivery" "201" "$(status -X POST "$BASE/reviews" -H "Content-Type: application/json" -H "Authorization: Bearer $BUYER_TOKEN" -d "{\"productId\":\"$PROD_ID\",\"rating\":5,\"comment\":\"Great notebook!\"}")"
check "public average rating" "5" "$(curl -s "$BASE/reviews/product/$PROD_ID" | field data.averageRating)"

echo ""
echo "=== 10. Seller sees the order in their panel ==="
check "seller order list" "200" "$(status "$BASE/orders" -H "Authorization: Bearer $SELLER_TOKEN")"
check "buyer sees full history" "1" "$(curl -s "$BASE/orders" -H "Authorization: Bearer $BUYER_TOKEN" | field data.total)"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
