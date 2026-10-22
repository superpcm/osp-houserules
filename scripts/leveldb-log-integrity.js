const BLOCK_SIZE = 32 * 1024;
const HEADER_SIZE = 7;
const TYPE_FULL = 1;
const TYPE_FIRST = 2;
const TYPE_MIDDLE = 3;
const TYPE_LAST = 4;

let crcTable;
function makeCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let crc = n;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? ((crc >>> 1) ^ 0x82f63b78) : (crc >>> 1);
    crcTable[n] = crc >>> 0;
  }
  return crcTable;
}

export function crc32c(input) {
  const bytes = Buffer.from(input);
  const table = makeCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (table[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

export function maskedCrc32c(input) {
  const crc = crc32c(input);
  return (((crc >>> 15) | (crc << 17)) + 0xa282ead8) >>> 0;
}

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function readVarint32(buffer, offset, label, context) {
  let value = 0;
  for (let shift = 0; shift < 32; shift += 7) {
    if (offset >= buffer.length) fail(label, `short ${context} varint`);
    const byte = buffer[offset++];
    if (shift === 28 && byte > 15) fail(label, `invalid ${context} varint`);
    value += (byte & 0x7f) * (2 ** shift);
    if (!(byte & 0x80)) return { value, offset };
  }
  fail(label, `invalid ${context} varint`);
}

function validateWriteBatch(payload, label) {
  if (payload.length < 12) fail(label, "write batch is shorter than its 12-byte header");
  const count = payload.readUInt32LE(8);
  let offset = 12;
  let operations = 0;
  while (offset < payload.length && operations < count) {
    const tag = payload[offset++];
    if (tag !== 0 && tag !== 1) fail(label, `invalid write batch operation tag ${tag}`);
    const keyLength = readVarint32(payload, offset, label, "key-length");
    offset = keyLength.offset;
    if (keyLength.value > payload.length - offset) fail(label, "write batch key exceeds payload");
    offset += keyLength.value;
    if (tag === 1) {
      const valueLength = readVarint32(payload, offset, label, "value-length");
      offset = valueLength.offset;
      if (valueLength.value > payload.length - offset) fail(label, "write batch value exceeds payload");
      offset += valueLength.value;
    }
    operations += 1;
  }
  if (operations !== count) fail(label, `write batch count ${count} does not match ${operations} operations`);
  if (offset !== payload.length) fail(label, "write batch has trailing bytes");
  return operations;
}

/** Validate LevelDB log blocks without opening the database natively. */
export function validateLog(input, { label = "LevelDB log", writeBatch = false } = {}) {
  const buffer = Buffer.from(input);
  let offset = 0;
  let fragment = null;
  let physicalRecords = 0;
  let logicalRecords = 0;
  const finish = payload => {
    logicalRecords += 1;
    if (writeBatch) validateWriteBatch(payload, label);
  };

  while (offset < buffer.length) {
    const blockOffset = offset - (offset % BLOCK_SIZE);
    const blockEnd = Math.min(blockOffset + BLOCK_SIZE, buffer.length);
    const remaining = blockEnd - offset;
    if (remaining < HEADER_SIZE) {
      for (let i = offset; i < blockEnd; i += 1) if (buffer[i] !== 0) fail(label, "non-zero truncated block trailer");
      offset = blockEnd;
      continue;
    }
    let allZero = true;
    for (let i = offset; i < blockEnd; i += 1) {
      if (buffer[i] !== 0) { allZero = false; break; }
    }
    if (allZero) { offset = blockEnd; continue; }

    const checksum = buffer.readUInt32LE(offset);
    const length = buffer.readUInt16LE(offset + 4);
    const type = buffer[offset + 6];
    if (![TYPE_FULL, TYPE_FIRST, TYPE_MIDDLE, TYPE_LAST].includes(type)) fail(label, `invalid record type ${type} at byte ${offset}`);
    if (length > blockEnd - offset - HEADER_SIZE) fail(label, "record payload exceeds block boundary");
    const payloadStart = offset + HEADER_SIZE;
    const payload = buffer.subarray(payloadStart, payloadStart + length);
    const crcInput = Buffer.concat([Buffer.from([type]), payload]);
    if (maskedCrc32c(crcInput) !== checksum) fail(label, `checksum mismatch at byte ${offset}`);
    physicalRecords += 1;

    if (type === TYPE_FULL) {
      if (fragment) fail(label, "FULL record encountered during a fragmented record");
      finish(payload);
    } else if (type === TYPE_FIRST) {
      if (fragment) fail(label, "FIRST record encountered during a fragmented record");
      fragment = Buffer.from(payload);
    } else if (type === TYPE_MIDDLE) {
      if (!fragment) fail(label, "orphan MIDDLE record");
      fragment = Buffer.concat([fragment, payload]);
    } else {
      if (!fragment) fail(label, "orphan LAST record");
      finish(Buffer.concat([fragment, payload]));
      fragment = null;
    }
    offset = payloadStart + length;
  }
  if (fragment) fail(label, "dangling fragmented record at end of log");
  return { physicalRecords, logicalRecords };
}

export { BLOCK_SIZE, HEADER_SIZE };
