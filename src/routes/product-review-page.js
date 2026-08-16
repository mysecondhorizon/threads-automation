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
.mode{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px}.product-picker{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.meta{color:#666;font-size:14px}.pending{border-left:5px solid #e3a008}.published{opacity:.7}.preview{margin:14px 0}.comment{background:#f4f6f8;border-radius:8px;padding:12px}.comment pre{white-space:pre-wrap;word-break:break-word;margin:8px 0 0}
</style></head><body>
<p><a href="/admin/dashboard">대시보드</a> · <a href="/admin/products-page">제품 관리</a></p>
<h1>제품글 테스트 / 검수</h1>
<p>후보 생성은 Threads에 게시하지 않습니다. 검수한 뒤 각 후보의 게시 버튼을 눌러야 게시됩니다.</p>
<section class="toolbar">
<div class="mode"><label><input type="radio" name="selection-mode" value="auto" checked> 자동선택</label><label><input type="radio" name="selection-mode" value="direct"> 직접선택</label></div>
<div class="product-picker"><label>제품 <select id="product" disabled><option value="">제품을 선택하세요</option></select></label><button id="generate">제품글 후보 생성</button> <span id="status"></span></div>
<p id="product-help" class="meta">자동선택은 기존 방식대로 사용 가능한 제품을 고릅니다.</p>
</section>
<main id="candidates"></main>
<script>
const statusEl=document.getElementById('status');
const productSelect=document.getElementById('product');
const productHelp=document.getElementById('product-help');
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function api(url,options){const response=await fetch(url,options);const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error||data.message||'요청 실패');return data.data||data;}
function renderCandidate(candidate){const disabled=candidate.status!=='pending_review';return '<article class="card '+(disabled?'published':'pending')+'"><div class="meta">'+escapeHtml(candidate.productName)+' · '+escapeHtml(candidate.status)+' · '+escapeHtml(new Date(candidate.createdAt).toLocaleString('ko-KR'))+'</div><section class="preview"><strong>본문 · 제품 경험 글</strong><textarea id="text-'+candidate.id+'">'+escapeHtml(candidate.text)+'</textarea></section><section class="preview comment"><strong>첫 댓글 · 서버 고정</strong><div class="meta">Topic: '+escapeHtml(candidate.firstCommentTopicTag||'없음')+'</div><pre>'+escapeHtml(candidate.firstComment)+'</pre></section><button '+(disabled?'disabled':'')+' data-candidate-id="'+escapeHtml(candidate.id)+'">검수 완료 후 게시</button></article>';}
function getSelectionMode(){return document.querySelector('input[name="selection-mode"]:checked').value;}
function syncSelectionMode(){const direct=getSelectionMode()==='direct';productSelect.disabled=!direct;productHelp.textContent=direct?'활성 제품 중 후보를 만들 제품을 직접 선택하세요.':'자동선택은 기존 방식대로 사용 가능한 제품을 고릅니다.';}
async function load(){const data=await api('/admin/product-reviews');const selected=productSelect.value;productSelect.innerHTML='<option value="">제품을 선택하세요</option>'+data.products.map((p)=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.name)+(p.category?' · '+escapeHtml(p.category):'')+(p.eligible?'':' (제품글 정보 확인 필요)')+'</option>').join('');if(data.products.some((p)=>p.id===selected))productSelect.value=selected;document.getElementById('candidates').innerHTML=data.candidates.map(renderCandidate).join('')||'<p>생성된 후보가 없습니다.</p>';}
document.querySelectorAll('input[name="selection-mode"]').forEach((input)=>input.addEventListener('change',syncSelectionMode));
document.getElementById('generate').onclick=async()=>{const selectionMode=getSelectionMode();const productId=selectionMode==='direct'?productSelect.value:null;if(selectionMode==='direct'&&!productId){statusEl.textContent='직접선택할 제품을 골라주세요.';return;}statusEl.textContent='생성 중...';try{const data=await api('/admin/product-reviews',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({selectionMode,productId})});statusEl.textContent='후보를 저장했습니다: '+data.candidate.productName;await load();}catch(error){statusEl.textContent=error.message;}};
async function publishCandidate(id){if(!confirm('검수한 제품글을 Threads에 게시할까요?'))return;statusEl.textContent='게시 중...';try{const text=document.getElementById('text-'+id).value;const result=await api('/admin/auto-post/publish-reviewed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({candidateId:id,text})});statusEl.textContent=result.firstComment?.published===false?'본문은 게시됐지만 제휴 링크 첫 댓글 게시에 실패했습니다.':'게시했습니다.';await load();}catch(error){statusEl.textContent=error.message;}};
document.getElementById('candidates').addEventListener('click',(event)=>{const button=event.target.closest('[data-candidate-id]');if(!button)return;publishCandidate(button.dataset.candidateId);});
syncSelectionMode();load().catch((error)=>{statusEl.textContent=error.message;});
</script></body></html>`);
}
