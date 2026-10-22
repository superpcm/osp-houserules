import { maskedCrc32c } from "./leveldb-log-integrity.js";

const FOOTER_SIZE = 48;
const MAGIC = 0xdb4775248b80fb57n;
const MAX_TABLE = 512 * 1024 * 1024;
const MAX_BLOCK = 128 * 1024 * 1024;
const MAX_RESTARTS = 1_000_000;

function fail(label, message) { throw new Error(`${label}: ${message}`); }

function varint(buffer, offset, label, context) {
  let value = 0n;
  for (let shift = 0n; shift <= 63n; shift += 7n) {
    if (offset >= buffer.length) fail(label, `short ${context} varint`);
    const byte = buffer[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) {
      if (shift === 63n && byte > 1) fail(label, `invalid ${context} varint`);
      return { value, offset };
    }
    if (shift === 63n) fail(label, `invalid ${context} varint`);
  }
  fail(label, `invalid ${context} varint`);
}

function boundedNumber(value, label, context, max = MAX_TABLE) {
  if (value > BigInt(max)) fail(label, `${context} exceeds bound`);
  return Number(value);
}

function handle(buffer, offset, label, context) {
  const parsedOffset = varint(buffer, offset, label, `${context} offset`);
  const parsedSize = varint(buffer, parsedOffset.offset, label, `${context} size`);
  const blockOffset = boundedNumber(parsedOffset.value, label, `${context} offset`);
  const blockSize = boundedNumber(parsedSize.value, label, `${context} size`, MAX_BLOCK);
  if (blockSize === 0) fail(label, `${context} has zero size`);
  return { offset: blockOffset, size: blockSize, offsetEnd: parsedSize.offset };
}

function exactHandle(buffer, offset, label, context) {
  const ref = handle(buffer, offset, label, context);
  if (ref.offsetEnd !== buffer.length) fail(label, `${context} has trailing bytes`);
  return ref;
}

function decodeSnappy(input, label) {
  let header;
  try { header = varint(input, 0, label, "Snappy length"); } catch (error) { throw error; }
  const declared = boundedNumber(header.value, label, "Snappy output length", MAX_BLOCK);
  const output = Buffer.allocUnsafe(declared);
  let inputOffset = header.offset;
  let outputOffset = 0;
  const ensureOutput = length => { if (length > declared - outputOffset) fail(label, "Snappy output exceeds declared length"); };
  while (inputOffset < input.length) {
    const tag = input[inputOffset++];
    const kind = tag & 3;
    if (kind === 0) {
      let length = tag >>> 2;
      if (length < 60) length += 1;
      else {
        const bytes = length - 59;
        if (bytes > 4 || inputOffset + bytes > input.length) fail(label, "invalid Snappy literal length");
        length = 0;
        for (let i = 0; i < bytes; i += 1) length += input[inputOffset++] * (2 ** (8 * i));
        length += 1;
      }
      if (length > input.length - inputOffset) fail(label, "Snappy literal exceeds input");
      ensureOutput(length);
      input.copy(output, outputOffset, inputOffset, inputOffset + length);
      inputOffset += length; outputOffset += length;
    } else {
      let length, distance;
      if (kind === 1) {
        length = ((tag >>> 2) & 7) + 4;
        if (inputOffset >= input.length) fail(label, "short Snappy copy-1");
        distance = ((tag & 0xe0) << 3) | input[inputOffset++];
      } else if (kind === 2) {
        length = (tag >>> 2) + 1;
        if (inputOffset + 2 > input.length) fail(label, "short Snappy copy-2");
        distance = input[inputOffset] | (input[inputOffset + 1] << 8); inputOffset += 2;
      } else if (kind === 3) {
        length = (tag >>> 2) + 1;
        if (inputOffset + 4 > input.length) fail(label, "short Snappy copy-4");
        distance = input.readUInt32LE(inputOffset); inputOffset += 4;
      } else fail(label, `unknown Snappy tag ${kind}`);
      if (!distance || distance > outputOffset) fail(label, "Snappy copy distance out of range");
      ensureOutput(length);
      for (let i = 0; i < length; i += 1) { output[outputOffset] = output[outputOffset - distance]; outputOffset += 1; }
    }
  }
  if (outputOffset !== declared) fail(label, "Snappy output length mismatch");
  return output;
}

function decodeBlock(buffer, compression, label) {
  if (compression === 0) return Buffer.from(buffer);
  if (compression === 1) return decodeSnappy(buffer, label);
  fail(label, `unsupported compression type ${compression}`);
}

function entries(block, label) {
  if (block.length < 4) fail(label, "block is shorter than restart trailer");
  const restartCount = block.readUInt32LE(block.length - 4);
  if (!restartCount || restartCount > MAX_RESTARTS) fail(label, "invalid restart count");
  const restartBytes = restartCount * 4;
  const entriesEnd = block.length - 4 - restartBytes;
  if (entriesEnd < 0) fail(label, "restart array exceeds block");
  let previousRestart = -1;
  let firstRestart = null;
  for (let i = 0; i < restartCount; i += 1) {
    const restart = block.readUInt32LE(entriesEnd + i * 4);
    if (firstRestart === null) firstRestart = restart;
    if ((entriesEnd !== 0 && restart >= entriesEnd) || (entriesEnd === 0 && restart !== 0) || restart < previousRestart || (restartCount > 1 && restart === previousRestart)) fail(label, "invalid restart offset");
    previousRestart = restart;
  }
  const result = [];
  const entryOffsets = [];
  let offset = 0, previousKey = Buffer.alloc(0);
  while (offset < entriesEnd) {
    const entryOffset = offset;
    const shared = varint(block, offset, label, "shared key length"); offset = shared.offset;
    const nonShared = varint(block, offset, label, "non-shared key length"); offset = nonShared.offset;
    const valueLength = varint(block, offset, label, "value length"); offset = valueLength.offset;
    const sharedLength = boundedNumber(shared.value, label, "shared key length", entriesEnd);
    const nonSharedLength = boundedNumber(nonShared.value, label, "non-shared key length", entriesEnd);
    const valueBytes = boundedNumber(valueLength.value, label, "value length", entriesEnd);
    if (sharedLength > previousKey.length || nonSharedLength > entriesEnd - offset || valueBytes > entriesEnd - offset - nonSharedLength) fail(label, "entry exceeds block");
    const key = Buffer.concat([previousKey.subarray(0, sharedLength), block.subarray(offset, offset + nonSharedLength)]);
    offset += nonSharedLength;
    result.push({ key, value: block.subarray(offset, offset + valueBytes) });
    offset += valueBytes; previousKey = key; entryOffsets.push(entryOffset);
  }
  if (offset !== entriesEnd) fail(label, "entry area does not end at restart array");
  if (entriesEnd !== 0 && firstRestart !== 0) fail(label, "first restart offset is not zero");
  const entryOffsetSet = new Set(entryOffsets);
  for (let i = 0; i < restartCount; i += 1) {
    const restart = block.readUInt32LE(entriesEnd + i * 4);
    if (entriesEnd === 0) continue;
    if (!entryOffsetSet.has(restart)) fail(label, "restart offset is not an entry boundary");
    const shared = varint(block, restart, label, "restart shared key length");
    if (shared.value !== 0n) fail(label, "restart entry has a shared key prefix");
  }
  return result;
}

function parseFilter(block, label) {
  if (block.length < 5) fail(label, "filter block is too short");
  const baseLg = block[block.length - 1];
  if (baseLg > 31) fail(label, "invalid filter base log");
  const arrayOffset = block.readUInt32LE(block.length - 5);
  if (arrayOffset > block.length - 5 || ((block.length - 5 - arrayOffset) % 4) !== 0) fail(label, "invalid filter offset array boundary");
  let previous = 0;
  for (let offset = arrayOffset; offset < block.length - 5; offset += 4) {
    const current = block.readUInt32LE(offset);
    if (current < previous || current > arrayOffset) fail(label, "invalid filter offset array");
    previous = current;
  }
}

function readBlock(buffer, ref, label, kind) {
  const end = ref.offset + ref.size + 5;
  if (!Number.isSafeInteger(end) || ref.offset < 0 || end > buffer.length - FOOTER_SIZE) fail(label, `${kind} extent is outside table`);
  const data = buffer.subarray(ref.offset, ref.offset + ref.size);
  const compression = buffer[ref.offset + ref.size];
  const stored = buffer.readUInt32LE(ref.offset + ref.size + 1);
  if (maskedCrc32c(Buffer.concat([data, Buffer.from([compression])])) !== stored) fail(label, `${kind} checksum mismatch at ${ref.offset}`);
  return { decoded: decodeBlock(data, compression, `${label} ${kind} at ${ref.offset}`), end, compression };
}

export function validateTable(input, { label = "LevelDB table" } = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length > MAX_TABLE) fail(label, "table exceeds 512 MiB bound");
  if (buffer.length < FOOTER_SIZE) fail(label, "table is shorter than footer");
  const footerStart = buffer.length - FOOTER_SIZE;
  if (buffer.readBigUInt64LE(buffer.length - 8) !== MAGIC) fail(label, "invalid table magic");
  const footer = buffer.subarray(footerStart, footerStart + 40);
  const meta = handle(footer, 0, label, "metaindex handle");
  const indexInFooter = handle(footer, meta.offsetEnd, label, "index handle");
  const index = { offset: indexInFooter.offset, size: indexInFooter.size, offsetEnd: footerStart + indexInFooter.offsetEnd };
  for (let i = index.offsetEnd; i < buffer.length - 8; i += 1) if (buffer[i] !== 0) fail(label, "non-zero footer padding");
  const refs = new Map();
  const add = (ref, kind) => {
    const key = `${ref.offset}:${ref.size}`;
    if (refs.has(key)) fail(label, `duplicate ${kind} extent`);
    refs.set(key, { ref, kind });
  };
  add(meta, "metaindex"); add(index, "index");
  const indexBlock = readBlock(buffer, index, label, "index");
  const indexEntries = entries(indexBlock.decoded, `${label} index block`);
  let dataBlocks = 0, metadataBlocks = 0, filterBlocks = 0, compressedBlocks = 0;
  for (const entry of indexEntries) {
    const ref = exactHandle(entry.value, 0, label, "data handle");
    add(ref, "data"); dataBlocks += 1;
  }
  const metaBlock = readBlock(buffer, meta, label, "metaindex");
  const metaEntries = entries(metaBlock.decoded, `${label} metaindex block`);
  for (const entry of metaEntries) {
    const name = entry.key.toString("utf8");
    const ref = exactHandle(entry.value, 0, label, `${name} handle`);
    add(ref, name.startsWith("filter.") ? "filter" : "metadata");
    const decoded = readBlock(buffer, ref, label, name);
    metadataBlocks += 1;
    if (name.startsWith("filter.")) { parseFilter(decoded.decoded, `${label} ${name}`); filterBlocks += 1; }
    else entries(decoded.decoded, `${label} ${name}`);
  }
  for (const { ref, kind } of refs.values()) {
    const block = readBlock(buffer, ref, label, kind);
    if (block.compression === 1) compressedBlocks += 1;
    if (kind === "data") entries(block.decoded, `${label} data block`);
  }
  const sorted = [...refs.values()].map(({ ref }) => ({ start: ref.offset, end: ref.offset + ref.size + 5 })).sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const extent of sorted) {
    if (extent.start !== cursor) fail(label, `physical coverage gap or overlap at ${cursor}`);
    if (extent.end > footerStart) fail(label, "block crosses footer");
    cursor = extent.end;
  }
  if (cursor !== footerStart) fail(label, "table has uncovered bytes before footer");
  return { bytes: buffer.length, blocks: refs.size, dataBlocks, metadataBlocks, filterBlocks, compressedBlocks, tableIntegrityVerified: true };
}

export { decodeSnappy, entries, maskedCrc32c };
