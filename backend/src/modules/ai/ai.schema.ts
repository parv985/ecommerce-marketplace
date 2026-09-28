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
