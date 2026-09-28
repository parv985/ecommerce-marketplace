import api from './api'
import type { ApiResponse, AISearchResult } from '@/types/api'

export const aiService = {
  /**
   * Performs natural-language semantic product search via Gemini AI + MongoDB.
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
}
