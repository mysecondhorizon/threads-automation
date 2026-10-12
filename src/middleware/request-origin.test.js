import assert from "node:assert/strict";
import test from "node:test";
import { requireSameOriginPost } from "./request-origin.js";

test("mutation origin guard accepts exact origin POST with optional same-origin fetch metadata", () => {
  for (const site of [null, "same-origin"]) {
    const headers = { origin: "https://example.test" };
    if (site !== null) headers["sec-fetch-site"] = site;
    assert.equal(requireSameOriginPost(new Request("https://example.test/action", { method: "POST", headers })), null);
  }
});

test("mutation origin guard rejects absent, null, sibling, different port and malformed origins", () => {
  for (const origin of [null, "null", "https://other.test", "https://sub.example.test", "http://example.test", "https://example.test:444", "https://example.test/", "https://example.test/path", "https://example.test https://other.test"] ) {
    const headers = { referer: "https://example.test/page" };
    if (origin !== null) headers.origin = origin;
    const denied = requireSameOriginPost(new Request("https://example.test/action", { method: "POST", headers }));
    assert.equal(denied.status, 403, String(origin));
    assert.equal(denied.headers.get("cache-control"), "no-store");
  }
  for (const site of ["cross-site", "same-site", "none", "", "SAME-ORIGIN"]) {
    assert.equal(requireSameOriginPost(new Request("https://example.test/action", {
      method: "POST", headers: { origin: "https://example.test", "sec-fetch-site": site },
    })).status, 403);
  }
});

test("mutation origin guard rejects non-POST methods before origin validation", () => {
  for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const denied = requireSameOriginPost(new Request("https://example.test/action", { method }));
    assert.equal(denied.status, 405);
    assert.equal(denied.headers.get("allow"), "POST");
    assert.equal(denied.headers.get("cache-control"), "no-store");
  }
});
