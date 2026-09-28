import { GoogleGenAI } from "@google/genai";

import { env } from "../../config/env.js";
import { AppError } from "../../errors/AppError.js";

/**
 * Singleton Google GenAI client instance, lazily instantiated on first use.
 * This prevents crashes at server startup when GEMINI_API_KEY is not configured yet.
 */
let clientInstance: GoogleGenAI | null = null;

export const isGeminiConfigured = (): boolean => {
  return Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
};

export const getGeminiClient = (): GoogleGenAI => {
  if (!isGeminiConfigured()) {
    throw new AppError(
      "Gemini API is not configured. Please set GEMINI_API_KEY in your backend .env file.",
      503,
      "GEMINI_NOT_CONFIGURED",
    );
  }

  if (!clientInstance) {
    clientInstance = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY!.trim(),
    });
  }

  return clientInstance;
};

export const getGeminiModelName = (): string => {
  return env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
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

/**
 * Generates structured JSON output from Gemini.
 * Perfect for semantic search criteria extraction, entity extraction, and classifications.
 */
export const generateGeminiJson = async <T>(
  options: GenerateJsonOptions,
): Promise<T> => {
  const ai = getGeminiClient();
  const model = getGeminiModelName();

  try {
    const config: Record<string, unknown> = {
      responseMimeType: "application/json",
      temperature: options.temperature ?? 0.1,
    };

    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction;
    }

    if (options.responseSchema) {
      config.responseSchema = options.responseSchema;
    }

    const response = await ai.models.generateContent({
      model,
      contents: options.prompt,
      config,
    });

    const rawText = response.text?.trim() || "{}";
    return JSON.parse(rawText) as T;
  } catch (error: any) {
    if (error instanceof AppError) throw error;

    // Handle common Gemini API errors gracefully
    const errorMessage = error?.message || String(error);
    const status = error?.status || error?.statusCode;

    if (status === 429 || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
      throw new AppError(
        "Gemini API rate limit or free-tier quota exceeded. Please try again in a few moments.",
        429,
        "AI_RATE_LIMITED",
      );
    }

    if (status === 400 && errorMessage.includes("API_KEY_INVALID")) {
      throw new AppError(
        "Invalid Gemini API key provided. Please verify GEMINI_API_KEY in .env.",
        401,
        "INVALID_GEMINI_KEY",
      );
    }

    throw new AppError(
      `Gemini AI processing failed: ${errorMessage}`,
      502,
      "AI_SERVICE_ERROR",
    );
  }
};

/**
 * Generates natural language text from Gemini.
 * Reusable for upcoming features: Shopping Chatbot, Review Summarizer, Customer Support, etc.
 */
export const generateGeminiText = async (
  options: GenerateTextOptions,
): Promise<string> => {
  const ai = getGeminiClient();
  const model = getGeminiModelName();

  try {
    const config: Record<string, unknown> = {
      temperature: options.temperature ?? 0.7,
    };

    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction;
    }

    const response = await ai.models.generateContent({
      model,
      contents: options.prompt,
      config,
    });

    return response.text || "";
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Gemini text generation failed: ${error?.message || String(error)}`,
      502,
      "AI_SERVICE_ERROR",
    );
  }
};

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
 * Generates response from Gemini with tool / function calling support.
 */
export const generateGeminiWithTools = async (
  options: GenerateWithToolsOptions,
): Promise<GenerateWithToolsResponse> => {
  const ai = getGeminiClient();
  const model = getGeminiModelName();

  try {
    const config: Record<string, unknown> = {
      temperature: options.temperature ?? 0.2,
    };

    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction;
    }

    if (options.tools && options.tools.length > 0) {
      config.tools = options.tools;
    }

    const response = await ai.models.generateContent({
      model,
      contents: options.contents,
      config,
    });

    return {
      text: response.text?.trim() || undefined,
      functionCalls: (response.functionCalls as Array<{ name: string; args: Record<string, any> }>) || undefined,
    };
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Gemini tool generation failed: ${error?.message || String(error)}`,
      502,
      "AI_SERVICE_ERROR",
    );
  }
};

