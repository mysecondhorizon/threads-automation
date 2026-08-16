import { requireAdminSession } from "../middleware/auth.js";
import { html } from "../utils/response.js";

export async function handleMediaManagementPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;

  return html(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>미디어 운영 재고</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:1100px;margin:30px auto;padding:0 18px;background:#f6f7f9;color:#222}
    section{background:#fff;border:1px solid #ddd;border-radius:12px;padding:20px;margin:18px 0}
    form{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
    label{display:flex;flex-direction:column;gap:6px;font-size:14px} input,select,textarea,button{padding:10px;font:inherit}
    textarea{min-height:70px} .wide{grid-column:1/-1}.actions{display:flex;gap:8px;align-items:end}
    table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.card{padding:14px;background:#f1f5ff;border-radius:8px}
    .value{font-size:24px;font-weight:bold}.ok{color:#087a37}.error{color:#b00020}code{word-break:break-all}
  </style>
</head>
<body>
  <h1>미디어 및 주간 운영 재고</h1>
  <p><a href="/admin/post">게시 관리</a> · <a href="/admin/products-page">제품 관리</a></p>

  <section>
    <h2>Batch Media Upload</h2>
    <p>최대 50개, 파일당 8MB. JPEG/PNG/WebP. CSV가 있으면 파일명 기준으로 기본값을 덮어씁니다.</p>
    <form id="upload-form">
      <label class="wide">이미지 파일<input type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple required></label>
      <label>CSV manifest<input type="file" name="manifest" accept=".csv,text/csv"></label>
      <label>기본 구분<select name="sourceType"><option value="general">general</option><option value="product">product</option></select></label>
      <label>기본 productId<input name="productId"></label>
      <label>기본 altText<input name="altText"></label>
      <label>기본 tags (| 구분)<input name="tags"></label>
      <label>기본 topics (| 구분)<input name="topics"></label>
      <label>priority<input name="priority" type="number" min="0" value="0"></label>
      <label>maxUses<input name="maxUses" type="number" min="1" value="1"></label>
      <label>cooldownDays<input name="cooldownDays" type="number" min="0" value="0"></label>
      <label class="wide">기본 description<textarea name="description"></textarea></label>
      <label><span>Content Pool 자동 생성</span><select name="createPoolItems"><option value="true">예</option><option value="false">아니오</option></select></label>
      <div class="actions"><button type="submit">일괄 업로드</button></div>
    </form>
    <p>CSV 필드: fileName, sourceType, productId, altText, description, tags, topics, allowedContentTypes, priority, maxUses, cooldownDays</p>
    <pre id="upload-result"></pre>
  </section>

  <section>
    <h2>이번 주 재고</h2>
    <div class="actions"><label>다음 7일 예상 Cron 횟수<input id="expected" type="number" min="0" value="21"></label><button id="refresh">전체 새로고침</button></div>
    <div id="inventory" class="cards"></div>
  </section>

  <section><h2>Media Library</h2><div id="media"></div></section>
  <section><h2>Content Pool</h2><div id="pool"></div></section>

<script>
const esc=(value)=>String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(url,options={}){const response=await fetch(url,options);const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"요청 실패");return data}
function table(headers,rows){return '<div style="overflow:auto"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>'}
async function loadMedia(){const data=await api('/admin/media');document.querySelector('#media').innerHTML=table(['구분','파일','설명','태그','사용','상태','관리'],data.media.map(m=>'<tr><td>'+esc(m.sourceType)+(m.productId?'<br>'+esc(m.productId):'')+'</td><td><code>'+esc(m.objectKey)+'</code></td><td>'+esc(m.altText)+'<br>'+esc(m.description)+'</td><td>'+esc((m.tags||[]).join(', '))+'</td><td>'+esc(m.usedCount)+' / '+esc(m.maxUses??'∞')+'<br>cooldown '+esc(m.cooldownDays)+'</td><td>'+esc(m.active?'active':'inactive')+'</td><td><button data-media="'+esc(m.id)+'" data-active="'+(!m.active)+'">'+(m.active?'비활성화':'활성화')+'</button></td></tr>'))}
async function loadPool(){const data=await api('/admin/content-pool');document.querySelector('#pool').innerHTML=table(['유형','mediaIds','topics','우선순위','사용','기간/cooldown','상태','관리'],data.items.map(i=>'<tr><td>'+esc(i.type)+(i.productId?'<br>'+esc(i.productId):'')+'</td><td>'+esc(i.mediaIds.join(', '))+'</td><td>'+esc(i.topics.join(', '))+'</td><td>'+esc(i.priority)+'</td><td>'+esc(i.usedCount)+' / '+esc(i.maxUses)+'</td><td>'+esc(i.availableFrom||'-')+' ~ '+esc(i.availableUntil||'-')+'<br>'+esc(i.cooldownDays)+'일</td><td>'+esc(i.active?'active':'inactive')+'</td><td><button data-pool="'+esc(i.id)+'" data-active="'+(!i.active)+'">'+(i.active?'비활성화':'활성화')+'</button></td></tr>'))}
async function loadInventory(){const count=document.querySelector('#expected').value;const data=await api('/admin/media-inventory?expectedPostCount='+encodeURIComponent(count));const i=data.inventory;const values=[['general media',i.availableGeneralMediaCount],['product media',i.availableProductMediaCount],['active products',i.activeProductCount],['affiliate products',i.affiliateLinkProductCount],['active pool',i.activeContentPoolItemCount],['available pool',i.availableContentPoolItemCount],['expected posts',i.expectedPostCount],['coverage',i.coverageRatio+'%']];document.querySelector('#inventory').innerHTML=values.map(v=>'<div class="card"><div>'+esc(v[0])+'</div><div class="value">'+esc(v[1])+'</div></div>').join('')}
async function refresh(){try{await Promise.all([loadMedia(),loadPool(),loadInventory()])}catch(error){alert(error.message)}}
document.querySelector('#upload-form').addEventListener('submit',async(event)=>{event.preventDefault();const output=document.querySelector('#upload-result');output.textContent='업로드 중...';try{const data=await api('/admin/media/batch',{method:'POST',body:new FormData(event.target)});output.textContent=JSON.stringify(data,null,2);await refresh()}catch(error){output.textContent=error.message;output.className='error'}});
document.body.addEventListener('click',async(event)=>{const button=event.target.closest('button[data-media],button[data-pool]');if(!button)return;try{if(button.dataset.media)await api('/admin/media',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:button.dataset.media,active:button.dataset.active==='true'})});else await api('/admin/content-pool',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:button.dataset.pool,active:button.dataset.active==='true'})});await refresh()}catch(error){alert(error.message)}});
document.querySelector('#refresh').addEventListener('click',refresh);refresh();
</script>
</body></html>`);
}
