import Groq from "groq-sdk";

import { env } from "../../config/env.js";
import { AppError } from "../../errors/AppError.js";

/**
 * Singleton Groq client instance, lazily instantiated on first use.
 * This prevents crashes at server startup when GROQ_API_KEY is not configured yet.
 */
let clientInstance: Groq | null = null;

export const isGroqConfigured = (): boolean => {
  return Boolean(env.GROQ_API_KEY && env.GROQ_API_KEY.trim().length > 0);
};

export const getGroqClient = (): Groq => {
  if (!isGroqConfigured()) {
    throw new AppError(
      "Groq API is not configured. Please set GROQ_API_KEY in your backend .env file.",
      503,
      "GROQ_NOT_CONFIGURED",
    );
  }

  if (!clientInstance) {
    clientInstance = new Groq({
      apiKey: env.GROQ_API_KEY!.trim(),
    });
  }

  return clientInstance;
};

export const getGroqModelName = (): string => {
  return env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
};

export interface GenerateJsonOptions {
  prompt: string;
  systemInstruction?: string;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
}

export interface GenerateTextOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
}

export interface GenerateWithToolsOptions {
  contents: any;
  systemInstruction?: string;
  tools?: any[];
  temperature?: number;
}

export interface GenerateWithToolsResponse {
  text?: string | undefined;
  functionCalls?: Array<{ name: string; args: Record<string, any> }> | undefined;
}

/**
 * Normalizes and dispatches Groq-specific errors into standardized AppError instances.
 */
const handleGroqError = (error: any, fallbackMessage: string): AppError => {
  if (error instanceof AppError) return error;

  const errorMessage = error?.message || String(error);
  const status = error?.status || error?.statusCode;
  const errorType = error?.error?.type || error?.code;

  if (
    status === 429 ||
    errorType === "rate_limit_exceeded" ||
    errorMessage.toLowerCase().includes("rate limit") ||
    errorMessage.toLowerCase().includes("quota")
  ) {
    return new AppError(
      "Groq API rate limit or quota exceeded. Please try again in a few moments.",
      429,
      "AI_RATE_LIMITED",
    );
  }

  if (
    status === 401 ||
    errorType === "invalid_api_key" ||
    errorMessage.toLowerCase().includes("invalid api key")
  ) {
    return new AppError(
      "Invalid Groq API key provided. Please verify GROQ_API_KEY in .env.",
      401,
      "INVALID_GROQ_KEY",
    );
  }

  if (
    status === 404 ||
    errorType === "model_not_found" ||
    errorMessage.toLowerCase().includes("model_not_found")
  ) {
    return new AppError(
      `Groq model unavailable: ${errorMessage}`,
      503,
      "AI_MODEL_UNAVAILABLE",
    );
  }

  if (
    errorType === "context_length_exceeded" ||
    errorMessage.toLowerCase().includes("context length") ||
    errorMessage.toLowerCase().includes("maximum context length")
  ) {
    return new AppError(
      "Request exceeds maximum Groq context length. Please shorten your query.",
      400,
      "CONTEXT_LENGTH_EXCEEDED",
    );
  }

  if (
    error?.code === "ETIMEDOUT" ||
    error?.code === "ECONNABORTED" ||
    errorMessage.toLowerCase().includes("timeout")
  ) {
    return new AppError(
      "Groq AI service request timed out. Please try again.",
      504,
      "AI_TIMEOUT",
    );
  }

  return new AppError(
    `${fallbackMessage}: ${errorMessage}`,
    502,
    "AI_SERVICE_ERROR",
  );
};

/**
 * Generates structured JSON output from Groq using JSON mode.
 * Perfect for semantic search criteria extraction, entity extraction, and classifications.
 */
export const generateGroqJson = async <T>(
  options: GenerateJsonOptions,
): Promise<T> => {
  const client = getGroqClient();
  const model = getGroqModelName();

  try {
    const messages: Array<{ role: "system" | "user"; content: string }> = [];

    const systemPrompt = options.systemInstruction
      ? `${options.systemInstruction}\nImportant: You must respond ONLY with a valid, parseable JSON object.`
      : "You must respond ONLY with a valid, parseable JSON object.";

    messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: options.prompt });

    const completion = await client.chat.completions.create({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: options.temperature ?? 0.1,
    });

    const rawText = completion.choices[0]?.message?.content?.trim() || "{}";
    return JSON.parse(rawText) as T;
  } catch (error: any) {
    throw handleGroqError(error, "Groq JSON generation failed");
  }
};

/**
 * Generates natural language text from Groq.
 * Used for AI review summaries, grounded shopping synthesis, and general conversational answers.
 */
export const generateGroqText = async (
  options: GenerateTextOptions,
): Promise<string> => {
  const client = getGroqClient();
  const model = getGroqModelName();

  try {
    const messages: Array<{ role: "system" | "user"; content: string }> = [];

    if (options.systemInstruction) {
      messages.push({ role: "system", content: options.systemInstruction });
    }
    messages.push({ role: "user", content: options.prompt });

    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
    });

    return completion.choices[0]?.message?.content || "";
  } catch (error: any) {
    throw handleGroqError(error, "Groq text generation failed");
  }
};

/**
 * Generates response from Groq with tool / function calling support.
 */
export const generateGroqWithTools = async (
  options: GenerateWithToolsOptions,
): Promise<GenerateWithToolsResponse> => {
  const client = getGroqClient();
  const model = getGroqModelName();

  try {
    const messages: any[] = [];

    if (options.systemInstruction) {
      messages.push({ role: "system", content: options.systemInstruction });
    }

    if (Array.isArray(options.contents)) {
      for (const item of options.contents) {
        const role = item.role === "model" ? "assistant" : item.role;
        const content =
          item.content ??
          (Array.isArray(item.parts)
            ? item.parts.map((p: any) => p.text || "").join("")
            : typeof item === "string"
              ? item
              : "");
        messages.push({ role, content });
      }
    } else if (typeof options.contents === "string") {
      messages.push({ role: "user", content: options.contents });
    }

    const payload: any = {
      model,
      messages,
      temperature: options.temperature ?? 0.2,
    };

    if (options.tools && options.tools.length > 0) {
      payload.tools = options.tools;
      payload.tool_choice = "auto";
    }

    const completion = await client.chat.completions.create(payload);
    const choice = completion.choices[0];
    const message = choice?.message;

    let functionCalls: Array<{ name: string; args: Record<string, any> }> | undefined;

    if (message?.tool_calls && message.tool_calls.length > 0) {
      functionCalls = message.tool_calls
        .filter((tc: any) => tc.type === "function")
        .map((tc: any) => {
          let parsedArgs: Record<string, any> = {};
          try {
            parsedArgs =
              typeof tc.function.arguments === "string"
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments || {};
          } catch {
            parsedArgs = {};
          }
          return {
            name: tc.function.name,
            args: parsedArgs,
          };
        });
    }

    return {
      text: message?.content?.trim() || undefined,
      functionCalls:
        functionCalls && functionCalls.length > 0 ? functionCalls : undefined,
    };
  } catch (error: any) {
    throw handleGroqError(error, "Groq tool generation failed");
  }
};
