import { describe, expect, it } from "vitest";
import { maskedCrc32c, validateTable, decodeSnappy, entries } from "./leveldb-table-integrity.js";

const handle = value => { const out = []; do { let byte = value & 0x7fn; value >>= 7n; if (value) byte |= 0x80n; out.push(Number(byte)); } while (value); return Buffer.from(out); };
const trailer = (payload, compression = 0) => { const out = Buffer.concat([payload, Buffer.from([compression]), Buffer.alloc(4)]); out.writeUInt32LE(maskedCrc32c(Buffer.concat([payload, Buffer.from([compression])])), payload.length + 1); return out; };
const entry = (key, value) => Buffer.concat([Buffer.from([0, key.length, value.length]), Buffer.from(key), value]);
function table() { const dataPayload = Buffer.concat([entry("a", Buffer.from("value")), Buffer.from([0, 0, 0, 0, 1, 0, 0, 0])]); const metaPayload = Buffer.from([0, 0, 0, 0, 1, 0, 0, 0]); const data = trailer(dataPayload), meta = trailer(metaPayload); const indexPayload = Buffer.concat([entry("a", Buffer.concat([handle(0n), handle(BigInt(dataPayload.length))])), Buffer.from([0, 0, 0, 0, 1, 0, 0, 0])]); const index = trailer(indexPayload); const footer = Buffer.alloc(48); let cursor = 0; for (const bytes of [handle(BigInt(data.length)), handle(BigInt(metaPayload.length)), handle(BigInt(data.length + meta.length)), handle(BigInt(indexPayload.length))]) { bytes.copy(footer, cursor); cursor += bytes.length; } footer.writeBigUInt64LE(0xdb4775248b80fb57n, 40); return Buffer.concat([data, meta, index, footer]); }

describe("LevelDB table integrity", () => {
  it("accepts checksum-correct structure and reports data blocks", () => { expect(validateTable(table())).toMatchObject({ tableIntegrityVerified: true, dataBlocks: 1, compressedBlocks: 0 }); });
  it("rejects stale CRC, truncation, and malformed structure", () => { const valid = table(); const stale = Buffer.from(valid); stale[1] ^= 1; expect(() => validateTable(stale)).toThrow(/checksum/); expect(() => validateTable(valid.subarray(0, -1))).toThrow(); const bad = Buffer.from(valid); bad[0] = 0xff; expect(() => validateTable(bad)).toThrow(); });
  it("decodes overlapping Snappy copies and rejects malformed output", () => { expect(decodeSnappy(Buffer.from([8, 0, 97, 0x1a, 1, 0]), "snappy").toString()).toBe("aaaaaaaa"); expect(() => decodeSnappy(Buffer.from([4, 0x3c, 0xff]), "snappy")).toThrow(); });
});

describe("SST structural boundaries", () => {
  const recheckData = bytes => bytes.writeUInt32LE(maskedCrc32c(bytes.subarray(0, 18)), 18);
  it.each([0, 22, 35])("rejects stored-byte mutation in data/meta/index block at %s", offset => {
    const bytes = table(); bytes[offset] ^= 1;
    expect(() => validateTable(bytes)).toThrow(/checksum/);
  });
  it("rejects unsupported compression with a valid checksum", () => {
    const bytes = table(); bytes[17] = 2; recheckData(bytes);
    expect(() => validateTable(bytes)).toThrow(/compression/);
  });
  it("rejects malformed data structure even after checksum is recomputed", () => {
    const bytes = table(); bytes[0] = 1; recheckData(bytes);
    expect(() => validateTable(bytes)).toThrow(/entry/);
    const restart = table(); restart[9] = 1; recheckData(restart);
    expect(() => validateTable(restart)).toThrow(/restart/);
  });
  it("rejects uncovered bytes with otherwise valid blocks", () => {
    const valid = table(); const bytes = Buffer.concat([valid.subarray(0, 22), Buffer.alloc(1), valid.subarray(22)]);
    const footer = bytes.length - 48; bytes[footer] += 1; bytes[footer + 2] += 1;
    expect(() => validateTable(bytes)).toThrow(/coverage/);
  });
  it("rejects footer padding and bounded handles", () => {
    const padding = table(); padding[padding.length - 9] = 1;
    expect(() => validateTable(padding)).toThrow(/padding/);
    const handle = table(); handle[handle.length - 48 + 3] = 127;
    expect(() => validateTable(handle)).toThrow(/extent|table/);
    const magic = table(); magic[magic.length - 1] ^= 1;
    expect(() => validateTable(magic)).toThrow(/magic/);
  });
  it("accepts empty blocks and rejects invalid restart boundaries", () => {
    expect(entries(Buffer.from([0,0,0,0,1,0,0,0]), "empty")).toEqual([]);
    expect(() => entries(Buffer.from([0,0,0,0,2,0,0,0]), "bad")).toThrow(/restart/);
  });
  it.each([
    [1, 0, 97, 0, 98],
    [1, 0xfc, 255, 255, 255, 255],
    [0x81, 0x80, 0x80, 0x40],
    [1, 1, 0],
    [2, 0, 97]
  ])("rejects malformed or excessive Snappy stream %s", (...stream) => {
    expect(() => decodeSnappy(Buffer.from(stream), "bad Snappy")).toThrow();
  });
});
