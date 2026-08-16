import { requireAdminSession } from "../middleware/auth.js";
import { html } from "../utils/response.js";

export async function handleProductReviewPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;

  return html(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>제품글 테스트와 검수</title>
<style>
body{font-family:Arial,sans-serif;max-width:1000px;margin:36px auto;padding:0 18px;background:#f7f7f7;color:#222}
a{color:#3157c8}.toolbar,.card{background:#fff;border:1px solid #ddd;border-radius:12px;padding:16px;margin:14px 0}
button,select,textarea{font:inherit;padding:9px}textarea{width:100%;min-height:160px;box-sizing:border-box}
.meta{color:#666;font-size:14px}.pending{border-left:5px solid #e3a008}.published{opacity:.7}
</style></head><body>
<p><a href="/admin/dashboard">대시보드</a> · <a href="/admin/products-page">제품 관리</a></p>
<h1>제품글 테스트 / 검수</h1>
<p>후보 생성은 Threads에 게시하지 않습니다. 검수한 뒤 각 후보의 게시 버튼을 눌러야 게시됩니다.</p>
<section class="toolbar"><label>제품 <select id="product"><option value="">자동 선택</option></select></label>
<button id="generate">제품글 후보 생성</button> <span id="status"></span></section>
<main id="candidates"></main>
<script>
const statusEl=document.getElementById('status');
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function api(url,options){const response=await fetch(url,options);const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error||data.message||'요청 실패');return data.data||data;}
function renderCandidate(candidate){const disabled=candidate.status!=='pending_review';return '<article class="card '+(disabled?'published':'pending')+'"><div class="meta">'+escapeHtml(candidate.productName)+' · '+escapeHtml(candidate.status)+' · '+escapeHtml(new Date(candidate.createdAt).toLocaleString('ko-KR'))+'</div><textarea id="text-'+candidate.id+'">'+escapeHtml(candidate.text)+'</textarea><div class="meta">첫 댓글(고정):<pre>'+escapeHtml(candidate.firstComment)+'</pre></div><button '+(disabled?'disabled':'')+' onclick="publishCandidate(\''+candidate.id+'\')">검수 완료 후 게시</button></article>';}
async function load(){const data=await api('/admin/product-reviews');const select=document.getElementById('product');select.innerHTML='<option value="">자동 선택</option>'+data.products.map((p)=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.name)+'</option>').join('');document.getElementById('candidates').innerHTML=data.candidates.map(renderCandidate).join('')||'<p>생성된 후보가 없습니다.</p>';}
document.getElementById('generate').onclick=async()=>{statusEl.textContent='생성 중...';try{await api('/admin/product-reviews',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:document.getElementById('product').value||null})});statusEl.textContent='후보를 저장했습니다.';await load();}catch(error){statusEl.textContent=error.message;}};
window.publishCandidate=async(id)=>{if(!confirm('검수한 제품글을 Threads에 게시할까요?'))return;statusEl.textContent='게시 중...';try{const text=document.getElementById('text-'+id).value;const result=await api('/admin/auto-post/publish-reviewed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({candidateId:id,text})});statusEl.textContent=result.firstComment?.published===false?'본문은 게시됐지만 제휴 링크 첫 댓글 게시에 실패했습니다.':'게시했습니다.';await load();}catch(error){statusEl.textContent=error.message;}};
load().catch((error)=>{statusEl.textContent=error.message;});
</script></body></html>`);
}
