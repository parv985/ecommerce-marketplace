import { z } from "zod";

export const aiSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, "Search query must be at least 2 characters")
    .max(500, "Search query cannot exceed 500 characters"),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export type AISearchInput = z.infer<typeof aiSearchSchema>;

export const aiChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().max(2000),
});

export const aiChatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(1000, "Message cannot exceed 1000 characters"),
  history: z.array(aiChatMessageSchema).optional().default([]),
});

export type AIChatInput = z.infer<typeof aiChatSchema>;

