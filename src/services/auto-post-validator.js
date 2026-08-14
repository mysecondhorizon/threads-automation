const MAX_POST_LENGTH = 500;

const FORBIDDEN_SECTION_LABELS = [
  "[글 유형]",
  "[본문]",
  "[첫 댓글]",
  "[기록 데이터]",
];

const FORBIDDEN_METADATA_PREFIXES = [
  "소재:",
  "상황:",
  "감정:",
  "핵심 후킹:",
  "제품:",
  "제품 경험 상태:",
  "제품 연결 여부:",
  "질문형 여부:",
  "예상 반응 유형:",
  "다음 글에서 피할 중복 요소:",
];

export class AutoPostValidationError extends Error {
  constructor(
    message,
    {
      code = "invalid_auto_post",
      details = null,
    } = {}
  ) {
    super(message);

    this.name =
      "AutoPostValidationError";

    this.code =
      code;

    this.details =
      details;
  }
}

function normalizeText(
  value
) {
  return String(
    value || ""
  )
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function findForbiddenSectionLabel(
  text
) {
  return FORBIDDEN_SECTION_LABELS.find(
    (label) =>
      text.includes(label)
  ) || null;
}

function findForbiddenMetadataLine(
  text
) {
  const lines =
    text.split("\n");

  for (
    const line of lines
  ) {
    const trimmedLine =
      line.trim();

    const matchedPrefix =
      FORBIDDEN_METADATA_PREFIXES.find(
        (prefix) =>
          trimmedLine.startsWith(
            prefix
          )
      );

    if (matchedPrefix) {
      return {
        line:
          trimmedLine,

        prefix:
          matchedPrefix,
      };
    }
  }

  return null;
}

function hasOnlySymbols(
  text
) {
  return !/[가-힣a-zA-Z0-9]/.test(
    text
  );
}

function hasExcessiveBlankLines(
  text
) {
  return /\n{4,}/.test(
    text
  );
}

function hasJsonCodeFence(
  text
) {
  return (
    text.includes("```json") ||
    text.includes("```JSON")
  );
}

export function validateAutoPostText(
  value
) {
  const text =
    normalizeText(
      value
    );

  if (!text) {
    throw new AutoPostValidationError(
      "게시할 본문이 비어 있습니다.",
      {
        code:
          "empty_post_text",
      }
    );
  }

  if (
    text.length >
    MAX_POST_LENGTH
  ) {
    throw new AutoPostValidationError(
      "게시할 본문이 500자를 초과했습니다.",
      {
        code:
          "post_text_too_long",

        details: {
          length:
            text.length,

          maxLength:
            MAX_POST_LENGTH,
        },
      }
    );
  }

  const forbiddenSectionLabel =
    findForbiddenSectionLabel(
      text
    );

  if (
    forbiddenSectionLabel
  ) {
    throw new AutoPostValidationError(
      "게시 본문에 출력 형식 라벨이 포함되어 있습니다.",
      {
        code:
          "section_label_detected",

        details: {
          label:
            forbiddenSectionLabel,
        },
      }
    );
  }

  const forbiddenMetadataLine =
    findForbiddenMetadataLine(
      text
    );

  if (
    forbiddenMetadataLine
  ) {
    throw new AutoPostValidationError(
      "게시 본문에 기록 데이터가 포함되어 있습니다.",
      {
        code:
          "metadata_detected",

        details:
          forbiddenMetadataLine,
      }
    );
  }

  if (
    hasJsonCodeFence(
      text
    )
  ) {
    throw new AutoPostValidationError(
      "게시 본문에 JSON 코드 블록이 포함되어 있습니다.",
      {
        code:
          "json_code_fence_detected",
      }
    );
  }

  if (
    hasOnlySymbols(
      text
    )
  ) {
    throw new AutoPostValidationError(
      "게시 본문에 유효한 문자가 없습니다.",
      {
        code:
          "invalid_post_characters",
      }
    );
  }

  if (
    hasExcessiveBlankLines(
      text
    )
  ) {
    throw new AutoPostValidationError(
      "게시 본문에 지나치게 많은 빈 줄이 포함되어 있습니다.",
      {
        code:
          "excessive_blank_lines",
      }
    );
  }

  return {
    text,

    length:
      text.length,

    maxLength:
      MAX_POST_LENGTH,
  };
}

export function validateAutoPostPolicy(
  generatedPost,
  context
) {
  const publishing =
    context?.publishing || {};

  const questionUsed =
    Boolean(
      generatedPost
        ?.questionUsed
    );

  const productConnected =
    Boolean(
      generatedPost
        ?.productConnected
    );

  const affiliateLinkUsed =
    Boolean(
      generatedPost
        ?.affiliateLinkUsed
    );

  const affiliateDisclosureRequired =
    Boolean(
      generatedPost
        ?.affiliateDisclosureRequired
    );

  if (
    publishing
      .questionAvailable ===
      false &&
    questionUsed
  ) {
    throw new AutoPostValidationError(
      "오늘 질문형 콘텐츠 사용 한도를 초과했습니다.",
      {
        code:
          "question_limit_reached",

        details: {
          todayQuestionCount:
            context?.history
              ?.todayQuestionCount ??
            0,
        },
      }
    );
  }

  if (
    publishing
      .productConnectedAvailable ===
      false &&
    productConnected
  ) {
    throw new AutoPostValidationError(
      "오늘 제품 연결 콘텐츠 사용 한도를 초과했습니다.",
      {
        code:
          "product_content_limit_reached",

        details: {
          todayProductConnectedCount:
            context?.history
              ?.todayProductConnectedCount ??
            0,
        },
      }
    );
  }

  if (
    publishing
      .affiliateLinkAvailable ===
      false &&
    affiliateLinkUsed
  ) {
    throw new AutoPostValidationError(
      "오늘 제휴 링크 사용 한도를 초과했습니다.",
      {
        code:
          "affiliate_link_limit_reached",

        details: {
          todayAffiliateLinkCount:
            context?.history
              ?.todayAffiliateLinkCount ??
            0,
        },
      }
    );
  }

  if (
    affiliateLinkUsed &&
    !productConnected
  ) {
    throw new AutoPostValidationError(
      "제품 연결 없이 제휴 링크를 사용할 수 없습니다.",
      {
        code:
          "affiliate_link_without_product",
      }
    );
  }

  if (
    affiliateLinkUsed &&
    !affiliateDisclosureRequired
  ) {
    throw new AutoPostValidationError(
      "제휴 링크 사용 글에 광고 고지 정보가 설정되지 않았습니다.",
      {
        code:
          "affiliate_disclosure_missing",
      }
    );
  }

  if (
    affiliateDisclosureRequired &&
    !affiliateLinkUsed
  ) {
    throw new AutoPostValidationError(
      "제휴 링크가 없는 글에 광고 고지 필요 상태가 설정되어 있습니다.",
      {
        code:
          "unnecessary_affiliate_disclosure",
      }
    );
  }

  return {
    valid:
      true,

    questionUsed,

    productConnected,

    affiliateLinkUsed,

    affiliateDisclosureRequired,
  };
}