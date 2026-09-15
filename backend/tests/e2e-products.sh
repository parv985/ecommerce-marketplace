#!/usr/bin/env bash
# Manual E2E verification for Steps 4-5 (Products + Categories).
# Requires the API running on http://localhost:5000 and an admin seeded
# via: npx tsx tests/seed-admin.ts
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
ADMIN_EMAIL="admin@example.com"
ADMIN_PASS="Admin@1234"
CAT_NAME="Electronics${D4}"

echo "== Admin login =="
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" | field data.accessToken)
check "admin login token" "non-empty" "${ADMIN_TOKEN:+non-empty}"

echo "== Categories: admin create + duplicate =="
CAT_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/categories" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d "{\"name\":\"$CAT_NAME\",\"description\":\"Gadgets and devices\"}")
CAT_CODE=$(echo "$CAT_RESP" | tail -1)
CAT_JSON=$(echo "$CAT_RESP" | head -n -1)
CAT_ID=$(echo "$CAT_JSON" | field data.id)
check "admin creates category" "201" "$CAT_CODE"
check "duplicate category name" "409" "$(status -X POST "$BASE/categories" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d "{\"name\":\"$CAT_NAME\"}")"

echo "== Seller register + login =="
S1_EMAIL="seller${ts}@test.com"
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" -d "{\"name\":\"Seller One\",\"email\":\"$S1_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"One Traders\",\"gstin\":\"27ABCDE${D4}F1ZV\",\"pan\":\"ABCDE${D4}F\",\"bankAccountHolderName\":\"Seller One\",\"bankAccountNumber\":\"123456789012\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Main Road\",\"city\":\"Mumbai\",\"state\":\"MH\",\"pincode\":\"400001\"}" > /dev/null
S1_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$S1_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)
check "seller1 login token" "non-empty" "${S1_TOKEN:+non-empty}"

S2_EMAIL="seller2${ts}@test.com"
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" -d "{\"name\":\"Seller Two\",\"email\":\"$S2_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Two Traders\",\"gstin\":\"27FGHIJ${D4}G1ZW\",\"pan\":\"FGHIJ${D4}G\",\"bankAccountHolderName\":\"Seller Two\",\"bankAccountNumber\":\"234567890123\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"2 Main Road\",\"city\":\"Delhi\",\"state\":\"DL\",\"pincode\":\"110001\"}" > /dev/null
S2_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$S2_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)
check "seller2 login token" "non-empty" "${S2_TOKEN:+non-empty}"

echo "== Authorization: seller cannot manage categories =="
check "seller create category forbidden" "403" "$(status -X POST "$BASE/categories" -H "Content-Type: application/json" -H "Authorization: Bearer $S1_TOKEN" -d '{"name":"Hack"}')"
check "seller patch category forbidden" "403" "$(status -X PATCH "$BASE/categories/$CAT_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $S1_TOKEN" -d '{"name":"Hack"}')"
check "unauthenticated products/my" "401" "$(status "$BASE/products/my")"

echo "== Products: create (DRAFT), list, single =="
PROD_JSON=$(curl -s -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $S1_TOKEN" -d "{\"name\":\"Wireless Mouse\",\"description\":\"Ergonomic 2.4G mouse\",\"category\":\"$CAT_ID\",\"price\":499.5,\"stock\":50,\"images\":[\"https://example.com/mouse.jpg\"]}")
PROD_ID=$(echo "$PROD_JSON" | field data.id)
check "seller creates product" "201" "$(echo "$PROD_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.success?201:j.code)})")"
check "product defaults to DRAFT" "DRAFT" "$(echo "$PROD_JSON" | field data.status)"
check "public get draft product hidden" "404" "$(status "$BASE/products/$PROD_ID")"
check "seller list own products" "200" "$(status "$BASE/products/my" -H "Authorization: Bearer $S1_TOKEN")"
check "seller get own product" "200" "$(status "$BASE/products/my/$PROD_ID" -H "Authorization: Bearer $S1_TOKEN")"

echo "== Ownership: seller2 cannot touch seller1's product =="
check "seller2 patch seller1 product" "404" "$(status -X PATCH "$BASE/products/$PROD_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $S2_TOKEN" -d '{"price":1}')"
check "seller2 delete seller1 product" "404" "$(status -X DELETE "$BASE/products/$PROD_ID" -H "Authorization: Bearer $S2_TOKEN")"
check "seller2 get seller1 product" "404" "$(status "$BASE/products/my/$PROD_ID" -H "Authorization: Bearer $S2_TOKEN")"

echo "== Validation =="
check "invalid category rejected" "400" "$(status -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $S1_TOKEN" -d '{"name":"Bad","category":"000000000000000000000000","price":10,"stock":1}')"
check "missing name rejected" "400" "$(status -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $S1_TOKEN" -d '{"price":10,"stock":1}')"
check "negative price rejected" "400" "$(status -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $S1_TOKEN" -d '{"name":"Bad","price":-5,"stock":1}')"
check "invalid product id param" "400" "$(status "$BASE/products/not-an-id")"

echo "== Activate + public catalog =="
check "seller activates product" "200" "$(status -X PATCH "$BASE/products/$PROD_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $S1_TOKEN" -d '{"status":"ACTIVE"}')"
check "public get active product" "200" "$(status "$BASE/products/$PROD_ID")"
check "browse all" "200" "$(status "$BASE/products")"
check "browse by category" "200" "$(status "$BASE/products?category=$CAT_ID")"
check "browse search" "200" "$(status "$BASE/products?search=mouse")"
check "browse pagination+sort" "200" "$(status "$BASE/products?page=1&limit=5&sort=price_asc")"
check "browse bad sort rejected" "400" "$(status "$BASE/products?sort=evil")"

echo "== Category deactivate/reactivate =="
check "admin deactivates category" "200" "$(status -X DELETE "$BASE/categories/$CAT_ID" -H "Authorization: Bearer $ADMIN_TOKEN")"
check "inactive category hidden from public" "0" "$(curl -s "$BASE/categories" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.data.some(c=>c.id==='$CAT_ID')?1:0)})")"
check "admin reactivates category" "200" "$(status -X PATCH "$BASE/categories/$CAT_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"isActive":true}')"
check "reactivated category visible" "1" "$(curl -s "$BASE/categories" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.data.some(c=>c.id==='$CAT_ID')?1:0)})")"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
