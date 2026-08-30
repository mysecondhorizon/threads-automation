import assert from "node:assert/strict";
import test from "node:test";

import { createRemoteKv } from "./maintenance-provision-registered-user.js";

test("remote provisioning KV adapter maps only confirmed missing-key 404 responses to null", async () => {
  const kv = createRemoteKv("namespace-id", {
    run() {
      throw new Error(
        "Failed to fetch [https://api.cloudflare.com/client/v4/accounts/example/storage/kv/namespaces/namespace-id/values/operator_users%3Av1] - 404: Not Found",
      );
    },
  });

  assert.equal(await kv.get("operator_users:v1", "json"), null);
});

test("remote provisioning KV adapter preserves non-missing-key failures", async () => {
  for (const message of [
    "HTTP status 403: Authentication error",
    "Failed to fetch [https://api.cloudflare.com/client/v4/accounts/example/storage/kv/namespaces/namespace-id] - 404: Not Found",
    "network request failed",
  ]) {
    const kv = createRemoteKv("namespace-id", {
      run() {
        throw new Error(message);
      },
    });
    await assert.rejects(
      () => kv.get("operator_users:v1", "json"),
      (error) => error instanceof Error && error.message === message,
    );
  }
});
