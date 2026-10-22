# BR-25 M1 R1: independent retest handoff

The original artifacts FAILED independent QA. Their reports and sealed archives are retained. R1 corrects the exact WAL mutation false-success with strict physical-log and write-batch preflight, before native recovery. BR-25 remains unaccepted pending independent retest and broader gates.

Extract the new source ZIP and QA ZIP into separate local folders. From BR25-M1-R1-SOURCE install the locked dependencies (`rtk npm ci`), then run:

```
rtk npm test -- scripts/pack-snapshot.test.js scripts/leveldb-log-integrity.test.js --maxWorkers=2 --hookTimeout=30000
rtk proxy node scripts/pack-snapshot.js --root /ABS/BR25-M1-R1-QA/fixture --output /ABS/NEW_OUTPUT
rtk proxy python3 /ABS/BR25-M1-R1-QA/evidence/independent-reproduce-defect.py /ABS/BR25-M1-R1-SOURCE /ABS/BR25-M1-R1-QA /ABS/NEW_CORRUPT_WORK
```

Expected valid canonical identity: cf5dcfbaae859c631228f8d93fed66470906686b767999d4b4a3571dac311c97; two records. The last-byte mutation must exit nonzero and publish no output. Independently compare all corrupt input hashes before/after and confirm cleanup. The retained reproducer prints the result; it does not assert it. `retest.json` records implementer checks, not independent acceptance.

Source revision, dirty-worktree declaration, precise selected-entry hashes/source identity, timestamps, runtime provenance, and exact artifact SHA-256 are in SOURCE-MANIFEST.json and artifact-receipt.json. Installed dependencies are excluded; no clean dependency install was performed for R1. Existing locked dependencies were used.

Not run: real pack capture, full application suite/build, clean install, release/Foundry/browser acceptance, native Linux/Windows, SST block checksum validation, output race stress. The native diagnostic guard is supplementary; its success does not verify all SST block checksums. No production pack mutation, shutdown, deployment, merge or publication occurred.
