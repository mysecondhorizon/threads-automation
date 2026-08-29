import {
  getPublicMediaById,
} from "../services/media.js";
import {
  getMediaObject,
  headMediaObject,
  MediaStorageError,
} from "../services/media-storage.js";

const MEDIA_PATH_PREFIX = "/media/";
const SAFE_MEDIA_ID = /^[A-Za-z0-9_-]+$/u;

function getMediaId(pathname) {
  if (!pathname.startsWith(MEDIA_PATH_PREFIX)) return null;
  const encodedId = pathname.slice(MEDIA_PATH_PREFIX.length);
  if (!encodedId || encodedId.includes("/")) return null;
  let mediaId;
  try {
    mediaId = decodeURIComponent(encodedId);
  } catch {
    return null;
  }
  if (!SAFE_MEDIA_ID.test(mediaId)) return null;
  return mediaId;
}

function notFound() {
  return new Response("Not Found", { status: 404 });
}

function parseByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(String(value || "").trim());
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size < 1) {
    return null;
  }

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return null;
    const length = Math.min(suffixLength, size);
    return { offset: size - length, length };
  }

  const offset = Number(match[1]);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size) return null;

  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < offset) return null;
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1 };
}

function rangeNotSatisfiable(size) {
  return new Response("Range Not Satisfiable", {
    status: 416,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes */${size}`,
    },
  });
}

export async function handlePublicMedia(request, env, url) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  const mediaId = getMediaId(url.pathname);
  if (!mediaId) return notFound();

  try {
    const media = await getPublicMediaById(
      env,
      mediaId
    );
    if (!media || !media.active) return notFound();

    const rangeHeader = request.headers.get("Range");
    let requestedRange = null;
    let object;

    if (rangeHeader) {
      const head = await headMediaObject(env, media.objectKey);
      if (!head) return notFound();
      requestedRange = parseByteRange(rangeHeader, head.size);
      if (!requestedRange) return rangeNotSatisfiable(head.size);
      object = await getMediaObject(env, media.objectKey, {
        range: requestedRange,
      });
    } else {
      object = await getMediaObject(env, media.objectKey);
    }
    if (!object) return notFound();

    const headers = new Headers({
      "Cache-Control": "public, max-age=300",
    });
    const contentType = object.httpMetadata?.contentType;
    if (contentType) headers.set("Content-Type", contentType);
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    if (object.uploaded) headers.set("Last-Modified", new Date(object.uploaded).toUTCString());
    headers.set("Accept-Ranges", "bytes");

    if (requestedRange) {
      const range = object.range || requestedRange;
      const offset = Number.isSafeInteger(range.offset)
        ? range.offset
        : requestedRange.offset;
      const length = Number.isSafeInteger(range.length)
        ? range.length
        : requestedRange.length;
      headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set("Content-Length", String(length));
      return new Response(object.body, { status: 206, headers });
    }

    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    if (error instanceof MediaStorageError) {
      console.error(error);
      return new Response("Media storage error", { status: 500 });
    }
    console.error(error);
    return new Response("Media endpoint error", { status: 500 });
  }
}
