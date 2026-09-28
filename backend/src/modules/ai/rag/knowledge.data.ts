import type { RAGChunk } from "../ai.types.js";

/**
 * Curated knowledge base for NexCart e-commerce marketplace.
 * Chunked into focused semantic passages for the RAG layer.
 */
export const NEXCART_KNOWLEDGE_CHUNKS: Omit<RAGChunk, "embedding">[] = [
  {
    id: "policy-shipping-timelines",
    title: "Shipping & Delivery Timelines",
    category: "shipping",
    content:
      "NexCart delivers orders across India. Standard shipping takes 3 to 5 business days for most locations. In major metro cities (Mumbai, Delhi NCR, Bengaluru, Hyderabad, Chennai, Kolkata, Ahmedabad, Pune), express shipping is available within 1 to 2 business days. Delivery hours are Monday through Saturday, 9:00 AM to 7:00 PM.",
    metadata: { topic: "shipping", priority: 1 },
  },
  {
    id: "policy-shipping-costs",
    title: "Shipping Fees & Free Delivery",
    category: "shipping",
    content:
      "NexCart offers FREE standard shipping on all orders totaling ₹499 or more. For orders below ₹499, a flat shipping fee of ₹49 is applied at checkout. No hidden handling or delivery charges are ever added.",
    metadata: { topic: "shipping", priority: 2 },
  },
  {
    id: "policy-shipping-tracking",
    title: "Order Tracking & Delivery Status",
    category: "shipping",
    content:
      "Buyers can track their order in real-time by visiting their Account > 'My Orders' section. As an order progresses, the status updates through: PENDING (order placed), CONFIRMED (seller accepted and packing), SHIPPED (dispatched with courier), and DELIVERED. Courier delivery partners will attempt delivery up to 3 times before returning the parcel.",
    metadata: { topic: "shipping", priority: 3 },
  },
  {
    id: "policy-returns-window",
    title: "Return Window & Eligibility",
    category: "returns",
    content:
      "NexCart provides a 7-day return window starting from the date of delivery. To be eligible for a return, the product must be unused, in its original brand packaging, with all price tags, warranty cards, manuals, and accessories intact. Consumable items, personal hygiene products, and clearance final-sale items cannot be returned unless received in a damaged or defective condition.",
    metadata: { topic: "returns", priority: 1 },
  },
  {
    id: "policy-returns-process",
    title: "How to Initiate a Return",
    category: "returns",
    content:
      "To initiate a return: 1. Go to 'My Orders' on NexCart. 2. Select the delivered order and click 'Request Return'. 3. Choose the reason for return (e.g. damaged, defective, wrong size/item) and submit. The seller reviews and approves the request within 48 business hours, and a free courier doorstep pickup is scheduled within 2 to 3 business days.",
    metadata: { topic: "returns", priority: 2 },
  },
  {
    id: "policy-refunds-timeline",
    title: "Refund Process & Timelines",
    category: "returns",
    content:
      "Once the returned item is picked up and inspected by the seller, the refund is processed automatically. For prepaid orders (credit/debit card, net banking, UPI), the refund is credited to the original payment source within 5 to 7 business days. For Cash on Delivery (COD) orders, the buyer receives a refund via direct bank transfer (NEFT) or UPI within 3 to 5 business days after providing account details.",
    metadata: { topic: "returns", priority: 3 },
  },
  {
    id: "policy-cancellation-rules",
    title: "Order Cancellation Policy",
    category: "cancellation",
    content:
      "Orders can be cancelled free of charge anytime while they are in PENDING or CONFIRMED status before they are shipped. Once an order status changes to SHIPPED, it cannot be cancelled because the parcel is already in transit with the courier. If an order is already shipped, buyers can decline delivery at their doorstep or request a return within 7 days after delivery.",
    metadata: { topic: "cancellation", priority: 1 },
  },
  {
    id: "policy-cancellation-refund",
    title: "Refunds for Cancelled Orders",
    category: "cancellation",
    content:
      "If a prepaid order is cancelled while in PENDING or CONFIRMED status, an instant refund is triggered immediately. The refunded amount reflects in the customer's original payment method (card, UPI, or net banking) within 24 to 48 business hours. For COD orders, no payment was collected, so no refund is necessary.",
    metadata: { topic: "cancellation", priority: 2 },
  },
  {
    id: "policy-payment-methods",
    title: "Accepted Payment Methods & Security",
    category: "payment",
    content:
      "NexCart supports multiple safe payment methods: 1. Cash on Delivery (COD) on eligible pin codes. 2. UPI payments (Google Pay, PhonePe, Paytm, BHIM). 3. Credit & Debit Cards (Visa, MasterCard, RuPay, American Express). 4. Net Banking from all major Indian banks. All online transactions are processed through Razorpay using 256-bit SSL encryption and 3D Secure OTP verification.",
    metadata: { topic: "payment", priority: 1 },
  },
  {
    id: "policy-verified-reviews",
    title: "Verified Delivery Customer Reviews",
    category: "faq",
    content:
      "NexCart enforces authentic customer reviews through a 'Verified Delivery' system. A buyer can only submit a review and star rating for a product after an order containing that product has been successfully DELIVERED. This ensures all customer ratings, feedback, and AI review summaries reflect authentic real-world buyer experiences.",
    metadata: { topic: "reviews", priority: 1 },
  },
  {
    id: "faq-customer-support",
    title: "Customer Support & Contact",
    category: "faq",
    content:
      "NexCart customer support is available 7 days a week from 8:00 AM to 10:00 PM IST. Buyers can contact support via email at support@nexcart.com or submit a ticket through the Help Center. Our AI Assistant is available 24/7 inside the app to assist with product search, order tracking, and policy questions.",
    metadata: { topic: "support", priority: 1 },
  },
  {
    id: "faq-addresses-management",
    title: "Managing Shipping Addresses",
    category: "faq",
    content:
      "Buyers can add, edit, or set default delivery addresses in their Profile > Addresses section. During checkout, buyers can also add new addresses with searchable State and City dropdowns. The newly added address is immediately available for selection.",
    metadata: { topic: "addresses", priority: 2 },
  },
];
