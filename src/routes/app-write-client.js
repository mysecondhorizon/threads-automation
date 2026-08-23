export function getPostSaveRequest({
  editingId,
  title,
  body,
  format,
  status,
  sourceType = "MANUAL",
  topicId = null,
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
    },
  };
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

export function buildWritePageClientScript() {
  return `
    const getPostSaveRequest = ${getPostSaveRequest.toString()};
    const getPostStatusRequest = ${getPostStatusRequest.toString()};
    const getPostDeleteRequest = ${getPostDeleteRequest.toString()};

    (() => {
      const form = document.querySelector("#post-editor");
      const titleInput = document.querySelector("#post-title");
      const bodyInput = document.querySelector("#post-body");
      const formatInput = document.querySelector("#post-format");
      const statusInput = document.querySelector("#post-status");
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
      let selectedTopicId = null;
      let busy = false;
      let generating = false;

      function setFeedback(message, tone = "") {
        feedback.textContent = message || "";
        feedback.className = "app-write-feedback " + tone;
      }

      function resetEditor() {
        editingId = null;
        editorSourceType = "MANUAL";
        editorTopicId = null;
        form.reset();
        formatInput.value = "TEXT";
        statusInput.value = "DRAFT";
        formHeading.textContent = "새 글";
        saveButton.textContent = "저장";
        setFeedback("");
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
          card.append(heading, metadata, preview);
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
        });
        setBusy(true);
        setFeedback("");
        try {
          const data = await requestApi(descriptor.url, requestOptions(descriptor));
          editingId = data.post.id;
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
      loadPosts();
      loadTopics();
    })();
  `;
}
