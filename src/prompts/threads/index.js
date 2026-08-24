import { THREADS_IDENTITY_PROMPT } from "./identity.js";
import { THREADS_POLICY_PROMPT } from "./policy.js";
import { THREADS_CONTENT_PROMPT } from "./content.js";
import { THREADS_PRODUCT_PROMPT } from "./product.js";
import { THREADS_ANALYTICS_PROMPT } from "./analytics.js";
import { THREADS_VALIDATION_PROMPT } from "./validation.js";
import { THREADS_OUTPUT_PROMPT } from "./output.js";

export { THREADS_IDENTITY_PROMPT } from "./identity.js";
export { THREADS_POLICY_PROMPT } from "./policy.js";
export { THREADS_CONTENT_PROMPT } from "./content.js";
export { THREADS_PRODUCT_PROMPT } from "./product.js";
export { THREADS_ANALYTICS_PROMPT } from "./analytics.js";
export { THREADS_VALIDATION_PROMPT } from "./validation.js";
export { THREADS_OUTPUT_PROMPT } from "./output.js";

export const THREADS_SYSTEM_PROMPT = [
  THREADS_IDENTITY_PROMPT,
  THREADS_POLICY_PROMPT,
  THREADS_CONTENT_PROMPT,
  THREADS_PRODUCT_PROMPT,
  THREADS_ANALYTICS_PROMPT,
  THREADS_VALIDATION_PROMPT,
  THREADS_OUTPUT_PROMPT,
]
  .filter(Boolean)
  .join("\n\n");

export function composeThreadsSystemPrompt(profile = {}) {
  return [
    profile.identityWriting ?? THREADS_IDENTITY_PROMPT,
    profile.generalWritingPolicy ?? THREADS_POLICY_PROMPT,
    profile.contentAndFormatPreferences ?? THREADS_CONTENT_PROMPT,
    profile.productWritingGuidance ?? THREADS_PRODUCT_PROMPT,
    profile.analyticsWritingGuidance ?? THREADS_ANALYTICS_PROMPT,
    THREADS_VALIDATION_PROMPT,
    THREADS_OUTPUT_PROMPT,
  ].filter(Boolean).join("\n\n");
}
