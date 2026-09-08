import { requireAdminSession } from "../middleware/auth.js";
import { resolveCurrentAppContext } from "../services/app-context.js";
import { DEFAULT_WORKSPACE_ID } from "../services/workspace-foundation.js";
import { renderAppShell, renderAppWorkspaceUnavailable } from "./app-shell.js";

function renderProductsPageContent() {
  return `<style>
    .opportunities-layout{display:grid;gap:22px;max-width:1000px}.opportunities-toolbar,.opportunity-form,.opportunity-card{padding:18px;border:1px solid #e2e6ec;border-radius:14px;background:#fff}.opportunities-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.opportunities-toolbar select,.opportunity-form input,.opportunity-form textarea,.opportunity-form select{border:1px solid #cfd6e2;border-radius:8px;font:inherit;padding:9px}.opportunities-toolbar select{min-width:150px}.opportunity-form{display:grid;gap:13px}.opportunity-form[hidden]{display:none}.opportunity-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.opportunity-form label{display:grid;gap:6px;color:#344054;font-size:14px;font-weight:700}.opportunity-form textarea{min-height:78px;resize:vertical}.opportunity-form .wide{grid-column:1 / -1}.opportunity-actions{display:flex;flex-wrap:wrap;gap:8px}.opportunity-button{border:1px solid #cfd6e2;border-radius:8px;background:#fff;color:#344054;cursor:pointer;font:inherit;font-weight:700;padding:9px 13px}.opportunity-button.primary{border-color:#294d9a;background:#294d9a;color:#fff}.opportunity-button.danger{border-color:#f2c7c3;color:#b42318}.opportunity-list{display:grid;gap:12px}.opportunity-card{display:grid;gap:10px}.opportunity-card h2{margin:0;font-size:18px}.opportunity-meta,.opportunity-detail,.opportunity-feedback{margin:0;color:#667085;font-size:14px;line-height:1.55}.opportunity-details{display:grid;gap:5px}.opportunity-feedback[data-state="error"]{color:#b42318}.opportunity-feedback[data-state="success"]{color:#067647}@media(max-width:650px){.opportunity-form-grid{grid-template-columns:1fr}}
  </style>
  <section class="opportunities-layout" aria-label="Product Opportunities">
    <div class="opportunities-toolbar">
      <button id="opportunity-create" class="opportunity-button primary" type="button">새 기회 추가</button>
      <label>상태 <select id="opportunity-status-filter"><option value="">전체</option><option value="DISCOVERED">발견</option><option value="RECOMMENDED">추천</option><option value="APPROVED">승인</option><option value="READY">준비</option><option value="USED">사용</option><option value="REJECTED">거절</option><option value="ARCHIVED">보관</option></select></label>
      <p id="opportunity-count" class="opportunity-feedback"></p>
    </div>
    <form id="opportunity-form" class="opportunity-form" hidden>
      <h2 id="opportunity-form-title">새 제품 기회</h2>
      <div class="opportunity-form-grid">
        <label>제품명 <input name="productName" required></label><label>카테고리 <input name="category" required></label>
        <label>상태 <select name="status" required><option value="DISCOVERED">발견</option><option value="RECOMMENDED">추천</option><option value="APPROVED">승인</option><option value="READY">준비</option><option value="USED">사용</option><option value="REJECTED">거절</option><option value="ARCHIVED">보관</option></select></label><label>브랜드 <input name="brand"></label>
        <label>출처 URL <input name="sourceUrl" type="url"></label><label>제휴 URL <input name="affiliateLink" type="url"></label>
        <label class="wide">문제 <textarea name="problem"></textarea></label><label>대상 <textarea name="audience"></textarea></label><label>상황 <textarea name="situation"></textarea></label><label class="wide">각도 <textarea name="angle"></textarea></label><label class="wide">발견 이유 <textarea name="discoveryReason"></textarea></label><label class="wide">신호 출처 <textarea name="signalSources" placeholder="한 줄에 하나 또는 쉼표로 구분"></textarea></label>
        <label>트렌드 점수 <input name="trendScore" type="number" min="0" max="100" step="any"></label><label>페르소나 적합도 <input name="personaFitScore" type="number" min="0" max="100" step="any"></label><label>구매 의도 <input name="purchaseIntentScore" type="number" min="0" max="100" step="any"></label><label>콘텐츠 가능성 <input name="contentPotentialScore" type="number" min="0" max="100" step="any"></label><label>경험 가능성 <input name="experiencePotentialScore" type="number" min="0" max="100" step="any"></label><label>제휴 가능성 <input name="affiliatePotentialScore" type="number" min="0" max="100" step="any"></label><label>기회 점수 <input name="opportunityScore" type="number" min="0" max="100" step="any"></label>
      </div>
      <div class="opportunity-actions"><button class="opportunity-button primary" type="submit">저장</button><button id="opportunity-cancel" class="opportunity-button" type="button">취소</button></div>
      <p id="opportunity-form-feedback" class="opportunity-feedback" role="status" aria-live="polite"></p>
    </form>
    <section><h2>제품 기회</h2><p id="opportunity-feedback" class="opportunity-feedback" role="status" aria-live="polite">불러오는 중…</p><div id="opportunity-list" class="opportunity-list"></div></section>
  </section>
  <script>${buildProductOpportunitiesClientScript()}</script>`;
}

export function buildProductOpportunitiesClientScript() {
  return `(() => {
    const list=document.querySelector('#opportunity-list'),feedback=document.querySelector('#opportunity-feedback'),count=document.querySelector('#opportunity-count'),filter=document.querySelector('#opportunity-status-filter'),create=document.querySelector('#opportunity-create'),form=document.querySelector('#opportunity-form'),formTitle=document.querySelector('#opportunity-form-title'),formFeedback=document.querySelector('#opportunity-form-feedback'),cancel=document.querySelector('#opportunity-cancel');
    const statuses={DISCOVERED:'발견',RECOMMENDED:'추천',APPROVED:'승인',READY:'준비',USED:'사용',REJECTED:'거절',ARCHIVED:'보관'};const scoreFields=['trendScore','personaFitScore','purchaseIntentScore','contentPotentialScore','experiencePotentialScore','affiliatePotentialScore','opportunityScore'];let opportunities=[],editingId=null;
    async function api(url,options){const response=await fetch(url,options);let data;try{data=await response.json()}catch{throw new Error('요청을 처리하지 못했습니다.')}if(!response.ok||data.ok===false)throw new Error(data.error||'요청을 처리하지 못했습니다.');return data}
    function request(method,payload){return {method,headers:{'content-type':'application/json'},body:JSON.stringify(payload)}}
    function addLine(parent,label,value){if(value===null||value===undefined||value==='')return;const line=document.createElement('p');line.className='opportunity-detail';line.textContent=label+': '+value;parent.append(line)}
    function formValue(name,value){const field=form.elements[name];if(!field)return;field.value=value===null||value===undefined?'':String(value)}
    function openForm(opportunity){editingId=opportunity?.id||null;form.reset();form.hidden=false;formTitle.textContent=editingId?'제품 기회 편집':'새 제품 기회';formFeedback.textContent='';if(!opportunity)return;for(const name of ['productName','category','status','brand','sourceUrl','affiliateLink','problem','audience','situation','angle','discoveryReason'])formValue(name,opportunity[name]);formValue('signalSources',Array.isArray(opportunity.signalSources)?opportunity.signalSources.join('\n'):'');for(const name of scoreFields)formValue(name,opportunity[name]);form.scrollIntoView({block:'start',behavior:'smooth'})}
    function payload(){const value={};for(const name of ['productName','category','status','brand','sourceUrl','affiliateLink','problem','audience','situation','angle','discoveryReason'])value[name]=form.elements[name].value;value.signalSources=form.elements.signalSources.value.split(/[\n,]/u).map((item)=>item.trim()).filter(Boolean);for(const name of scoreFields){const raw=form.elements[name].value.trim();value[name]=raw===''?null:Number(raw)}return value}
    function render(){list.replaceChildren();const visible=opportunities.filter((item)=>!filter.value||item.status===filter.value);count.textContent='총 '+visible.length+'개';if(!visible.length){feedback.textContent='표시할 제품 기회가 없습니다.';return}feedback.textContent='';for(const opportunity of visible){const card=document.createElement('article');card.className='opportunity-card';const title=document.createElement('h2');title.textContent=opportunity.productName;const meta=document.createElement('p');meta.className='opportunity-meta';meta.textContent=[opportunity.brand,opportunity.category,statuses[opportunity.status]||opportunity.status,opportunity.opportunityScore===null||opportunity.opportunityScore===undefined?'':('점수 '+opportunity.opportunityScore)].filter(Boolean).join(' · ');const details=document.createElement('div');details.className='opportunity-details';addLine(details,'문제',opportunity.problem);addLine(details,'대상',opportunity.audience);addLine(details,'상황',opportunity.situation);addLine(details,'각도',opportunity.angle);addLine(details,'발견 이유',opportunity.discoveryReason);addLine(details,'업데이트',opportunity.updatedAt||opportunity.createdAt);addLine(details,'사용 횟수',Number.isInteger(opportunity.useCount)?opportunity.useCount:null);addLine(details,'최근 사용',opportunity.lastUsedAt);const actions=document.createElement('div');actions.className='opportunity-actions';const edit=document.createElement('button');edit.type='button';edit.className='opportunity-button';edit.textContent='편집';edit.addEventListener('click',()=>openForm(opportunity));const remove=document.createElement('button');remove.type='button';remove.className='opportunity-button danger';remove.textContent='삭제';remove.addEventListener('click',async()=>{if(!window.confirm('이 제품 기회를 삭제할까요?'))return;try{await api('/api/product-opportunities/'+encodeURIComponent(opportunity.id),{method:'DELETE'});await load()}catch(error){feedback.textContent=error.message;feedback.dataset.state='error'}});actions.append(edit,remove);card.append(title,meta,details,actions);list.append(card)}}
    async function load(){feedback.dataset.state='';feedback.textContent='불러오는 중…';try{opportunities=(await api('/api/product-opportunities')).opportunities||[];render()}catch(error){opportunities=[];list.replaceChildren();count.textContent='';feedback.textContent=error.message;feedback.dataset.state='error'}}
    create.addEventListener('click',()=>openForm(null));cancel.addEventListener('click',()=>{form.hidden=true;editingId=null;formFeedback.textContent=''});filter.addEventListener('change',render);form.addEventListener('submit',async(event)=>{event.preventDefault();const save=form.querySelector('button[type="submit"]');save.disabled=true;formFeedback.dataset.state='';formFeedback.textContent='저장 중…';try{const data=await api(editingId?'/api/product-opportunities/'+encodeURIComponent(editingId):'/api/product-opportunities',request(editingId?'PATCH':'POST',payload()));form.hidden=true;editingId=null;formFeedback.textContent='';await load();if(data.opportunity)feedback.textContent='저장했습니다.';feedback.dataset.state='success'}catch(error){formFeedback.textContent=error.message;formFeedback.dataset.state='error'}finally{save.disabled=false}});load();
  })();`;
}

export async function handleAppProductsPage(request, env) {
  const auth = await requireAdminSession(request, env);
  if (!auth.ok) return auth.response;
  const appContext = await resolveCurrentAppContext(request, env);
  if (!auth.session.legacy && (
    !auth.session.selectedWorkspaceId ||
    (auth.session.selectedWorkspaceId !== DEFAULT_WORKSPACE_ID && !appContext?.currentWorkspace)
  )) {
    return renderAppWorkspaceUnavailable(appContext, "/app/products");
  }
  return renderAppShell({
    activePath: "/app/products",
    title: "제품 기회",
    description: "판매 가능성이 있는 제품·문제·상황별 기회를 관리합니다.",
    content: renderProductsPageContent(),
    appContext,
  });
}
