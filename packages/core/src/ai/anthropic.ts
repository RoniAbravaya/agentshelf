import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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

/** Claude vision + structured outputs via the official Anthropic SDK. */
export class AnthropicListingProvider implements ListingAiProvider {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = "claude-opus-5-5",
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async generateListingDraft(req: ListingDraftRequest): Promise<AiListingDraft> {
    const content: Anthropic.ContentBlockParam[] = [
      ...req.images.map<Anthropic.ImageBlockParam>((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      })),
      { type: "text", text: buildListingUserPrompt(req, CATEGORY_IDS) },
    ];
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: [{ type: "text", text: LISTING_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: zodOutputFormat(AiListingDraftSchema) },
    });
    if (response.stop_reason === "refusal") {
      throw new AiRefusalError(response.stop_details?.explanation ?? "The model declined to describe these photos.", this.name);
    }
    if (!response.parsed_output) throw new Error("Claude returned no structured listing draft");
    return response.parsed_output;
  }

  async parseMandate(req: MandateParseRequest): Promise<AiPolicyDraft> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8000,
      system: [{ type: "text", text: MANDATE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildMandateUserPrompt(req, CATEGORY_IDS) }],
      output_config: { effort: "low", format: zodOutputFormat(AiPolicyDraftSchema) },
    });
    if (response.stop_reason === "refusal") {
      throw new AiRefusalError(response.stop_details?.explanation ?? "The model declined to parse these rules.", this.name);
    }
    if (!response.parsed_output) throw new Error("Claude returned no structured policy");
    return response.parsed_output;
  }
}
