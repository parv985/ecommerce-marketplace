import api from './api'
import type {
  ApiResponse,
  AISearchResult,
  AIChatMessage,
  AIChatResult,
} from '@/types/api'

export const aiService = {
  /**
   * Performs natural-language semantic product search via Groq AI + MongoDB.
   * e.g. "Show me comfortable running shoes under ₹3,000"
   */
  searchProducts: (query: string, limit?: number) => {
    return api
      .post<ApiResponse<AISearchResult>>('/ai/search', {
        query,
        limit: limit || 20,
      })
      .then((r) => r.data.data)
  },

  /**
   * Conversational NexCart AI Assistant for authenticated buyers.
   */
  chat: (message: string, history?: AIChatMessage[]) => {
    return api
      .post<ApiResponse<AIChatResult>>('/ai/chat', {
        message,
        history: history || [],
      })
      .then((r) => r.data.data)
  },
}

