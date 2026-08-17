import { getMedia } from "../services/media.js";
import {
  getMediaObject,
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
    const media = await getMedia(env, mediaId);
    if (!media || !media.active) return notFound();

    const object = await getMediaObject(env, media.objectKey);
    if (!object) return notFound();

    const headers = new Headers({
      "Cache-Control": "public, max-age=300",
    });
    const contentType = object.httpMetadata?.contentType;
    if (contentType) headers.set("Content-Type", contentType);
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    if (object.uploaded) headers.set("Last-Modified", new Date(object.uploaded).toUTCString());

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
