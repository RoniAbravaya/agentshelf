import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AiListingDraftSchema, AiPolicyDraftSchema, CATEGORY_IDS, type AiListingDraft, type AiPolicyDraft } from "@agentshelf/shared";
import {
  AiRefusalError,
  LISTING_SYSTEM_PROMPT,
  MANDATE_SYSTEM_PROMPT,
  buildListingUserPrompt,
  buildMandateUserPrompt,
  type ListingAiProvider,
  type ListingDraftRequest,
  type MandateParseRequest,
} from "./provider";

/** Low-cost vision + structured-output default; set OPENAI_MODEL=gpt-6-astra for best quality. */
export const OPENAI_DEFAULT_MODEL = "gpt-6-luna";

/** ChatGPT (OpenAI) vision + structured outputs through the Responses API. */
export class OpenAiListingProvider implements ListingAiProvider {
  readonly name = "openai" as const;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string = OPENAI_DEFAULT_MODEL,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async generateListingDraft(req: ListingDraftRequest): Promise<AiListingDraft> {
    const response = await this.client.responses.parse({
      model: this.model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 4096,
      instructions: LISTING_SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [
            ...req.images.map((img) => ({
              type: "input_image" as const,
              image_url: `data:${img.mediaType};base64,${img.base64}`,
              detail: "high" as const,
            })),
            { type: "input_text" as const, text: buildListingUserPrompt(req, CATEGORY_IDS) },
          ],
        },
      ],
      text: { format: zodTextFormat(AiListingDraftSchema, "listing_draft") },
    });
    const refusal = findRefusal(response);
    if (refusal) throw new AiRefusalError(refusal, this.name);
    if (response.status !== "completed") {
      throw new Error(`OpenAI generation incomplete: ${response.status} ${JSON.stringify(response.incomplete_details ?? null)}`);
    }
    if (!response.output_parsed) throw new Error("OpenAI returned no structured listing draft");
    return response.output_parsed;
  }

  async parseMandate(req: MandateParseRequest): Promise<AiPolicyDraft> {
    const response = await this.client.responses.parse({
      model: this.model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 2048,
      instructions: MANDATE_SYSTEM_PROMPT,
      input: buildMandateUserPrompt(req, CATEGORY_IDS),
      text: { format: zodTextFormat(AiPolicyDraftSchema, "spend_policy") },
    });
    const refusal = findRefusal(response);
    if (refusal) throw new AiRefusalError(refusal, this.name);
    if (response.status !== "completed") {
      throw new Error(`OpenAI generation incomplete: ${response.status} ${JSON.stringify(response.incomplete_details ?? null)}`);
    }
    if (!response.output_parsed) throw new Error("OpenAI returned no structured policy");
    return response.output_parsed;
  }
}

function findRefusal(response: { output?: unknown[] }): string | null {
  for (const item of response.output ?? []) {
    const msg = item as { type?: string; content?: Array<{ type?: string; refusal?: string }> };
    if (msg.type !== "message") continue;
    for (const part of msg.content ?? []) {
      if (part.type === "refusal" && part.refusal) return part.refusal;
    }
  }
  return null;
}
