import assert from "node:assert/strict";

import { ADMIN_SESSION_KEY_PREFIX, USERS_KEY, WORKSPACES_KEY } from "../services/login-foundation.js";
import { handleOperatorPromptReset, handleOperatorPrompts } from "./api-prompts.js";

const DEFAULT_PROMPT_KEY = "operator_prompt_profile:v1";
const NEXT_PROMPT_KEY = `${DEFAULT_PROMPT_KEY}:workspace-next`;

function createEnv(selectedWorkspaceId = "workspace-next") {
  const values = new Map([
    [USERS_KEY, JSON.stringify({ version: 1, users: [{ id: "user-next", loginId: "next", displayName: "Next", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] })],
    [WORKSPACES_KEY, JSON.stringify({ version: 1, workspaces: [
      { id: "workspace-next", ownerUserId: "user-next", name: "Next", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      { id: "workspace-foreign", ownerUserId: "user-foreign", name: "Foreign", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    ] })],
    [`${ADMIN_SESSION_KEY_PREFIX}registered`, JSON.stringify({ version: 1, userId: "user-next", selectedWorkspaceId, createdAt: "2026-01-01", expiresAt: "2099-01-01" })],
    [DEFAULT_PROMPT_KEY, JSON.stringify({ version: 1, updatedAt: "2026-01-01", profile: { generalWritingPolicy: "DEFAULT_STORED" } })],
    [NEXT_PROMPT_KEY, JSON.stringify({ version: 1, updatedAt: "2026-01-02", profile: { generalWritingPolicy: "NEXT_STORED" } })],
    ["admin_session:legacy", "valid"],
  ]);
  return {
    values,
    env: { THREADS_KV: {
      async get(key, type) { const value = values.get(key); return value === undefined ? null : (type === "json" ? JSON.parse(value) : value); },
      async put(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); },
    } },
  };
}

function request(method, body, sessionId = "registered") {
  return new Request("https://x/api/prompts", {
    method,
    headers: { cookie: `admin_session=${sessionId}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const { env, values } = createEnv();
assert.equal((await handleOperatorPrompts(new Request("https://x/api/prompts"), env)).status, 401);
assert.equal((await (await handleOperatorPrompts(request("GET"), env)).json()).prompts.generalWritingPolicy, "NEXT_STORED");
assert.equal((await handleOperatorPrompts(request("PATCH", { generalWritingPolicy: "NEXT_UPDATED" }), env)).status, 200);
assert.equal(JSON.parse(values.get(NEXT_PROMPT_KEY)).profile.generalWritingPolicy, "NEXT_UPDATED");
assert.equal(JSON.parse(values.get(DEFAULT_PROMPT_KEY)).profile.generalWritingPolicy, "DEFAULT_STORED");
assert.equal((await handleOperatorPrompts(request("PATCH", { generalWritingPolicy: "bad", workspaceId: "workspace-foreign" }), env)).status, 400);
assert.equal((await handleOperatorPromptReset(request("POST"), env)).status, 200);
assert.equal(values.has(NEXT_PROMPT_KEY), false);
assert.equal(values.has(DEFAULT_PROMPT_KEY), true);
assert.notEqual((await (await handleOperatorPrompts(request("GET"), env)).json()).prompts.generalWritingPolicy, "DEFAULT_STORED");
const registeredDefault = createEnv("default-workspace");
assert.equal((await (await handleOperatorPrompts(request("GET"), registeredDefault.env)).json()).prompts.generalWritingPolicy, "DEFAULT_STORED");
assert.equal((await (await handleOperatorPrompts(request("GET", undefined, "legacy"), env)).json()).prompts.generalWritingPolicy, "DEFAULT_STORED");
console.log("api prompts workspace fixture passed");
