import { THREADS_IDENTITY_PROMPT } from "./identity.js";
import { THREADS_POLICY_PROMPT } from "./policy.js";
import { THREADS_CONTENT_PROMPT } from "./content.js";
import { THREADS_PRODUCT_PROMPT } from "./product.js";
import { THREADS_ANALYTICS_PROMPT } from "./analytics.js";
import { THREADS_VALIDATION_PROMPT } from "./validation.js";
import { THREADS_OUTPUT_PROMPT } from "./output.js";

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
