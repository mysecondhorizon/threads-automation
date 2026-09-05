import assert from "node:assert/strict";
import { handleOperatorProductAnalyze } from "./api-product-analyze.js";

const env = (authenticated = true) => ({ THREADS_KV: { async get(key) { return authenticated && key === "admin_session:session-1" ? "valid" : null; } } });
const request = (body, authenticated = true) => new Request("https://x/api/products/analyze", { method: "POST", headers: { ...(authenticated ? { cookie: "admin_session=session-1" } : {}), "content-type": "application/json" }, body: JSON.stringify(body) });
assert.equal((await handleOperatorProductAnalyze(request({ mediaId: "m1" }, false), env(false))).status, 401);
const result = await handleOperatorProductAnalyze(request({ mediaId: "m1" }), env(), { recognize: async (_env, id, options) => { assert.equal(id, "m1"); assert.equal(options.workspaceId, "default-workspace"); return { name: "Product", category: "Office", description: "Description" }; } });
assert.deepEqual((await result.json()).product, { name: "Product", category: "Office", description: "Description" });
const recognized = (await (await handleOperatorProductAnalyze(request({ mediaId: "m1" }), env(), {
  recognize: async () => ({ name: "Product", category: "Office", description: "Description" }),
})).json()).product;
assert.equal(recognized.price, undefined); assert.equal(recognized.link, undefined);
assert.equal((await handleOperatorProductAnalyze(request({}), env())).status, 400);
console.log("product recognition API fixture passed");
