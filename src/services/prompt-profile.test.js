import assert from "node:assert/strict";
import {
  THREADS_ANALYTICS_PROMPT,
  THREADS_CONTENT_PROMPT,
  THREADS_IDENTITY_PROMPT,
  THREADS_OUTPUT_PROMPT,
  THREADS_POLICY_PROMPT,
  THREADS_PRODUCT_PROMPT,
  THREADS_SYSTEM_PROMPT,
  THREADS_VALIDATION_PROMPT,
} from "../prompts/threads/index.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace-foundation.js";
import {
  composeEffectiveThreadsPrompt,
  getDefaultPromptProfile,
  getEffectivePromptProfile,
  resetPromptProfile,
  updatePromptProfile,
} from "./prompt-profile.js";

const LEGACY_KEY = "operator_prompt_profile:v1";

function createEnv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    env: {
      THREADS_KV: {
        async get(key, type) {
          const value = store.get(key) ?? null;
          return type === "json" && value !== null ? JSON.parse(value) : value;
        },
        async put(key, value) {
          store.set(key, value);
        },
        async delete(key) {
          store.delete(key);
        },
      },
    },
  };
}

const defaults = getDefaultPromptProfile();
assert.equal(composeEffectiveThreadsPrompt(defaults), THREADS_SYSTEM_PROMPT);
for (const part of [
  THREADS_IDENTITY_PROMPT,
  THREADS_POLICY_PROMPT,
  THREADS_CONTENT_PROMPT,
  THREADS_PRODUCT_PROMPT,
  THREADS_ANALYTICS_PROMPT,
  THREADS_VALIDATION_PROMPT,
  THREADS_OUTPUT_PROMPT,
]) {
  assert.ok(THREADS_SYSTEM_PROMPT.includes(part));
}

const { env, store } = createEnv();
await updatePromptProfile(env, { generalWritingPolicy: "default override" });
assert.equal(store.has(LEGACY_KEY), true);
let effective = await getEffectivePromptProfile(env);
assert.equal(effective.profile.generalWritingPolicy, "default override");

await updatePromptProfile(env, { productWritingGuidance: "" }, DEFAULT_WORKSPACE_ID);
effective = await getEffectivePromptProfile(env, DEFAULT_WORKSPACE_ID);
assert.equal(effective.profile.generalWritingPolicy, "default override");
assert.equal(effective.profile.productWritingGuidance, "");
assert.equal(effective.profile.analyticsWritingGuidance, THREADS_ANALYTICS_PROMPT);

const workspaceA = "workspace-a";
const workspaceB = "workspace-b";
const workspaceAKey = `${LEGACY_KEY}:${workspaceA}`;
const workspaceBKey = `${LEGACY_KEY}:${workspaceB}`;

const missingWorkspaceProfile = await getEffectivePromptProfile(env, workspaceA);
assert.deepEqual(missingWorkspaceProfile.profile, defaults);
assert.equal(missingWorkspaceProfile.profile.generalWritingPolicy, THREADS_POLICY_PROMPT);

await updatePromptProfile(env, { generalWritingPolicy: "workspace a override" }, workspaceA);
assert.equal(store.has(workspaceAKey), true);
assert.equal(store.has(workspaceBKey), false);
assert.equal((await getEffectivePromptProfile(env, workspaceA)).profile.generalWritingPolicy, "workspace a override");
assert.equal((await getEffectivePromptProfile(env)).profile.generalWritingPolicy, "default override");
assert.equal((await getEffectivePromptProfile(env, workspaceB)).profile.generalWritingPolicy, THREADS_POLICY_PROMPT);

await updatePromptProfile(env, { generalWritingPolicy: "workspace b override" }, workspaceB);
assert.equal((await getEffectivePromptProfile(env, workspaceA)).profile.generalWritingPolicy, "workspace a override");
assert.equal((await getEffectivePromptProfile(env, workspaceB)).profile.generalWritingPolicy, "workspace b override");

await assert.rejects(
  updatePromptProfile(env, { unknown: "value" }),
  /Invalid prompt profile/u,
);
await assert.rejects(
  updatePromptProfile(env, { generalWritingPolicy: 1 }),
  /Invalid prompt profile value/u,
);
await assert.rejects(
  getEffectivePromptProfile(env, ""),
  /Invalid workspace id/u,
);

await resetPromptProfile(env);
assert.equal(store.has(LEGACY_KEY), false);
assert.deepEqual((await getEffectivePromptProfile(env)).profile, defaults);
assert.equal((await getEffectivePromptProfile(env, workspaceA)).profile.generalWritingPolicy, "workspace a override");

console.log("prompt profile fixture passed");
