# BR-25 M1 R2 — independent SST checksum retest

R1 independently passed the WAL correction. Its broader SST safeguard failed: equal-length sentinel substitution with a stale checksum was published. Keep those results separate. Full BR-25 remains unaccepted.

Extract source and QA ZIPs into new local directories, install source lockfile dependencies, then run:

```
rtk npm test -- scripts/pack-snapshot.test.js scripts/leveldb-log-integrity.test.js scripts/leveldb-table-integrity.test.js --maxWorkers=2 --hookTimeout=30000
rtk proxy node scripts/pack-snapshot.js --root /ABS/BR25-M1-R2-QA/fixture --output /ABS/NEW_WAL_VALID_OUTPUT
rtk proxy node scripts/pack-snapshot.js --root /ABS/BR25-M1-R2-QA/sst-fixtures/sst-clean-output --output /ABS/NEW_SST_VALID_OUTPUT
rtk proxy node scripts/pack-snapshot.js --root /ABS/BR25-M1-R2-QA/sst-fixtures/sst-input --output /ABS/NEW_SST_CORRUPT_OUTPUT
```

Valid WAL fixture expects two records and canonical identity cf5dcfbaae859c631228f8d93fed66470906686b767999d4b4a3571dac311c97. Clean SST fixture expects three records and identity c73ca09885e3c5f852fa1f9301665efeabb2e9b9ad0b77d967d520bfeda8602c. Corrupt SST must exit nonzero, publish no output and preserve every input byte. Check source file hashes before/after independently. Regression suite creates additional disposable compressed/uncompressed SST data; no real packs are needed.

Checksums detect accidental corruption; this tool does not establish malicious-tamper resistance or full catalog/rule fidelity. Original artifacts/evidence remain preserved. No real-pack or production files were changed; no shutdown, deployment, merge or publication occurred. Not run: real closed-pack capture, full application/build, release install, Foundry/browser acceptance, native Linux/Windows or hostile filesystem races. Exact archive hashes, source entry hashes, dirty source identity and timestamps accompany the handoff receipt. Internal reviews and implementer checks are separate from independent QA.

Supported format is bundled LevelDB table format with compression type 0 (none) or 1 (raw Snappy). R2 fails closed above a 512 MiB table or 128 MiB decoded block, or for unsupported compression/metadata formats. These are explicit tool limits, not campaign rules. Native Linux/Windows and larger tables were not exercised.
