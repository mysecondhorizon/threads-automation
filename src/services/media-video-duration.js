import {
  getMediaObject,
  headMediaObject,
} from "./media-storage.js";

const HEAD_READ_BYTES = 512 * 1024;
const TAIL_READ_BYTES = 2 * 1024 * 1024;

function fourCc(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readBox(bytes, view, offset, limit) {
  if (offset < 0 || offset + 8 > limit) return null;
  const size32 = view.getUint32(offset);
  const type = fourCc(bytes, offset + 4);
  if (size32 === 0) return null;
  if (size32 === 1) {
    if (offset + 16 > limit) return null;
    const size64 = view.getBigUint64(offset + 8);
    if (size64 < 16n || size64 > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    const size = Number(size64);
    const end = offset + size;
    return end <= limit ? { type, offset, end, headerLength: 16 } : null;
  }
  if (size32 < 8) return null;
  const end = offset + size32;
  return end <= limit ? { type, offset, end, headerLength: 8 } : null;
}

async function readRange(env, objectKey, offset, length) {
  const object = await getMediaObject(env, objectKey, { range: { offset, length } });
  if (!object?.body) throw new Error("Temporary video could not be read");
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

function readMvhdDuration(bytes, moov) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = moov.offset + moov.headerLength; offset + 8 <= moov.end;) {
    const child = readBox(bytes, view, offset, moov.end);
    if (!child) return null;
    if (child.type === "mvhd") {
      const content = child.offset + child.headerLength;
      if (content + 20 > child.end) return null;
      const version = view.getUint8(content);
      if (version !== 0 && version !== 1) return null;
      const timescaleOffset = version === 1 ? content + 20 : content + 12;
      const durationOffset = version === 1 ? content + 24 : content + 16;
      const durationSize = version === 1 ? 8 : 4;
      if (durationOffset + durationSize > child.end) return null;
      const timescale = view.getUint32(timescaleOffset);
      if (!timescale) return null;
      const durationValue = version === 1 ? view.getBigUint64(durationOffset) : view.getUint32(durationOffset);
      if (typeof durationValue === "bigint" && durationValue > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      const seconds = Number(durationValue) / timescale;
      return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    }
    offset = child.end;
  }
  return null;
}

function durationFromHead(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 8 <= bytes.byteLength;) {
    const box = readBox(bytes, view, offset, bytes.byteLength);
    if (!box) return null;
    if (box.type === "moov") return readMvhdDuration(bytes, box);
    offset = box.end;
  }
  return null;
}

function durationFromTail(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let typeOffset = 4; typeOffset + 4 <= bytes.byteLength; typeOffset += 1) {
    if (fourCc(bytes, typeOffset) !== "moov") continue;
    const moov = readBox(bytes, view, typeOffset - 4, bytes.byteLength);
    if (!moov || moov.type !== "moov") continue;
    const duration = readMvhdDuration(bytes, moov);
    if (duration) return duration;
  }
  return null;
}

export async function readMp4DurationSeconds(env, objectKey) {
  const head = await headMediaObject(env, objectKey);
  const size = Number(head?.size);
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("Temporary video size is invalid");
  const headLength = Math.min(HEAD_READ_BYTES, size);
  const headDuration = durationFromHead(await readRange(env, objectKey, 0, headLength));
  if (headDuration) return headDuration;
  if (size > headLength) {
    const tailOffset = Math.max(0, size - TAIL_READ_BYTES);
    const tailDuration = durationFromTail(await readRange(env, objectKey, tailOffset, size - tailOffset));
    if (tailDuration) return tailDuration;
  }
  throw new Error("MP4 duration metadata was not found in bounded reads");
}
