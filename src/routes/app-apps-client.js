export function appAppsClientScript() {
  return `<script>
(() => {
  const list = document.querySelector("#operator-app-list");
  const feedback = document.querySelector("#operator-app-feedback");
  const form = document.querySelector("#operator-app-create-form");
  const labels = { CONNECTED: "연결됨", NEEDS_ATTENTION: "확인 필요", NOT_CONFIGURED: "연결 설정 필요" };
  function setFeedback(message, isError = false) { feedback.textContent = message; feedback.dataset.state = isError ? "error" : "success"; }
  async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || "요청에 실패했습니다.");
    return data;
  }
  function text(value) { return document.createTextNode(value == null ? "" : String(value)); }
  function element(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value != null) node.append(text(value)); return node; }
  function render(apps) {
    list.replaceChildren();
    if (!apps.length) { list.append(element("p", "app-empty", "등록된 앱 연결이 없습니다.")); return; }
    for (const app of apps) {
      const card = element("article", "operator-app-card");
      const header = element("div", "operator-app-card-header");
      header.append(element("h2", "", app.name));
      header.append(element("span", "operator-app-status", labels[app.connectionStatus] || "확인 필요"));
      card.append(header);
      const detail = element("dl", "operator-app-details");
      for (const [label, value] of [["유형", app.type], ["운영 설정", app.active ? "사용" : "사용 안 함"]]) {
        detail.append(element("dt", "", label)); detail.append(element("dd", "", value));
      }
      card.append(detail);
      const controls = element("div", "operator-app-controls");
      const name = document.createElement("input"); name.type = "text"; name.value = app.name; name.maxLength = 120; name.setAttribute("aria-label", "앱 이름");
      const activeLabel = element("label", "operator-app-active"); const active = document.createElement("input"); active.type = "checkbox"; active.checked = app.active; activeLabel.append(active, text(" 운영 설정 사용"));
      const save = element("button", "app-media-button", "저장"); save.type = "button";
      save.onclick = async () => { try { save.disabled = true; await api("/api/apps/" + encodeURIComponent(app.id), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.value, active: active.checked }) }); setFeedback("앱 설정을 저장했습니다."); await load(); } catch (error) { setFeedback(error.message, true); } finally { save.disabled = false; } };
      controls.append(name, activeLabel, save);
      if (app.deletable) { const remove = element("button", "app-media-button danger", "삭제"); remove.type = "button"; remove.onclick = async () => { if (!confirm("이 앱 연결 설정을 삭제할까요?")) return; try { await api("/api/apps/" + encodeURIComponent(app.id), { method: "DELETE" }); setFeedback("앱 연결 설정을 삭제했습니다."); await load(); } catch (error) { setFeedback(error.message, true); } }; controls.append(remove); }
      card.append(controls); list.append(card);
    }
  }
  async function load() { try { const data = await api("/api/apps"); render(data.apps); } catch (error) { setFeedback(error.message, true); } }
  form.addEventListener("submit", async (event) => { event.preventDefault(); const submit = form.querySelector("button[type=submit]"); try { submit.disabled = true; await api("/api/apps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.elements.name.value, type: form.elements.type.value, active: form.elements.active.checked }) }); form.reset(); form.elements.active.checked = true; setFeedback("앱 연결 설정을 추가했습니다."); await load(); } catch (error) { setFeedback(error.message, true); } finally { submit.disabled = false; } });
  load();
})();
</script>`;
}
