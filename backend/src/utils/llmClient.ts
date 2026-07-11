import { GoogleGenAI } from '@google/genai';

/**
 * llmClient — single place that knows about the LLM provider (Gemini only).
 *
 * Everything else talks to `completeJSON(...)` and never touches the SDK
 * directly, so the provider stays swappable behind this one interface.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let gemini: any = null;
let provider = 'none';

if (process.env.GEMINI_API_KEY) {
  try {
    gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    provider = 'gemini';
    console.log(`[llm] Gemini client ready (model: ${GEMINI_MODEL}).`);
  } catch (err: any) {
    console.error('[llm] Failed to init Gemini:', err.message);
  }
} else {
  console.warn('[llm] No GEMINI_API_KEY found — using the local pattern-matching engine.');
}

/**
 * Retry an async fn with exponential backoff.
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (retries <= 0) throw err;
    console.warn(`[llm] call failed, retrying in ${delay}ms — ${err.message}`);
    await new Promise((r) => setTimeout(r, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

interface CompleteJSONOptions {
  system: string;
  prompt: string;
  geminiSchema: any;
  apiKey?: string;
  maxOutputTokens?: number;
}

/**
 * Structured JSON completion via Gemini. Returns the parsed object.
 */
export async function completeJSON({ system, prompt, geminiSchema, apiKey, maxOutputTokens = 32768 }: CompleteJSONOptions): Promise<any> {
  const activeKey = apiKey || process.env.GEMINI_API_KEY;
  if (!activeKey) throw new Error('NO_LLM_PROVIDER');

  return retryWithBackoff(async () => {
    const client = (activeKey === process.env.GEMINI_API_KEY && gemini)
      ? gemini
      : new GoogleGenAI({ apiKey: activeKey });

    const res = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: geminiSchema,
        systemInstruction: system,
        temperature: 0.1,
        maxOutputTokens,
      },
    });

    const text = res.text;
    if (!text) throw new Error('Empty response from Gemini');
    return JSON.parse(text);
  });
}

export const model = GEMINI_MODEL;
export const isConfigured = (apiKey?: string): boolean => !!(apiKey || process.env.GEMINI_API_KEY);
export { provider };
