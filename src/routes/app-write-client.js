export function getPostSaveRequest({ editingId, title, body, format, status }) {
  return {
    url: editingId ? `/api/posts/${encodeURIComponent(editingId)}` : "/api/posts",
    method: editingId ? "PATCH" : "POST",
    payload: {
      title: String(title || "").trim() || null,
      body,
      format,
      status,
      sourceType: "MANUAL",
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
      let editingId = null;
      let busy = false;

      function setFeedback(message, tone = "") {
        feedback.textContent = message || "";
        feedback.className = "app-write-feedback " + tone;
      }

      function resetEditor() {
        editingId = null;
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

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        const descriptor = getPostSaveRequest({
          editingId,
          title: titleInput.value,
          body: bodyInput.value,
          format: formatInput.value,
          status: statusInput.value,
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
      resetEditor();
      loadPosts();
    })();
  `;
}
