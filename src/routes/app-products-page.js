import { requireAdminSession } from "../middleware/auth.js";
import { renderAppShell } from "./app-shell.js";
import { buildProductsClientScript } from "./app-products-client.js";

export async function handleAppProductsPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;
  return renderAppShell({
    activePath: "/app/products",
    title: "\uC81C\uD488",
    description: "\uC81C\uD488 \uC815\uBCF4\uB97C \uAD00\uB9AC\uD558\uACE0 \uAC8C\uC2DC \uB9C1\uD06C\uB97C \uC124\uC815\uD569\uB2C8\uB2E4.",
    content: `<div class="app-media-layout">
      <section class="app-media-panel"><h2>\uC774\uBBF8\uC9C0\uB85C \uC81C\uD488 \uC778\uC2DD</h2><p class="app-media-copy">\uC81C\uD488 \uC774\uBBF8\uC9C0\uB97C \uBD84\uC11D\uD558\uBA74 \uC81C\uD488\uBA85, \uC81C\uD488\uAD70, \uC124\uBA85\uC744 \uC790\uB3D9\uC73C\uB85C \uC791\uC131\uD569\uB2C8\uB2E4.</p><form id="operator-product-analyze-form" class="app-media-upload-form"><input name="mediaId" required placeholder="Product media ID"><button class="app-media-button" type="submit">\uC81C\uD488 \uC778\uC2DD</button></form><p id="operator-product-analyze-status" class="app-media-feedback"></p></section>
      <section class="app-media-panel"><h2>\uC81C\uD488 \uCD94\uAC00</h2><p class="app-media-copy">\uC778\uC2DD \uACB0\uACFC\uB97C \uAC80\uD1A0\uD55C \uB4A4 \uC800\uC7A5\uD558\uC138\uC694. \uB9C1\uD06C\uB294 \uB098\uC911\uC5D0 \uB4F1\uB85D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p><form id="operator-product-form" class="app-media-edit-form"><label>\uC81C\uD488\uBA85<input name="name" required></label><label>\uC81C\uD488\uAD70<input name="category" required></label><label>\uC124\uBA85<textarea name="description"></textarea></label><label>\uC81C\uD488 \uB9C1\uD06C<input name="link" type="url" placeholder="https://..."></label><label><input name="active" type="checkbox" checked> \uD65C\uC131</label><button class="app-media-button primary" type="submit">\uC800\uC7A5</button></form></section>
      <section><h2>\uC81C\uD488 \uBAA9\uB85D</h2><p id="operator-products-status" class="app-media-list-feedback"></p><div id="operator-products-list" class="app-media-list"></div></section></div><script>${buildProductsClientScript()}</script>`,
  });
}
