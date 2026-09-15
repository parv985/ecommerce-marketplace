#!/usr/bin/env bash
# Manual E2E verification for Step 11 (Reviews).
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
B_EMAIL="rvb${ts}@test.com"
B2_EMAIL="rvb2${ts}@test.com"
S_EMAIL="rvs${ts}@test.com"

curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "{\"name\":\"Review Buyer\",\"email\":\"$B_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
B_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$B_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "{\"name\":\"Other Buyer\",\"email\":\"$B2_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
B2_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$B2_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" -d "{\"name\":\"Review Seller\",\"email\":\"$S_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Review Traders\",\"gstin\":\"27PQRSV${D4}P1ZV\",\"pan\":\"PQRSV${D4}P\",\"bankAccountHolderName\":\"RS\",\"bankAccountNumber\":\"567890123456\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Rd\",\"city\":\"Jaipur\",\"state\":\"RJ\",\"pincode\":\"302001\"}" > /dev/null
S_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$S_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)

PROD_ID=$(curl -s -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $S_TOKEN" -d '{"name":"Reviewable Product","price":150,"stock":5,"status":"ACTIVE"}' | field data.id)
check "product ready" "non-empty" "${PROD_ID:+non-empty}"

echo "== Buyer completes a delivered order =="
curl -s -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$PROD_ID\",\"quantity\":1}" > /dev/null
ADDR_ID=$(curl -s -X POST "$BASE/users/me/addresses" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d '{"recipientName":"Review Buyer","phone":"9876501234","addressLine1":"1 Fort","city":"Jaipur","state":"RJ","pincode":"302001"}' | field data.id)
ORDER_ID=$(curl -s -X POST "$BASE/orders" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"shippingAddressId\":\"$ADDR_ID\"}" | field data.0.id)
for st in CONFIRMED SHIPPED DELIVERED; do
  curl -s -X PATCH "$BASE/orders/$ORDER_ID/status" -H "Content-Type: application/json" -H "Authorization: Bearer $S_TOKEN" -d "{\"status\":\"$st\"}" > /dev/null
done
check "order delivered" "DELIVERED" "$(curl -s "$BASE/orders/$ORDER_ID" -H "Authorization: Bearer $B_TOKEN" | field data.status)"

echo "== Create review =="
RV=$(curl -s -X POST "$BASE/reviews" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$PROD_ID\",\"rating\":5,\"comment\":\"Excellent quality!\"}")
RV_ID=$(echo "$RV" | field data.id)
check "create review" "201" "$(echo "$RV" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.success?201:j.code)})")"
check "duplicate review rejected" "409" "$(status -X POST "$BASE/reviews" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$PROD_ID\",\"rating\":4}")"
check "rating out of range rejected" "400" "$(status -X POST "$BASE/reviews" -H "Content-Type: application/json" -H "Authorization: Bearer $B2_TOKEN" -d "{\"productId\":\"$PROD_ID\",\"rating\":6}")"
check "not eligible (no purchase)" "403" "$(status -X POST "$BASE/reviews" -H "Content-Type: application/json" -H "Authorization: Bearer $B2_TOKEN" -d "{\"productId\":\"$PROD_ID\",\"rating\":4}")"
check "reviews require auth" "401" "$(status -X POST "$BASE/reviews" -H "Content-Type: application/json" -d "{\"productId\":\"$PROD_ID\",\"rating\":4}")"

echo "== Public list + average =="
check "list reviews" "200" "$(status "$BASE/reviews/product/$PROD_ID")"
check "average rating" "5" "$(curl -s "$BASE/reviews/product/$PROD_ID" | field data.averageRating)"
check "review count" "1" "$(curl -s "$BASE/reviews/product/$PROD_ID" | field data.reviewCount)"
check "reviewer name attached" "Review Buyer" "$(curl -s "$BASE/reviews/product/$PROD_ID" | field data.items.0.userName)"

echo "== Update / delete ownership =="
check "update own review" "200" "$(status -X PATCH "$BASE/reviews/$RV_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d '{"rating":4,"comment":"Still good"}')"
check "rating persisted" "4" "$(curl -s "$BASE/reviews/product/$PROD_ID" | field data.items.0.rating)"
check "other user cannot update" "403" "$(status -X PATCH "$BASE/reviews/$RV_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $B2_TOKEN" -d '{"rating":1}')"
check "other user cannot delete" "403" "$(status -X DELETE "$BASE/reviews/$RV_ID" -H "Authorization: Bearer $B2_TOKEN")"
check "delete own review" "200" "$(status -X DELETE "$BASE/reviews/$RV_ID" -H "Authorization: Bearer $B_TOKEN")"
check "review gone after delete" "0" "$(curl -s "$BASE/reviews/product/$PROD_ID" | field data.reviewCount)"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
