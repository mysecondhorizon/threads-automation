import {
  getMediaObject,
  headMediaObject,
} from "./media-storage.js";

const HEAD_READ_BYTES = 512 * 1024;
const TAIL_READ_BYTES = 2 * 1024 * 1024;
const FIXED_ONE = 65536;
const MATRIX_ONE = 1073741824;

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
  if (!object?.body) throw new Error("Temporary video could not be read for orientation parsing");
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

function findMoovFromHead(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 8 <= bytes.byteLength;) {
    const box = readBox(bytes, view, offset, bytes.byteLength);
    if (!box) return null;
    if (box.type === "moov") return box;
    offset = box.end;
  }
  return null;
}

function findMoovsFromTail(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = [];
  for (let typeOffset = 4; typeOffset + 4 <= bytes.byteLength; typeOffset += 1) {
    if (fourCc(bytes, typeOffset) !== "moov") continue;
    const box = readBox(bytes, view, typeOffset - 4, bytes.byteLength);
    if (box?.type === "moov") boxes.push(box);
  }
  return boxes;
}

function childBoxes(bytes, parent) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = [];
  for (let offset = parent.offset + parent.headerLength; offset + 8 <= parent.end;) {
    const box = readBox(bytes, view, offset, parent.end);
    if (!box) return null;
    boxes.push(box);
    offset = box.end;
  }
  return boxes;
}

function isVideoTrack(bytes, trak) {
  const mdia = childBoxes(bytes, trak)?.find((box) => box.type === "mdia");
  const hdlr = mdia && childBoxes(bytes, mdia)?.find((box) => box.type === "hdlr");
  if (!hdlr) return false;
  const handlerTypeOffset = hdlr.offset + hdlr.headerLength + 8;
  return handlerTypeOffset + 4 <= hdlr.end && fourCc(bytes, handlerTypeOffset) === "vide";
}

function rotationFromTkhd(bytes, tkhd) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const content = tkhd.offset + tkhd.headerLength;
  if (content + 4 > tkhd.end) return null;
  const version = view.getUint8(content);
  if (version !== 0 && version !== 1) return null;
  const matrixOffset = content + (version === 1 ? 52 : 40);
  if (matrixOffset + 36 > tkhd.end) return null;
  const matrix = Array.from({ length: 9 }, (_, index) => view.getInt32(matrixOffset + index * 4));
  const [a, b, u, c, d, v, , , w] = matrix;
  if (u !== 0 || v !== 0 || w !== MATRIX_ONE) return null;
  if (a === FIXED_ONE && b === 0 && c === 0 && d === FIXED_ONE) return 0;
  if (a === 0 && b === FIXED_ONE && c === -FIXED_ONE && d === 0) return 90;
  if (a === -FIXED_ONE && b === 0 && c === 0 && d === -FIXED_ONE) return 180;
  if (a === 0 && b === -FIXED_ONE && c === FIXED_ONE && d === 0) return 270;
  return null;
}

function orientationFromMoov(bytes, moov) {
  const tracks = childBoxes(bytes, moov)?.filter((box) => box.type === "trak");
  if (!tracks) return { status: "skip" };
  const videoTrack = tracks.find((track) => isVideoTrack(bytes, track));
  if (!videoTrack) return { status: "skip" };
  const tkhd = childBoxes(bytes, videoTrack)?.find((box) => box.type === "tkhd");
  const degrees = tkhd ? rotationFromTkhd(bytes, tkhd) : null;
  return degrees === null
    ? { status: "unsupported" }
    : { status: "success", degrees };
}

function orientationFromHead(bytes) {
  const moov = findMoovFromHead(bytes);
  return moov ? orientationFromMoov(bytes, moov) : { status: "skip" };
}

function orientationFromTail(bytes) {
  for (const moov of findMoovsFromTail(bytes)) {
    const result = orientationFromMoov(bytes, moov);
    if (result.status !== "skip") return result;
  }
  return { status: "skip" };
}

function degreesOrThrow(result) {
  if (result.status === "success") return result.degrees;
  if (result.status === "unsupported") {
    throw new Error("MP4 orientation matrix is unsupported");
  }
  return null;
}

export async function readMp4OrientationDegrees(env, objectKey) {
  const head = await headMediaObject(env, objectKey);
  const size = Number(head?.size);
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("Temporary video size is invalid");
  const headLength = Math.min(HEAD_READ_BYTES, size);
  const headOrientation = degreesOrThrow(orientationFromHead(
    await readRange(env, objectKey, 0, headLength)
  ));
  if (headOrientation !== null) return headOrientation;
  if (size > headLength) {
    const tailOffset = Math.max(0, size - TAIL_READ_BYTES);
    const tailOrientation = degreesOrThrow(orientationFromTail(
      await readRange(env, objectKey, tailOffset, size - tailOffset)
    ));
    if (tailOrientation !== null) return tailOrientation;
  }
  throw new Error("MP4 orientation metadata was not found in bounded reads");
}
