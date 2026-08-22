import {
  requireAdminSession,
} from "../middleware/auth.js";

import {
  html,
} from "../utils/response.js";
import { renderAdminNavigation } from "../services/admin-navigation.js";

export async function handleProductsPage(
  request,
  env
) {
  const auth =
    await requireAdminSession(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  return html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>
    제품 관리
  </title>
</head>

<body style="
  font-family:Arial,sans-serif;
  max-width:1000px;
  margin:40px auto;
  padding:0 20px;
  background:#f7f7f7;
">
  ${renderAdminNavigation("/admin/products-page")}
  <header style="
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:16px;
    margin-bottom:28px;
  ">
    <div>
      <h1 style="
        margin:0 0 8px;
      ">
        제품 관리
      </h1>

      <div style="
        color:#666;
      ">
        자동 제품 글에 사용할 제품, 경험, 링크 정보를 관리합니다.
      </div>
    </div>

    <nav style="
      display:flex;
      gap:8px;
      flex-wrap:wrap;
    ">
      <a href="/admin/product-review-page">
        <button type="button" style="padding:10px 14px;">
          제품글 테스트 / 검수
        </button>
      </a>

      <a href="/admin/dashboard">
        <button
          type="button"
          style="
            padding:10px 14px;
          "
        >
          대시보드
        </button>
      </a>

      <a href="/admin/auto-post/preview-page">
        <button
          type="button"
          style="
            padding:10px 14px;
          "
        >
          게시 미리보기
        </button>
      </a>
    </nav>
  </header>

  <section
    id="status-card"
    style="
      display:none;
      border:1px solid #ddd;
      border-radius:12px;
      padding:16px;
      margin-bottom:18px;
      background:#fff;
    "
  >
    <div
      id="status-message"
      style="
        font-weight:700;
        white-space:pre-wrap;
        line-height:1.6;
      "
    ></div>
  </section>

  <section style="
    border:1px solid #ddd;
    border-radius:14px;
    padding:20px;
    background:#fff;
    margin-bottom:24px;
  ">
    <h2 style="
      margin-top:0;
    ">
      제품 등록 및 수정
    </h2>

    <form id="product-form">
      <input
        id="product-id"
        type="hidden"
      >

      <div style="
        display:grid;
        grid-template-columns:
          repeat(
            auto-fit,
            minmax(240px, 1fr)
          );
        gap:16px;
      ">
        <label>
          <div style="
            font-weight:700;
            margin-bottom:7px;
          ">
            제품명 *
          </div>

          <input
            id="name"
            type="text"
            required
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px;
              border:1px solid #ccc;
              border-radius:8px;
              font:inherit;
            "
          >
        </label>

        <label>
          <div style="
            font-weight:700;
            margin-bottom:7px;
          ">
            제품군
          </div>

          <input
            id="category"
            type="text"
            placeholder="예: 사무용품, 생활용품"
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px;
              border:1px solid #ccc;
              border-radius:8px;
              font:inherit;
            "
          >
        </label>

        <label>
          <div style="
            font-weight:700;
            margin-bottom:7px;
          ">
            가격
          </div>

          <input
            id="price"
            type="number"
            min="0"
            step="1"
            placeholder="예: 19900"
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px;
              border:1px solid #ccc;
              border-radius:8px;
              font:inherit;
            "
          >
        </label>

        <label>
          <div style="
            font-weight:700;
            margin-bottom:7px;
          ">
            경험 상태
          </div>

          <select
            id="experience-status"
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px;
              border:1px solid #ccc;
              border-radius:8px;
              font:inherit;
              background:#fff;
            "
          >
            <option value="미확인">
              미확인
            </option>

            <option value="직접 사용">
              직접 사용
            </option>

            <option value="가족 사용">
              가족 사용
            </option>

            <option value="관심 제품">
              관심 제품
            </option>
          </select>
        </label>
      </div>

      <label style="
        display:block;
        margin-top:16px;
      ">
        <div style="
          font-weight:700;
          margin-bottom:7px;
        ">
          제품 설명
        </div>

        <textarea
          id="description"
          rows="4"
          placeholder="제품의 특징과 용도를 입력하세요."
          style="
            width:100%;
            box-sizing:border-box;
            padding:12px;
            border:1px solid #ccc;
            border-radius:8px;
            resize:vertical;
            font:inherit;
            line-height:1.6;
          "
        ></textarea>
      </label>

      <label style="
        display:block;
        margin-top:16px;
      ">
        <div style="
          font-weight:700;
          margin-bottom:7px;
        ">
          선택 이유
        </div>

        <textarea
          id="selection-reason"
          rows="3"
          placeholder="왜 이 제품을 선택했는지 입력하세요."
          style="
            width:100%;
            box-sizing:border-box;
            padding:12px;
            border:1px solid #ccc;
            border-radius:8px;
            resize:vertical;
            font:inherit;
            line-height:1.6;
          "
        ></textarea>
      </label>

      <label style="
        display:block;
        margin-top:16px;
      ">
        <div style="
          font-weight:700;
          margin-bottom:7px;
        ">
          실제 경험
        </div>

        <textarea
          id="experience"
          rows="5"
          placeholder="직접 사용한 상황, 장점, 불편함 등을 사실대로 입력하세요."
          style="
            width:100%;
            box-sizing:border-box;
            padding:12px;
            border:1px solid #ccc;
            border-radius:8px;
            resize:vertical;
            font:inherit;
            line-height:1.6;
          "
        ></textarea>
      </label>

      <label style="
        display:block;
        margin-top:16px;
      ">
        <div style="
          font-weight:700;
          margin-bottom:7px;
        ">
          제품 사진 설명
        </div>

        <textarea
          id="photo-description"
          rows="3"
          placeholder="사진에 보이는 색상, 크기, 사용 장면 등을 입력하세요."
          style="
            width:100%;
            box-sizing:border-box;
            padding:12px;
            border:1px solid #ccc;
            border-radius:8px;
            resize:vertical;
            font:inherit;
            line-height:1.6;
          "
        ></textarea>
      </label>

      <label style="
        display:block;
        margin-top:16px;
      ">
        <div style="
          font-weight:700;
          margin-bottom:7px;
        ">
          쿠팡파트너스 링크
        </div>

        <input
          id="affiliate-link"
          type="url"
          placeholder="https://..."
          style="
            width:100%;
            box-sizing:border-box;
            padding:11px;
            border:1px solid #ccc;
            border-radius:8px;
            font:inherit;
          "
        >
      </label>

      <label style="
        display:block;
        margin-top:16px;
      ">
        <div style="
          font-weight:700;
          margin-bottom:7px;
        ">
          경제적 이해관계 고지 문구
        </div>

        <textarea
          id="affiliate-disclosure"
          rows="3"
          style="
            width:100%;
            box-sizing:border-box;
            padding:12px;
            border:1px solid #ccc;
            border-radius:8px;
            resize:vertical;
            font:inherit;
            line-height:1.6;
          "
        >이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</textarea>
      </label>

      <div style="
        display:flex;
        gap:18px;
        flex-wrap:wrap;
        margin-top:18px;
      ">
        <label style="
          display:flex;
          align-items:center;
          gap:8px;
        ">
          <input
            id="link-enabled"
            type="checkbox"
          >

          첫 댓글 링크 사용
        </label>

        <label style="
          display:flex;
          align-items:center;
          gap:8px;
        ">
          <input
            id="active"
            type="checkbox"
            checked
          >

          AI 컨텍스트에서 사용
        </label>
      </div>

      <div style="
        display:flex;
        gap:10px;
        margin-top:22px;
        flex-wrap:wrap;
      ">
        <button
          id="save-button"
          type="submit"
          style="
            flex:1;
            min-width:180px;
            padding:13px 16px;
            border:0;
            border-radius:8px;
            background:#111;
            color:#fff;
            font-size:16px;
            font-weight:700;
            cursor:pointer;
          "
        >
          제품 저장
        </button>

        <button
          id="reset-button"
          type="button"
          style="
            padding:13px 16px;
            border:1px solid #bbb;
            border-radius:8px;
            background:#fff;
            font-size:16px;
            cursor:pointer;
          "
        >
          입력 초기화
        </button>
      </div>
    </form>
  </section>

  <section style="border:1px solid #ddd;border-radius:14px;padding:20px;background:#fff;margin-bottom:24px;">
    <h2 style="margin-top:0;">Batch Product CSV</h2>
    <p style="color:#666;">productKey,name,category,description,experienceStatus,experience,selectionReason,price,affiliateLink,affiliateDisclosure,linkEnabled,active</p>
    <input id="product-csv-file" type="file" accept=".csv,text/csv">
    <button id="product-csv-upload" type="button" style="padding:9px 13px;">Upload CSV</button>
    <pre id="product-csv-result" style="white-space:pre-wrap;"></pre>
  </section>

  <section>
    <div style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      margin-bottom:14px;
    ">
      <h2 style="
        margin:0;
      ">
        등록된 제품
      </h2>

      <button
        id="reload-button"
        type="button"
        style="
          padding:9px 13px;
        "
      >
        새로고침
      </button>
    </div>

    <div
      id="products-list"
    ></div>
  </section>

  <script>
    const form =
      document.getElementById(
        "product-form"
      );

    const productsList =
      document.getElementById(
        "products-list"
      );

    const statusCard =
      document.getElementById(
        "status-card"
      );

    const statusMessage =
      document.getElementById(
        "status-message"
      );

    const saveButton =
      document.getElementById(
        "save-button"
      );

    const csvFile =
      document.getElementById("product-csv-file");
    const csvUploadButton =
      document.getElementById("product-csv-upload");
    const csvResult =
      document.getElementById("product-csv-result");

    let products =
      [];

    function getElement(
      id
    ) {
      return document.getElementById(
        id
      );
    }

    function escapeHtml(
      value
    ) {
      return String(
        value ?? ""
      )
        .replaceAll(
          "&",
          "&amp;"
        )
        .replaceAll(
          "<",
          "&lt;"
        )
        .replaceAll(
          ">",
          "&gt;"
        )
        .replaceAll(
          '"',
          "&quot;"
        )
        .replaceAll(
          "'",
          "&#039;"
        );
    }

    function showStatus(
      message,
      isError = false
    ) {
      statusCard.style.display =
        "block";

      statusCard.style.background =
        isError
          ? "#fff5f5"
          : "#f3fff8";

      statusCard.style.borderColor =
        isError
          ? "#e0a0a0"
          : "#9fcdb5";

      statusMessage.style.color =
        isError
          ? "#b00020"
          : "#0b5d34";

      statusMessage.textContent =
        message;
    }

    function hideStatus() {
      statusCard.style.display =
        "none";
    }

    function resetForm() {
      form.reset();

      getElement(
        "product-id"
      ).value =
        "";

      getElement(
        "experience-status"
      ).value =
        "미확인";

      getElement(
        "affiliate-disclosure"
      ).value =
        "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

      getElement(
        "active"
      ).checked =
        true;

      saveButton.textContent =
        "제품 저장";
    }

    function buildPayload() {
      const priceValue =
        getElement(
          "price"
        ).value;

      return {
        id:
          getElement(
            "product-id"
          ).value ||
          undefined,

        name:
          getElement(
            "name"
          ).value,

        category:
          getElement(
            "category"
          ).value,

        description:
          getElement(
            "description"
          ).value,

        selectionReason:
          getElement(
            "selection-reason"
          ).value,

        experience:
          getElement(
            "experience"
          ).value,

        experienceStatus:
          getElement(
            "experience-status"
          ).value,

        price:
          priceValue
            ? Number(
                priceValue
              )
            : null,

        photoDescription:
          getElement(
            "photo-description"
          ).value,

        affiliateLink:
          getElement(
            "affiliate-link"
          ).value,

        affiliateDisclosure:
          getElement(
            "affiliate-disclosure"
          ).value,

        linkEnabled:
          getElement(
            "link-enabled"
          ).checked,

        active:
          getElement(
            "active"
          ).checked,
      };
    }

    function editProduct(
      productId
    ) {
      const product =
        products.find(
          (
            item
          ) =>
            item.id ===
            productId
        );

      if (!product) {
        return;
      }

      getElement(
        "product-id"
      ).value =
        product.id ||
        "";

      getElement(
        "name"
      ).value =
        product.name ||
        "";

      getElement(
        "category"
      ).value =
        product.category ||
        "";

      getElement(
        "description"
      ).value =
        product.description ||
        "";

      getElement(
        "selection-reason"
      ).value =
        product.selectionReason ||
        "";

      getElement(
        "experience"
      ).value =
        product.experience ||
        "";

      getElement(
        "experience-status"
      ).value =
        product.experienceStatus ||
        "미확인";

      getElement(
        "price"
      ).value =
        product.price ??
        "";

      getElement(
        "photo-description"
      ).value =
        product.photoDescription ||
        "";

      getElement(
        "affiliate-link"
      ).value =
        product.affiliateLink ||
        "";

      getElement(
        "affiliate-disclosure"
      ).value =
        product.affiliateDisclosure ||
        "";

      getElement(
        "link-enabled"
      ).checked =
        Boolean(
          product.linkEnabled
        );

      getElement(
        "active"
      ).checked =
        Boolean(
          product.active
        );

      saveButton.textContent =
        "제품 수정 저장";

      window.scrollTo({
        top:
          0,

        behavior:
          "smooth",
      });
    }

    async function deleteProduct(
      productId
    ) {
      const product =
        products.find(
          (
            item
          ) =>
            item.id ===
            productId
        );

      const confirmed =
        window.confirm(
          String(
            product?.name ||
            "이 제품"
          ) +
          "을 삭제하시겠습니까?"
        );

      if (!confirmed) {
        return;
      }

      try {
        const response =
          await fetch(
            "/admin/products",
            {
              method:
                "DELETE",

              headers: {
                "content-type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  id:
                    productId,
                }),
            }
          );

        const payload =
          await response.json();

        if (
          !response.ok ||
          payload.ok === false
        ) {
          throw new Error(
            payload.error ||
            "제품 삭제에 실패했습니다."
          );
        }

        showStatus(
          "제품이 삭제되었습니다."
        );

        resetForm();

        await loadProducts();
      } catch (
        error
      ) {
        showStatus(
          error instanceof Error
            ? error.message
            : String(error),
          true
        );
      }
    }

    function renderProducts() {
      if (
        products.length ===
        0
      ) {
        productsList.innerHTML =
          '<article style="border:1px solid #ddd;border-radius:12px;padding:20px;background:#fff;color:#666;">등록된 제품이 없습니다.</article>';

        return;
      }

      productsList.innerHTML =
        products.map(
          (
            product
          ) => {
            const price =
              product.price ===
                null ||
              product.price ===
                undefined
                ? "-"
                : Number(
                    product.price
                  ).toLocaleString(
                    "ko-KR"
                  ) +
                  "원";

            const linkStatus =
              product.linkEnabled &&
              product.affiliateLink
                ? "링크 사용"
                : "링크 미사용";

            return \`
              <article style="
                border:1px solid #ddd;
                border-radius:14px;
                padding:18px;
                background:#fff;
                margin-bottom:14px;
              ">
                <div style="
                  display:flex;
                  justify-content:space-between;
                  gap:16px;
                  align-items:flex-start;
                  flex-wrap:wrap;
                ">
                  <div>
                    <h3 style="
                      margin:0 0 8px;
                    ">
                      \${escapeHtml(
                        product.name
                      )}
                    </h3>

                    <div style="color:#555;font-size:13px;margin-bottom:5px;">
                      key: \${escapeHtml(product.productKey || "-")}
                    </div>

                    <div style="
                      color:#666;
                      font-size:14px;
                    ">
                      \${escapeHtml(
                        product.category ||
                        "제품군 없음"
                      )}
                      ·
                      \${escapeHtml(
                        price
                      )}
                      ·
                      \${escapeHtml(
                        product.experienceStatus ||
                        "미확인"
                      )}
                    </div>
                  </div>

                  <div style="
                    display:flex;
                    gap:8px;
                    flex-wrap:wrap;
                  ">
                    <span style="
                      padding:5px 9px;
                      border-radius:999px;
                      background:
                        \${product.active
                          ? "#e8f7ee"
                          : "#eee"};
                      font-size:13px;
                    ">
                      \${product.active
                        ? "활성"
                        : "비활성"}
                    </span>

                    <span style="
                      padding:5px 9px;
                      border-radius:999px;
                      background:#eef2ff;
                      font-size:13px;
                    ">
                      \${escapeHtml(
                        linkStatus
                      )}
                    </span>
                  </div>
                </div>

                <p style="
                  white-space:pre-wrap;
                  line-height:1.6;
                  color:#444;
                ">
                  \${escapeHtml(
                    product.description ||
                    "제품 설명 없음"
                  )}
                </p>

                <div style="
                  margin-top:12px;
                  padding:12px;
                  border-radius:8px;
                  background:#f7f7f7;
                  white-space:pre-wrap;
                  line-height:1.55;
                ">
                  <strong>
                    실제 경험
                  </strong>

                  <div style="
                    margin-top:6px;
                  ">
                    \${escapeHtml(
                      product.experience ||
                      "등록된 경험 없음"
                    )}
                  </div>
                </div>

                <div style="
                  display:flex;
                  gap:8px;
                  margin-top:14px;
                ">
                  <button
                    type="button"
                    data-edit-id="\${escapeHtml(
                      product.id
                    )}"
                    style="
                      flex:1;
                      padding:10px;
                    "
                  >
                    수정
                  </button>

                  <button
                    type="button"
                    data-delete-id="\${escapeHtml(
                      product.id
                    )}"
                    style="
                      flex:1;
                      padding:10px;
                      color:#b00020;
                    "
                  >
                    삭제
                  </button>
                </div>
              </article>
            \`;
          }
        ).join("");

      document
        .querySelectorAll(
          "[data-edit-id]"
        )
        .forEach(
          (
            button
          ) => {
            button.addEventListener(
              "click",
              () =>
                editProduct(
                  button.dataset
                    .editId
                )
            );
          }
        );

      document
        .querySelectorAll(
          "[data-delete-id]"
        )
        .forEach(
          (
            button
          ) => {
            button.addEventListener(
              "click",
              () =>
                deleteProduct(
                  button.dataset
                    .deleteId
                )
            );
          }
        );
    }

    async function loadProducts() {
      productsList.innerHTML =
        '<article style="border:1px solid #ddd;border-radius:12px;padding:20px;background:#fff;">제품 목록을 불러오는 중입니다.</article>';

      try {
        const response =
          await fetch(
            "/admin/products"
          );

        const payload =
          await response.json();

        if (
          !response.ok ||
          payload.ok === false
        ) {
          throw new Error(
            payload.error ||
            "제품 목록을 불러오지 못했습니다."
          );
        }

        const data =
          payload.data ||
          payload;

        products =
          Array.isArray(
            data.products
          )
            ? data.products
            : [];

        renderProducts();
      } catch (
        error
      ) {
        productsList.innerHTML =
          '<article style="border:1px solid #e0a0a0;border-radius:12px;padding:20px;background:#fff5f5;color:#b00020;">' +
          escapeHtml(
            error instanceof Error
              ? error.message
              : String(error)
          ) +
          "</article>";
      }
    }

    csvUploadButton.addEventListener("click", async () => {
      const file = csvFile.files?.[0];
      if (!file) { csvResult.textContent = "Select a CSV file first."; return; }
      csvUploadButton.disabled = true;
      csvResult.textContent = "Uploading...";
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/admin/products/batch", { method: "POST", body: formData });
        const payload = await response.json();
        if (!response.ok || payload.ok === false) throw new Error(payload.error || "CSV upload failed");
        csvResult.textContent = JSON.stringify(payload.summary, null, 2) + "\n" +
          payload.results.filter((item) => item.status === "failed").map((item) => "row " + item.row + ": " + item.error).join("\n");
        await loadProducts();
      } catch (error) {
        csvResult.textContent = error instanceof Error ? error.message : String(error);
      } finally { csvUploadButton.disabled = false; }
    });

    form.addEventListener(
      "submit",
      async (
        event
      ) => {
        event.preventDefault();

        hideStatus();

        saveButton.disabled =
          true;

        saveButton.textContent =
          "저장 중...";

        try {
          const response =
            await fetch(
              "/admin/products",
              {
                method:
                  "POST",

                headers: {
                  "content-type":
                    "application/json",
                },

                body:
                  JSON.stringify(
                    buildPayload()
                  ),
              }
            );

          const payload =
            await response.json();

          if (
            !response.ok ||
            payload.ok === false
          ) {
            throw new Error(
              payload.error ||
              "제품 저장에 실패했습니다."
            );
          }

          showStatus(
            "제품이 저장되었습니다."
          );

          resetForm();

          await loadProducts();
        } catch (
          error
        ) {
          showStatus(
            error instanceof Error
              ? error.message
              : String(error),
            true
          );
        } finally {
          saveButton.disabled =
            false;

          if (
            !getElement(
              "product-id"
            ).value
          ) {
            saveButton.textContent =
              "제품 저장";
          }
        }
      }
    );

    getElement(
      "reset-button"
    ).addEventListener(
      "click",
      () => {
        resetForm();

        hideStatus();
      }
    );

    getElement(
      "reload-button"
    ).addEventListener(
      "click",
      loadProducts
    );

    loadProducts();
  </script>
</body>
</html>`);
}
