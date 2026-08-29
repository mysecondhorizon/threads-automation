export function getPostSaveRequest({
  editingId,
  title,
  body,
  format,
  status,
  sourceType = "MANUAL",
  topicId = null,
  targetApp = null,
}) {
  return {
    url: editingId ? `/api/posts/${encodeURIComponent(editingId)}` : "/api/posts",
    method: editingId ? "PATCH" : "POST",
    payload: {
      title: String(title || "").trim() || null,
      body,
      format,
      status,
      sourceType: sourceType === "AI" ? "AI" : "MANUAL",
      topicId: typeof topicId === "string" && topicId.trim() ? topicId.trim() : null,
      targetApp: typeof targetApp === "string" && targetApp.trim() ? targetApp.trim() : null,
    },
  };
}

export function isFunctionalTargetApp(targetApp, apps) {
  const appId = targetApp === null || targetApp === undefined ? "threads-primary" : targetApp;
  const records = Array.isArray(apps) ? apps : [];
  const app = records.find((item) => item?.id === appId)
    || (appId === "threads-primary"
      ? { id: "threads-primary", name: "Second Horizon Threads", type: "THREADS" }
      : null);
  // The legacy credential compatibility foundation proves only this built-in
  // connection. Other THREADS registry records remain non-selectable until
  // they have a distinct, supported Connected Account implementation.
  return appId === "threads-primary" && app?.type === "THREADS";
}

export function getTargetAppOptions(apps) {
  const records = Array.isArray(apps) ? apps : [];
  const optionRecords = records.some((app) => app?.id === "threads-primary")
    ? [...records]
    : [{ id: "threads-primary", name: "Second Horizon Threads", type: "THREADS" }, ...records];
  if (!records.some((app) => app?.type === "WORDPRESS")) {
    optionRecords.push({ id: "wordpress-coming-soon", name: "WordPress", type: "WORDPRESS" });
  }
  if (!records.some((app) => app?.type === "CUSTOM_API")) {
    optionRecords.push({ id: "custom-api-coming-soon", name: "Custom API", type: "CUSTOM_API" });
  }

  const options = [];
  const seenIds = new Set();
  for (const app of optionRecords) {
    if (!app || typeof app.id !== "string" || !app.id.trim() || seenIds.has(app.id.trim())) continue;
    const id = app.id.trim();
    seenIds.add(id);
    const name = typeof app.name === "string" && app.name.trim() ? app.name.trim() : app.id.trim();
    const functional = isFunctionalTargetApp(id, optionRecords);
    const suffix = functional ? "" : app.type === "WORDPRESS" || app.type === "CUSTOM_API"
      ? " — 준비 중"
      : " — 사용 불가";
    options.push({ id, label: name + suffix, disabled: !functional });
  }
  return options;
}

export function getTargetAppLabel(targetApp, apps) {
  const appId = targetApp === null || targetApp === undefined ? "threads-primary" : targetApp;
  const option = getTargetAppOptions(apps).find((item) => item.id === appId);
  return option?.label || String(appId) + " — 사용 불가";
}

export function getPostStatusRequest(postId, status) {
  return {
    url: `/api/posts/${encodeURIComponent(postId)}`,
    method: "PATCH",
    payload: { status },
  };
}

export function getPostDeleteRequest(postId) {
  return {
    url: `/api/posts/${encodeURIComponent(postId)}`,
    method: "DELETE",
  };
}

export function getPostPublishRequest(postId) {
  return {
    url: `/api/posts/${encodeURIComponent(postId)}/publish`,
    method: "POST",
  };
}

export function buildWritePageClientScript() {
  return `
    const getPostSaveRequest = ${getPostSaveRequest.toString()};
    const isFunctionalTargetApp = ${isFunctionalTargetApp.toString()};
    const getTargetAppOptions = ${getTargetAppOptions.toString()};
    const getTargetAppLabel = ${getTargetAppLabel.toString()};
    const getPostStatusRequest = ${getPostStatusRequest.toString()};
    const getPostDeleteRequest = ${getPostDeleteRequest.toString()};
    const getPostPublishRequest = ${getPostPublishRequest.toString()};

    (() => {
      const form = document.querySelector("#post-editor");
      const titleInput = document.querySelector("#post-title");
      const bodyInput = document.querySelector("#post-body");
      const formatInput = document.querySelector("#post-format");
      const statusInput = document.querySelector("#post-status");
      const targetAppInput = document.querySelector("#post-target-app");
      const saveButton = document.querySelector("#post-save");
      const newButton = document.querySelector("#post-new");
      const cancelButton = document.querySelector("#post-cancel");
      const formHeading = document.querySelector("#post-editor-heading");
      const feedback = document.querySelector("#post-feedback");
      const list = document.querySelector("#saved-post-list");
      const listFeedback = document.querySelector("#saved-post-feedback");
      const topicList = document.querySelector("#topic-list");
      const topicFeedback = document.querySelector("#topic-feedback");
      const topicRefreshButton = document.querySelector("#topic-refresh");
      const topicGenerateButton = document.querySelector("#topic-generate");
      let editingId = null;
      let editorSourceType = "MANUAL";
      let editorTopicId = null;
      let editorTargetApp = null;
      let targetApps = [];
      let selectedTopicId = null;
      let busy = false;
      let generating = false;
      let publishingPostId = null;

      function setFeedback(message, tone = "") {
        feedback.textContent = message || "";
        feedback.className = "app-write-feedback " + tone;
      }

      function resetEditor() {
        editingId = null;
        editorSourceType = "MANUAL";
        editorTopicId = null;
        editorTargetApp = null;
        form.reset();
        formatInput.value = "TEXT";
        statusInput.value = "DRAFT";
        renderTargetAppOptions(null);
        formHeading.textContent = "새 글";
        saveButton.textContent = "저장";
        setFeedback("");
      }

      function renderTargetAppOptions(selectedTargetApp) {
        const selectedId = selectedTargetApp === null || selectedTargetApp === undefined
          ? "threads-primary"
          : selectedTargetApp;
        const options = getTargetAppOptions(targetApps);
        if (!options.some((option) => option.id === selectedId)) {
          options.push({ id: selectedId, label: String(selectedId) + " — 사용 불가", disabled: true });
        }
        targetAppInput.replaceChildren();
        for (const item of options) {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.label;
          option.disabled = item.disabled;
          option.selected = item.id === selectedId;
          targetAppInput.append(option);
        }
      }

      function setBusy(value) {
        busy = value;
        saveButton.disabled = value;
        saveButton.textContent = value ? "저장 중..." : "저장";
      }

      function setTopicFeedback(message, tone = "") {
        topicFeedback.textContent = message || "";
        topicFeedback.className = "app-write-feedback " + tone;
      }

      function setGenerating(value) {
        generating = value;
        topicGenerateButton.disabled = value || !selectedTopicId;
        topicRefreshButton.disabled = value;
        topicGenerateButton.textContent = value ? "AI 초안 생성 중..." : "선택한 Topic으로 글 작성";
      }

      async function requestApi(url, options = {}) {
        let response;
        try {
          response = await fetch(url, options);
        } catch {
          throw new Error("요청을 완료하지 못했습니다. 잠시 후 다시 시도하세요.");
        }
        let data = null;
        try {
          data = await response.json();
        } catch {
          throw new Error("응답을 처리하지 못했습니다. 다시 시도하세요.");
        }
        if (!response.ok || data.ok === false) {
          throw new Error(data.error || "요청을 처리하지 못했습니다.");
        }
        return data;
      }

      function requestOptions(descriptor) {
        return descriptor.payload === undefined
          ? { method: descriptor.method }
          : {
            method: descriptor.method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(descriptor.payload),
          };
      }

      function makeButton(label, action, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = action === "delete" ? "app-write-button danger" : "app-write-button";
        button.textContent = label;
        button.addEventListener("click", onClick);
        return button;
      }

      function formatUpdatedAt(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "업데이트 시간 없음" : date.toLocaleString("ko-KR");
      }

      function renderPosts(posts) {
        list.replaceChildren();
        if (!posts.length) {
          listFeedback.textContent = "저장된 글이 없습니다.";
          return;
        }
        listFeedback.textContent = "";
        for (const post of posts) {
          const card = document.createElement("article");
          card.className = "app-write-post";
          const heading = document.createElement("h3");
          heading.textContent = post.title || "제목 없는 글";
          const metadata = document.createElement("p");
          metadata.className = "app-write-meta";
          metadata.textContent = [
            post.format,
            post.status,
            post.sourceType === "AI" ? "AI" : "수동",
            formatUpdatedAt(post.updatedAt),
          ].join(" · ");
          const preview = document.createElement("p");
          preview.className = "app-write-preview";
          preview.textContent = String(post.body || "").replace(/\\s+/g, " ").slice(0, 220);
          const target = document.createElement("p");
          target.className = "app-write-meta";
          target.textContent = "게시 대상: " + getTargetAppLabel(post.targetApp, targetApps);
          card.append(heading, metadata, target, preview);
          if (post.status === "PUBLISHED") {
            const published = document.createElement("p");
            published.className = "app-write-meta";
            published.textContent = "게시 완료" + (post.publishedAt ? " · " + formatUpdatedAt(post.publishedAt) : "");
            card.append(published);
          }
          if (post.status !== "PUBLISHED") {
            const actions = document.createElement("div");
            actions.className = "app-write-actions";
            actions.append(
              makeButton("수정", "edit", () => {
                editingId = post.id;
                titleInput.value = post.title || "";
                bodyInput.value = post.body || "";
                formatInput.value = post.format;
                statusInput.value = post.status;
                editorSourceType = post.sourceType === "AI" ? "AI" : "MANUAL";
                editorTopicId = editorSourceType === "AI" && typeof post.topicId === "string"
                  ? post.topicId
                  : null;
                editorTargetApp = post.targetApp;
                renderTargetAppOptions(editorTargetApp);
                formHeading.textContent = "글 수정";
                saveButton.textContent = "변경 저장";
                setFeedback("");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }),
              makeButton(post.status === "DRAFT" ? "게시 준비" : "초안으로", "status", async () => {
                const nextStatus = post.status === "DRAFT" ? "READY" : "DRAFT";
                try {
                  const descriptor = getPostStatusRequest(post.id, nextStatus);
                  await requestApi(descriptor.url, requestOptions(descriptor));
                  setFeedback(nextStatus === "READY" ? "게시 준비 상태로 변경했습니다." : "초안 상태로 변경했습니다.", "success");
                  await loadPosts();
                } catch (error) {
                  setFeedback(error.message, "error");
                }
              }),
              makeButton("삭제", "delete", async () => {
                if (!window.confirm("이 글을 삭제할까요?")) return;
                try {
                  const descriptor = getPostDeleteRequest(post.id);
                  await requestApi(descriptor.url, requestOptions(descriptor));
                  if (editingId === post.id) resetEditor();
                  setFeedback("글을 삭제했습니다.", "success");
                  await loadPosts();
                } catch (error) {
                  setFeedback(error.message, "error");
                }
              })
            );
            if (post.status === "READY") {
              const publishButton = makeButton("게시", "publish", async () => {
                const targetLabel = getTargetAppLabel(post.targetApp, targetApps);
                if (publishingPostId || !window.confirm("이 글을 " + targetLabel + "에 게시할까요?")) return;
                publishingPostId = post.id;
                publishButton.disabled = true;
                publishButton.textContent = "게시 중...";
                try {
                  const descriptor = getPostPublishRequest(post.id);
                  await requestApi(descriptor.url, requestOptions(descriptor));
                  setFeedback("Threads에 게시했습니다.", "success");
                  await loadPosts();
                } catch (error) {
                  setFeedback(error.message, "error");
                } finally {
                  publishingPostId = null;
                  publishButton.disabled = false;
                  publishButton.textContent = "게시";
                }
              });
              if (!isFunctionalTargetApp(post.targetApp, targetApps)) {
                publishButton.disabled = true;
                publishButton.title = "이 게시 대상은 아직 사용할 수 없습니다.";
              }
              actions.append(publishButton);
            }
            card.append(actions);
          }
          list.append(card);
        }
      }

      async function loadPosts() {
        list.replaceChildren();
        listFeedback.textContent = "저장된 글을 불러오는 중...";
        try {
          const data = await requestApi("/api/posts");
          renderPosts(Array.isArray(data.posts) ? data.posts : []);
        } catch (error) {
          listFeedback.textContent = error.message;
        }
      }

      async function loadApps() {
        try {
          const data = await requestApi("/api/apps");
          targetApps = Array.isArray(data.apps) ? data.apps : [];
        } catch {
          targetApps = [];
        }
        renderTargetAppOptions(editorTargetApp);
      }

      function formatTopicUpdatedAt(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR");
      }

      function selectTopic(topicId) {
        selectedTopicId = topicId;
        topicGenerateButton.disabled = !selectedTopicId || generating;
        for (const button of topicList.querySelectorAll("button")) {
          button.classList.toggle("is-selected", button.dataset.topicId === topicId);
        }
      }

      function renderTopics(topics) {
        topicList.replaceChildren();
        selectedTopicId = null;
        topicGenerateButton.disabled = true;
        if (!topics.length) {
          setTopicFeedback("현재 선택할 Topic이 없습니다.");
          return;
        }
        setTopicFeedback("");
        for (const topic of topics) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "app-topic-card";
          button.dataset.topicId = topic.id;
          const title = document.createElement("strong");
          title.textContent = topic.title;
          const summary = document.createElement("span");
          summary.textContent = topic.summary || "";
          const updatedAt = document.createElement("small");
          updatedAt.textContent = formatTopicUpdatedAt(topic.updatedAt);
          button.append(title, summary, updatedAt);
          button.addEventListener("click", () => selectTopic(topic.id));
          topicList.append(button);
        }
      }

      async function loadTopics() {
        setTopicFeedback("Topic을 불러오는 중...");
        try {
          const data = await requestApi("/api/topics");
          renderTopics(Array.isArray(data.topics) ? data.topics : []);
        } catch (error) {
          setTopicFeedback(error.message, "error");
        }
      }

      async function refreshTopics() {
        if (generating) return;
        topicRefreshButton.disabled = true;
        setTopicFeedback("Topic을 새로 가져오는 중...");
        try {
          const data = await requestApi("/api/topics/refresh", { method: "POST" });
          renderTopics(Array.isArray(data.topics) ? data.topics : []);
          setTopicFeedback("Topic을 새로 가져왔습니다.", "success");
        } catch (error) {
          setTopicFeedback(error.message, "error");
        } finally {
          topicRefreshButton.disabled = false;
        }
      }

      async function generateDraft() {
        if (!selectedTopicId || generating) return;
        if ((titleInput.value.trim() || bodyInput.value.trim()) && !window.confirm("작성 중인 내용을 AI 초안으로 바꿀까요? 저장하지 않은 내용은 사라집니다.")) return;
        setGenerating(true);
        setTopicFeedback("");
        try {
          const data = await requestApi("/api/posts/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ topicId: selectedTopicId, format: formatInput.value }),
          });
          const draft = data.draft;
          editingId = null;
          titleInput.value = draft.title || "";
          bodyInput.value = draft.body || "";
          formatInput.value = draft.format;
          statusInput.value = "DRAFT";
          editorSourceType = "AI";
          editorTopicId = draft.topicId;
          formHeading.textContent = "AI 초안";
          saveButton.textContent = "저장";
          setFeedback("AI 초안을 편집한 뒤 저장하세요.", "success");
        } catch (error) {
          setTopicFeedback(error.message, "error");
        } finally {
          setGenerating(false);
        }
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        const descriptor = getPostSaveRequest({
          editingId,
          title: titleInput.value,
          body: bodyInput.value,
          format: formatInput.value,
          status: statusInput.value,
          sourceType: editorSourceType,
          topicId: editorTopicId,
          targetApp: targetAppInput.value,
        });
        setBusy(true);
        setFeedback("");
        try {
          const data = await requestApi(descriptor.url, requestOptions(descriptor));
          editingId = data.post.id;
          editorTargetApp = data.post.targetApp;
          formHeading.textContent = "글 수정";
          saveButton.textContent = "변경 저장";
          setFeedback("저장했습니다.", "success");
          await loadPosts();
        } catch (error) {
          setFeedback(error.message, "error");
        } finally {
          setBusy(false);
          if (editingId) saveButton.textContent = "변경 저장";
        }
      });

      newButton.addEventListener("click", resetEditor);
      cancelButton.addEventListener("click", resetEditor);
      topicRefreshButton.addEventListener("click", refreshTopics);
      topicGenerateButton.addEventListener("click", generateDraft);
      resetEditor();
      loadApps().then(() => loadPosts());
      loadTopics();
    })();
  `;
}
