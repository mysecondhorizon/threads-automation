import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleAdminHomePage } from "./admin-overview.js";
import {
  handleAppHome,
  handleAppPlaceholderPage,
} from "./app-shell.js";

function createEnv() {
  return {
    THREADS_KV: {
      async get(key) {
        return key === "admin_session:session-1" ? "valid" : null;
      },
    },
  };
}

function authenticatedRequest(path) {
  return new Request(`https://example.test${path}`, {
    headers: { cookie: "admin_session=session-1" },
  });
}

const homeResponse = await handleAppHome(authenticatedRequest("/app"), createEnv());
const homePage = await homeResponse.text();

assert.equal(homeResponse.status, 200);
assert.match(homePage, /운영 홈/u);
assert.match(homePage, /class="app-nav-link is-active" href="\/app" aria-current="page"/u);

for (const path of ["/app/write", "/app/daily", "/app/products", "/app/prompts", "/app/activity", "/app/schedules", "/app/apps"]) {
  assert.match(homePage, new RegExp(`href="${path}"`, "u"));
}

const placeholderResponse = await handleAppPlaceholderPage(
  authenticatedRequest("/app/daily"),
  createEnv(),
  "/app/daily"
);
const placeholderPage = await placeholderResponse.text();
assert.equal(placeholderResponse.status, 200);
assert.match(placeholderPage, /Daily/u);
assert.match(placeholderPage, /준비 중/u);
assert.match(placeholderPage, /class="app-nav-link is-active" href="\/app\/daily" aria-current="page"/u);

const unauthenticatedResponse = await handleAppHome(
  new Request("https://example.test/app"),
  createEnv()
);
assert.equal(unauthenticatedResponse.status, 302);
assert.equal(unauthenticatedResponse.headers.get("location"), "https://example.test/app/login");

const legacyResponse = await handleAdminHomePage(
  authenticatedRequest("/admin"),
  createEnv()
);
const legacyPage = await legacyResponse.text();
assert.equal(legacyResponse.status, 200);
assert.match(legacyPage, /Second Horizon Admin/u);

const indexSource = await readFile(new URL("../index.js", import.meta.url), "utf8");
assert.doesNotMatch(indexSource, /admin\/maintenance\/password-reset/u);
for (const path of ["/app", "/app/write", "/app/daily", "/app/media", "/app/products", "/app/prompts", "/app/activity", "/app/schedules", "/app/apps"]) {
  assert.match(indexSource, new RegExp(`"${path}"`, "u"));
}

console.log("app shell fixture passed");
