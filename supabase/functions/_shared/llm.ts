import Anthropic from "npm:@anthropic-ai/sdk";

// Cheap model for classifying chats at volume; strongest model for customer-facing replies.
export const CLASSIFIER_MODEL = "claude-haiku-5-5";
export const REPLY_MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
export function hasLlm(): boolean {
  return Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
}

/**
 * One structured-output call. Returns the raw JSON text (validate it with a
 * parser from funnel.ts) or null on refusal/API failure.
 */
export async function jsonCompletion(opts: {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<string | null> {
  client ??= new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
  const params: any = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { effort: opts.effort, format: { type: "json_schema", schema: opts.schema } },
  };
  try {
    // Server-side refusal fallback is only available for the Opus/Sonnet tier.
    const response: any = opts.model === REPLY_MODEL
      ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : await client.messages.create(params);
    if (response.stop_reason === "refusal") {
      console.warn("LLM refused", response.stop_details?.category);
      return null;
    }
    const text = response.content.find((b: any) => b.type === "text");
    return text?.text ?? null;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("LLM rate limited");
    else if (e instanceof Anthropic.APIError) console.error(`LLM API error ${e.status}:`, e.message);
    else console.error("LLM call failed", e);
    return null;
  }
}

// Recent chat as a plain transcript the model can read (Arabic or English).
export function transcript(messages: Array<{ direction: string; author: string; text: string }>): string {
  return messages
    .map((m) => `${m.direction === "in" ? "CUSTOMER" : m.author === "ai" ? "BUSINESS (assistant)" : "BUSINESS"}: ${m.text}`)
    .join("\n");
}
