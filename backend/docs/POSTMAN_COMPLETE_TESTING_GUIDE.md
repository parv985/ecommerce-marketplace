# Complete Postman API Testing Guide — E-Commerce Marketplace Backend

> **Base URL:** `http://localhost:5000/api/v1`
> **Swagger UI:** `http://localhost:5000/api-docs`
> **Total APIs:** 100+ endpoints across 16 modules

---

## Table of Contents

1. [Postman Setup & Configuration](#1-postman-setup--configuration)
2. [Environment Variables](#2-environment-variables)
3. [Collection-Level Scripts](#3-collection-level-scripts)
4. [Testing Sequence Overview](#4-testing-sequence-overview)
5. [Phase 1 — Authentication](#5-phase-1--authentication)
6. [Phase 2 — User Profile & Addresses](#6-phase-2--user-profile--addresses)
7. [Phase 3 — Admin: Seller Approval & Categories](#7-phase-3--admin-seller-approval--categories)
8. [Phase 4 — Seller Profile](#8-phase-4--seller-profile)
9. [Phase 5 — Products](#9-phase-5--products)
10. [Phase 6 — Cart](#10-phase-6--cart)
11. [Phase 7 — Orders & Checkout](#11-phase-7--orders--checkout)
12. [Phase 8 — Payments](#12-phase-8--payments)
13. [Phase 9 — Discounts](#13-phase-9--discounts)
14. [Phase 10 — Coupons](#14-phase-10--coupons)
15. [Phase 11 — Reviews](#15-phase-11--reviews)
16. [Phase 12 — Returns](#16-phase-12--returns)
17. [Phase 13 — Notifications](#17-phase-13--notifications)
18. [Phase 14 — Analytics & Dashboard](#18-phase-14--analytics--dashboard)
19. [Phase 15 — Settlements](#19-phase-15--settlements)
20. [Phase 16 — Admin APIs](#20-phase-16--admin-apis)
21. [Phase 17 — Cloudinary File Uploads](#21-phase-17--cloudinary-file-uploads)
22. [Phase 18 — System](#22-phase-18--system)
23. [Failure & Edge-Case Testing](#23-failure--edge-case-testing)
24. [Database Verification](#24-database-verification)
25. [Troubleshooting](#25-troubleshooting)

---

## 1. Postman Setup & Configuration

### Import

1. **Collection:** Postman → Collections → Import → `docs/postman-collection.json`
2. **Environment:** Postman → Environments → Import → `docs/postman-environments.json`
3. Select environment dropdown (top-right) → `E-Commerce Dev`

### Architecture

- All requests use `{{apiPrefix}}` which resolves to `http://localhost:5000/api/v1`
- All protected requests use `Authorization: Bearer {{accessToken}}`
- Auto-save scripts at collection level save tokens and IDs automatically

---

## 2. Environment Variables

| Variable | Default Value | Description |
|---|---|---|
| `baseUrl` | `http://localhost:5000` | Server host |
| `apiPrefix` | `http://localhost:5000/api/v1` | Full API base |
| `accessToken` | _(set after login)_ | Current JWT access token |
| `refreshToken` | _(set after login)_ | Refresh token cookie |
| `buyerAccessToken` | _(set after buyer login)_ | Buyer JWT token |
| `sellerAccessToken` | _(set after seller login)_ | Seller JWT token |
| `adminAccessToken` | _(set after admin login)_ | Admin JWT token |
| `buyerUserId` | _(set after buyer register)_ | Buyer user ID |
| `sellerUserId` | _(set after seller register)_ | Seller user ID |
| `adminUserId` | _(set after admin login)_ | Admin user ID |
| `categoryId` | _(set after category creation)_ | Category ID |
| `productId` | _(set after product creation)_ | Product ID |
| `addressId` | _(set after address creation)_ | Address ID |
| `orderId` | _(set after order creation)_ | Order ID |
| `sellerProfileId` | _(set after admin approval)_ | Seller profile ID |
| `discountId` | _(set after discount creation)_ | Discount ID |
| `couponId` | _(set after coupon creation)_ | Coupon ID |
| `reviewId` | _(set after review creation)_ | Review ID |
| `returnId` | _(set after return request)_ | Return ID |
| `paymentOrderId` | _(set after payment initiation)_ | Payment gateway order ID |
| `notificationId` | _(set after notification listed)_ | Notification ID |
| `settlementId` | _(set after settlement generation)_ | Settlement ID |
| `imagePublicId` | _(set after image upload)_ | Cloudinary publicId for uploaded image |
| `documentPublicId` | _(set after document upload)_ | Cloudinary publicId for uploaded document |

---

## 3. Collection-Level Scripts

### Pre-request Script (Collection Level)

```javascript
// Auto-select auth token based on role
const role = pm.environment.get("activeRole");
if (role === "BUYER") {
  pm.request.headers.add({
    key: "Authorization",
    value: "Bearer " + pm.environment.get("buyerAccessToken")
  });
} else if (role === "SELLER") {
  pm.request.headers.add({
    key: "Authorization",
    value: "Bearer " + pm.environment.get("sellerAccessToken")
  });
} else if (role === "SUPER_ADMIN") {
  pm.request.headers.add({
    key: "Authorization",
    value: "Bearer " + pm.environment.get("adminAccessToken")
  });
}
```

### Test Scripts (Per-Request Pattern)

Every authenticated request should include:

```javascript
// Save tokens if present
const data = pm.response.json();
if (data?.data?.accessToken) {
  pm.environment.set("accessToken", data.data.accessToken);
}
// Save IDs
if (data?.data?._id) {
  pm.environment.set("currentId", data.data._id);
}
```

---

## 4. Testing Sequence Overview

The APIs have strict dependencies. You must follow this order:

```
PHASE 1: Authentication
    ├── Register Buyer → save buyerUserId, buyerAccessToken
    ├── Register Seller → save sellerUserId, sellerAccessToken
    ├── Register Admin (or seed) → save adminUserId, adminAccessToken
    └── Login Buyer → save buyerAccessToken, refresh token cookie

PHASE 2: User Profile & Avatar
    ├── Get buyer profile
    ├── Update buyer profile
    ├── Upload avatar → save avatarUrl
    ├── Create address → save addressId
    ├── List addresses
    └── Update address

PHASE 3: Admin Setup
    ├── List pending sellers
    ├── Approve seller → save sellerProfileId
    └── Create category → save categoryId

PHASE 4: Seller Profile & Documents
    ├── Get seller profile
    ├── Update seller profile
    ├── Upload document → save documentPublicId
    └── List documents

PHASE 5: Products & Images
    ├── Create product → save productId
    ├── Upload product images → save imagePublicId
    ├── List my products
    ├── Get product by ID
    ├── Update product
    ├── Browse products (public)
    └── Delete (deactivate) product

PHASE 6: Cart
    ├── Add item to cart → uses productId
    ├── Get cart
    ├── Update cart item quantity
    ├── Add second item
    └── Remove item

PHASE 7: Orders
    ├── Create order (checkout) → save orderId
    ├── List orders
    ├── Get order by ID
    ├── Seller: update status → CONFIRMED
    ├── Seller: update status → SHIPPED
    └── Seller: update status → DELIVERED

PHASE 8: Payments
    ├── Initiate payment → save paymentOrderId
    ├── Verify payment
    ├── (Webhook test)
    └── Refund

PHASE 9: Discounts
    ├── Create discount → save discountId
    ├── List discounts
    ├── Get discount by ID
    ├── Update discount
    └── Deactivate discount

PHASE 10: Coupons
    ├── Create coupon → save couponId
    ├── List coupons
    ├── Get coupon by ID
    ├── Update coupon
    └── Deactivate coupon

PHASE 11: Reviews
    ├── Create review → save reviewId
    ├── List product reviews
    ├── Update review
    └── Delete review

PHASE 12: Returns
    ├── Request return → save returnId
    ├── List returns
    ├── Get return by ID
    ├── Seller: approve return
    └── Seller: complete return

PHASE 13: Notifications
    ├── List notifications
    ├── Get unread count
    ├── Mark notification read
    ├── Mark all read
    ├── Get preferences
    └── Update preferences

PHASE 14: Analytics
    ├── Dashboard
    ├── Sales over time
    ├── Top products
    ├── Category performance
    ├── Customers
    └── Revenue

PHASE 15: Settlements
    ├── Generate settlements (admin)
    ├── List settlements (admin)
    ├── Get settlement (admin)
    ├── Process settlement
    ├── Mark paid
    └── Seller: get my settlement

PHASE 16: Admin
    ├── List users
    ├── Update user status
    ├── List sellers
    ├── List products
    ├── List orders
    ├── Broadcast notification
    ├── Commission settings
    └── Get commission settings
```

---

## 5. Phase 1 — Authentication

### 5.1 Register Buyer

```
POST /api/v1/auth/register
```

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "name": "John Buyer",
  "email": "buyer.test@example.com",
  "password": "StrongPassword123!"
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "_id": "<buyerUserId>",
    "name": "John Buyer",
    "email": "buyer.test@example.com",
    "role": "BUYER",
    "isActive": true,
    "createdAt": "2026-08-19T..."
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("buyerUserId", res.data._id);
pm.environment.set("buyerAccessToken", res.data.accessToken);
```

**Variables Saved:** `buyerUserId`

**Failure Cases:**
| Test | Body | Expected |
|---|---|---|
| Missing email | `{"name":"X","password":"123"}` | `400` — `"email is required"` |
| Invalid email | `{"name":"X","email":"bad","password":"123"}` | `400` — `"valid email"` |
| Short password | `{"name":"X","email":"a@b.com","password":"123"}` | `400` — `"at least 8 characters"` |
| Duplicate email | Same email again | `409` — already exists |
| Short name | `{"name":"J","email":"x@y.com","password":"Strong123!"}` | `400` — `"at least 2 characters"` |

---

### 5.2 Register Seller

```
POST /api/v1/sellers/register
```

**Body (JSON):**
```json
{
  "name": "Jane Seller",
  "email": "seller.test@example.com",
  "password": "StrongPassword123!",
  "businessName": "Jane's Trading Co.",
  "phone": "9876543210",
  "gstin": "27AAPFU0939F1ZV",
  "pan": "AAPFU0939F",
  "bankAccountHolderName": "Jane Seller",
  "bankAccountNumber": "123456789012",
  "ifscCode": "HDFC0001234",
  "addressLine1": "123 Market Street",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001"
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Seller registered successfully",
  "data": {
    "_id": "<sellerUserId>",
    "name": "Jane Seller",
    "email": "seller.test@example.com",
    "role": "SELLER"
  }
}
```

**Variables Saved:** `sellerUserId`

**Important Notes:**
- GSTIN format: 15 chars `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`
- PAN format: 10 chars `^[A-Z]{5}[0-9]{4}[A-Z]$`
- IFSC format: 11 chars `^[A-Z]{4}0[A-Z0-9]{6}$`
- Phone: exactly 10 digits
- Pincode: 6 digits starting with 1-9

**Failure Cases:**
| Test | Issue | Expected |
|---|---|---|
| Invalid GSTIN | Wrong format | `400` — validation error |
| Invalid PAN | Wrong format | `400` — validation error |
| Duplicate GSTIN | Same GSTIN as another seller | `409` |
| Short password | `< 8 chars` | `400` |

---

### 5.3 Register Admin (Seed)

```
POST /api/v1/auth/register
```

**Body:**
```json
{
  "name": "Super Admin",
  "email": "admin.test@example.com",
  "password": "AdminPass123!"
}
```

> **Note:** In production, admin accounts are seeded. For testing, register then manually set role to `SUPER_ADMIN` in the database, or use a pre-seeded admin account. The server log at startup may show admin credentials.

**Alternative — Use seed script:**
```bash
PORT=5000 npx tsx tests/seed-admin.ts
```

---

### 5.4 Login Buyer

```
POST /api/v1/auth/login
```

**Body:**
```json
{
  "email": "buyer.test@example.com",
  "password": "StrongPassword123!"
}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "<jwt-token>",
    "user": {
      "_id": "<buyerUserId>",
      "name": "John Buyer",
      "email": "buyer.test@example.com",
      "role": "BUYER"
    }
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("buyerAccessToken", res.data.accessToken);
pm.environment.set("activeRole", "BUYER");
```

**Variables Saved:** `buyerAccessToken`

> **Note:** The refresh token is set as an httpOnly cookie. It is NOT in the JSON response. In Postman, the cookie is automatically managed.

**Failure Cases:**
| Test | Body | Expected |
|---|---|---|
| Wrong password | `{"email":"a@b.com","password":"wrong"}` | `401` — `"Invalid credentials"` |
| Non-existent email | `{"email":"none@x.com","password":"123"}` | `401` — `"Invalid credentials"` |
| Missing fields | `{}` | `400` — validation error |
| Inactive account | Login with deactivated user | `401` |

---

### 5.5 Login Seller

```
POST /api/v1/auth/login
```

**Body:**
```json
{
  "email": "seller.test@example.com",
  "password": "StrongPassword123!"
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("sellerAccessToken", res.data.accessToken);
pm.environment.set("activeRole", "SELLER");
```

**Variables Saved:** `sellerAccessToken`

> **Note:** If 2FA is enabled for this seller, the response will be:
> ```json
> {
>   "success": true,
>   "message": "Two-factor authentication required",
>   "data": {
>     "twoFactorRequired": true,
>     "loginToken": "<short-lived-token>"
>   }
> }
> ```
> Then call `/api/v1/auth/2fa/verify` with the `loginToken` and a TOTP code.

---

### 5.6 Login Admin

```
POST /api/v1/auth/login
```

**Body:**
```json
{
  "email": "admin.test@example.com",
  "password": "AdminPass123!"
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("adminAccessToken", res.data.accessToken);
pm.environment.set("activeRole", "SUPER_ADMIN");
```

**Variables Saved:** `adminAccessToken`

---

### 5.7 Refresh Token

```
POST /api/v1/auth/refresh
```

**Headers:**
```
(No Authorization header needed — uses httpOnly cookie)
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "<new-jwt-token>"
  }
}
```

> **Note:** The refresh token cookie is automatically rotated (single-use). A new cookie is set in the response.

**Failure Cases:**
| Test | Expected |
|---|---|
| No cookie | `401` — `"Refresh token is required"` |
| Expired cookie | `401` — `"Invalid or expired refresh token"` |
| Reused cookie | `401` — `"Invalid or expired refresh token"` (rotation) |

---

### 5.8 Logout

```
POST /api/v1/auth/logout
```

**Headers:**
```
Authorization: Bearer {{accessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Logout successful",
  "data": null
}
```

> The refresh token is revoked and the cookie is cleared.

---

### 5.9 Forgot Password

```
POST /api/v1/auth/forgot-password
```

**Body:**
```json
{
  "email": "buyer.test@example.com"
}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset email has been sent.",
  "data": null
}
```

> Always returns 200 to prevent account enumeration. Check the email inbox (or Ethereal mail logs) for the reset token.

---

### 5.10 Reset Password

```
POST /api/v1/auth/reset-password
```

**Body:**
```json
{
  "token": "<reset-token-from-email>",
  "password": "NewStrongPassword123!",
  "confirmPassword": "NewStrongPassword123!"
}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password reset successfully",
  "data": null
}
```

**Failure Cases:**
| Test | Expected |
|---|---|
| Mismatched passwords | `400` — `"Passwords do not match"` |
| Expired token | `400` — `"Invalid or expired token"` |
| Short password | `400` — `"at least 8 characters"` |

---

## 6. Phase 2 — User Profile & Addresses

### 6.1 Get My Profile

```
GET /api/v1/users/me
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Profile fetched successfully",
  "data": {
    "_id": "<buyerUserId>",
    "name": "John Buyer",
    "email": "buyer.test@example.com",
    "role": "BUYER",
    "avatar": null,
    "addresses": []
  }
}
```

**Failure:** `401` without token

---

### 6.2 Update My Profile

```
PATCH /api/v1/users/me
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "John Updated",
  "avatar": "https://example.com/avatar.jpg"
}
```

**Expected Response:** `200 OK`

**Failure Cases:**
| Test | Expected |
|---|---|
| Invalid URL for avatar | `400` — `"Avatar must be a valid URL"` |
| Name too short | `400` — `"at least 2 characters"` |
| Extra fields | `400` (strict schema rejects unknown keys) |

---

### 6.3 Create Address

```
POST /api/v1/users/me/addresses
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "label": "Home",
  "recipientName": "John Buyer",
  "phone": "9876543210",
  "addressLine1": "456 Residential Lane",
  "addressLine2": "Apt 12B",
  "city": "Delhi",
  "state": "Delhi",
  "pincode": "110001"
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Address created successfully",
  "data": {
    "_id": "<addressId>",
    "label": "Home",
    "recipientName": "John Buyer",
    "phone": "9876543210",
    "addressLine1": "456 Residential Lane",
    "addressLine2": "Apt 12B",
    "city": "Delhi",
    "state": "Delhi",
    "pincode": "110001"
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("addressId", res.data._id);
```

**Variables Saved:** `addressId`

**Failure Cases:**
| Test | Expected |
|---|---|
| Invalid pincode | `400` — `"Invalid Indian pincode"` |
| Invalid phone | `400` — `"Invalid phone number"` |
| Missing required fields | `400` — validation error |

---

### 6.4 List My Addresses

```
GET /api/v1/users/me/addresses
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Addresses fetched successfully",
  "data": [
    {
      "_id": "<addressId>",
      "label": "Home",
      "recipientName": "John Buyer",
      ...
    }
  ]
}
```

---

### 6.5 Update Address

```
PATCH /api/v1/users/me/addresses/{{addressId}}
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "label": "Office",
  "city": "Navi Mumbai"
}
```

**Expected Response:** `200 OK`

**Failure Cases:**
| Test | Expected |
|---|---|
| Non-existent address | `404` |
| Another user's address | `404` (ownership enforced) |
| Invalid ObjectId | `400` |

---

### 6.6 Delete Address

```
DELETE /api/v1/users/me/addresses/{{addressId}}
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Expected Response:** `200 OK`

> **Tip:** Create a second address first so you can delete one without losing the address needed for checkout in Phase 7.

---

## 7. Phase 3 — Admin: Seller Approval & Categories

### 7.1 List Pending Sellers (Admin)

```
GET /api/v1/admin/sellers?status=PENDING
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "sellers": [
      {
        "_id": "<sellerProfileId>",
        "userId": "<sellerUserId>",
        "businessName": "Jane's Trading Co.",
        "status": "PENDING",
        ...
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1 }
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
if (res.data.sellers.length > 0) {
  pm.environment.set("sellerProfileId", res.data.sellers[0]._id);
}
```

**Variables Saved:** `sellerProfileId`

---

### 7.2 Approve Seller

```
PATCH /api/v1/admin/sellers/{{sellerProfileId}}/status
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "status": "APPROVED",
  "reason": "Verified business documents"
}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Seller status updated",
  "data": {
    "_id": "<sellerProfileId>",
    "status": "APPROVED",
    ...
  }
}
```

**Important:** After approval, the seller must **login again** to get a valid token that reflects their approved status.

---

### 7.3 Create Category (Admin)

```
POST /api/v1/categories
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Electronics",
  "description": "Electronic devices and gadgets"
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Category created successfully",
  "data": {
    "_id": "<categoryId>",
    "name": "Electronics",
    "description": "Electronic devices and gadgets",
    "isActive": true
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("categoryId", res.data._id);
```

**Variables Saved:** `categoryId`

**Failure Cases:**
| Test | Expected |
|---|---|
| Duplicate name | `409` — already exists |
| Missing name | `400` |
| Non-admin calling | `403` |

---

### 7.4 List Active Categories (Public)

```
GET /api/v1/categories
```

**No auth required.**

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Categories fetched successfully",
  "data": [
    {
      "_id": "<categoryId>",
      "name": "Electronics",
      "description": "Electronic devices and gadgets",
      "isActive": true
    }
  ]
}
```

---

### 7.5 List All Categories (Admin — includes inactive)

```
GET /api/v1/categories/all
````````

**Headers:**
```     
Authorization: Bearer {{adminAccessToken}}
```

---

### 7.6 Update Category (Admin)

```
PATCH /api/v1/categories/{{categoryId}}
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Consumer Electronics",
  "description": "Updated description"
}
```

**Expected Response:** `200 OK`

---

### 7.7 Deactivate Category (Admin)

```
DELETE /api/v1/categories/{{categoryId}}
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

**Expected Response:** `200 OK`

> **Note:** This is a soft-delete (sets `isActive: false`). Products keep their category reference.

---

## 8. Phase 4 — Seller Profile

### 8.1 Get Seller Profile

```
GET /api/v1/sellers/me
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Seller profile fetched successfully",
  "data": {
    "_id": "<sellerProfileId>",
    "userId": "<sellerUserId>",
    "businessName": "Jane's Trading Co.",
    "phone": "9876543210",
    "gstin": "27AAPFU0939F1ZV",
    "pan": "AAPFU0939F",
    "status": "APPROVED",
    "bankAccountHolderName": "Jane Seller",
    "bankAccountNumber": "123456789012",
    "ifscCode": "HDFC0001234",
    "address": {
      "addressLine1": "123 Market Street",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001"
    }
  }
}
```

**Failure Cases:**
| Test | Expected |
|---|---|
| Without token | `401` |
| With buyer token | `403` |
| Seller not found | `404` |

---

### 8.2 Update Seller Profile

```
PATCH /api/v1/sellers/me
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "businessName": "Jane's Trading Updated",
  "phone": "9876543211",
  "city": "Pune"
}
```

**Expected Response:** `200 OK`

> **Note:** GSTIN and PAN are immutable after registration. Attempting to send them returns `400`.

---

## 9. Phase 5 — Products

### 9.1 Create Product (Seller)

```
POST /api/v1/products
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Wireless Mouse",
  "description": "Ergonomic wireless mouse with USB receiver",
  "category": "{{categoryId}}",
  "price": 799,
  "stock": 50,
  "images": ["https://example.com/mouse1.jpg"],
  "status": "ACTIVE"
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "_id": "<productId>",
    "sellerId": "<sellerProfileId>",
    "name": "Wireless Mouse",
    "price": 799,
    "stock": 50,
    "status": "ACTIVE",
    "category": "<categoryId>"
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("productId", res.data._id);
```

**Variables Saved:** `productId`

**Failure Cases:**
| Test | Expected |
|---|---|
| Without auth | `401` |
| Buyer calling | `403` |
| Price <= 0 | `400` |
| Negative stock | `400` |
| Invalid category ID | `400` |
| Name too short | `400` |

---

### 9.2 List My Products (Seller)

```
GET /api/v1/products/my
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Products fetched successfully",
  "data": [
    {
      "_id": "<productId>",
      "name": "Wireless Mouse",
      "price": 799,
      "stock": 50,
      "status": "ACTIVE",
      ...
    }
  ]
}
```

---

### 9.3 Get Product by ID (Seller — own product)

```
GET /api/v1/products/my/{{productId}}
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`

---

### 9.4 Update Product (Seller)

```
PATCH /api/v1/products/{{productId}}
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Wireless Mouse Pro",
  "price": 999,
  "stock": 45
}
```

**Expected Response:** `200 OK`

**Failure Cases:**
| Test | Expected |
|---|---|
| Another seller's product | `404` |
| Invalid ObjectId | `400` |
| Extra fields | `400` (strict schema) |

---

### 9.5 Browse Products (Public)

```
GET /api/v1/products
```

**No auth required.**

**Query Parameters:**
| Parameter | Type | Example | Description |
|---|---|---|---|
| `search` | string | `mouse` | Free text search |
| `category` | string (ObjectId) | `{{categoryId}}` | Filter by category |
| `minPrice` | number | `500` | Minimum price |
| `maxPrice` | number | `1500` | Maximum price |
| `sort` | enum | `price_asc` | `newest`, `oldest`, `price_asc`, `price_desc`, `name_asc` |
| `page` | integer | `1` | Page number (default: 1) |
| `limit` | integer | `20` | Items per page (default: 20, max: 100) |

**Full example:**
```
GET /api/v1/products?search=mouse&minPrice=500&maxPrice=1500&sort=price_asc&page=1&limit=10
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Products fetched successfully",
  "data": {
    "products": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1
    }
  }
}
```

---

### 9.6 Get Product by ID (Public — active only)

```
GET /api/v1/products/{{productId}}
```

**No auth required.**

**Expected Response:** `200 OK`

**Failure Cases:**
| Test | Expected |
|---|---|
| Inactive product | `404` |
| Non-existent ID | `404` |
| Invalid ObjectId | `400` |

---

### 9.7 Delete (Deactivate) Product

```
DELETE /api/v1/products/{{productId}}
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`

> **Note:** This is a soft-delete — sets `status: INACTIVE`. The product disappears from the public catalog.

---

## 10. Phase 6 — Cart

### 10.1 Add Item to Cart

```
POST /api/v1/cart/items
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "productId": "{{productId}}",
  "quantity": 2
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Item added to cart",
  "data": {
    "items": [
      {
        "product": "<productId>",
        "quantity": 2,
        "price": 999
      }
    ],
    "totalItems": 2,
    "subtotal": 1998
  }
}
```

**Failure Cases:**
| Test | Expected |
|---|---|
| Without auth | `401` |
| Non-existent product | `404` |
| Inactive product | `404` |
| Quantity > stock | `400` — insufficient stock |
| Quantity < 1 | `400` |
| Quantity = 0 | `400` |

---

### 10.2 Get Cart

```
GET /api/v1/cart
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Cart fetched successfully",
  "data": {
    "items": [
      {
        "product": {
          "_id": "<productId>",
          "name": "Wireless Mouse Pro",
          "price": 999,
          "stock": 45,
          "status": "ACTIVE"
        },
        "quantity": 2
      }
    ],
    "totalItems": 2,
    "subtotal": 1998
  }
}
```

---

### 10.3 Update Cart Item Quantity

```
PATCH /api/v1/cart/items/{{productId}}
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "quantity": 3
}
```

**Expected Response:** `200 OK`

---

### 10.4 Remove Item from Cart

```
DELETE /api/v1/cart/items/{{productId}}
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Expected Response:** `200 OK`

---

### 10.5 Clear Cart

```
DELETE /api/v1/cart
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Expected Response:** `200 OK`

---

## 11. Phase 7 — Orders & Checkout

### 11.1 Create Order (Checkout)

```
POST /api/v1/orders
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "shippingAddressId": "{{addressId}}",
  "paymentMethod": "CASH_ON_DELIVERY"
}
```

**Optional:** Add a coupon code:
```json
{
  "shippingAddressId": "{{addressId}}",
  "paymentMethod": "ONLINE",
  "couponCode": "WELCOME10"
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Order(s) created successfully",
  "data": [
    {
      "_id": "<orderId>",
      "buyerId": "<buyerUserId>",
      "sellerId": "<sellerProfileId>",
      "items": [
        {
          "product": "<productId>",
          "name": "Wireless Mouse Pro",
          "price": 999,
          "quantity": 3,
          "subtotal": 2997
        }
      ],
      "subtotal": 2997,
      "discount": 0,
      "couponDiscount": 0,
      "total": 2997,
      "paymentMethod": "CASH_ON_DELIVERY",
      "paymentStatus": "PENDING",
      "status": "PENDING",
      "shippingAddress": { ... }
    }
  ]
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
if (Array.isArray(res.data) && res.data.length > 0) {
  pm.environment.set("orderId", res.data[0]._id);
}
```

**Variables Saved:** `orderId`

**Failure Cases:**
| Test | Expected |
|---|---|
| Empty cart | `400` — cart is empty |
| Insufficient stock | `400` |
| Address not found | `404` |
| Address belongs to another user | `404` |
| Invalid payment method | `400` |
| Coupon not provided | `400` |

---

### 11.2 List My Orders

```
GET /api/v1/orders
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `status` | enum | `PENDING`, `CONFIRMED`, `SHIPPED`, `DELIVERED`, `CANCELLED` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Orders fetched successfully",
  "data": {
    "orders": [...],
    "pagination": { "page": 1, "limit": 20, "total": 1 }
  }
}
```

---

### 11.3 Get Order by ID

```
GET /api/v1/orders/{{orderId}}
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Expected Response:** `200 OK`

**Failure Cases:**
| Test | Expected |
|---|---|
| Another buyer's order | `403` |
| Non-existent ID | `404` |

---

### 11.4 Update Order Status (Seller)

```
PATCH /api/v1/orders/{{orderId}}/status
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "status": "CONFIRMED"
}
```

**Valid transitions:**
```
PENDING → CONFIRMED → SHIPPED → DELIVERED
PENDING → CANCELLED
CONFIRMED → CANCELLED
```

**Expected Response:** `200 OK`

**Failure Cases:**
| Test | Expected |
|---|---|
| DELIVERED → PENDING | `400` — invalid transition |
| Buyer calling | `403` |
| Another seller | `403` |

---

### 11.5 Cancel Order (Buyer or Seller)

```
POST /api/v1/orders/{{orderId}}/cancel
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Expected Response:** `200 OK`

> Stock is restored when an order is cancelled.

**Failure Cases:**
| Test | Expected |
|---|---|
| Already delivered | `400` — cannot cancel |
| Already cancelled | `400` |

---

### 11.6 Mark Order Paid (COD — Seller)

```
POST /api/v1/orders/{{orderId}}/pay
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`

> Only works on DELIVERED orders with CASH_ON_DELIVERY payment method.

---

## 12. Phase 8 — Payments

### 12.1 Initiate Online Payment

```
POST /api/v1/payments/orders/{{orderId}}/initiate
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Note:** The order must have `paymentMethod: "ONLINE"`.

**Expected Response:** `201 Created`
```json 
{
  "success": true,
  "message": "Payment initiated",
  "data": {
    "_id": "<paymentId>",
    "orderId": "<orderId>",
    "gatewayOrderId": "order_XXXXXXX",
    "amount": 2997,
    "currency": "INR",
    "status": "PENDING"
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("paymentOrderId", res.data.gatewayOrderId);
```

**Variables Saved:** `paymentOrderId` (gateway order ID)

---

### 12.2 Verify Payment

```
POST /api/v1/payments/orders/{{orderId}}/verify
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "paymentId": "pay_XXXXXXXXXXXXX",
  "signature": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
}
```

> In mock mode, the signature verification is bypassed. The payment is marked as PAID.

**Expected Response:** `200 OK`

---

### 12.3 Razorpay Webhook

```
POST /api/v1/payments/webhook/razorpay
```

**Headers:**
```
Content-Type: application/json
X-Razorpay-Signature: <hmac-signature>
```

**Body:**
```json
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_XXXXXXX",
        "amount": 299700,
        "status": "captured",
        "order_id": "order_XXXXXXX"
      }
    }
  }
}
```

> **Note:** In mock mode, signature verification is bypassed. In production, the HMAC-SHA256 signature is verified.

---

### 12.4 Refund Payment

```
POST /api/v1/payments/orders/{{orderId}}/refund
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`

> Only the order's seller or an admin can issue a refund. The full paid amount is refunded.

---

## 13. Phase 9 — Discounts

### 13.1 Create Discount (Seller)

```
POST /api/v1/discounts
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Product Discount:**
```json
{
  "productId": "{{productId}}",
  "discountType": "PERCENTAGE",
  "discountValue": 10,
  "startAt": "2026-08-01T00:00:00.000Z",
  "endAt": "2026-12-31T23:59:59.000Z",
  "status": "ACTIVE"
}
```

**Category Discount:**
```json
{
  "categoryId": "{{categoryId}}",
  "discountType": "PERCENTAGE",
  "discountValue": 15,
  "startAt": "2026-08-01T00:00:00.000Z",
  "endAt": "2026-12-31T23:59:59.000Z",
  "status": "ACTIVE"
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Discount created successfully",
  "data": {
    "_id": "<discountId>",
    "sellerId": "<sellerProfileId>",
    "productId": "<productId>",
    "discountType": "PERCENTAGE",
    "discountValue": 10,
    "startAt": "2026-08-01T...",
    "endAt": "2026-12-31T...",
    "status": "ACTIVE"
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("discountId", res.data._id);
```

**Variables Saved:** `discountId`

**Rules:**
- Either `productId` or `categoryId` required, not both
- `discountValue`: 1-100 (percentage)
- `endAt` must be after `startAt`
- Product must belong to the seller

**Failure Cases:**
| Test | Expected |
|---|---|
| Both productId and categoryId | `400` |
| Neither productId nor categoryId | `400` |
| Discount > 100% | `400` |
| endAt before startAt | `400` |
| Another seller's product | `404` |

---

### 13.2 List My Discounts

```
GET /api/v1/discounts
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `status` | enum | `ACTIVE`, `INACTIVE` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

---

### 13.3 Get Discount by ID

```
GET /api/v1/discounts/{{discountId}}
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

---

### 13.4 Update Discount

```
PATCH /api/v1/discounts/{{discountId}}
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "discountValue": 20,
  "endAt": "2027-01-01T00:00:00.000Z"
}
```

---

### 13.5 Deactivate Discount

```
DELETE /api/v1/discounts/{{discountId}}
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`

> Soft-delete: sets `status: INACTIVE`.

---

## 14. Phase 10 — Coupons

### 14.1 Create Coupon (Seller)

```
POST /api/v1/coupons
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Percentage Coupon:**
```json
{
  "code": "WELCOME10",
  "type": "PERCENTAGE",
  "value": 10,
  "minOrderValue": 500,
  "maxDiscount": 200,
  "productIds": ["{{productId}}"],
  "categoryIds": [],
  "startAt": "2026-08-01T00:00:00.000Z",
  "endAt": "2026-12-31T23:59:59.000Z",
  "usageLimit": 100,
  "perUserLimit": 3,
  "status": "ACTIVE"
}
```

**Fixed Coupon:**
```json
{
  "code": "FLAT500",
  "type": "FIXED",
  "value": 500,
  "minOrderValue": 2000,
  "maxDiscount": null,
  "productIds": [],
  "categoryIds": ["{{categoryId}}"],
  "startAt": "2026-08-01T00:00:00.000Z",
  "endAt": "2026-12-31T23:59:59.000Z",
  "usageLimit": 50,
  "perUserLimit": 1,
  "status": "ACTIVE"
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Coupon created successfully",
  "data": {
    "_id": "<couponId>",
    "code": "WELCOME10",
    "sellerId": "<sellerProfileId>",
    "type": "PERCENTAGE",
    "value": 10,
    "minOrderValue": 500,
    "maxDiscount": 200,
    "usageLimit": 100,
    "perUserLimit": 3,
    "status": "ACTIVE"
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("couponId", res.data._id);
```

**Variables Saved:** `couponId`

**Rules:**
- Code is normalized to UPPERCASE
- Code must be unique across all sellers
- `type`: `PERCENTAGE` (value 1-100) or `FIXED`
- `endAt` must be after `startAt`
- `productIds` and `categoryIds` are optional restrictions

**Failure Cases:**
| Test | Expected |
|---|---|
| Duplicate code | `409` |
| Percentage > 100 | `400` |
| endAt before startAt | `400` |
| Invalid code chars | `400` |

---

### 14.2 List My Coupons

```
GET /api/v1/coupons
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `status` | enum | `ACTIVE`, `INACTIVE` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

---

### 14.3 Get Coupon by ID

```
GET /api/v1/coupons/{{couponId}}
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

---

### 14.4 Update Coupon

```
PATCH /api/v1/coupons/{{couponId}}
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "value": 15,
  "usageLimit": 200
}
```

> **Note:** The `code` field is immutable — customers type it in.

---

### 14.5 Deactivate Coupon

```
DELETE /api/v1/coupons/{{couponId}}
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

---

## 15. Phase 11 — Reviews

### 15.1 Create Review

```
POST /api/v1/reviews
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "productId": "{{productId}}",
  "rating": 5,
  "comment": "Excellent product! Fast delivery."
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Review submitted successfully",
  "data": {
    "_id": "<reviewId>",
    "userId": "<buyerUserId>",
    "productId": "<productId>",
    "rating": 5,
    "comment": "Excellent product! Fast delivery."
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("reviewId", res.data._id);
```

**Variables Saved:** `reviewId`

**Rules:**
- Only users who received a DELIVERED order containing the product can review
- One review per user per product
- Rating: integer 1-5
- Comment is optional

**Failure Cases:**
| Test | Expected |
|---|---|
| Duplicate review | `409` |
| Rating < 1 or > 5 | `400` |
| No delivered order | `403` |

---

### 15.2 List Product Reviews (Public)

```
GET /api/v1/reviews/product/{{productId}}
```

**No auth required.**

**Query Parameters:**
| Parameter | Type | Default |
|---|---|---|
| `page` | integer | `1` |
| `limit` | integer | `20` |

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Reviews fetched successfully",
  "data": {
    "reviews": [...],
    "averageRating": 5,
    "totalReviews": 1,
    "pagination": { "page": 1, "limit": 20, "total": 1 }
  }
}
```

---

### 15.3 Update Review

```
PATCH /api/v1/reviews/{{reviewId}}
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "rating": 4,
  "comment": "Updated: Good product but delivery took long."
}
```

---

### 15.4 Delete Review

```
DELETE /api/v1/reviews/{{reviewId}}
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

---

## 16. Phase 12 — Returns

### 16.1 Request Return

```
POST /api/v1/returns
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "orderId": "{{orderId}}",
  "reason": "Product received is damaged and not working properly."
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Return request submitted",
  "data": {
    "_id": "<returnId>",
    "orderId": "<orderId>",
    "buyerId": "<buyerUserId>",
    "reason": "Product received is damaged and not working properly.",
    "status": "PENDING",
    "createdAt": "2026-08-19T..."
  }
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
pm.environment.set("returnId", res.data._id);
```

**Variables Saved:** `returnId`

**Rules:**
- Order must be `DELIVERED`
- Return must be within 7 days of delivery
- Only the buyer who owns the order can request
- One active return per order at a time

**Failure Cases:**
| Test | Expected |
|---|---|
| Order not delivered | `400` |
| Return window expired | `400` |
| Duplicate active return | `409` |
| Another buyer's order | `403` |

---

### 16.2 List My Returns

```
GET /api/v1/returns
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `status` | enum | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

---

### 16.3 Get Return by ID

```
GET /api/v1/returns/{{returnId}}
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

---

### 16.4 Approve Return (Seller)

```
PATCH /api/v1/returns/{{returnId}}/status
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "status": "APPROVED"
}
```

**Expected Response:** `200 OK`

---

### 16.5 Complete Return (Seller — stock restored)

```
PATCH /api/v1/returns/{{returnId}}/status
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "status": "COMPLETED"
}
```

---

### 16.6 Cancel Return (Buyer)

```
POST /api/v1/returns/{{returnId}}/cancel
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

> Only works when status is `PENDING`.

---

### 16.7 Reject Return (Seller — requires reason)

```
PATCH /api/v1/returns/{{returnId}}/status
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "status": "REJECTED",
  "reason": "Item is not eligible for return as it was used."
}
```

> **Note:** `reason` is required when rejecting.

---

## 17. Phase 13 — Notifications

### 17.1 List Notifications

```
GET /api/v1/notifications
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `unread` | string | `true` or `false` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Notifications fetched successfully",
  "data": {
    "notifications": [
      {
        "_id": "<notificationId>",
        "type": "SELLER_APPROVED",
        "title": "Seller Approved",
        "message": "Your seller account has been approved.",
        "isRead": false,
        "createdAt": "2026-08-19T..."
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1 }
  }
}
```

---

### 17.2 Get Unread Count

```
GET /api/v1/notifications/unread-count
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Unread count fetched successfully",
  "data": { "unread": 1 }
}
```

---

### 17.3 Mark Notification Read

```
PATCH /api/v1/notifications/{{notificationId}}/read
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

---

### 17.4 Mark All Read

```
PATCH /api/v1/notifications/read-all
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "All notifications marked as read",
  "data": { "marked": 5 }
}
```

---

### 17.5 Get Preferences

```
GET /api/v1/notifications/preferences
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Preferences fetched successfully",
  "data": {
    "emailOrderUpdates": true,
    "emailPaymentUpdates": true,
    "emailPromotional": true,
    "inApp": true
  }
}
```

---

### 17.6 Update Preferences

```
PATCH /api/v1/notifications/preferences
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "emailPromotional": false,
  "inApp": true
}
```

---

## 18. Phase 14 — Analytics & Dashboard

> All analytics endpoints require `SELLER` role and are mounted under `/api/v1/sellers/`.

### 18.1 Dashboard

```
GET /api/v1/sellers/dashboard
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Dashboard fetched successfully",
  "data": {
    "totalOrders": 10,
    "pendingOrders": 2,
    "confirmedOrders": 3,
    "shippedOrders": 3,
    "deliveredOrders": 2,
    "cancelledOrders": 0,
    "totalRevenue": 15000,
    "activeProducts": 5,
    "lowStockProducts": 1,
    "pendingReturns": 1
  }
}
```

---

### 18.2 Sales Over Time

```
GET /api/v1/sellers/analytics/sales
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `from` | ISO 8601 | `2026-01-01T00:00:00.000Z` |
| `to` | ISO 8601 | `2026-12-31T23:59:59.000Z` |
| `groupBy` | enum | `day` or `month` |

---

### 18.3 Top Products

```
GET /api/v1/sellers/analytics/top-products?limit=10
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

---

### 18.4 Category Performance

```
GET /api/v1/sellers/analytics/categories
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

---

### 18.5 Customers

```
GET /api/v1/sellers/customers
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `search` | string | `john` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

---

### 18.6 Revenue Statistics

```
GET /api/v1/sellers/revenue
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `from` | ISO 8601 | `2026-01-01T00:00:00.000Z` |
| `to` | ISO 8601 | `2026-12-31T23:59:59.000Z` |
| `groupBy` | enum | `day` or `month` |

---

## 19. Phase 15 — Settlements

### 19.1 Get My Settlement (Seller)

```
GET /api/v1/sellers/settlement
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `month` | string | `2026-08` (YYYY-MM) |

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Settlement fetched successfully",
  "data": null
}
```

> Returns `null` when no settlement exists for the period.

---

### 19.2 Generate Settlements (Admin)

```
POST /api/v1/admin/settlements/generate
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "month": "2026-08"
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "data": [
    {
      "_id": "<settlementId>",
      "sellerId": "<sellerProfileId>",
      "month": "2026-08",
      "totalRevenue": 15000,
      "commissionRate": 10,
      "platformCommission": 1500,
      "sellerPayable": 13500,
      "status": "PENDING"
    }
  ]
}
```

**Postman Test Script:**
```javascript
const res = pm.response.json();
if (Array.isArray(res.data) && res.data.length > 0) {
  pm.environment.set("settlementId", res.data[0]._id);
}
```

**Variables Saved:** `settlementId`

---

### 19.3 List Settlements (Admin)

```
GET /api/v1/admin/settlements
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `status` | enum | `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `CANCELLED` |
| `sellerId` | string | `<sellerProfileId>` |
| `month` | string | `2026-08` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

---

### 19.4 Get Settlement Details (Admin)

```
GET /api/v1/admin/settlements/{{settlementId}}
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

---

### 19.5 Process Settlement (Admin)

```
POST /api/v1/admin/settlements/{{settlementId}}/process
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

**Expected Response:** `200 OK`

> Moves `PENDING` → `PROCESSING`

---

### 19.6 Mark Settlement Paid

```
POST /api/v1/admin/settlements/{{settlementId}}/mark-paid
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

**Expected Response:** `200 OK`

> Moves `PROCESSING` → `PAID`, notifies seller.

---

### 19.7 Cancel Settlement

```
POST /api/v1/admin/settlements/{{settlementId}}/cancel
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

---

### 19.8 Fail Settlement

```
POST /api/v1/admin/settlements/{{settlementId}}/fail
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

---

### 19.9 Send Payout Reminder

```
POST /api/v1/admin/settlements/{{settlementId}}/remind
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

---

## 20. Phase 16 — Admin APIs

### 20.1 List Users

```
GET /api/v1/admin/users
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `role` | enum | `BUYER`, `SELLER`, `SUPER_ADMIN` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

---

### 20.2 Update User Status (Activate/Deactivate)

```
PATCH /api/v1/admin/users/{{buyerUserId}}
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "isActive": false
}
```

---

### 20.3 List Sellers

```
GET /api/v1/admin/sellers
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `status` | enum | `PENDING`, `APPROVED`, `REJECTED`, `PAUSED`, `SUSPENDED` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

---

### 20.4 List All Products (Admin)

```
GET /api/v1/admin/products
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `status` | enum | `DRAFT`, `ACTIVE`, `INACTIVE` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

---

### 20.5 Moderate Product (Admin)

```
PATCH /api/v1/admin/products/{{productId}}/status
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "status": "INACTIVE"
}
```

---

### 20.6 List All Orders (Admin)

```
GET /api/v1/admin/orders
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

**Query Parameters:**
| Parameter | Type | Example |
|---|---|---|
| `status` | enum | `PENDING`, `CONFIRMED`, `SHIPPED`, `DELIVERED`, `CANCELLED` |
| `page` | integer | `1` |
| `limit` | integer | `20` |

---

### 20.7 Broadcast Notification

```
POST /api/v1/admin/notifications
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```

**To specific users:**
```json
{
  "title": "System Maintenance",
  "message": "Scheduled maintenance on Sunday 2AM-4AM IST.",
  "channel": "BOTH",
  "recipientIds": ["<buyerUserId>", "<sellerUserId>"]
}
```

**To all sellers:**
```json
{
  "title": "New Feature Announcement",
  "message": "Discount system is now live!",
  "channel": "IN_APP",
  "audience": "SELLERS"
}
```

**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Notification broadcast sent",
  "data": { "deliveredTo": 2 }
}
```

---

### 20.8 Get Commission Settings

```
GET /api/v1/admin/settings/commission
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "data": { "rate": 10 }
}
```

---

### 20.9 Update Commission Settings

```
PATCH /api/v1/admin/settings/commission
```

**Headers:**
```
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```

**Body:**
```json
{
  "rate": 12.5
}
```

> Rate is a percentage (0-100). Affects only future settlements.

---

## 21. Phase 17 — Cloudinary File Uploads

This phase covers all file upload/delete functionality using Cloudinary.

**Prerequisites:**
- Cloudinary account with `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` configured in `.env`
- Use `sellerAccessToken` for seller operations and `buyerAccessToken` for avatar
- File uploads use `multipart/form-data` content type

---

### 21.1 Upload User Avatar

```
POST /api/v1/users/me/avatar
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
Content-Type: multipart/form-data
```

**Body (form-data):**
| Key | Type | Description |
|---|---|---|
| `image` | File | Avatar image (JPEG, PNG, WebP, GIF, max 5 MB) |

**How to configure in Postman:**
1. Select `POST` method
2. Set URL: `{{apiPrefix}}/users/me/avatar`
3. Go to **Body** tab → select `form-data`
4. Add key `image`, change type from Text to **File**, select an image file
5. Authorization: Bearer Token → `{{buyerAccessToken}}`

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Avatar uploaded successfully",
  "data": {
    "avatarUrl": "https://res.cloudinary.com/xxx/image/upload/v1234567890/avatars/avatar_userId_1234567890.jpg"
  }
}
```

**Save variables (in Tests tab):**
```javascript
const data = pm.response.json();
if (data.success && data.data?.avatarUrl) {
  pm.environment.set("avatarUrl", data.data.avatarUrl);
}
```

**Failure Cases:**
| Test | Expected |
|---|---|
| No file provided | `400` — `"No file provided"` |
| Invalid file type (e.g., .txt) | `400` — `"Only JPEG, PNG, WebP and GIF images are allowed"` |
| File exceeds 5 MB | `400` error |
| No auth token | `401` — `"Authentication required"` |

---

### 21.2 Delete User Avatar

```
DELETE /api/v1/users/me/avatar
```

**Headers:**
```
Authorization: Bearer {{buyerAccessToken}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Avatar deleted successfully",
  "data": null
}
```

**Failure Cases:**
| Test | Expected |
|---|---|
| No avatar to delete | `400` — `"No avatar to delete"` |
| No auth token | `401` |

---

### 21.3 Upload Seller Document

```
POST /api/v1/sellers/me/documents
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: multipart/form-data
```

**Body (form-data):**
| Key | Type | Description |
|---|---|---|
| `document` | File | Document file (JPEG, PNG, PDF, max 10 MB) |
| `documentType` | Text | Type of document (e.g., GST, PAN, BANK_STATEMENT) |

**How to configure in Postman:**
1. Select `POST` method
2. Set URL: `{{apiPrefix}}/sellers/me/documents`
3. Go to **Body** tab → select `form-data`
4. Add key `document`, change type from Text to **File**, select a document file
5. Add key `documentType`, keep type as **Text**, enter value like `GST`
6. Authorization: Bearer Token → `{{sellerAccessToken}}`

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "type": "GST",
    "url": "https://res.cloudinary.com/xxx/image/upload/v1234567890/seller-documents/doc_sellerId_GST_1234567890.jpg",
    "publicId": "seller-documents/doc_sellerId_GST_1234567890"
  }
}
```

**Save variables (in Tests tab):**
```javascript
const data = pm.response.json();
if (data.success && data.data?.publicId) {
  pm.environment.set("documentPublicId", data.data.publicId);
}
```

**Failure Cases:**
| Test | Expected |
|---|---|
| No file provided | `400` — `"No file provided"` |
| Missing documentType | `400` — `"Document type is required"` |
| Invalid file type (e.g., .docx) | `400` — `"Only JPEG, PNG and PDF documents are allowed"` |
| File exceeds 10 MB | `400` error |
| No auth token | `401` |
| Not a seller | `403` |

---

### 21.4 Delete Seller Document

```
DELETE /api/v1/sellers/me/documents/:documentId
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**URL Parameters:**
| Parameter | Description |
|---|---|
| `documentId` | Cloudinary publicId of the document (from upload response) |

**Example URL:**
```
{{apiPrefix}}/sellers/me/documents/{{documentPublicId}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Document deleted successfully",
  "data": null
}
```

**Failure Cases:**
| Test | Expected |
|---|---|
| Document not found | `404` — `"Document not found"` |
| No auth token | `401` |
| Not the document owner | `404` |

---

### 21.5 Upload Product Images

```
POST /api/v1/products/:id/images  
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
Content-Type: multipart/form-data
```

**URL Parameters:**
| Parameter | Description |
|---|---|
| `id` | Product ObjectId |

**Body (form-data):**
| Key | Type | Description |
|---|---|---|
| `images` | File (multiple) | Product images (JPEG, PNG, WebP, GIF, max 5 MB each, up to 8 files) |

**How to configure in Postman:**
1. Select `POST` method
2. Set URL: `{{apiPrefix}}/products/{{productId}}/images`
3. Go to **Body** tab → select `form-data`
4. Add key `images`, change type from Text to **File**, select image files
5. To upload multiple: add multiple rows with key `images` and type File
6. Authorization: Bearer Token → `{{sellerAccessToken}}`

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Product images uploaded successfully",
  "data": [
    {
      "url": "https://res.cloudinary.com/xxx/image/upload/v123/products/product_productId_abc123.jpg",
      "publicId": "products/product_productId_abc123"
    },
    {
      "url": "https://res.cloudinary.com/xxx/image/upload/v123/products/product_productId_def456.jpg",
      "publicId": "products/product_productId_def456"
    }
  ]
}
```

**Save variables (in Tests tab):**
```javascript
const data = pm.response.json();
if (data.success && data.data?.length > 0) {
  pm.environment.set("imagePublicId", data.data[0].publicId);
  pm.environment.set("imageUrl", data.data[0].url);
}
```

**Failure Cases:**
| Test | Expected |
|---|---|
| No files provided | `400` — `"No files provided"` |
| Invalid file type | `400` — `"Only JPEG, PNG, WebP and GIF images are allowed"` |
| File exceeds 5 MB | `400` error |
| More than 8 images total | `400` — `"A product can have at most 8 images"` |
| Product not found | `404` — `"Product not found"` |
| Not the product owner | `404` — `"Product not found"` |
| No auth token | `401` |
| Not a seller | `403` |

---

### 21.6 Delete Product Image

```
DELETE /api/v1/products/:id/images/:imageId
```

**Headers:**
```
Authorization: Bearer {{sellerAccessToken}}
```

**URL Parameters:**
| Parameter | Description |
|---|---|
| `id` | Product ObjectId |
| `imageId` | Cloudinary publicId of the image (from upload response) |

**Example URL:**
```
{{apiPrefix}}/products/{{productId}}/images/{{imagePublicId}}
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "Product image deleted successfully",
  "data": null
}
```

**Failure Cases:**
| Test | Expected |
|---|---|
| Image not found | `404` — `"Image not found on this product"` |
| Product not found | `404` — `"Product not found"` |
| Not the product owner | `404` — `"Product not found"` |
| No auth token | `401` |
| Not a seller | `403` |

---

## 22. Phase 18 — System

### 21.1 Health Check

```
GET /api/v1/health
```

**No auth required.**

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "API is healthy",
  "data": {
    "status": "UP",
    "timestamp": "2026-08-19T12:00:00.000Z"
  }
}
```

### 21.2 Root

```
GET /
```

**Expected Response:** `200 OK`
```json
{
  "success": true,
  "message": "E-commerce Marketplace API"
}
```

### 21.3 Swagger UI

```
GET /api-docs
```

Opens Swagger UI in browser.

---

## 22. Failure & Edge-Case Testing

### Authentication Failures

| Test | Method | Endpoint | Body/Headers | Expected |
|---|---|---|---|---|
| No token | GET | `/users/me` | None | `401` |
| Expired token | GET | `/users/me` | Expired JWT | `401` |
| Invalid token | GET | `/users/me` | `Bearer invalid` | `401` |
| Tampered token | GET | `/users/me` | Modified JWT | `401` |

### Authorization Failures

| Test | Method | Endpoint | Role | Expected |
|---|---|---|---|---|
| Buyer → seller route | GET | `/sellers/me` | BUYER | `403` |
| Seller → admin route | GET | `/admin/users` | SELLER | `403` |
| Buyer → create product | POST | `/products` | BUYER | `403` |
| Seller → create category | POST | `/categories` | SELLER | `403` |

### Validation Failures

| Test | Method | Endpoint | Issue | Expected |
|---|---|---|---|---|
| Invalid ObjectId | GET | `/products/invalid` | Bad ID format | `400` |
| Missing required field | POST | `/products` | No name | `400` |
| Extra fields | POST | `/products` | Unknown field | `400` (strict) |
| Negative price | POST | `/products` | `price: -1` | `400` |
| Duplicate entry | POST | `/sellers/register` | Same GSTIN | `409` |

### Not Found

| Test | Method | Endpoint | Expected |
|---|---|---|---|
| Non-existent product | GET | `/products/000000000000000000000000` | `404` |
| Non-existent order | GET | `/orders/000000000000000000000000` | `404` |
| Unknown route | GET | `/nonexistent` | `404` |

### Rate Limiting

Auth endpoints (`/auth/login`, `/auth/register`, `/auth/forgot-password`) are rate-limited:
- **20 requests per 15 minutes** per IP
- Response: `429` — `"Too many attempts, please try again later"`

API endpoints are rate-limited:
- **300 requests per 15 minutes** per IP
- Response: `429` — `"Too many requests, please try again later"`

> **Tip:** Restart the dev server to reset rate limits during testing.

---

## 23. Database Verification

After each major operation, verify the database state:

### Check User Created
```javascript
// MongoDB shell
db.users.findOne({ email: "buyer.test@example.com" })
```
Verify: `role: "BUYER"`, `isActive: true`, password is hashed (not plaintext)

### Check Seller Profile
```javascript
db.sellers.findOne({ userId: ObjectId("<sellerUserId>") })
```
Verify: `status: "APPROVED"`, GSTIN/PAN stored, bank details present

### Check Product
```javascript
db.products.findOne({ _id: ObjectId("<productId>") })
```
Verify: `sellerId`, `price`, `stock`, `status`, `category` reference

### Check Order
```javascript
db.orders.findOne({ _id: ObjectId("<orderId>") })
```
Verify: `buyerId`, `sellerId`, `items[].price` matches product price (not client-supplied), `status`, `paymentStatus`

### Check Cart Cleared
```javascript
db.carts.findOne({ userId: ObjectId("<buyerUserId>") })
```
Verify: After checkout, `items: []`

### Check Stock Decremented
```javascript
db.products.findOne({ _id: ObjectId("<productId>") })
```
Verify: `stock` decreased by order quantity

### Check Discount Applied
```javascript
db.discounts.findOne({ _id: ObjectId("<discountId>") })
```
Verify: `discountValue`, `startAt`, `endAt`, `status`, `sellerId` ownership

### Check Coupon Usage
```javascript
db.couponusages.findOne({ couponId: ObjectId("<couponId>"), userId: ObjectId("<buyerUserId>") })
```
Verify: Only one usage record per user per coupon

### Check Notification
```javascript
db.notifications.find({ recipientId: ObjectId("<sellerUserId>") }).sort({ createdAt: -1 })
```
Verify: `type`, `title`, `message`, `isRead: false`

### Check Audit Log
```javascript
db.auditlogs.find().sort({ createdAt: -1 }).limit(5)
```
Verify: `actorId`, `actorRole`, `action`, `entityType`, `entityId`

---

## 24. Troubleshooting

### Common Errors

| Error | Cause | Fix |
|---|---|---|
| `429 Too many requests` | Rate limit hit | Restart dev server (`Ctrl+C` then `npm run dev`) |
| `401 Invalid credentials` | Wrong password/email | Verify the user exists and password is correct |
| `401 Two-factor authentication required` | 2FA enabled | Use `/auth/2fa/verify` with loginToken and TOTP code |
| `403 Requires SELLER role` | Wrong role token | Login as seller and use sellerAccessToken |
| `404 Seller profile not found` | Seller not approved | Admin must approve seller first |
| `400 Cart is empty` | No items in cart | Add items to cart before checkout |
| `400 Stock insufficient` | Quantity exceeds stock | Reduce quantity or increase stock |
| `403 Not your order` | Wrong user accessing order | Use the correct user's token |
| `409 Review already exists` | Duplicate review per product | Delete existing review first |
| `400 Return request already in progress` | Active return exists | Complete/cancel existing return first |
| `E11000 duplicate key` | Duplicate unique field | Use unique test data per run |

### Server Not Starting

```bash
# Check if port is already in use
netstat -ano | grep ':5000'

# Kill the process
taskkill /PID <pid> /F

# Restart
npm run dev
```

### Tests Failing

```bash
# Run tests with fresh server
PORT=5000 npx vitest run

# Run a specific test
PORT=5000 npx vitest run tests/orders.test.ts

# Run single test by name
PORT=5000 npx vitest run -t "test name"
```

### Typecheck

```bash
npm run typecheck
```

### Build

```bash
npm run build
```

---

## Complete Sequential Testing Workflow

Follow this exact order from an empty database:

```
 1. POST /api/v1/health                          (verify server running)
 2. POST /api/v1/auth/register                    (buyer → buyerUserId)
 3. POST /api/v1/auth/register                    (seller → sellerUserId)
 4. POST /api/v1/auth/register                    (admin → adminUserId, set role to SUPER_ADMIN)
 5. POST /api/v1/auth/login                       (buyer → buyerAccessToken)
 6. POST /api/v1/auth/login                       (seller → sellerAccessToken)
 7. POST /api/v1/auth/login                       (admin → adminAccessToken)
 8. POST /api/v1/auth/refresh                     (verify refresh token rotation)
 9. GET  /api/v1/users/me                         (verify buyer profile)
10. PATCH /api/v1/users/me                        (update buyer name/avatar)
11. POST /api/v1/users/me/addresses               (create address → addressId)
12. GET  /api/v1/users/me/addresses               (verify address created)
13. GET  /api/v1/admin/sellers?status=PENDING     (find pending seller → sellerProfileId)
14. PATCH /api/v1/admin/sellers/:id/status        (approve seller)
15. POST /api/v1/auth/login                       (seller re-login after approval)
16. POST /api/v1/categories                        (admin creates category → categoryId)
17. GET  /api/v1/categories                        (public list — verify)
18. GET  /api/v1/sellers/me                       (seller profile)
19. PATCH /api/v1/sellers/me                      (update seller profile)
20. POST /api/v1/products                         (seller creates product → productId)
21. GET  /api/v1/products/my                      (seller lists own products)
22. GET  /api/v1/products/:id                     (public — verify ACTIVE product)
23. PATCH /api/v1/products/:id                    (seller updates product)
24. GET  /api/v1/products?search=mouse            (public search)
25. POST /api/v1/cart/items                       (buyer adds to cart)
26. GET  /api/v1/cart                             (verify cart)
27. PATCH /api/v1/cart/items/:productId           (update quantity)
28. POST /api/v1/orders                           (checkout → orderId)
29. GET  /api/v1/orders                           (buyer lists orders)
30. GET  /api/v1/orders/:id                       (get order detail)
31. PATCH /api/v1/orders/:id/status               (seller: PENDING → CONFIRMED)
32. PATCH /api/v1/orders/:id/status               (seller: CONFIRMED → SHIPPED)
33. PATCH /api/v1/orders/:id/status               (seller: SHIPPED → DELIVERED)
34. POST /api/v1/orders/:id/pay                   (seller: mark COD paid)
35. POST /api/v1/discounts                        (seller creates discount → discountId)
36. GET  /api/v1/discounts                        (seller lists discounts)
37. POST /api/v1/coupons                          (seller creates coupon → couponId)
38. GET  /api/v1/coupons                          (seller lists coupons)
39. POST /api/v1/reviews                          (buyer reviews product → reviewId)
40. GET  /api/v1/reviews/product/:productId       (public — list reviews)
41. POST /api/v1/returns                          (buyer requests return → returnId)
42. GET  /api/v1/returns                          (buyer lists returns)
43. PATCH /api/v1/returns/:id/status              (seller: APPROVE return)
44. PATCH /api/v1/returns/:id/status              (seller: COMPLETE return)
45. GET  /api/v1/notifications                    (seller lists notifications)
46. GET  /api/v1/notifications/unread-count       (count unread)
47. PATCH /api/v1/notifications/read-all          (mark all read)
48. GET  /api/v1/notifications/preferences        (get prefs)
49. PATCH /api/v1/notifications/preferences       (update prefs)
50. GET  /api/v1/sellers/dashboard                (seller dashboard)
51. GET  /api/v1/sellers/analytics/sales          (sales analytics)
52. GET  /api/v1/sellers/analytics/top-products   (top products)
53. GET  /api/v1/sellers/analytics/categories     (category perf)
54. GET  /api/v1/sellers/customers                (customer list)
55. GET  /api/v1/sellers/revenue                  (revenue stats)
56. GET  /api/v1/admin/users                      (admin: list users)
57. GET  /api/v1/admin/sellers                    (admin: list sellers)
58. GET  /api/v1/admin/products                   (admin: list all products)
59. GET  /api/v1/admin/orders                     (admin: list all orders)
60. POST /api/v1/admin/notifications              (admin: broadcast notification)
61. GET  /api/v1/admin/settings/commission        (get commission rate)
62. PATCH /api/v1/admin/settings/commission       (update commission rate)
63. POST /api/v1/admin/settlements/generate       (admin: generate settlements)
64. GET  /api/v1/admin/settlements                (admin: list settlements)
65. POST /api/v1/admin/settlements/:id/process    (admin: process settlement)
66. POST /api/v1/admin/settlements/:id/mark-paid  (admin: mark paid)
67. GET  /api/v1/sellers/settlement               (seller: get my settlement)
68. POST /api/v1/auth/forgot-password             (request reset)
69. POST /api/v1/auth/logout                      (logout)
70. GET  /api/v1/health                           (final health check)
```

### New Features Added (Latest Update)

#### Wishlist
```
71. POST /api/v1/wishlist/items                    (buyer adds product to wishlist)
72. GET  /api/v1/wishlist                         (buyer lists wishlist)
73. GET  /api/v1/wishlist/items/:productId        (check if product in wishlist)
74. DELETE /api/v1/wishlist/items/:productId      (remove from wishlist)
75. DELETE /api/v1/wishlist                       (clear wishlist)
```

#### Inventory
```
76. GET  /api/v1/inventory                        (seller lists inventory transactions)
77. GET  /api/v1/inventory/product/:productId    (product inventory history)
78. POST /api/v1/inventory/product/:productId/adjust  (adjust stock)
```

#### Order Invoice & Tracking
```
79. GET  /api/v1/orders/:id/invoice               (get order invoice)
80. GET  /api/v1/orders/:id/tracking             (get order tracking timeline)
```

#### Product SKU & Specifications
```
81. POST /api/v1/products (with sku & specifications fields)
82. PATCH /api/v1/products (update sku & specifications)
```

#### 2FA for Sellers
```
83. POST /api/v1/auth/2fa/setup                   (start 2FA setup)
84. POST /api/v1/auth/2fa/enable                  (enable 2FA)
85. POST /api/v1/auth/2fa/verify                  (verify 2FA login)
86. POST /api/v1/auth/2fa/disable                 (disable 2FA)
87. POST /api/v1/auth/2fa/recovery-codes          (regenerate recovery codes)
```
