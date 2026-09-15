#!/usr/bin/env bash
# Manual E2E verification for Step 7 (Cart).
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
B_EMAIL="cartbuyer${ts}@test.com"
S_EMAIL="cartseller${ts}@test.com"

echo "== Setup: buyer + seller + active product =="
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "{\"name\":\"Cart Buyer\",\"email\":\"$B_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
B_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$B_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)
check "buyer login token" "non-empty" "${B_TOKEN:+non-empty}"

curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" -d "{\"name\":\"Cart Seller\",\"email\":\"$S_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Cart Traders\",\"gstin\":\"27KLMNO${D4}K1ZV\",\"pan\":\"KLMNO${D4}K\",\"bankAccountHolderName\":\"Cart Seller\",\"bankAccountNumber\":\"456789012345\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"5 Rd\",\"city\":\"Chennai\",\"state\":\"TN\",\"pincode\":\"600001\"}" > /dev/null
S_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$S_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)

P1_JSON=$(curl -s -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $S_TOKEN" -d '{"name":"Mechanical Keyboard","price":2499,"stock":10,"status":"ACTIVE"}')
P1_ID=$(echo "$P1_JSON" | field data.id)
P2_JSON=$(curl -s -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $S_TOKEN" -d '{"name":"Mouse Pad","price":299,"stock":3,"status":"ACTIVE"}')
P2_ID=$(echo "$P2_JSON" | field data.id)
DRAFT_JSON=$(curl -s -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $S_TOKEN" -d '{"name":"Unreleased","price":99,"stock":5}')
DRAFT_ID=$(echo "$DRAFT_JSON" | field data.id)
check "active products ready" "non-empty" "${P1_ID:+non-empty}"

echo "== Add items =="
CART=$(curl -s -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$P1_ID\",\"quantity\":2}")
check "add item" "201" "$(echo "$CART" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.success?201:j.code)})")"
check "cart totalQuantity after add" "2" "$(echo "$CART" | field data.totalQuantity)"
check "cart totalPrice authoritative (2499*2)" "4998" "$(echo "$CART" | field data.totalPrice)"

CART=$(curl -s -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$P1_ID\",\"quantity\":3}")
check "same item increments quantity" "5" "$(echo "$CART" | field data.totalQuantity)"

check "over-stock add rejected" "400" "$(status -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$P2_ID\",\"quantity\":99}")"

CART=$(curl -s -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$P2_ID\",\"quantity\":2}")
check "second product subtotal" "598" "$(echo "$CART" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const it=j.data.items.find(i=>i.productId==='$P2_ID');console.log(it.subtotal)})")"
check "totalQuantity two lines" "7" "$(echo "$CART" | field data.totalQuantity)"

echo "== Update / remove / clear =="
check "update quantity" "200" "$(status -X PATCH "$BASE/cart/items/$P1_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d '{"quantity":1}')"
check "update above stock rejected" "400" "$(status -X PATCH "$BASE/cart/items/$P2_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d '{"quantity":5}')"
check "remove item" "200" "$(status -X DELETE "$BASE/cart/items/$P1_ID" -H "Authorization: Bearer $B_TOKEN")"
check "item count after remove" "1" "$(curl -s "$BASE/cart" -H "Authorization: Bearer $B_TOKEN" | field data.totalItems)"
check "remove missing item" "404" "$(status -X DELETE "$BASE/cart/items/$P1_ID" -H "Authorization: Bearer $B_TOKEN")"
check "clear cart" "200" "$(status -X DELETE "$BASE/cart" -H "Authorization: Bearer $B_TOKEN")"
check "cart empty after clear" "0" "$(curl -s "$BASE/cart" -H "Authorization: Bearer $B_TOKEN" | field data.totalQuantity)"

echo "== Validation + authz =="
check "draft product not addable" "404" "$(status -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$DRAFT_ID\",\"quantity\":1}")"
check "zero quantity rejected" "400" "$(status -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d "{\"productId\":\"$P1_ID\",\"quantity\":0}")"
check "missing productId rejected" "400" "$(status -X POST "$BASE/cart/items" -H "Content-Type: application/json" -H "Authorization: Bearer $B_TOKEN" -d '{"quantity":1}')"
check "cart requires auth" "401" "$(status "$BASE/cart")"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
