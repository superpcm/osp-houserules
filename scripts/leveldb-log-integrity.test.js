import { describe, expect, it } from "vitest";
import { BLOCK_SIZE, crc32c, maskedCrc32c, validateLog } from "./leveldb-log-integrity.js";

const record = (type, payload) => {
  const body = Buffer.concat([Buffer.from([type]), Buffer.from(payload)]);
  const header = Buffer.alloc(7);
  header.writeUInt32LE(maskedCrc32c(body), 0);
  header.writeUInt16LE(payload.length, 4);
  header[6] = type;
  return Buffer.concat([header, payload]);
};
const batch = (operations, count = operations.length) => {
  const head = Buffer.alloc(12); head.writeUInt32LE(count, 8);
  const body = operations.map(({ tag, key, value }) => {
    const keyBuffer = Buffer.from(key);
    const parts = [Buffer.from([tag]), Buffer.from([keyBuffer.length]), keyBuffer];
    if (tag === 1) { const valueBuffer = Buffer.from(value); parts.push(Buffer.from([valueBuffer.length]), valueBuffer); }
    return Buffer.concat(parts);
  });
  return Buffer.concat([head, ...body]);
};

describe("LevelDB log integrity", () => {
  it("uses the Castagnoli CRC32C and LevelDB mask", () => {
    expect(crc32c(Buffer.from("123456789"))).toBe(0xe3069283);
    expect(maskedCrc32c(Buffer.from("123456789"))).toBe(0xc78ab0e5);
  });

  it("accepts empty logs, zero padding, and valid records", () => {
    expect(validateLog(Buffer.alloc(0))).toEqual({ physicalRecords: 0, logicalRecords: 0 });
    expect(validateLog(Buffer.concat([record(1, Buffer.from("ok")), Buffer.alloc(BLOCK_SIZE - 9)]))).toEqual({ physicalRecords: 1, logicalRecords: 1 });
  });

  it("validates write batches and counts one completed logical record", () => {
    const payload = batch([{ tag: 1, key: "a", value: "b" }, { tag: 0, key: "c" }]);
    expect(validateLog(record(1, payload), { writeBatch: true })).toEqual({ physicalRecords: 1, logicalRecords: 1 });
  });

  it("rejects a recomputed checksum with a mismatched write-batch count", () => {
    const payload = batch([{ tag: 1, key: "a", value: "b" }], 2);
    expect(() => validateLog(record(1, payload), { writeBatch: true })).toThrow(/count/);
  });

  it("rejects a write-batch varint with bits beyond uint32", () => {
    const payload = Buffer.alloc(18);
    payload.writeUInt32LE(1, 8);
    payload[12] = 0;
    payload.set([0x80, 0x80, 0x80, 0x80, 0x10], 13);
    expect(() => validateLog(record(1, payload), { writeBatch: true })).toThrow(/varint/);
  });

  it.each(["checksum", "type", "length", "truncated"]) ("rejects malformed %s records", kind => {
    const valid = record(1, Buffer.from("payload"));
    const broken = Buffer.from(valid);
    if (kind === "checksum") broken[0] ^= 1;
    if (kind === "type") broken[6] = 9;
    if (kind === "length") broken.writeUInt16LE(100, 4);
    if (kind === "truncated") broken[4] = 20;
    expect(() => validateLog(broken)).toThrow();
  });

  it("assembles records fragmented across 32 KiB blocks", () => {
    const firstPayload = Buffer.alloc(BLOCK_SIZE - 7, 7);
    const first = record(2, firstPayload);
    const last = record(4, Buffer.from("tail"));
    expect(first.length).toBe(BLOCK_SIZE);
    expect(validateLog(Buffer.concat([first, last]))).toEqual({ physicalRecords: 2, logicalRecords: 1 });
  });

  it("rejects orphan, nested, and dangling fragments", () => {
    expect(() => validateLog(record(3, Buffer.from("x")))).toThrow(/orphan/);
    expect(() => validateLog(Buffer.concat([record(2, Buffer.from("x")), record(1, Buffer.from("y"))]))).toThrow(/FULL/);
    expect(() => validateLog(record(2, Buffer.from("x")))).toThrow(/dangling/);
  });
});
