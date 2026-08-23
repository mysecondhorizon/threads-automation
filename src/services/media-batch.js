import {
  putMediaObject,
  deleteMediaObject,
} from "./media-storage.js";
import {
  OPTIMIZED_IMAGE_CONTENT_TYPE,
  OPTIMIZED_IMAGE_EXTENSION,
  optimizeUploadedImage,
} from "./media-image-optimization.js";
import {
  analyzeMediaImage,
} from "./media-vision.js";
import {
  readMp4DurationSeconds,
} from "./media-video-duration.js";
import {
  readMp4OrientationDegrees,
} from "./media-video-orientation.js";
import {
  createNormalizedVideoObjectKey,
  normalizeVideoOrientation,
} from "./media-video-normalization.js";
import {
  createVideoFrameTimestamps,
  extractVideoFrames,
  transformVideoClip,
} from "./media-video-transformation.js";
import {
  analyzeVideoFrames,
  validateVideoClipTiming,
} from "./media-video-vision.js";
import { createMediaBatch } from "./media.js";
import { createContentPoolBatch } from "./content-pool.js";

const MAX_BATCH_FILES = 50;
const MAX_IMAGE_FILE_SIZE = 8 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE = 25 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const VIDEO_CONTENT_TYPE = "video/mp4";
const VIDEO_EXTENSION = ".mp4";
const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 256;

function text(value) {
  return String(value ?? "").trim();
}

function diagnosticMessage(error) {
  return String(error?.message || error)
    .replace(/\s+/gu, " ")
    .slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH);
}

function splitList(value) {
  return [...new Set(text(value).split(/[|;]/u).map(text).filter(Boolean))];
}

function numberValue(value, fallback) {
  const normalized = text(value);
  if (!normalized) return fallback;
  const number = Number(normalized);
  return Number.isInteger(number) ? number : value;
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = String(csv || "").replace(/^\uFEFF/u, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((item) => text(item))) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("CSV manifest contains an unclosed quote");
  row.push(value);
  if (row.some((item) => text(item))) rows.push(row);
  return rows;
}

export function parseCsvManifest(csv) {
  if (!text(csv)) return [];
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => text(header));
  if (!headers.includes("fileName")) {
    throw new Error("CSV manifest requires a fileName column");
  }
  return rows.slice(1).map((row, index) => {
    const item = { manifestRow: index + 2 };
    headers.forEach((header, column) => {
      if (header) item[header] = text(row[column]);
    });
    return item;
  });
}

function sanitizeFileName(fileName) {
  const normalized = text(fileName)
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(-120);
  return normalized || "image";
}

function createObjectKey(sourceType, fileName, extension) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const normalizedFileName =
    sanitizeFileName(fileName);
  const baseName =
    normalizedFileName.replace(
      /\.[^.]+$/u,
      ""
    ) || "image";

  return `media/${sourceType}/${year}/${month}/${id}-${baseName}${extension}`;
}

function createTemporaryVideoObjectKey() {
  const id = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `media/tmp/video/${id}-source.mp4`;
}

function validateFile(file) {
  if (!file) {
    throw new Error("A valid media file is required");
  }
  if (IMAGE_TYPES.has(file.type)) {
    if (typeof file.arrayBuffer !== "function") {
      throw new Error("A valid image file is required");
    }
    if (!file.size || file.size > MAX_IMAGE_FILE_SIZE) {
      throw new Error(`Image size must be between 1 byte and ${MAX_IMAGE_FILE_SIZE} bytes`);
    }
    return "image";
  }
  if (file.type === VIDEO_CONTENT_TYPE) {
    if (typeof file.stream !== "function") {
      throw new Error("A valid video file is required");
    }
    if (!file.size || file.size > MAX_VIDEO_FILE_SIZE) {
      throw new Error(`Video size must be between 1 byte and ${MAX_VIDEO_FILE_SIZE} bytes`);
    }
    return "video";
  }
  if (String(file.type || "").startsWith("video/")) {
    throw new Error(`Unsupported video type: ${file.type || "unknown"}`);
  }
  throw new Error(`Unsupported media type: ${file.type || "unknown"}`);
}

function mediaExtension(mediaKind) {
  return mediaKind === "video"
    ? VIDEO_EXTENSION
    : OPTIMIZED_IMAGE_EXTENSION;
}

function buildInput(file, manifest, defaults, mediaKind) {
  const sourceType = text(manifest?.sourceType || defaults.sourceType || "general").toLowerCase();
  if (sourceType !== "general" && sourceType !== "product") {
    throw new Error("sourceType must be general or product");
  }
  const productId = sourceType === "product"
    ? text(manifest?.productId || defaults.productId) || null
    : null;
  return {
    file,
    mediaKind,
    sourceType,
    productId,
    objectKey: createObjectKey(sourceType, file.name, mediaExtension(mediaKind)),
    imageUrl: null,
    altText: text(manifest?.altText || defaults.altText),
    description: text(manifest?.description || defaults.description),
    tags: splitList(manifest?.tags || defaults.tags),
    topics: splitList(manifest?.topics || defaults.topics),
    allowedContentTypes: splitList(manifest?.allowedContentTypes || defaults.allowedContentTypes),
    priority: numberValue(manifest?.priority ?? defaults.priority, 0),
    maxUses: numberValue(manifest?.maxUses ?? defaults.maxUses, 1),
    cooldownDays: numberValue(manifest?.cooldownDays ?? defaults.cooldownDays, 0),
  };
}

async function imageUploadData(env, file, input) {
  const optimized = await optimizeUploadedImage(env.IMAGES, file);
  const vision = await analyzeMediaImage(env, optimized.body, {
    manualMetadata: input,
  });
  return {
    input: mergeMediaMetadata(input, vision),
    body: optimized.body,
    contentType: optimized.contentType,
    originalBytes: optimized.originalBytes,
    storedBytes: optimized.storedBytes,
    optimizedContentType: optimized.contentType,
  };
}

async function videoUploadData(env, file, input, sourceObjectKey, temporaryObjectKeys) {
  await putMediaObject(env, sourceObjectKey, file.stream(), {
    httpMetadata: { contentType: VIDEO_CONTENT_TYPE },
    customMetadata: {
      originalFileName: file.name,
      originalContentType: file.type,
      originalBytes: String(file.size),
    },
  });
  temporaryObjectKeys.push(sourceObjectKey);
  const rotationDegrees = await readMp4OrientationDegrees(env, sourceObjectKey);
  let processingObjectKey = sourceObjectKey;
  if (rotationDegrees !== 0) {
    const normalizedObjectKey = createNormalizedVideoObjectKey(sourceObjectKey);
    temporaryObjectKeys.push(normalizedObjectKey);
    try {
      await normalizeVideoOrientation(env, {
        sourceObjectKey,
        normalizedObjectKey,
        rotationDegrees,
      });
      let normalizedRotationDegrees;
      try {
        normalizedRotationDegrees = await readMp4OrientationDegrees(env, normalizedObjectKey);
        console.log(
          `[video-normalize] orientation parser success=true rotation=${normalizedRotationDegrees}`
        );
      } catch (error) {
        console.error(
          `[video-normalize] orientation parser success=false ` +
          `error=${diagnosticMessage(error)}`
        );
        throw error;
      }
      console.log(`[video-normalize] orientation verification degrees=${normalizedRotationDegrees} expected=0`);
      if (normalizedRotationDegrees !== 0) {
        throw new Error("Normalized video orientation metadata is not identity");
      }
    } catch (error) {
      console.error(`[video-normalize] normalization failed message=${diagnosticMessage(error)}`);
      throw error;
    }
    processingObjectKey = normalizedObjectKey;
  }
  const sourceDurationSeconds = await readMp4DurationSeconds(env, processingObjectKey);
  if (sourceDurationSeconds < 2) {
    throw new Error("Video duration must be at least 2 seconds");
  }
  const frames = await extractVideoFrames(
    env,
    processingObjectKey,
    createVideoFrameTimestamps(sourceDurationSeconds)
  );
  const vision = await analyzeVideoFrames(env, frames);
  const timing = validateVideoClipTiming(vision, sourceDurationSeconds);
  const transformed = await transformVideoClip(env, processingObjectKey, timing);
  return {
    input: {
      ...input,
      tags: vision.tags,
      description: vision.description,
      sceneType: vision.sceneType,
      usableAngles: vision.usableAngles,
      sourceDurationSeconds,
      clipStartSeconds: timing.startTimeSeconds,
      clipDurationSeconds: timing.durationSeconds,
      temporaryObjectKeys: [...temporaryObjectKeys],
    },
    body: transformed.body,
    contentType: transformed.contentType,
    originalBytes: Number(file.size),
    storedContentType: transformed.contentType,
  };
}

function r2CustomMetadata(input, upload) {
  return {
    sourceType: input.sourceType,
    productId: input.productId || "",
    originalFileName: input.file.name,
    originalContentType: input.file.type,
    originalBytes: String(upload.originalBytes),
    ...(input.mediaKind === "image"
      ? { optimizedBytes: String(upload.storedBytes) }
      : {}),
  };
}

function setUploadResult(result, input) {
  result.objectKey = input.objectKey;
  result.originalBytes = input.originalBytes;
  result.storedBytes = input.storedBytes;
  if (input.optimizedContentType) {
    result.optimizedContentType = input.optimizedContentType;
  }
  if (input.storedContentType) {
    result.storedContentType = input.storedContentType;
  }
  result.status = "uploaded";
}

export function mergeMediaMetadata(input, vision) {
  return {
    ...input,
    tags: input.tags.length ? input.tags : vision.tags,
    topics: input.topics.length ? input.topics : vision.topics,
    altText: input.altText || vision.altText,
    description: input.description || vision.description,
    sceneType: vision.sceneType,
    usableAngles: vision.usableAngles,
    peoplePresent: vision.peoplePresent,
    textPresent: vision.textPresent,
    brandVisible: vision.brandVisible,
  };
}

async function cleanupObjects(env, objectKeys) {
  const failures = [];
  for (const objectKey of objectKeys) {
    try {
      await deleteMediaObject(env, objectKey);
    } catch (error) {
      failures.push({ objectKey, message: error?.message || String(error) });
    }
  }
  return failures;
}

export async function batchUploadMedia(
  env,
  {
    files,
    manifestText = "",
    defaults = {},
    createPoolItems = true,
  }
) {
  const fileList = Array.from(files || []);
  if (!fileList.length) throw new Error("At least one image file is required");
  if (fileList.length > MAX_BATCH_FILES) {
    throw new Error(`A batch can contain at most ${MAX_BATCH_FILES} files`);
  }

  const manifest = parseCsvManifest(manifestText);
  const manifestByName = new Map();
  for (const row of manifest) {
    const fileName = text(row.fileName);
    if (!fileName) continue;
    if (manifestByName.has(fileName)) throw new Error(`Duplicate manifest fileName: ${fileName}`);
    manifestByName.set(fileName, row);
  }

  const results = fileList.map((file, index) => ({
    index,
    fileName: text(file?.name),
    status: "pending",
  }));
  const uploaded = [];
  const earlyCleanupFailures = [];

  for (let index = 0; index < fileList.length; index += 1) {
    const file = fileList[index];
    let input = null;
    let objectUploaded = false;
    let finalObjectWriteAttempted = false;
    const temporaryObjectKeys = [];
    try {
      const mediaKind = validateFile(file);
      input = buildInput(file, manifestByName.get(file.name), defaults, mediaKind);
      const sourceObjectKey = mediaKind === "video"
        ? createTemporaryVideoObjectKey()
        : null;
      const upload = mediaKind === "video"
        ? await videoUploadData(env, file, input, sourceObjectKey, temporaryObjectKeys)
        : await imageUploadData(env, file, input);
      input = upload.input;

      finalObjectWriteAttempted = true;
      const stored = await putMediaObject(env, input.objectKey, upload.body, {
        httpMetadata: {
          contentType: upload.contentType,
        },
        customMetadata: r2CustomMetadata(input, upload),
      });
      objectUploaded = true;
      input.originalBytes = upload.originalBytes;
      input.storedBytes = Number.isSafeInteger(stored?.size)
        ? stored.size
        : upload.storedBytes;
      input.optimizedContentType = upload.optimizedContentType;
      input.storedContentType = upload.storedContentType;
      uploaded.push({ originalIndex: index, input });
      setUploadResult(results[index], input);
    } catch (error) {
      const cleanupKeys = [
        ...((objectUploaded || finalObjectWriteAttempted) && input?.objectKey
          ? [input.objectKey]
          : []),
        ...temporaryObjectKeys,
      ];
      if (cleanupKeys.length) {
        const cleanup = await cleanupObjects(env, cleanupKeys);
        earlyCleanupFailures.push(...cleanup);
      }
      results[index].status = "failed";
      results[index].stage = "upload";
      results[index].error = error?.message || String(error);
    }
  }

  if (!uploaded.length) {
    return { results, cleanupFailures: earlyCleanupFailures, manifestWarnings: [] };
  }

  let registration;
  try {
    registration = await createMediaBatch(env, uploaded.map(({ input }) => ({
      mediaKind: input.mediaKind,
      sourceType: input.sourceType,
      productId: input.productId,
      objectKey: input.objectKey,
      imageUrl: input.imageUrl,
      altText: input.altText,
      description: input.description,
      tags: input.tags,
      maxUses: input.maxUses,
      cooldownDays: input.cooldownDays,
      originalBytes: input.originalBytes,
      storedBytes: input.storedBytes,
      optimizedContentType: input.optimizedContentType,
      storedContentType: input.storedContentType,
      sourceDurationSeconds: input.sourceDurationSeconds,
      clipStartSeconds: input.clipStartSeconds,
      clipDurationSeconds: input.clipDurationSeconds,
      sceneType: input.sceneType,
      usableAngles: input.usableAngles,
      peoplePresent: input.peoplePresent,
      textPresent: input.textPresent,
      brandVisible: input.brandVisible,
    })));
  } catch (error) {
    const cleanupFailures = earlyCleanupFailures.concat(
      await cleanupObjects(env, uploaded.flatMap(({ input }) => [
        input.objectKey,
        ...(input.temporaryObjectKeys || []),
      ]))
    );
    for (const item of uploaded) {
      Object.assign(results[item.originalIndex], {
        status: "failed",
        stage: "media_library",
        error: error?.message || String(error),
      });
    }
    return { results, cleanupFailures, manifestWarnings: [] };
  }

  const failedRegistration = new Map(registration.failures.map((failure) => [failure.index, failure]));
  const registered = [];
  let createdIndex = 0;
  const cleanupKeys = [];
  for (let index = 0; index < uploaded.length; index += 1) {
    const upload = uploaded[index];
    const failure = failedRegistration.get(index);
    if (failure) {
      cleanupKeys.push(
        upload.input.objectKey,
        ...(upload.input.temporaryObjectKeys || [])
      );
      Object.assign(results[upload.originalIndex], {
        status: "failed",
        stage: "media_library",
        error: failure.message,
      });
    } else {
      const media = registration.created[createdIndex++];
      registered.push({ ...upload, media });
      Object.assign(results[upload.originalIndex], { status: "success", media });
    }
  }
  const cleanupFailures = earlyCleanupFailures.concat(await cleanupObjects(
    env,
    cleanupKeys.concat(registered.flatMap(({ input }) =>
      input.temporaryObjectKeys || []
    ))
  ));

  const poolRegistered = registered.filter(
    ({ input }) => input.mediaKind === "image"
  );
  if (createPoolItems && poolRegistered.length) {
    let pool;
    try {
      pool = await createContentPoolBatch(env, poolRegistered.map(({ input, media }) => ({
        type: input.sourceType,
        mediaIds: [media.id],
        productId: input.productId,
        topics: input.topics,
        allowedContentTypes: input.allowedContentTypes,
        priority: input.priority,
        maxUses: input.maxUses,
        cooldownDays: input.cooldownDays,
      })));
    } catch (error) {
      for (const item of poolRegistered) {
        results[item.originalIndex].status = "partial";
        results[item.originalIndex].poolError = error?.message || String(error);
      }
      return { results, cleanupFailures, manifestWarnings: [] };
    }
    const failedPool = new Map(pool.failures.map((failure) => [failure.index, failure]));
    let poolIndex = 0;
    poolRegistered.forEach((item, index) => {
      const failure = failedPool.get(index);
      if (failure) {
        results[item.originalIndex].status = "partial";
        results[item.originalIndex].poolError = failure.message;
      } else {
        results[item.originalIndex].contentPoolItem = pool.created[poolIndex++];
      }
    });
  }

  const uploadedNames = new Set(fileList.map((file) => file.name));
  const manifestWarnings = manifest
    .filter((row) => row.fileName && !uploadedNames.has(row.fileName))
    .map((row) => `Manifest row ${row.manifestRow}: file not selected (${row.fileName})`);
  return { results, cleanupFailures, manifestWarnings };
}
