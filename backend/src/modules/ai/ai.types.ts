import type { ProductResponse } from "../products/product.types.js";

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIChatOrderSummary {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  itemsCount: number;
  firstItemName?: string | undefined;
  createdAt: string | Date;
  deliveredAt?: string | Date | null | undefined;
}

export interface AIChatResult {
  message: string;
  intent: string;
  products?: ProductResponse[] | undefined;
  orders?: AIChatOrderSummary[] | undefined;
  toolCallsExecuted?: string[] | undefined;
  ragSourcesUsed?: string[] | undefined;
}

export interface AISearchCriteria {
  category?: string | null | undefined;
  minPrice?: number | null | undefined;
  maxPrice?: number | null | undefined;
  brand?: string | null | undefined;
  color?: string | null | undefined;
  useCase?: string | null | undefined;
  searchTerms: string[];
  summary: string;
}

export interface AISearchResult {
  query: string;
  extractedCriteria: AISearchCriteria;
  products: ProductResponse[];
  total: number;
}

/**
 * Representation of a knowledge chunk in the RAG vector store.
 */
export interface RAGChunk {
  id: string;
  title: string;
  category: "shipping" | "returns" | "cancellation" | "payment" | "policy" | "faq" | "review" | "product";
  content: string;
  metadata?: Record<string, any> | undefined;
  embedding?: number[] | undefined;
}

export interface RAGSearchResult {
  chunk: RAGChunk;
  score: number;
}

/**
 * Representation of a tool call request from Groq or internal dispatcher.
 */
export interface ToolCallRequest {
  name: string;
  args: Record<string, any>;
}

export interface ToolCallResult {
  name: string;
  result: any;
  error?: string | undefined;
}
