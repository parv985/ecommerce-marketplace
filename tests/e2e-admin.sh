#!/usr/bin/env bash
# Manual E2E verification for Step 12 (Admin APIs).
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
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"Admin@1234"}' | field data.accessToken)
check "admin login" "non-empty" "${ADMIN_TOKEN:+non-empty}"

S_EMAIL="admins${ts}@test.com"
B_EMAIL="adminb${ts}@test.com"

curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "{\"name\":\"Admin Test Buyer\",\"email\":\"$B_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
curl -s -X POST "$BASE/sellers/register" -H "Content-Type: application/json" -d "{\"name\":\"Admin Test Seller\",\"email\":\"$S_EMAIL\",\"password\":\"Password123!\",\"businessName\":\"Admin Test Traders\",\"gstin\":\"27TUVWX${D4}T1ZV\",\"pan\":\"TUVWX${D4}T\",\"bankAccountHolderName\":\"ATS\",\"bankAccountNumber\":\"678901234567\",\"ifscCode\":\"HDFC0001234\",\"addressLine1\":\"1 Rd\",\"city\":\"Kolkata\",\"state\":\"WB\",\"pincode\":\"700001\"}" > /dev/null
S_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$S_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)
B_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$B_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)

echo "== Seller approval gate =="
check "pending seller cannot create product" "403" "$(status -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $S_TOKEN" -d '{"name":"Early Bird","price":10,"stock":1}')"

echo "== Admin lists + approval =="
SELLER_PROFILE_ID=$(curl -s "$BASE/admin/sellers?status=PENDING" -H "Authorization: Bearer $ADMIN_TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const s=j.data.items.find(x=>x.gstin.startsWith('27TUVWX'));console.log(s?s.id:'')})")
check "admin sees pending seller" "non-empty" "${SELLER_PROFILE_ID:+non-empty}"
check "admin approves seller" "200" "$(status -X PATCH "$BASE/admin/sellers/$SELLER_PROFILE_ID/status" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"APPROVED","reason":"Docs verified"}')"
check "seller status APPROVED" "APPROVED" "$(curl -s "$BASE/admin/sellers?status=APPROVED" -H "Authorization: Bearer $ADMIN_TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const s=j.data.items.find(x=>x.id==='$SELLER_PROFILE_ID');console.log(s?s.status:'')})")"
check "approved seller can create product" "201" "$(status -X POST "$BASE/products" -H "Content-Type: application/json" -H "Authorization: Bearer $S_TOKEN" -d '{"name":"Approved Product","price":99,"stock":5,"status":"ACTIVE"}')"

echo "== Product moderation =="
PROD_ID=$(curl -s "$BASE/admin/products" -H "Authorization: Bearer $ADMIN_TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const p=j.data.items.find(x=>x.name==='Approved Product');console.log(p?p.id:'')})")
check "admin lists products" "non-empty" "${PROD_ID:+non-empty}"
check "admin deactivates product" "200" "$(status -X PATCH "$BASE/admin/products/$PROD_ID/status" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"INACTIVE"}')"
check "deactivated product hidden publicly" "404" "$(status "$BASE/products/$PROD_ID")"

echo "== User management =="
BUYER_USER_ID=$(curl -s "$BASE/admin/users?role=BUYER" -H "Authorization: Bearer $ADMIN_TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const u=j.data.items.find(x=>x.email==='$B_EMAIL');console.log(u?u.id:'')})")
check "admin sees buyer in user list" "non-empty" "${BUYER_USER_ID:+non-empty}"
check "admin deactivates buyer" "200" "$(status -X PATCH "$BASE/admin/users/$BUYER_USER_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"isActive":false}')"
check "deactivated buyer login blocked" "403" "$(status -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$B_EMAIL\",\"password\":\"Password123!\"}")"
check "admin reactivates buyer" "200" "$(status -X PATCH "$BASE/admin/users/$BUYER_USER_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"isActive":true}')"

echo "== Order oversight =="
check "admin lists orders" "200" "$(status "$BASE/admin/orders" -H "Authorization: Bearer $ADMIN_TOKEN")"

echo "== Authorization: non-admins blocked =="
check "seller blocked from admin users" "403" "$(status "$BASE/admin/users" -H "Authorization: Bearer $S_TOKEN")"
check "buyer blocked from admin sellers" "403" "$(status "$BASE/admin/sellers" -H "Authorization: Bearer $B_TOKEN")"
check "unauthenticated blocked" "401" "$(status "$BASE/admin/users")"

echo "== Validation =="
check "invalid seller status value" "400" "$(status -X PATCH "$BASE/admin/sellers/$SELLER_PROFILE_ID/status" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"BANNED"}')"
check "invalid user id rejected" "400" "$(status -X PATCH "$BASE/admin/users/not-an-id" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"isActive":true}')"
check "missing seller id 404" "404" "$(status -X PATCH "$BASE/admin/sellers/000000000000000000000000/status" -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"APPROVED"}')"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
