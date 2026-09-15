# Stitch AI Redesign Prompt — NexCart Multi-Vendor Marketplace

## Project Overview
**NexCart** is a full-featured multi-vendor ecommerce marketplace (India-focused) with three user roles: Buyers, Sellers, and Super Admins. The frontend is React 18 + TypeScript + Vite + Tailwind CSS 4, using TanStack Query for server state and Zustand for auth. **No code changes needed** — this is a visual/UX redesign preserving all existing functionality.

---

## Current Design System (Must Preserve These Tokens)

### Colors (CSS Variables in `src/index.css`)
```css
--primary: #b83e20;           /* Warm Terracotta — single brand accent */
--primary-hover: #9c3217;
--primary-active: #822810;
--primary-subtle: #fcf5f2;
--primary-fg: #ffffff;

--bg: #faf9f6;                /* Warm off-white page background */
--bg-card: #ffffff;
--fg: #191816;                /* Near-black ink for text */
--fg-secondary: #55534e;
--muted: #78756f;

--border: #e5e3dc;
--border-subtle: #eeedea;
--border-strong: #cdc9be;

--surface-warm: #faf5ec;      /* Warm cream for panels/hero */
--surface-warm-deep: #f5ecdc;
--surface-tint: #fdf1e6;      /* Subtle warm-orange highlight band */

--success: #15803d; --success-bg: #f0fdf4;
--warning: #b45309; --warning-bg: #fffbeb;
--destructive: #b91c1c; --destructive-fg: #ffffff;
--info: #1d4ed8; --info-bg: #eff6ff;

--shadow-sm: 0 1px 2px rgba(25,24,22,0.04);
--shadow-md: 0 4px 12px rgba(25,24,22,0.06);
--shadow-lg: 0 12px 32px rgba(25,24,22,0.09);

--radius-sm: 4px;   /* badges, chips */
--radius: 6px;      /* buttons, inputs, controls */
--radius-lg: 10px;  /* cards, modals, panels */
--radius-xl: 14px;
```

### Typography
- **Font**: 'Plus Jakarta Sans', 'Inter', system fallbacks
- **Weights**: 400 (regular), 500 (medium), 600 (semibold), 700 (bold), 900 (black for logo)
- **Scale**: Text-sm (0.875rem) base, tight leading, negative letter-spacing on headings

### Component Patterns (Already in Codebase)
- `.card` — white card, 1px border, radius-lg, shadow-sm
- `.product-card` — hover: border-strong, shadow-md, translateY(-1px)
- `.btn-primary/.btn-secondary/.btn-ghost/.btn-danger` — 6px radius, 0.15s transitions, active:scale(0.99)
- `.input-field` — 1px border, primary focus ring (1px solid + 1px box-shadow)
- `.badge` — rectangular (radius-sm), no rounded-full pills
- `.section-heading` — 1.25rem, 600 weight, -0.02em tracking
- `.container-app` — max-w-5xl (80rem), responsive padding

---

## Pages to Redesign (Priority Order)

### 1. **Homepage** (`HomePage.tsx`) — Public Landing
**Current**: Announcement bar → Hero (2-col: copy + live product showcase) → Categories (8 cards) → New Arrivals (grid) → Best Deals (carousel) → Trust markers → Seller CTA → Footer
**Redesign Goals**:
- **Hero**: More visual breathing room; larger product showcase with parallax/depth; trust badges integrated more naturally
- **Categories**: Elevate from simple cards to "shop the look" style with lifestyle imagery placeholders; staggered entrance
- **Product Grids/Carousels**: Consistent card height; better image-to-text ratio; skeleton states that match final layout
- **Trust Section**: Convert to interactive cards with subtle hover lift
- **Seller CTA**: Warmer panel, clearer value prop, single primary action
- **Announcement Bar**: Subtler, dismissible, slides up on scroll

### 2. **Header** (`Header.tsx`) — Global Navigation
**Current**: Sticky, announcement bar, logo, search (desktop), nav links (Shop, Cart, Notifications), user avatar dropdown, mobile drawer
**Redesign Goals**:
- **Search**: Expandable on focus (desktop), full-width on mobile; show recent searches & trending categories in dropdown
- **Cart/Notifications**: Badge with subtle pulse on update; dropdown preview (mini-cart, notification list) on hover/click
- **User Menu**: Grouped sections with icons; seller/admin badges more prominent; keyboard navigable
- **Mobile**: Bottom sheet instead of full-screen drawer; sticky search at top
- **Scroll Behavior**: Header shrinks/elevates on scroll down, reveals on scroll up

### 3. **Product List Page** (`ProductListPage.tsx`) — Catalog Browse
**Current**: Top bar (title, sort, filter toggle) → Sidebar filters (categories, price) → Infinite-scroll grid (2/3 cols) → Load more sentinel
**Redesign Goals**:
- **Filters**: Collapsible accordion sections; active filter chips above grid with clear-all; price range slider (dual-handle)
- **Grid**: Masonry option for mixed aspect ratios; quick-view on hover (desktop); "Add to cart" inline on card hover
- **Empty/Loading**: Illustrated empty states per filter context; skeleton matches final card proportions
- **URL Sync**: All filters in URL (already works) — keep, enhance with shareable filter links

### 4. **Product Detail Page** (`ProductDetailPage.tsx`) — Purchase Decision
**Current**: Gallery (main + thumbnails) → Info (title, price, rating, stock, specs) → Quantity + Add to Cart/Wishlist → Reviews (paginated, write/edit/delete)
**Redesign Goals**:
- **Gallery**: Full-screen zoom modal (pinch/zoom on mobile); swipe gestures; video support placeholder
- **Price Block**: Sticky on scroll (mobile); clear discount hierarchy (seller discount > coupon > MRP)
- **Add to Cart**: Sticky bottom bar on mobile; haptic feedback on press
- **Reviews**: Expandable cards; photo reviews grid; helpful votes; seller response badge
- **Specs**: Accordion table; copy-to-clipboard for SKU
- **Trust Signals**: "Verified seller", "Ships in 24h", "7-day returns" as inline badges near price

### 5. **Cart Page** (`CartPage.tsx`) — Review & Edit
**Current**: Item list (image, name, price, qty stepper, remove) → Order summary (subtotal, shipping, total) → Checkout CTA
**Redesign Goals**:
- **Item Cards**: Swipe-to-remove (mobile); inline stock warning; "Save for later" section
- **Summary**: Expandable line items; coupon applied badge with remove; estimated delivery date
- **Empty State**: Personalized recommendations based on cart history
- **Progress Indicator**: Cart → Checkout → Payment → Confirmation steps

### 6. **Checkout Page** (`CheckoutPage.tsx`) — Conversion Critical
**Current**: 2-col: Address selector + Add new (dialog) → Payment method (COD/Online radio cards) → Coupon input → Sticky order summary
**Redesign Goals**:
- **Single Column Mobile**: Collapsible sections with progress; save address as default checkbox
- **Address Form**: Inline validation with clear error messages; auto-detect city/state from PIN (API exists)
- **Payment**: Visual cards with icons; Razorpay badge with security icons; COD availability check per PIN
- **Coupon**: Real-time preview (already works) — animate discount application
- **Order Summary**: Sticky on mobile; line-item discounts shown per product; tax breakdown on expand

### 7. **Account / Orders / Returns** (`AccountPage.tsx`, `OrderListPage.tsx`, `OrderDetailPage.tsx`, `ReturnListPage.tsx`, `ReturnDetailPage.tsx`)
**Current**: Profile card (avatar, name, email) → Addresses list (add/edit/delete dialog) → Orders list (status badges, actions) → Order detail (timeline, items, invoice) → Returns (request dialog, status tracking)
**Redesign Goals**:
- **Profile**: Avatar upload with cropper; 2FA status banner; account health score
- **Orders**: Tabbed by status (All/Active/Past); timeline with real-time tracking link; reorder button
- **Returns**: Visual stepper (Requested → Approved → Picked up → Refunded); reason tags; image upload for damage
- **Empty States**: Actionable — "Track order", "Shop again", "Contact support"

### 8. **Seller Dashboard & Pages** (`SellerDashboardPage.tsx`, `SellerProductsPage.tsx`, `SellerOrdersPage.tsx`, etc.)
**Current**: Stat cards (8 metrics) → Tabbed pages with tables/forms → Product manager (2-step dialog: details → images)
**Redesign Goals**:
- **Dashboard**: KPI cards with sparkline trends (7d/30d); quick actions (Add product, View orders); revenue chart (lightweight SVG/Canvas)
- **Products Table**: Inline edit for price/stock/status; bulk actions (activate, deactivate, export); image column with hover zoom
- **Orders**: Kanban-style status columns (Pending → Packed → Shipped → Delivered); print invoice; bulk status update
- **Analytics**: Visual charts (Revenue, Orders, Conversion, Top products); date range picker; export CSV
- **Dialogs**: Stepper with progress; validation summary before submit; drag-drop image reorder

### 9. **Admin Dashboard & Pages** (`AdminDashboardPage.tsx`, `AdminUsersPage.tsx`, `AdminCategoriesPage.tsx`, etc.)
**Current**: Stat cards → Tables with search/pagination → Category management (table + dialog) → Audit log (MUI themed)
**Redesign Goals**:
- **Dashboard**: Platform health metrics (GMV, Active sellers, Conversion, Refund rate); alerts panel
- **Tables**: Column visibility toggle; density control (comfortable/condensed); advanced filters drawer
- **Category Manager**: Drag-drop tree reorder; icon picker; SEO fields preview
- **Audit Log**: Keep MUI theme but align colors/spacing; virtualized list for performance

### 10. **Footer** (`Footer.tsx`) — Site Map & Trust
**Current**: 6-column grid (Brand, Shop, Account, Sellers, Support, Legal) → Policy modals → Bottom bar (copyright, policy shortcuts)
**Redesign Goals**:
- **Layout**: Responsive stack; brand column full-width on mobile with newsletter signup
- **Links**: Hover underline animation; grouped with subtle dividers
- **Newsletter**: Inline email capture with honeypot; success toast
- **Social/Trust**: Payment method icons; app store badges; security certifications

---

## Cross-Cutting UX Improvements

### Micro-Interactions (Respect `prefers-reduced-motion`)
| Element | Interaction |
|---------|-------------|
| Buttons | Press: scale(0.98), ripple on primary |
| Cards | Hover: translateY(-2px), shadow-lg, border-primary/20 |
| Inputs | Focus: ring-2 ring-primary/30, label lifts |
| Tabs | Sliding indicator, 200ms ease-out |
| Toasts | Slide from bottom-right, stack with gap |
| Skeletons | Shimmer left→right, match content shape |
| Dropdowns | Scale from trigger origin, fade |
| Carousel | Drag/swipe with momentum, snap |

### Elevation System (Extend Existing Shadows)
```
Level 0: none (flat panels)
Level 1: shadow-sm  (cards, inputs)
Level 2: shadow-md  (hover cards, dropdowns)
Level 3: shadow-lg  (modals, sticky headers, bottom sheets)
Level 4: shadow-lg + ring-1 ring-primary/20 (focused modals)
```

### Motion Tokens
```
--duration-fast: 100ms;
--duration-base: 200ms;
--duration-slow: 350ms;
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

### Responsive Breakpoints (Tailwind Defaults + Custom)
```
sm: 640px   (mobile landscape / small tablet)
md: 768px   (tablet)
lg: 1024px  (desktop)
xl: 1280px  (wide desktop)
2xl: 1536px (ultrawide)
```

---

## Specific Component Redesign Specs

### Product Card (Used Everywhere)
```
Current: 1:1 image, fixed height, wishlist bottom
New:
- Aspect ratio toggle: 1:1 (default) | 4:5 (mobile) | 16:10 (featured)
- Image: object-cover, lazy, blur-up placeholder (LQIP)
- Badges: Top-left stack (discount %, "New", "Bestseller", "Low stock")
- Wishlist: Top-right, icon-only, filled state animated
- Quick actions on hover (desktop): Add to cart, Compare, Quick view
- Price: Primary price large, strikethrough smaller, discount badge inline
- Rating: Stars + count, compact
- Seller name: Small, secondary, link to seller profile
- Skeleton: Exact same dimensions, shimmer
```

### Button Variants (Extend Existing)
```
Primary:      Terracotta fill, white text, shadow-sm → hover: shadow-md
Secondary:    White fill, terracotta border/text → hover: terracotta fill
Ghost:        Transparent, ink text → hover: warm cream bg
Outline:      White, border, ink text → hover: warm cream bg
Destructive:  Red fill → hover: darker red
Link:         Underline on hover, terracotta text
Icon-only:    40x40 touch target, round, bg on hover
```

### Form Inputs
```
- Floating label (CSS :placeholder-shown + :focus)
- Helper text below, error state: border-destructive, icon + message
- Prefix/suffix slots (currency, search icon, toggle password)
- Character counter for textarea
- Auto-resize textarea
```

### Data Tables (Seller/Admin)
```
- Sticky header, horizontal scroll on mobile
- Row hover: warm cream bg
- Selected row: primary-subtle bg, primary left border
- Inline actions: icon buttons, tooltip on hover
- Bulk actions bar: sticky bottom on mobile
- Empty state: illustration + action button
```

### Modals / Dialogs
```
- Backdrop: bg-black/30, backdrop-blur-sm
- Panel: radius-xl, shadow-lg, max-h-[85vh], overflow-auto
- Header: sticky, border-b, title + close
- Footer: sticky, border-t, actions right-aligned
- Focus trap, ESC to close, click backdrop to close
- Enter key submits primary action
```

---

## Accessibility (Must Maintain/Improve)
- **WCAG AA**: Contrast ratios (text 4.5:1, UI 3:1), focus visible
- **Keyboard**: All interactive elements reachable, logical tab order
- **ARIA**: Live regions for toasts/cart updates, labels for icon buttons
- **Reduced Motion**: Disable non-essential animations
- **Screen Readers**: Semantic HTML, heading hierarchy, landmark regions

---

## Performance Considerations
- **Images**: WebP/AVIF, responsive srcset, lazy loading, LQIP
- **Fonts**: Preload Plus Jakarta Sans, font-display: swap
- **CSS**: Critical CSS inlined, rest async
- **JS**: Code-split by route (already lazy), tree-shaken
- **Third-party**: Razorpay script lazy-loaded on checkout only

---

## What NOT to Change
- ✅ All API contracts, query keys, mutation signatures
- ✅ Routing structure, role-based guards, ProtectedRoute logic
- ✅ State management (Zustand, TanStack Query patterns)
- ✅ Form validation schemas (Zod)
- ✅ Business logic in hooks/services
- ✅ TypeScript types (`@/types/api`)
- ✅ Backend integration points

---

## Deliverables for Stitch AI
1. **Design Tokens File** — Extended Tailwind config with new motion/elevation tokens
2. **Component Library** — Updated Button, Card, Input, Badge, Modal, Table, ProductCard, Header, Footer
3. **Page Templates** — Home, ProductList, ProductDetail, Cart, Checkout, Account, SellerDashboard, AdminDashboard
4. **Responsive Specs** — Mobile-first, breakpoint-specific layouts
5. **Interaction Specs** — Framer Motion / CSS transitions for each micro-interaction
6. **Dark Mode** — Optional: full dark theme mapping (extend CSS variables)

---

## Visual Reference Style
**Think**: Linear, Stripe, Notion, Vercel — clean, intentional, premium but not flashy. Warm terracotta as the *only* color accent. Generous whitespace. Sharp 6-10px radii. Subtle depth via 1px borders + layered shadows. Typography-led hierarchy. No gradients on text, no neon, no 3D illustrations, no "AI aesthetic" blobs.

**Moodboard Keywords**: Editorial commerce, calm technology, craftsmanship, trust, warmth, clarity.