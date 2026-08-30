import { requireAdminSession } from "../middleware/auth.js";
import { renderAppShell } from "./app-shell.js";
import { buildProductsClientScript } from "./app-products-client.js";

function renderProductsPageContent() {
  return `<style>
    .app-products-layout { display:grid; grid-template-columns:minmax(0, .95fr) minmax(360px, 1.05fr); gap:28px; align-items:start; }
    .app-products-panel { padding:24px; border:1px solid #e2e6ec; border-radius:14px; background:#fff; }
    .app-products-panel.full { grid-column:1 / -1; }
    .app-products-panel-header, .app-products-list-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; }
    .app-products-panel h2 { margin:0 0 8px; color:#1d2433; font-size:20px; letter-spacing:-.02em; }
    .app-products-panel-header h2, .app-products-list-header h2 { margin:0; }
    .app-products-copy, .app-products-feedback, .app-products-list-feedback { margin:0; color:#667085; line-height:1.6; }
    .app-products-form { display:grid; gap:20px; }
    .app-products-section { display:grid; gap:12px; }
    .app-products-section + .app-products-section { padding-top:20px; border-top:1px solid #e2e6ec; }
    .app-products-section h3 { margin:0; color:#344054; font-size:15px; }
    .app-products-fields { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; }
    .app-products-label { display:grid; gap:7px; color:#344054; font-size:14px; font-weight:700; }
    .app-products-input, .app-products-textarea { width:100%; box-sizing:border-box; border:1px solid #cfd6e2; border-radius:8px; background:#fff; color:#1d2433; font:inherit; padding:10px 11px; }
    .app-products-textarea { min-height:124px; resize:vertical; line-height:1.6; }
    .app-products-toggle { display:flex; align-items:center; gap:9px; color:#344054; font-size:14px; font-weight:700; }
    .app-products-actions, .app-products-card-actions { display:flex; flex-wrap:wrap; gap:8px; }
    .app-products-button { border:1px solid #cfd6e2; border-radius:8px; background:#fff; color:#344054; cursor:pointer; font:inherit; font-weight:700; padding:9px 13px; }
    .app-products-button:hover { background:#f7f8fa; }
    .app-products-button:disabled { cursor:wait; opacity:.65; }
    .app-products-button.primary { border-color:#294d9a; background:#294d9a; color:#fff; }
    .app-products-feedback { min-height:22px; font-size:14px; }
    .app-products-feedback.success { color:#067647; } .app-products-feedback.error { color:#b42318; }
    .app-products-upload-form { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
    .app-products-file { max-width:100%; }
    .app-products-media-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; margin-top:16px; }
    .app-products-media-card { overflow:hidden; border:1px solid #e2e6ec; border-radius:10px; background:#fff; }
    .app-products-media-preview { display:block; width:100%; aspect-ratio:4 / 3; background:#eef1f5; object-fit:cover; }
    .app-products-media-content { display:grid; gap:10px; padding:12px; }
    .app-products-media-description { display:-webkit-box; overflow:hidden; margin:0; color:#475467; font-size:13px; line-height:1.5; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
    .app-products-media-hints { display:grid; gap:10px; margin-top:12px; }
    .app-products-media-hints label { display:grid; gap:6px; color:#344054; font-size:14px; font-weight:700; }
    .app-products-media-hints input, .app-products-media-hints textarea { width:100%; box-sizing:border-box; border:1px solid #cfd6e2; border-radius:8px; font:inherit; padding:9px; }
    .app-products-media-hints textarea { min-height:76px; resize:vertical; }
    .app-products-media-hints p { margin:0; color:#667085; font-size:13px; line-height:1.5; }
    .app-products-list { display:grid; gap:12px; }
    .app-products-card { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:18px; padding:18px; border:1px solid #e2e6ec; border-radius:12px; background:#fff; }
    .app-products-card.is-inactive { background:#fcfcfd; }
    .app-products-card h3 { margin:0; color:#1d2433; font-size:17px; }
    .app-products-card-title { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
    .app-products-badges { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
    .app-products-badge { border-radius:999px; background:#eef2f6; color:#475467; font-size:12px; font-weight:700; padding:4px 8px; }
    .app-products-badge.good { background:#ecfdf3; color:#067647; } .app-products-badge.muted { background:#f2f4f7; color:#667085; }
    .app-products-description { display:-webkit-box; overflow:hidden; margin:12px 0 0; color:#475467; line-height:1.6; white-space:pre-wrap; word-break:break-word; -webkit-box-orient:vertical; -webkit-line-clamp:3; }
    .app-products-card-actions { align-content:start; justify-content:flex-end; }
    .app-products-external-link { align-self:center; color:#175cd3; font-size:14px; font-weight:700; text-decoration:none; }
    .app-products-external-link:hover { text-decoration:underline; }
    @media (max-width:900px) { .app-products-layout { grid-template-columns:1fr; } .app-products-panel.full { grid-column:auto; } }
    @media (max-width:600px) { .app-products-panel { padding:18px; } .app-products-fields, .app-products-media-grid { grid-template-columns:1fr; } .app-products-panel-header, .app-products-list-header, .app-products-card { grid-template-columns:1fr; display:grid; } .app-products-card-actions { justify-content:flex-start; } }
  </style>
  <div class="app-products-layout">
    <section class="app-products-panel" aria-labelledby="product-editor-heading">
      <div class="app-products-panel-header">
        <div><h2 id="product-editor-heading">제품 추가</h2><p id="operator-product-editor-copy" class="app-products-copy">제품의 기본 정보와 게시 링크 사용 여부를 입력하세요.</p></div>
        <button id="operator-product-new" class="app-products-button" type="button">제품 추가</button>
      </div>
      <form id="operator-product-form" class="app-products-form">
        <section class="app-products-section" aria-labelledby="product-basic-heading">
          <h3 id="product-basic-heading">기본 정보</h3>
          <div class="app-products-fields">
            <label class="app-products-label">제품명<input class="app-products-input" name="name" autocomplete="off" required></label>
            <label class="app-products-label">제품군<input class="app-products-input" name="category" autocomplete="off" required></label>
          </div>
          <label class="app-products-label">제품 설명<textarea class="app-products-textarea" name="description" placeholder="제품의 특징과 용도를 기록하세요."></textarea></label>
        </section>
        <section class="app-products-section" aria-labelledby="product-link-heading">
          <h3 id="product-link-heading">링크 및 사용 상태</h3>
          <label class="app-products-label">제품 링크<input class="app-products-input" name="link" type="url" inputmode="url" placeholder="https://..."></label>
          <label class="app-products-toggle"><input name="active" type="checkbox" checked> 자동 게시 후보에 포함</label>
        </section>
        <div class="app-products-actions"><button id="operator-product-save" class="app-products-button primary" type="submit">제품 저장</button><button id="operator-product-cancel" class="app-products-button" type="button">입력 초기화</button></div>
        <p id="operator-product-form-status" class="app-products-feedback" role="status" aria-live="polite"></p>
      </form>
    </section>
    <section class="app-products-panel" aria-labelledby="product-media-heading">
      <h2 id="product-media-heading">제품 에셋</h2>
      <p class="app-products-copy">여기서 업로드한 이미지와 동영상은 제품용 에셋으로 관리됩니다. Daily 에셋과는 별도로 관리됩니다.</p>
      <form id="operator-product-media-upload-form" class="app-products-upload-form" style="margin-top:16px;"><input id="product-media-files" class="app-products-file" name="files" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple required><button id="operator-product-media-upload" class="app-products-button primary" type="submit">에셋 업로드</button></form>
      <div class="app-products-media-hints">
        <label>&#52404;&#54744; &#53468;&#44536; <input id="product-media-experience-tags" name="experienceTags" form="operator-product-media-upload-form" type="text" placeholder="&#52636;&#44540;&#44592;, &#48708; &#50724;&#45716; &#45216;, &#50724;&#47000; &#44152;&#51020;"></label>
        <label>&#52404;&#54744; &#47700;&#47784; <textarea id="product-media-experience-note" name="experienceNote" form="operator-product-media-upload-form" placeholder="&#49324;&#50857; &#49345;&#54889;&#44284; &#51665;&#51217; &#44221;&#54744;&#51012; &#44036;&#45800;&#55176; &#51201;&#50612; &#51452;&#49464;&#50836."></textarea></label>
        <p>&#46160; &#54637;&#47785;&#51008; &#49440;&#53469; &#51077;&#47141;&#51077;&#45768;&#45796;. &#49440;&#53469;&#54620; &#47784;&#46304; &#51060;&#48120;&#51648;&#50752; &#46041;&#50689;&#49345;&#50640; &#46041;&#51068;&#54616;&#44172; &#51201;&#50857;&#46121;&#45768;&#45796;.</p>
      </div>
      <p id="operator-product-media-status" class="app-products-feedback" role="status" aria-live="polite"></p>
      <div id="operator-product-media-list" class="app-products-media-grid"></div>
    </section>
    <section class="app-products-panel full" aria-labelledby="products-list-heading">
      <div class="app-products-list-header"><div><h2 id="products-list-heading">제품 목록</h2><p class="app-products-copy">자동 게시에 사용할 수 있는 제품과 링크 상태를 한눈에 확인하세요.</p></div><button id="operator-products-refresh" class="app-products-button" type="button">새로고침</button></div>
      <p id="operator-products-status" class="app-products-list-feedback" role="status" aria-live="polite">제품을 불러오는 중...</p>
      <div id="operator-products-list" class="app-products-list"></div>
    </section>
  </div><script>${buildProductsClientScript()}</script>`;
}

export async function handleAppProductsPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;
  return renderAppShell({
    activePath: "/app/products",
    title: "제품",
    description: "제품 정보, 게시 링크, 제품용 이미지를 관리합니다.",
    content: renderProductsPageContent(),
  });
}
