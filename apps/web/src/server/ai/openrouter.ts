import { ASK_JSON_SCHEMA, EXTRACTION_JSON_SCHEMA } from "./schema";
import {
  askUserPrompt,
  ASK_SYSTEM_PROMPT,
  extractionUserPrompt,
  SYSTEM_PROMPT,
} from "./prompt";
import {
  AskFailed,
  ExtractionFailed,
  type AskInput,
  type AskProvider,
  type AskReply,
  type ExtractionProvider,
  type ExtractionInput,
  type ExtractionReply,
  type ExtractionUsage,
} from "./types";

/**
 * OpenRouter instead of one vendor's SDK, so the model is a configuration value
 * (PREPO.md §7: "model ids in config, checked against current docs before the
 * first run"). No dependency is added, and swapping models is one env line.
 *
 * One class serves both halves of the AI surface: extraction (§7.2) and Ask
 * Prepo (§8.8). They differ in their prompt, their response schema and their
 * token budget, and they share the transport, the structured-output retry and
 * the timeout. Splitting them into two classes would duplicate the retry rule,
 * which is the part most likely to be fixed once and forgotten in the other.
 *
 * The request asks for a JSON Schema response. A model that does not support
 * that gets one retry in JSON mode. Either way the reply must pass the matching
 * Zod schema, so a provider that ignores the schema fails the run rather than
 * half-importing an answer.
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ExtractionEnv = Record<string, string | undefined>;

/**
 * Why extraction cannot run, or null when it can. Both values are required:
 * silently defaulting a model would make a run's cost and behaviour depend on
 * code rather than configuration.
 */
export function extractionConfigProblem(env: ExtractionEnv = process.env): string | null {
  if (!env.OPENROUTER_API_KEY?.trim()) return "OPENROUTER_API_KEY is not set";
  if (!env.AI_MODEL_EXTRACT?.trim()) return "AI_MODEL_EXTRACT is not set";
  return null;
}

export function extractionProvider(env: ExtractionEnv = process.env): ExtractionProvider | null {
  const key = env.OPENROUTER_API_KEY?.trim();
  const model = env.AI_MODEL_EXTRACT?.trim();
  if (!key || !model) return null;
  return new OpenRouterProvider(key, model, env.APP_URL?.trim());
}

/**
 * The model Ask Prepo answers with. `AI_MODEL_ASK` is its own value because
 * answering is a different job from extraction and a workspace may want a
 * different model and price for it; when it is unset, the extraction model is
 * used, and the readiness message says which one is in play rather than
 * pretending a second model was configured.
 */
export function askModel(env: ExtractionEnv = process.env): string | null {
  return env.AI_MODEL_ASK?.trim() || env.AI_MODEL_EXTRACT?.trim() || null;
}

export function askConfigProblem(env: ExtractionEnv = process.env): string | null {
  if (!env.OPENROUTER_API_KEY?.trim()) return "OPENROUTER_API_KEY is not set";
  if (!askModel(env)) {
    return "AI_MODEL_ASK is not set and there is no AI_MODEL_EXTRACT to fall back to";
  }
  return null;
}

export function askProvider(env: ExtractionEnv = process.env): AskProvider | null {
  const key = env.OPENROUTER_API_KEY?.trim();
  const model = askModel(env);
  if (!key || !model) return null;
  return new OpenRouterProvider(key, model, env.APP_URL?.trim());
}

/* ------------------------------------------------------- provider response */

type ChatMessage = { role: "system" | "user"; content: string };

type ResponseFormat =
  | { type: "json_schema"; json_schema: { name: string; strict: boolean; schema: unknown } }
  | { type: "json_object" };

type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  response_format: ResponseFormat;
  provider: { require_parameters: boolean };
};

type OpenRouterResponse = {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
};

/** Fenced JSON is common even when a schema is requested; unwrap it. */
export function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const text = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(text);
  } catch {
    throw new ExtractionFailed(
      "The model's reply was not valid JSON, so nothing was imported.",
    );
  }
}

function usageFrom(
  payload: OpenRouterResponse,
  fallbackModel: string,
  latencyMs: number,
): ExtractionUsage {
  const cost = payload.usage?.cost;
  return {
    model: typeof payload.model === "string" && payload.model ? payload.model : fallbackModel,
    tokensIn: typeof payload.usage?.prompt_tokens === "number" ? payload.usage.prompt_tokens : null,
    tokensOut:
      typeof payload.usage?.completion_tokens === "number" ? payload.usage.completion_tokens : null,
    costUsd: typeof cost === "number" && Number.isFinite(cost) ? cost : null,
    latencyMs,
  };
}

class OpenRouterProvider implements ExtractionProvider, AskProvider {
  readonly name = "openrouter";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly appUrl?: string,
  ) {}

  async extract(input: ExtractionInput): Promise<ExtractionReply> {
    const body: ChatRequest = {
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: extractionUserPrompt(input) },
      ],
      // Minutes should be reproducible, not creative.
      temperature: 0,
      max_tokens: 4000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "prepo_extraction",
          strict: true,
          schema: EXTRACTION_JSON_SCHEMA,
        },
      },
      // Only route to a provider that supports every parameter above, so a
      // structured-output request cannot land on one that ignores it.
      provider: { require_parameters: true },
    };

    const { content, payload, latencyMs } = await this.request(
      body,
      "The model returned an empty answer, so nothing was imported.",
    );

    return {
      raw: parseModelJson(content),
      usage: usageFrom(payload, this.model, latencyMs),
    };
  }

  /**
   * The answering half (§8.8). Same transport and same schema gate, different
   * contract: an answer with citations instead of minutes. Temperature 0 for the
   * same reason: an answer about a workspace is a report, not a piece of writing.
   */
  async answer(input: AskInput): Promise<AskReply> {
    const body: ChatRequest = {
      model: this.model,
      messages: [
        { role: "system", content: ASK_SYSTEM_PROMPT },
        { role: "user", content: askUserPrompt(input) },
      ],
      temperature: 0,
      max_tokens: 1200,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "prepo_answer",
          strict: true,
          schema: ASK_JSON_SCHEMA,
        },
      },
      provider: { require_parameters: true },
    };

    try {
      const { content, payload, latencyMs } = await this.request(
        body,
        "The model returned an empty answer.",
      );
      return {
        raw: parseModelJson(content),
        usage: usageFrom(payload, this.model, latencyMs),
      };
    } catch (error) {
      // The shared transport speaks in extraction terms. Callers of `answer`
      // should not have to know that.
      if (error instanceof ExtractionFailed) throw new AskFailed(error.message);
      throw error;
    }
  }

  /**
   * One round trip with the one retry some models need for structured output.
   * Shared, so a fix to the retry rule cannot land on only one half.
   */
  private async request(
    body: ChatRequest,
    emptyMessage: string,
  ): Promise<{ content: string; payload: OpenRouterResponse; latencyMs: number }> {
    const startedAt = Date.now();
    let response = await this.send(body);
    let text = await response.text();

    // Some models expose `response_format` but not `json_schema`. One retry in
    // JSON mode, after which the same Zod gate still applies.
    if (
      !response.ok &&
      (response.status === 400 || response.status === 422) &&
      /response_format|json_schema|structured|schema/i.test(text)
    ) {
      body.response_format = { type: "json_object" };
      response = await this.send(body);
      text = await response.text();
    }

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      throw new ExtractionFailed(
        `The model provider returned ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`,
      );
    }

    let payload: OpenRouterResponse;
    try {
      payload = JSON.parse(text) as OpenRouterResponse;
    } catch {
      throw new ExtractionFailed("The model provider returned a reply that was not JSON.");
    }

    if (payload.error?.message) {
      throw new ExtractionFailed(`The model provider refused: ${payload.error.message.slice(0, 300)}`);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new ExtractionFailed(emptyMessage);
    }

    return { content, payload, latencyMs };
  }

  private async send(body: ChatRequest): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      // OpenRouter attributes usage to an app with these; neither is required.
      "X-Title": "Prepo",
    };
    if (this.appUrl) headers["HTTP-Referer"] = this.appUrl;

    try {
      return await fetch(OPENROUTER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        // A provider that never answers must not hold the request open forever.
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new ExtractionFailed("The model did not answer within 90 seconds.");
      }
      throw new ExtractionFailed(
        "The model provider could not be reached. Check the network and try again.",
      );
    }
  }
}
