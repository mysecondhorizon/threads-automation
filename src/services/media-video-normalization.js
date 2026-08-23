import {
  getMediaObject,
  putMediaObject,
} from "./media-storage.js";
import {
  getContainer,
} from "@cloudflare/containers";

const VIDEO_CONTENT_TYPE = "video/mp4";
const NORMALIZER_INSTANCE_NAME = "video-orientation-normalizer";
const ALLOWED_ROTATIONS = new Set([90, 180, 270]);
const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 256;
const MAX_DIAGNOSTIC_STACK_LENGTH = 512;

function diagnosticMessage(error) {
  return String(error?.message || error)
    .replace(/\s+/gu, " ")
    .slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH);
}

function diagnosticStack(error) {
  return String(error?.stack || "")
    .replace(/\s+/gu, " ")
    .slice(0, MAX_DIAGNOSTIC_STACK_LENGTH);
}

function describeBody(body) {
  const isStream = Boolean(body && typeof body.getReader === "function");
  const bodyType = isStream
    ? "ReadableStream"
    : body instanceof ArrayBuffer
      ? "ArrayBuffer"
      : ArrayBuffer.isView(body)
        ? body.constructor?.name || "ArrayBufferView"
        : typeof body;
  const knownLength = Number.isSafeInteger(body?.byteLength)
    ? body.byteLength
    : Number.isSafeInteger(body?.length)
      ? body.length
      : null;
  return {
    bodyType,
    knownLength: knownLength === null ? "unknown" : knownLength,
    locked: isStream ? Boolean(body.locked) : "n/a",
    disturbed: typeof body?.disturbed === "boolean" ? body.disturbed : "unknown",
    bodyUsed: typeof body?.bodyUsed === "boolean" ? body.bodyUsed : "unknown",
  };
}

export function createNormalizedVideoObjectKey(sourceObjectKey) {
  const source = String(sourceObjectKey || "");
  if (!source.endsWith("-source.mp4")) {
    throw new Error("Temporary source video object key is invalid");
  }
  return `${source.slice(0, -"-source.mp4".length)}-normalized.mp4`;
}

export async function normalizeVideoOrientation(
  env,
  { sourceObjectKey, normalizedObjectKey, rotationDegrees }
) {
  if (!ALLOWED_ROTATIONS.has(rotationDegrees)) {
    throw new Error("Video rotation is invalid");
  }
  if (!env?.VIDEO_NORMALIZER) {
    throw new Error("Video normalizer binding is unavailable");
  }
  const source = await getMediaObject(env, sourceObjectKey);
  if (!source?.body) throw new Error("Temporary source video could not be read for normalization");
  const container = getContainer(env.VIDEO_NORMALIZER, NORMALIZER_INSTANCE_NAME);
  let normalizedResult;
  const rpcStartedAt = Date.now();
  try {
    normalizedResult = await container.normalizeVideo(source.body, rotationDegrees);
    const normalizedBody = normalizedResult?.body;
    const bodyDescription = describeBody(normalizedBody);
    console.log(
      `[video-normalize] RPC completed=true durationMs=${Date.now() - rpcStartedAt} ` +
      `body=${normalizedBody !== null && normalizedBody !== undefined} ` +
      `size=${String(normalizedResult?.size ?? "unknown")} ` +
      `stream=${bodyDescription.bodyType === "ReadableStream"} ` +
      `bodyType=${bodyDescription.bodyType} knownLength=${bodyDescription.knownLength} ` +
      `locked=${bodyDescription.locked} disturbed=${bodyDescription.disturbed} ` +
      `bodyUsed=${bodyDescription.bodyUsed}`
    );
  } catch (error) {
    console.error(
      `[video-normalize] RPC completed=false durationMs=${Date.now() - rpcStartedAt} ` +
      `errorName=${String(error?.name || "Error")} message=${diagnosticMessage(error)} ` +
      `stack=${diagnosticStack(error)}`
    );
    throw error;
  }
  const normalizedBody = normalizedResult?.body;
  const normalizedSize = normalizedResult?.size;
  if (!normalizedBody || typeof normalizedBody.getReader !== "function") {
    console.error("[video-normalize] RPC returned no readable body");
    throw new Error("Video normalizer did not return a stream");
  }
  if (!Number.isSafeInteger(normalizedSize) || normalizedSize <= 0) {
    console.error(`[video-normalize] RPC returned invalid size=${String(normalizedSize)}`);
    throw new Error("Video normalizer returned an invalid size");
  }
  const { readable, writable } = new FixedLengthStream(normalizedSize);
  console.log(`[video-normalize] FixedLengthStream created size=${normalizedSize}`);
  const putStartedAt = Date.now();
  const putBodyDescription = describeBody(readable);
  console.log(
    `[video-normalize] R2 put start stage=normalized_temp key=${normalizedObjectKey} ` +
    `bodyType=${putBodyDescription.bodyType} knownLength=${putBodyDescription.knownLength} ` +
    `contentType=${VIDEO_CONTENT_TYPE} locked=${putBodyDescription.locked} ` +
    `disturbed=${putBodyDescription.disturbed} bodyUsed=${putBodyDescription.bodyUsed} ` +
    `startedAt=${new Date(putStartedAt).toISOString()}`
  );
  let pipePromise;
  let putPromise;
  try {
    const pipeStartedAt = Date.now();
    pipePromise = normalizedBody.pipeTo(writable).then(() => {
      console.log(
        `[video-normalize] FixedLengthStream pipe success size=${normalizedSize} ` +
        `durationMs=${Date.now() - pipeStartedAt}`
      );
    }).catch((error) => {
      console.error(
        `[video-normalize] FixedLengthStream pipe failed size=${normalizedSize} ` +
        `durationMs=${Date.now() - pipeStartedAt} errorName=${String(error?.name || "Error")} ` +
        `message=${diagnosticMessage(error)}`
      );
      throw error;
    });
    putPromise = putMediaObject(env, normalizedObjectKey, readable, {
      httpMetadata: { contentType: VIDEO_CONTENT_TYPE },
    });
    const firstResult = await Promise.race([
      pipePromise.then(() => ({ kind: "pipe", ok: true }), (error) => ({ kind: "pipe", ok: false, error })),
      putPromise.then(() => ({ kind: "put", ok: true }), (error) => ({ kind: "put", ok: false, error })),
    ]);
    if (!firstResult.ok) {
      await Promise.allSettled([
        writable.abort(firstResult.error).catch(() => {}),
        readable.cancel(firstResult.error).catch(() => {}),
        pipePromise,
        putPromise,
      ]);
      throw firstResult.error;
    }
    await Promise.all([pipePromise, putPromise]);
    console.log(
      `[video-normalize] R2 put success stage=normalized_temp key=${normalizedObjectKey} ` +
      `durationMs=${Date.now() - putStartedAt}`
    );
  } catch (error) {
    console.error(
      `[video-normalize] R2 put failed stage=normalized_temp key=${normalizedObjectKey} ` +
      `durationMs=${Date.now() - putStartedAt} errorName=${String(error?.name || "Error")} ` +
      `message=${diagnosticMessage(error)} stack=${diagnosticStack(error)}`
    );
    throw error;
  }
}
