import {
  getJson,
  putJson,
} from "./kv.js";

import {
  DEFAULT_WORKSPACE_ID,
} from "./workspace-foundation.js";

const MEDIA_LIBRARY_KEY =
  "content_media_library";

const MEDIA_LIBRARY_VERSION =
  1;

const MAX_MEDIA_RECORDS =
  500;

const MAX_OBJECT_KEY_BYTES =
  1024;

const MAX_ALT_TEXT_LENGTH =
  1000;

const MAX_DESCRIPTION_LENGTH =
  4000;

const MAX_EXPERIENCE_NOTE_LENGTH =
  1000;

const MAX_IMAGE_URL_LENGTH =
  8192;

const MAX_TAGS =
  30;

const MAX_SCENE_TYPE_LENGTH =
  60;

const MAX_USABLE_ANGLES =
  6;

const MAX_USABLE_ANGLE_LENGTH =
  100;

export function resolveMediaWorkspaceId(
  workspaceId
) {
  if (
    workspaceId === undefined ||
    workspaceId === null
  ) {
    return DEFAULT_WORKSPACE_ID;
  }

  if (
    typeof workspaceId !== "string" ||
    !workspaceId.trim()
  ) {
    throw createMediaLibraryError(
      "Workspace id is invalid",
      "media_workspace_invalid"
    );
  }

  return workspaceId.trim();
}

function storedWorkspaceId(
  media
) {
  const workspaceId =
    typeof media?.workspaceId === "string"
      ? media.workspaceId.trim()
      : "";

  return workspaceId ||
    DEFAULT_WORKSPACE_ID;
}

function isInWorkspace(
  media,
  workspaceId
) {
  return storedWorkspaceId(media) ===
    workspaceId;
}

function mergeWorkspaceMedia(
  records,
  workspaceId,
  workspaceRecords
) {
  return [
    ...workspaceRecords.slice(
      0,
      MAX_MEDIA_RECORDS
    ),
    ...records.filter(
      (media) =>
        !isInWorkspace(
          media,
          workspaceId
        )
    ),
  ];
}

const SOURCE_TYPES =
  new Set([
    "general",
    "product",
  ]);

const MEDIA_KINDS =
  new Set([
    "image",
    "video",
  ]);

export class MediaLibraryError extends Error {
  constructor(
    message,
    {
      code = "media_library_failed",
      details = null,
    } = {}
  ) {
    super(message);

    this.name =
      "MediaLibraryError";

    this.code =
      code;

    this.details =
      details;
  }
}

function createMediaLibraryError(
  message,
  code,
  details = null
) {
  return new MediaLibraryError(
    message,
    {
      code,
      details,
    }
  );
}

function normalizeText(
  value
) {
  return String(
    value ?? ""
  ).trim();
}

function normalizeNullableText(
  value
) {
  const normalized =
    normalizeText(value);

  return normalized || null;
}

function normalizeSourceType(
  value,
  fallback = "general"
) {
  const normalized =
    normalizeText(
      value ?? fallback
    ).toLowerCase();

  if (
    !SOURCE_TYPES.has(
      normalized
    )
  ) {
    throw createMediaLibraryError(
      "Media sourceType must be general or product",
      "media_source_type_invalid",
      {
        sourceType:
          normalized || null,
      }
    );
  }

  return normalized;
}

function normalizeMediaKind(
  value,
  fallback = "image"
) {
  const normalized =
    normalizeText(
      value ?? fallback
    ).toLowerCase();

  if (
    !MEDIA_KINDS.has(
      normalized
    )
  ) {
    throw createMediaLibraryError(
      "Media mediaKind must be image or video",
      "media_kind_invalid",
      {
        mediaKind:
          normalized || null,
      }
    );
  }

  return normalized;
}

function normalizeActive(
  value,
  fallback = true
) {
  if (
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value !==
    "boolean"
  ) {
    throw createMediaLibraryError(
      "Media active must be a boolean",
      "media_active_invalid"
    );
  }

  return value;
}

function getUtf8ByteLength(
  value
) {
  return new TextEncoder()
    .encode(value)
    .byteLength;
}

function normalizeObjectKey(
  value
) {
  const objectKey =
    normalizeText(value);

  if (!objectKey) {
    throw createMediaLibraryError(
      "Media objectKey is required",
      "media_object_key_missing"
    );
  }

  if (
    getUtf8ByteLength(
      objectKey
    ) > MAX_OBJECT_KEY_BYTES
  ) {
    throw createMediaLibraryError(
      "Media objectKey exceeds the R2 size limit",
      "media_object_key_too_long"
    );
  }

  if (
    /[\u0000-\u001f\u007f]/u.test(
      objectKey
    ) ||
    objectKey.startsWith("/") ||
    objectKey.endsWith("/") ||
    objectKey.includes("\\")
  ) {
    throw createMediaLibraryError(
      "Media objectKey is invalid",
      "media_object_key_invalid"
    );
  }

  const segments =
    objectKey.split("/");

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".."
    )
  ) {
    throw createMediaLibraryError(
      "Media objectKey contains an invalid path segment",
      "media_object_key_invalid"
    );
  }

  return objectKey;
}

function normalizeImageUrl(
  value
) {
  const imageUrl =
    normalizeNullableText(value);

  if (!imageUrl) {
    return null;
  }

  if (
    imageUrl.length >
    MAX_IMAGE_URL_LENGTH
  ) {
    throw createMediaLibraryError(
      "Media imageUrl is too long",
      "media_image_url_too_long"
    );
  }

  let parsedUrl;

  try {
    parsedUrl =
      new URL(imageUrl);
  } catch {
    throw createMediaLibraryError(
      "Media imageUrl must be a valid URL",
      "media_image_url_invalid"
    );
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.protocol !== "http:"
  ) {
    throw createMediaLibraryError(
      "Media imageUrl must use HTTP or HTTPS",
      "media_image_url_invalid"
    );
  }

  return imageUrl;
}

function normalizeLimitedText(
  value,
  field,
  maxLength
) {
  const normalized =
    normalizeText(value);

  if (
    normalized.length >
    maxLength
  ) {
    throw createMediaLibraryError(
      `Media ${field} is too long`,
      `media_${field}_too_long`
    );
  }

  return normalized;
}

function normalizeStringList(
  value,
  field = "tags"
) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[|;,]/u)
      : value == null
        ? []
        : [value];

  const normalized = [...new Set(
    values.map(normalizeText).filter(Boolean)
  )];

  if (normalized.length > MAX_TAGS) {
    throw createMediaLibraryError(
      `Media ${field} has too many values`,
      `media_${field}_too_many`
    );
  }

  return normalized;
}

function normalizeLimitedStringList(
  value,
  fallback,
  field,
  maxItems,
  maxLength
) {
  if (value === undefined) return fallback;
  const values = Array.isArray(value) ? value : [];
  if (values.length > maxItems) {
    throw createMediaLibraryError(
      `Media ${field} has too many values`,
      `media_${field}_too_many`
    );
  }

  const normalized = [...new Set(values.map(normalizeText).filter(Boolean))];
  if (normalized.some((item) => item.length > maxLength)) {
    throw createMediaLibraryError(
      `Media ${field} contains a value that is too long`,
      `media_${field}_too_long`
    );
  }
  return normalized;
}

function normalizeNullableLimitedText(
  value,
  fallback,
  field,
  maxLength
) {
  if (value === undefined) return fallback;
  const normalized = normalizeNullableText(value);
  if (normalized && normalized.length > maxLength) {
    throw createMediaLibraryError(
      `Media ${field} is too long`,
      `media_${field}_too_long`
    );
  }
  return normalized;
}

function normalizeNullableBoolean(
  value,
  fallback,
  field
) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== "boolean") {
    throw createMediaLibraryError(
      `Media ${field} must be a boolean or null`,
      `media_${field}_invalid`
    );
  }
  return value;
}

function normalizeNonNegativeInteger(
  value,
  fallback,
  field
) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw createMediaLibraryError(
      `Media ${field} must be a non-negative integer`,
      `media_${field}_invalid`
    );
  }
  return normalized;
}

function normalizeNullablePositiveInteger(
  value,
  fallback,
  field
) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1) {
    throw createMediaLibraryError(
      `Media ${field} must be a positive integer or null`,
      `media_${field}_invalid`
    );
  }
  return normalized;
}

function normalizeNullableNonNegativeInteger(
  value,
  fallback,
  field
) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw createMediaLibraryError(
      `Media ${field} must be a non-negative integer or null`,
      `media_${field}_invalid`
    );
  }
  return normalized;
}

function normalizeNullableFiniteNumber(
  value,
  fallback,
  field,
  { minimum = 0, exclusiveMinimum = false } = {}
) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) ||
    (exclusiveMinimum ? normalized <= minimum : normalized < minimum)) {
    throw createMediaLibraryError(
      `Media ${field} is invalid`,
      `media_${field}_invalid`
    );
  }
  return normalized;
}

function normalizeNullableDate(
  value,
  fallback = null
) {
  if (value === undefined) return fallback;
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw createMediaLibraryError(
      "Media date is invalid",
      "media_date_invalid"
    );
  }
  return date.toISOString();
}

function createMediaId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto
      .randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 12),
  ].join("-");
}

function normalizeMediaRecord(
  input,
  existingMedia = null,
  workspaceId = DEFAULT_WORKSPACE_ID
) {
  const now =
    new Date().toISOString();

  const sourceType =
    normalizeSourceType(
      input?.sourceType,
      existingMedia?.sourceType ||
        "general"
    );

  const mediaKind =
    normalizeMediaKind(
      input?.mediaKind,
      existingMedia?.mediaKind ||
        "image"
    );

  const requestedProductId =
    input?.productId === undefined
      ? existingMedia?.productId
      : input.productId;

  return {
    id:
      existingMedia?.id ||
      createMediaId(),

    workspaceId,

    mediaKind,

    sourceType,

    productId:
      sourceType === "product"
        ? normalizeNullableText(
            requestedProductId
          )
        : null,

    objectKey:
      normalizeObjectKey(
        input?.objectKey ===
          undefined
          ? existingMedia
              ?.objectKey
          : input.objectKey
      ),

    imageUrl:
      normalizeImageUrl(
        input?.imageUrl ===
          undefined
          ? existingMedia
              ?.imageUrl
          : input.imageUrl
      ),

    altText:
      normalizeLimitedText(
        input?.altText ===
          undefined
          ? existingMedia
              ?.altText
          : input.altText,
        "alt_text",
        MAX_ALT_TEXT_LENGTH
      ),

    description:
      normalizeLimitedText(
        input?.description ===
          undefined
          ? existingMedia
              ?.description
          : input.description,
        "description",
        MAX_DESCRIPTION_LENGTH
      ),

    tags:
      normalizeStringList(
        input?.tags === undefined
          ? existingMedia?.tags
          : input.tags
      ),

    experienceTags:
      normalizeStringList(
        input?.experienceTags === undefined
          ? existingMedia?.experienceTags
          : input.experienceTags
      ),

    experienceNote:
      normalizeNullableLimitedText(
        input?.experienceNote,
        existingMedia?.experienceNote ?? null,
        "experience_note",
        MAX_EXPERIENCE_NOTE_LENGTH
      ),

    maxUses:
      normalizeNullablePositiveInteger(
        input?.maxUses,
        existingMedia?.maxUses ?? null,
        "max_uses"
      ),

    usedCount:
      normalizeNonNegativeInteger(
        input?.usedCount,
        existingMedia?.usedCount ?? 0,
        "used_count"
      ),

    lastUsedAt:
      normalizeNullableDate(
        input?.lastUsedAt,
        existingMedia?.lastUsedAt ?? null
      ),

    cooldownDays:
      normalizeNonNegativeInteger(
        input?.cooldownDays,
        existingMedia?.cooldownDays ?? 0,
        "cooldown_days"
      ),

    originalBytes:
      normalizeNullableNonNegativeInteger(
        input?.originalBytes,
        existingMedia?.originalBytes ?? null,
        "original_bytes"
      ),

    storedBytes:
      normalizeNullableNonNegativeInteger(
        input?.storedBytes,
        existingMedia?.storedBytes ?? null,
        "stored_bytes"
      ),

    optimizedContentType:
      normalizeNullableText(
        input?.optimizedContentType === undefined
          ? existingMedia?.optimizedContentType
          : input.optimizedContentType
      ),

    storedContentType:
      normalizeNullableText(
        input?.storedContentType === undefined
          ? existingMedia?.storedContentType
          : input.storedContentType
      ),

    sourceDurationSeconds:
      normalizeNullableFiniteNumber(
        input?.sourceDurationSeconds,
        existingMedia?.sourceDurationSeconds ?? null,
        "source_duration_seconds",
        { exclusiveMinimum: true }
      ),

    clipStartSeconds:
      normalizeNullableFiniteNumber(
        input?.clipStartSeconds,
        existingMedia?.clipStartSeconds ?? null,
        "clip_start_seconds"
      ),

    clipDurationSeconds:
      normalizeNullableFiniteNumber(
        input?.clipDurationSeconds,
        existingMedia?.clipDurationSeconds ?? null,
        "clip_duration_seconds",
        { exclusiveMinimum: true }
      ),

    sceneType:
      normalizeNullableLimitedText(
        input?.sceneType,
        existingMedia?.sceneType ?? null,
        "scene_type",
        MAX_SCENE_TYPE_LENGTH
      ),

    usableAngles:
      normalizeLimitedStringList(
        input?.usableAngles,
        existingMedia?.usableAngles ?? [],
        "usable_angles",
        MAX_USABLE_ANGLES,
        MAX_USABLE_ANGLE_LENGTH
      ),

    peoplePresent:
      normalizeNullableBoolean(
        input?.peoplePresent,
        existingMedia?.peoplePresent ?? null,
        "people_present"
      ),

    textPresent:
      normalizeNullableBoolean(
        input?.textPresent,
        existingMedia?.textPresent ?? null,
        "text_present"
      ),

    brandVisible:
      normalizeNullableBoolean(
        input?.brandVisible,
        existingMedia?.brandVisible ?? null,
        "brand_visible"
      ),

    active:
      normalizeActive(
        input?.active,
        existingMedia?.active ??
          true
      ),

    createdAt:
      existingMedia?.createdAt ||
      now,

    updatedAt:
      now,
  };
}

function normalizeStoredMedia(
  input
) {
  const sourceType =
    SOURCE_TYPES.has(
      input?.sourceType
    )
      ? input.sourceType
      : "general";

  const mediaKind =
    MEDIA_KINDS.has(
      input?.mediaKind
    )
      ? input.mediaKind
      : "image";

  const workspaceId =
    typeof input?.workspaceId === "string" &&
    input.workspaceId.trim()
      ? input.workspaceId.trim()
      : null;

  return {
    id:
      normalizeText(
        input?.id
      ),

    ...(workspaceId
      ? { workspaceId }
      : {}),

    mediaKind,

    sourceType,

    productId:
      sourceType === "product"
        ? normalizeNullableText(
            input?.productId
          )
        : null,

    objectKey:
      normalizeText(
        input?.objectKey
      ),

    imageUrl:
      normalizeNullableText(
        input?.imageUrl
      ),

    altText:
      normalizeText(
        input?.altText
      ),

    description:
      normalizeText(
        input?.description
      ),

    tags:
      normalizeStringList(
        input?.tags
      ),

    experienceTags:
      normalizeStringList(
        input?.experienceTags
      ),

    experienceNote:
      normalizeNullableLimitedText(
        input?.experienceNote,
        null,
        "experience_note",
        MAX_EXPERIENCE_NOTE_LENGTH
      ),

    maxUses:
      Number.isInteger(input?.maxUses) && input.maxUses > 0
        ? input.maxUses
        : null,

    usedCount:
      Number.isInteger(input?.usedCount) && input.usedCount >= 0
        ? input.usedCount
        : 0,

    lastUsedAt:
      normalizeNullableText(
        input?.lastUsedAt
      ),

    cooldownDays:
      Number.isInteger(input?.cooldownDays) && input.cooldownDays >= 0
        ? input.cooldownDays
        : 0,

    originalBytes:
      Number.isInteger(input?.originalBytes) && input.originalBytes >= 0
        ? input.originalBytes
        : null,

    storedBytes:
      Number.isInteger(input?.storedBytes) && input.storedBytes >= 0
        ? input.storedBytes
        : null,

    optimizedContentType:
      normalizeNullableText(
        input?.optimizedContentType
      ),

    storedContentType:
      normalizeNullableText(
        input?.storedContentType
      ),

    sourceDurationSeconds:
      Number.isFinite(input?.sourceDurationSeconds) && input.sourceDurationSeconds > 0
        ? input.sourceDurationSeconds
        : null,

    clipStartSeconds:
      Number.isFinite(input?.clipStartSeconds) && input.clipStartSeconds >= 0
        ? input.clipStartSeconds
        : null,

    clipDurationSeconds:
      Number.isFinite(input?.clipDurationSeconds) && input.clipDurationSeconds > 0
        ? input.clipDurationSeconds
        : null,

    sceneType:
      normalizeNullableLimitedText(
        input?.sceneType,
        null,
        "scene_type",
        MAX_SCENE_TYPE_LENGTH
      ),

    usableAngles:
      normalizeLimitedStringList(
        input?.usableAngles,
        [],
        "usable_angles",
        MAX_USABLE_ANGLES,
        MAX_USABLE_ANGLE_LENGTH
      ),

    peoplePresent:
      normalizeNullableBoolean(
        input?.peoplePresent,
        null,
        "people_present"
      ),

    textPresent:
      normalizeNullableBoolean(
        input?.textPresent,
        null,
        "text_present"
      ),

    brandVisible:
      normalizeNullableBoolean(
        input?.brandVisible,
        null,
        "brand_visible"
      ),

    active:
      input?.active !== false,

    createdAt:
      normalizeNullableText(
        input?.createdAt
      ),

    updatedAt:
      normalizeNullableText(
        input?.updatedAt
      ),
  };
}

async function readMediaStore(
  env
) {
  const stored =
    await getJson(
      env,
      MEDIA_LIBRARY_KEY
    );

  if (
    !stored ||
    !Array.isArray(
      stored.records
    )
  ) {
    return {
      version:
        MEDIA_LIBRARY_VERSION,

      updatedAt:
        null,

      rawRecords:
        [],

      records:
        [],
    };
  }

  return {
    version:
      Number(
        stored.version ||
        MEDIA_LIBRARY_VERSION
      ),

    updatedAt:
      stored.updatedAt ||
      null,

    rawRecords:
      stored.records,

    records:
      stored.records
        .map(
          normalizeStoredMedia
        )
        .filter(
          (media) =>
            media.id &&
            media.objectKey
        ),
  };
}

async function writeMediaStore(
  env,
  records
) {
  const value = {
    version:
      MEDIA_LIBRARY_VERSION,

    updatedAt:
      new Date().toISOString(),

    records,
  };

  await putJson(
    env,
    MEDIA_LIBRARY_KEY,
    value
  );

  return value;
}

function assertUniqueObjectKey(
  records,
  media
) {
  const duplicate =
    records.find(
      (item) =>
        item.id !== media.id &&
        item.objectKey ===
          media.objectKey
    );

  if (duplicate) {
    throw createMediaLibraryError(
      "Media objectKey is already registered",
      "media_object_key_duplicate",
      {
        objectKey:
          media.objectKey,
        mediaId:
          duplicate.id,
      }
    );
  }
}

function normalizeListOptions(
  options
) {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw createMediaLibraryError(
      "Media list options must be an object",
      "media_list_options_invalid"
    );
  }

  const sourceType =
    options.sourceType ===
      undefined
      ? null
      : normalizeSourceType(
          options.sourceType
        );

  let active = null;

  if (
    options.active !==
    undefined
  ) {
    active =
      normalizeActive(
        options.active
      );
  }

  const hasProductId =
    options.productId !==
    undefined;

  return {
    sourceType,
    active,
    hasProductId,
    productId:
      hasProductId
        ? normalizeNullableText(
            options.productId
          )
        : null,
  };
}

export async function createMedia(
  env,
  input,
  workspaceId
) {
  const resolvedWorkspaceId =
    resolveMediaWorkspaceId(
      workspaceId
    );

  const store =
    await readMediaStore(env);

  const workspaceRecords =
    store.records.filter(
      (media) =>
        isInWorkspace(
          media,
          resolvedWorkspaceId
        )
    );

  if (
    workspaceRecords.length >=
    MAX_MEDIA_RECORDS
  ) {
    throw createMediaLibraryError(
      "Media Library has reached its record limit",
      "media_library_limit_reached",
      {
        limit:
          MAX_MEDIA_RECORDS,
      }
    );
  }

  const media =
    normalizeMediaRecord(
      input,
      null,
      resolvedWorkspaceId
    );

  assertUniqueObjectKey(
    store.records,
    media
  );

  await writeMediaStore(
    env,
    mergeWorkspaceMedia(
      store.rawRecords,
      resolvedWorkspaceId,
      [
        media,
        ...workspaceRecords,
      ]
    )
  );

  return media;
}

export async function createMediaBatch(
  env,
  inputs,
  workspaceId
) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw createMediaLibraryError(
      "Media batch must contain at least one item",
      "media_batch_empty"
    );
  }

  const resolvedWorkspaceId =
    resolveMediaWorkspaceId(
      workspaceId
    );
  const store = await readMediaStore(env);
  const workspaceRecords =
    store.records.filter(
      (media) =>
        isInWorkspace(
          media,
          resolvedWorkspaceId
        )
    );
  const availableSlots = MAX_MEDIA_RECORDS - workspaceRecords.length;
  const created = [];
  const failures = [];

  for (let index = 0; index < inputs.length; index += 1) {
    if (created.length >= availableSlots) {
      failures.push({
        index,
        code: "media_library_limit_reached",
        message: "Media Library has reached its record limit",
      });
      continue;
    }

    try {
      const media = normalizeMediaRecord(
        inputs[index],
        null,
        resolvedWorkspaceId
      );
      assertUniqueObjectKey(
        [...store.records, ...created],
        media
      );
      created.push(media);
    } catch (error) {
      failures.push({
        index,
        code: error?.code || "media_validation_failed",
        message: error?.message || String(error),
      });
    }
  }

  if (created.length > 0) {
    await writeMediaStore(
      env,
      mergeWorkspaceMedia(
        store.rawRecords,
        resolvedWorkspaceId,
        [...created].reverse().concat(workspaceRecords)
      )
    );
  }

  return { created, failures };
}

export async function getMedia(
  env,
  mediaId,
  workspaceId
) {
  const normalizedId =
    normalizeText(mediaId);

  if (!normalizedId) {
    return null;
  }

  const resolvedWorkspaceId =
    resolveMediaWorkspaceId(
      workspaceId
    );
  const store =
    await readMediaStore(env);

  return (
    store.records.find(
      (media) =>
        media.id === normalizedId &&
        isInWorkspace(
          media,
          resolvedWorkspaceId
        )
    ) ||
    null
  );
}

export async function getPublicMediaById(
  env,
  mediaId
) {
  const normalizedId =
    normalizeText(mediaId);

  if (!normalizedId) return null;

  const store =
    await readMediaStore(env);

  return store.records.find(
    (media) =>
      media.id === normalizedId
  ) || null;
}

export async function listMedia(
  env,
  options = {},
  workspaceId
) {
  const filters =
    normalizeListOptions(options);

  const resolvedWorkspaceId =
    resolveMediaWorkspaceId(
      workspaceId
    );
  const store =
    await readMediaStore(env);

  return store.records.filter(
    (media) => {
      if (!isInWorkspace(media, resolvedWorkspaceId)) {
        return false;
      }

      if (
        filters.sourceType &&
        media.sourceType !==
          filters.sourceType
      ) {
        return false;
      }

      if (
        filters.active !== null &&
        media.active !==
          filters.active
      ) {
        return false;
      }

      if (
        filters.hasProductId &&
        media.productId !==
          filters.productId
      ) {
        return false;
      }

      return true;
    }
  );
}

export async function updateMedia(
  env,
  mediaId,
  input,
  workspaceId
) {
  const normalizedId =
    normalizeText(mediaId);

  if (!normalizedId) {
    throw createMediaLibraryError(
      "Media id is required",
      "media_id_missing"
    );
  }

  const resolvedWorkspaceId =
    resolveMediaWorkspaceId(
      workspaceId
    );
  const store =
    await readMediaStore(env);

  const workspaceRecords =
    store.records.filter(
      (media) =>
        isInWorkspace(
          media,
          resolvedWorkspaceId
        )
    );

  const existingIndex =
    workspaceRecords.findIndex(
      (media) =>
        media.id ===
        normalizedId
    );

  if (existingIndex < 0) {
    throw createMediaLibraryError(
      "Media record was not found",
      "media_not_found",
      {
        mediaId:
          normalizedId,
      }
    );
  }

  const existingMedia =
    workspaceRecords[
      existingIndex
    ];

  const media =
    normalizeMediaRecord(
      input,
      existingMedia,
      resolvedWorkspaceId
    );

  assertUniqueObjectKey(
    store.records,
    media
  );

  const nextWorkspaceRecords = [
    ...workspaceRecords,
  ];

  nextWorkspaceRecords[
    existingIndex
  ] = media;

  await writeMediaStore(
    env,
    mergeWorkspaceMedia(
      store.rawRecords,
      resolvedWorkspaceId,
      nextWorkspaceRecords
    )
  );

  return media;
}

export async function removeMedia(
  env,
  mediaId,
  workspaceId
) {
  const normalizedId =
    normalizeText(mediaId);

  if (!normalizedId) {
    return false;
  }

  const resolvedWorkspaceId =
    resolveMediaWorkspaceId(
      workspaceId
    );
  const store =
    await readMediaStore(env);

  const workspaceRecords =
    store.records.filter(
      (media) =>
        isInWorkspace(
          media,
          resolvedWorkspaceId
        )
    );

  const nextWorkspaceRecords =
    workspaceRecords.filter(
      (media) =>
        media.id !==
        normalizedId
    );

  if (
    nextWorkspaceRecords.length ===
    workspaceRecords.length
  ) {
    return false;
  }

  await writeMediaStore(
    env,
    mergeWorkspaceMedia(
      store.rawRecords,
      resolvedWorkspaceId,
      nextWorkspaceRecords
    )
  );

  return true;
}

export function isMediaAvailable(
  media,
  at = new Date()
) {
  if (!media?.active) return false;
  if (media.maxUses !== null && media.usedCount >= media.maxUses) {
    return false;
  }
  if (!media.lastUsedAt || !media.cooldownDays) return true;
  const lastUsedAt = new Date(media.lastUsedAt);
  const availableAt = lastUsedAt.getTime() + media.cooldownDays * 86400000;
  return !Number.isNaN(availableAt) && availableAt <= new Date(at).getTime();
}

export async function listAvailableMedia(
  env,
  options = {},
  workspaceId
) {
  const at = options.at || new Date();
  const records = await listMedia(env, {
    sourceType: options.sourceType,
    productId: options.productId,
  }, workspaceId);
  return records.filter((media) => isMediaAvailable(media, at));
}

export async function markMediaUsed(
  env,
  mediaId,
  usedAt = new Date(),
  workspaceId
) {
  const media = await getMedia(
    env,
    mediaId,
    workspaceId
  );
  if (!media) {
    throw createMediaLibraryError(
      "Media record was not found",
      "media_not_found",
      { mediaId: normalizeText(mediaId) }
    );
  }
  return await updateMedia(env, media.id, {
    usedCount: media.usedCount + 1,
    lastUsedAt: new Date(usedAt).toISOString(),
  }, workspaceId);
}
