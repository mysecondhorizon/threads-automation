const OPENAI_RESPONSES_URL =
  "https://api.openai.com/v1/responses";

export class AiServiceError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "AiServiceError";
    this.details = details;
  }
}

function extractOutputText(data) {
  const texts = [];

  for (const item of data.output || []) {
    if (item.type !== "message") {
      continue;
    }

    for (const content of item.content || []) {
      if (
        content.type === "output_text" &&
        typeof content.text === "string"
      ) {
        texts.push(content.text);
      }
    }
  }

  return texts.join("\n").trim();
}

export async function generateThreadsDraft(
  env,
  {
    topic,
    tone = "친근하고 통찰력 있는",
  }
) {
  if (!env.OPENAI_API_KEY) {
    throw new AiServiceError(
      "OPENAI_API_KEY is not configured"
    );
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6",
      reasoning: {
        effort: "low",
      },
      instructions: [
        "당신은 Second Horizon의 Threads 콘텐츠 에디터입니다.",
        "한국어로 자연스럽고 사람이 직접 쓴 듯한 글을 작성합니다.",
        "과장된 광고 문구와 불필요한 해시태그는 피합니다.",
        "출력은 Threads 게시문 본문만 제공합니다.",
        "전체 길이는 500자를 넘지 않습니다.",
      ].join("\n"),
      input: [
        `주제: ${topic}`,
        `톤: ${tone}`,
        "첫 문장은 독자의 관심을 끌고, 마지막 문장은 여운이나 질문으로 끝내세요.",
      ].join("\n"),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new AiServiceError(
      "OpenAI request failed",
      data
    );
  }

  const text = extractOutputText(data);

  if (!text) {
    throw new AiServiceError(
      "OpenAI returned no text",
      data
    );
  }

  return text.slice(0, 500);
}
