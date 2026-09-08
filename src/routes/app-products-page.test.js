import assert from "node:assert/strict";

import { APP_NAVIGATION } from "../services/app-navigation.js";
import { handleAppProductsPage } from "./app-products-page.js";
import { ADMIN_SESSION_KEY_PREFIX, USERS_KEY, WORKSPACES_KEY } from "../services/login-foundation.js";

const legacyEnv = { THREADS_KV: { async get(key) { return key === "admin_session:legacy" ? "valid" : null; } } };
const unauthenticated = await handleAppProductsPage(new Request("https://example.test/app/products"), legacyEnv);
assert.equal(unauthenticated.status, 302);

const legacyPage = await handleAppProductsPage(new Request("https://example.test/app/products", { headers: { cookie: "admin_session=legacy" } }), legacyEnv);
const legacyText = await legacyPage.text();
assert.equal(legacyPage.status, 200);
assert.match(legacyText, /제품 기회/u);
assert.match(legacyText, /새 기회 추가/u);
assert.match(legacyText, /api\/product-opportunities/u);
assert.doesNotMatch(legacyText, /Product Catalog|CSV|Product Review|제품 후기/u);
assert.match(legacyText, /textContent=opportunity\.productName/u);
assert.match(legacyText, /replaceChildren\(\)/u);
assert.doesNotMatch(legacyText, /innerHTML/u);
assert.equal(legacyText.includes("mediaIds"), false);
assert.equal(legacyText.includes("experienceNote"), false);

const values = new Map([
  [USERS_KEY, JSON.stringify({ version: 1, users: [{ id: "user-next", loginId: "next", displayName: "Next", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] })],
  [WORKSPACES_KEY, JSON.stringify({ version: 1, workspaces: [{ id: "workspace-next", ownerUserId: "user-next", name: "Next Horizon", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] })],
  [`${ADMIN_SESSION_KEY_PREFIX}registered`, JSON.stringify({ version: 1, userId: "user-next", selectedWorkspaceId: "workspace-next", createdAt: "2026-01-01", expiresAt: "2099-01-01" })],
]);
const registeredEnv = { THREADS_KV: { async get(key, type) { const value = values.get(key); return value === undefined ? null : (type === "json" ? JSON.parse(value) : value); } } };
const registered = await handleAppProductsPage(new Request("https://example.test/app/products", { headers: { cookie: "admin_session=registered" } }), registeredEnv);
assert.equal(registered.status, 200);
assert.match(await registered.text(), /Next Horizon/u);
assert.equal(APP_NAVIGATION.some((item) => item.path === "/app/products" && item.label === "제품 기회"), true);

console.log("app products page fixture passed");
