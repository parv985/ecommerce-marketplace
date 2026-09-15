#!/usr/bin/env bash
# Manual E2E verification for Step 6 (User profile + addresses).
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
B1_EMAIL="buyer${ts}@test.com"
B2_EMAIL="buyer2${ts}@test.com"

echo "== Register + login buyers =="
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "{\"name\":\"Buyer One\",\"email\":\"$B1_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
B1_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$B1_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)
check "buyer1 login token" "non-empty" "${B1_TOKEN:+non-empty}"

curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "{\"name\":\"Buyer Two\",\"email\":\"$B2_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
B2_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$B2_EMAIL\",\"password\":\"Password123!\"}" | field data.accessToken)
check "buyer2 login token" "non-empty" "${B2_TOKEN:+non-empty}"

echo "== Profile =="
check "get my profile" "200" "$(status "$BASE/users/me" -H "Authorization: Bearer $B1_TOKEN")"
check "profile shows role BUYER" "BUYER" "$(curl -s "$BASE/users/me" -H "Authorization: Bearer $B1_TOKEN" | field data.role)"
check "profile hides passwordHash" "0" "$(curl -s "$BASE/users/me" -H "Authorization: Bearer $B1_TOKEN" | grep -c passwordHash)"
check "update profile name" "200" "$(status -X PATCH "$BASE/users/me" -H "Content-Type: application/json" -H "Authorization: Bearer $B1_TOKEN" -d '{"name":"Buyer One Updated","avatar":"https://example.com/avatar.png"}')"
check "updated name persisted" "Buyer One Updated" "$(curl -s "$BASE/users/me" -H "Authorization: Bearer $B1_TOKEN" | field data.name)"
check "unauthorized field rejected" "400" "$(status -X PATCH "$BASE/users/me" -H "Content-Type: application/json" -H "Authorization: Bearer $B1_TOKEN" -d '{"email":"hack@test.com"}')"
check "profile requires auth" "401" "$(status "$BASE/users/me")"

echo "== Addresses =="
ADDR_JSON=$(curl -s -X POST "$BASE/users/me/addresses" -H "Content-Type: application/json" -H "Authorization: Bearer $B1_TOKEN" -d '{"label":"Home","recipientName":"Buyer One","phone":"9876543210","addressLine1":"42 MG Road","city":"Bengaluru","state":"KA","pincode":"560001"}')
ADDR_ID=$(echo "$ADDR_JSON" | field data.id)
check "create address" "201" "$(echo "$ADDR_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.success?201:j.code)})")"
check "list my addresses" "200" "$(status "$BASE/users/me/addresses" -H "Authorization: Bearer $B1_TOKEN")"
check "update address" "200" "$(status -X PATCH "$BASE/users/me/addresses/$ADDR_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $B1_TOKEN" -d '{"city":"Mumbai","state":"MH","pincode":"400001"}')"
check "updated city persisted" "Mumbai" "$(curl -s "$BASE/users/me/addresses" -H "Authorization: Bearer $B1_TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.data[0].city)})")"

echo "== Ownership: buyer2 cannot touch buyer1's address =="
check "buyer2 patch buyer1 address" "404" "$(status -X PATCH "$BASE/users/me/addresses/$ADDR_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $B2_TOKEN" -d '{"city":"Delhi"}')"
check "buyer2 delete buyer1 address" "404" "$(status -X DELETE "$BASE/users/me/addresses/$ADDR_ID" -H "Authorization: Bearer $B2_TOKEN")"

echo "== Validation =="
check "bad phone rejected" "400" "$(status -X POST "$BASE/users/me/addresses" -H "Content-Type: application/json" -H "Authorization: Bearer $B1_TOKEN" -d '{"recipientName":"X","phone":"123","addressLine1":"A","city":"B","state":"C","pincode":"1"}')"
check "bad pincode rejected" "400" "$(status -X POST "$BASE/users/me/addresses" -H "Content-Type: application/json" -H "Authorization: Bearer $B1_TOKEN" -d '{"recipientName":"Buyer One","phone":"9876543210","addressLine1":"42 MG Road","city":"Bengaluru","state":"KA","pincode":"56000"}')"
check "invalid address id" "400" "$(status -X DELETE "$BASE/users/me/addresses/not-an-id" -H "Authorization: Bearer $B1_TOKEN")"

echo "== Delete own address =="
check "buyer1 deletes own address" "200" "$(status -X DELETE "$BASE/users/me/addresses/$ADDR_ID" -H "Authorization: Bearer $B1_TOKEN")"
check "deleted address gone" "0" "$(curl -s "$BASE/users/me/addresses" -H "Authorization: Bearer $B1_TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.data.length)})")"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
