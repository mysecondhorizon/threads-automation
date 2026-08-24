import { requireAdminSession } from "../middleware/auth.js";
import { renderAppShell } from "./app-shell.js";
import { buildProductsClientScript } from "./app-products-client.js";

export async function handleAppProductsPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;
  return renderAppShell({
    activePath: "/app/products",
    title: "제품",
    description: "제품 정보와 게시 링크를 관리합니다.",
    content: `<div class="app-media-layout">
      <section class="app-media-panel"><h2>제품 정보</h2><p class="app-media-copy">인식 결과를 검토한 뒤 저장하세요. 링크는 나중에 등록할 수 있습니다.</p><form id="operator-product-form" class="app-media-edit-form"><label>제품명<input name="name" required></label><label>제품군<input name="category" required></label><label>설명<textarea name="description"></textarea></label><label>제품 링크<input name="link" type="url" placeholder="https://..."></label><label><input name="active" type="checkbox" checked> 활성</label><button class="app-media-button primary" type="submit">저장</button></form></section>
      <section class="app-media-panel"><h2>제품 이미지</h2><p class="app-media-copy">제품 이미지를 업로드하면 AI가 제품 정보를 분석할 수 있습니다.</p><form id="operator-product-media-upload-form" class="app-media-upload-form"><input id="product-media-files" name="files" type="file" accept="image/jpeg,image/png,image/webp" multiple required><button id="operator-product-media-upload" class="app-media-button" type="submit">이미지 업로드</button></form><p id="operator-product-media-status" class="app-media-feedback"></p><div id="operator-product-media-list" class="app-media-list"></div></section>
      <section><h2>제품 목록</h2><p id="operator-products-status" class="app-media-list-feedback"></p><div id="operator-products-list" class="app-media-list"></div></section></div><script>${buildProductsClientScript()}</script>`,
  });
}
