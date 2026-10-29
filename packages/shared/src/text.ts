/**
 * Defence against prompt injection through seller-written text.
 * Seller text is untrusted input to buyer agents. We strip instruction-like
 * phrasing and control characters before it is returned through MCP, and the
 * field is always labelled as seller-provided.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|any|the|your|previous|prior|these)[^.!?\n]*/gi,
  /disregard (all|any|the|your|previous|prior|these)[^.!?\n]*/gi,
  /(you are|you're) (now|an?) [^.!?\n]*(assistant|agent|ai)[^.!?\n]*/gi,
  /system prompt[^.!?\n]*/gi,
  /(as an? (ai|assistant|agent)|to the (ai|assistant|agent)|attention (ai|agents?|assistants?))[^.!?\n]*/gi,
  /\b(buy|purchase|order) (all|every|everything|this (item )?(now|immediately))[^.!?\n]*/gi,
  /(call|invoke|use|run) (the )?(buy|quote_purchase|purchase|rate_order)[^.!?\n]*/gi,
  /\b(spending|budget) (rules?|limits?|policy|cap)[^.!?\n]*/gi,
  /<\/?(system|assistant|user|tool|instruction|important)[^>]*>/gi,
  /\[(system|instructions?|important)\][^\n]*/gi,
];

export function sanitizeSellerText(input: string, maxLen = 1000): string {
  let text = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  for (const re of INJECTION_PATTERNS) text = text.replace(re, "[removed]");
  text = text.replace(/\s{3,}/g, "  ").trim();
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .slice(0, 60);
}

/** "Maya Alvarez" -> "Maya A." */
export function publicName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return displayName.trim();
  const last = parts[parts.length - 1] ?? "";
  return `${parts.slice(0, -1).join(" ")} ${last.charAt(0).toUpperCase()}.`;
}
