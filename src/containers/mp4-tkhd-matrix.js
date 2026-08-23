const FIXED_ONE = 65536;
const MATRIX_ONE = 1073741824;

export const MP4_IDENTITY_MATRIX = [
  FIXED_ONE, 0, 0,
  0, FIXED_ONE, 0,
  0, 0, MATRIX_ONE,
];

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
    const end = offset + Number(size64);
    return end <= limit ? { type, offset, end, headerLength: 16 } : null;
  }
  if (size32 < 8) return null;
  const end = offset + size32;
  return end <= limit ? { type, offset, end, headerLength: 8 } : null;
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
  const moovs = [];
  for (let typeOffset = 4; typeOffset + 4 <= bytes.byteLength; typeOffset += 1) {
    if (fourCc(bytes, typeOffset) !== "moov") continue;
    const box = readBox(bytes, view, typeOffset - 4, bytes.byteLength);
    if (box?.type === "moov") moovs.push(box);
  }
  return moovs;
}

function isVideoTrack(bytes, trak) {
  const mdia = childBoxes(bytes, trak)?.find((box) => box.type === "mdia");
  const hdlr = mdia && childBoxes(bytes, mdia)?.find((box) => box.type === "hdlr");
  if (!hdlr) return false;
  const handlerTypeOffset = hdlr.offset + hdlr.headerLength + 8;
  return handlerTypeOffset + 4 <= hdlr.end && fourCc(bytes, handlerTypeOffset) === "vide";
}

function rotationFromMatrix(matrix) {
  const [a, b, u, c, d, v, , , w] = matrix;
  if (u !== 0 || v !== 0 || w !== MATRIX_ONE) return null;
  if (a === FIXED_ONE && b === 0 && c === 0 && d === FIXED_ONE) return 0;
  if (a === 0 && b === FIXED_ONE && c === -FIXED_ONE && d === 0) return 90;
  if (a === -FIXED_ONE && b === 0 && c === 0 && d === -FIXED_ONE) return 180;
  if (a === 0 && b === -FIXED_ONE && c === FIXED_ONE && d === 0) return 270;
  return null;
}

function describeVideoTkhd(bytes, moov) {
  const tracks = childBoxes(bytes, moov)?.filter((box) => box.type === "trak");
  if (!tracks) return null;
  const trackIndex = tracks.findIndex((track) => isVideoTrack(bytes, track));
  if (trackIndex < 0) return null;
  const trak = tracks[trackIndex];
  const tkhd = childBoxes(bytes, trak)?.find((box) => box.type === "tkhd");
  if (!tkhd) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const content = tkhd.offset + tkhd.headerLength;
  if (content + 4 > tkhd.end) return null;
  const version = view.getUint8(content);
  if (version !== 0 && version !== 1) return null;
  const matrixOffset = content + (version === 1 ? 52 : 40);
  if (matrixOffset + 44 > tkhd.end) return null;
  const matrix = Array.from({ length: 9 }, (_, index) => view.getInt32(matrixOffset + index * 4));
  return {
    trackIndex,
    version,
    matrixOffset,
    matrix,
    rotation: rotationFromMatrix(matrix),
    width: view.getUint32(matrixOffset + 36) / FIXED_ONE,
    height: view.getUint32(matrixOffset + 40) / FIXED_ONE,
  };
}

export function findVideoTkhdMatrix(bytes, { tail = false } = {}) {
  const moovs = tail
    ? findMoovsFromTail(bytes)
    : [findMoovFromHead(bytes)].filter(Boolean);
  for (const moov of moovs) {
    const descriptor = describeVideoTkhd(bytes, moov);
    if (descriptor) return descriptor;
  }
  return null;
}

export function identityMatrixBytes() {
  const bytes = new Uint8Array(36);
  const view = new DataView(bytes.buffer);
  MP4_IDENTITY_MATRIX.forEach((value, index) => view.setInt32(index * 4, value));
  return bytes;
}

export function patchVideoTkhdMatrixToIdentity(bytes, descriptor) {
  if (!descriptor || descriptor.rotation === null) {
    throw new Error("MP4 video tkhd matrix is unsupported");
  }
  if (descriptor.matrixOffset < 0 || descriptor.matrixOffset + 36 > bytes.byteLength) {
    throw new Error("MP4 video tkhd matrix offset is invalid");
  }
  bytes.set(identityMatrixBytes(), descriptor.matrixOffset);
  return findVideoTkhdMatrix(bytes, { tail: false });
}
