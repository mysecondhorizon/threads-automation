import assert from "node:assert/strict";
import test from "node:test";
import {
  MP4_IDENTITY_MATRIX,
  findVideoTkhdMatrix,
  patchVideoTkhdMatrixToIdentity,
} from "./mp4-tkhd-matrix.js";

const ROTATE_90 = [0, 65536, 0, -65536, 0, 0, 0, 0, 1073741824];

function box(type, payload) {
  const bytes = new Uint8Array(8 + payload.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.byteLength);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(payload, 8);
  return bytes;
}

function join(...parts) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

function tkhd(version, matrix, width = 1080, height = 1920) {
  const matrixOffset = version === 1 ? 52 : 40;
  const payload = new Uint8Array(matrixOffset + 44);
  const view = new DataView(payload.buffer);
  view.setUint8(0, version);
  matrix.forEach((value, index) => view.setInt32(matrixOffset + index * 4, value));
  view.setUint32(matrixOffset + 36, width * 65536);
  view.setUint32(matrixOffset + 40, height * 65536);
  return box("tkhd", payload);
}

function trak(handler, version, matrix) {
  const hdlr = new Uint8Array(12);
  hdlr.set(new TextEncoder().encode(handler), 8);
  return box("trak", join(tkhd(version, matrix), box("mdia", box("hdlr", hdlr))));
}

function fixture(version, matrix, includeAudio = false) {
  const tracks = includeAudio
    ? [trak("soun", version, ROTATE_90), trak("vide", version, matrix)]
    : [trak("vide", version, matrix)];
  return box("moov", join(...tracks));
}

test("patches version 0 video tkhd 90 degrees to identity", () => {
  const bytes = fixture(0, ROTATE_90);
  const descriptor = findVideoTkhdMatrix(bytes);
  assert.equal(descriptor.rotation, 90);
  const after = patchVideoTkhdMatrixToIdentity(bytes, descriptor);
  assert.equal(after.rotation, 0);
  assert.deepEqual(after.matrix, MP4_IDENTITY_MATRIX);
});

test("patches version 1 video tkhd 90 degrees to identity", () => {
  const bytes = fixture(1, ROTATE_90);
  const descriptor = findVideoTkhdMatrix(bytes);
  assert.equal(descriptor.version, 1);
  assert.equal(patchVideoTkhdMatrixToIdentity(bytes, descriptor).rotation, 0);
});

test("leaves an identity video tkhd matrix unchanged", () => {
  const bytes = fixture(0, MP4_IDENTITY_MATRIX);
  const before = new Uint8Array(bytes);
  const descriptor = findVideoTkhdMatrix(bytes);
  assert.equal(descriptor.rotation, 0);
  patchVideoTkhdMatrixToIdentity(bytes, descriptor);
  assert.deepEqual(bytes, before);
});

test("rejects corrupt or unsupported video tkhd matrices", () => {
  const corrupt = new Uint8Array([0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x76]);
  assert.equal(findVideoTkhdMatrix(corrupt), null);
  const bytes = fixture(0, [2, 0, 0, 0, 2, 0, 0, 0, 1073741824]);
  assert.throws(() => patchVideoTkhdMatrixToIdentity(bytes, findVideoTkhdMatrix(bytes)));
});

test("patches only the video track when audio precedes it", () => {
  const bytes = fixture(0, ROTATE_90, true);
  const descriptor = findVideoTkhdMatrix(bytes);
  const audioMatrixOffset = 8 + 8 + 8 + 40;
  const audioBefore = bytes.slice(audioMatrixOffset, audioMatrixOffset + 36);
  patchVideoTkhdMatrixToIdentity(bytes, descriptor);
  assert.deepEqual(bytes.slice(audioMatrixOffset, audioMatrixOffset + 36), audioBefore);
  assert.equal(findVideoTkhdMatrix(bytes).rotation, 0);
});
