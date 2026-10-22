# BR-25 M1 independent QA — FAIL

Exact source archive af40be68fe43663f58b15afb50bc76f1b9268d5ce361527dc1fed8b4d15103a6 and QA archive 0a3fff34316664b8af24207898e2a3982e4dec62672e618e2fcbc6f254c5ac85 verified by SHA-256 and ZIP CRC. Every source manifest entry matched; bundled CLI/helper/tests match between archives. This is the bounded dirty-main snapshot, not a full application or release.

## Blocking defect: AC-25-1 silently accepts corrupt WAL and loses a record

Start with an untouched extracted QA fixture. Copy it to a disposable directory; flip its final WAL byte (`packs/qa-fixture/000003.log`, 466 bytes; byte 465 XOR 255). Execute the unmodified source artifact CLI against that copy. Expected: nonzero exit and no published output for database corruption. Observed: exit 0, status published, one Item record instead of two, `roundTripVerified: true`, empty warnings. Identity becomes 305a09292c32f664af6a7dccf8c591b4943b77f4ffae6983b1cb7648843f293a. Fresh rebuild merely preserves the already reduced export. This violates fail-closed corruption acceptance and makes round-trip success insufficient to establish source integrity.

Reproduce with `rtk proxy python3 reproduce-defect.py EXTRACTED_SOURCE/BR25-M1-SOURCE EXTRACTED_QA/BR25-M1-QA NEW_ABSOLUTE_WORK_DIR`. Install the source lockfile dependencies first. See wal-corrupt.json for the actual CLI command/exit, wal-corrupt-input for damaged input, wal-corrupt for accepted output. No implementation fixes made. Source review indicates normal ClassicLevel recovery defaults are used; investigate strict corruption handling and add a regression case before rerunning independent acceptance.

## Passed

- AC-25-2: independent separate-process ClassicLevel lock holder; actual CLI refused while locked, no output, all fixture file hashes including LOCK unchanged (independent-lock.json).
- AC-25-3/4/5 synthetic scope: Node 22.22.3 and 24.21.0 captures and saved-input rebuild share expected identity cf5dcfbaae859c631228f8d93fed66470906686b767999d4b4a3571dac311c97 and canonical export aa1a51a451dc71d0432f5ff85c5ec2c7925d082f86e96cf40f1d35507f5c0325. Every manifest input/output hash verified; source fixture hashes unchanged; temporary inspection/rebuild directories removed. Provenance recorded. Atomic rename publication inspected in source, not stress-tested under concurrent destination replacement.
- Nine independent CLI cases passed: two version captures, saved-input rebuild, missing input, malformed CURRENT, no declared packs, invalid catalog JSON, symlink input, changed catalog affecting identity. Actual commands, UTC timestamps, expected/observed and exits in results.json. Runner in run-independent.py.
- AC-25-6: exact supplied focused suite: 11/11 passed, covering empty database warning, unsafe/existing output, missing/symlink/hardlink input, actual lock contention and lock lifetime, changed/added input rejection, simulated unsupported OS, malformed CURRENT. This suite did not cover corrupt WAL recovery.
- AC-25-7: documentation accurately limits synthetic mechanism validation and keeps broader release gates pending.

## Commands and environment

Executed from extracted source: `rtk npm ci --ignore-scripts --cache /tmp/osp-br25-independent-npm-cache --fetch-retries=0`; `rtk npm test -- scripts/pack-snapshot.test.js --maxWorkers=2 --hookTimeout=30000`. Native prebuilt ClassicLevel worked without install scripts. Initial sandbox network install failed DNS; authorized network-enabled retry succeeded. Lockfile unchanged. Npm reported 14 dependency advisories (4 moderate, 10 high); not triaged or changed in scoped QA. Environment versions and completion UTC timestamp in environment.json. CLI invocations in evidence JSON.

## Blocked / not run

Real pack capture remains blocked by previously reported locks; no live pack data was read, opened, stopped, or changed during this QA. Full catalog/rule/schema/image validation, overlay reconciliation, release build/install, Foundry runtime/browser acceptance, Linux/native Windows and forced round-trip mismatch injection were not run. Output destination race stress and hostile concurrent filesystem replacement were not run. Synthetic success is not full BR-25 acceptance.

Production/source archive bytes were not modified. All exercise inputs/outputs were disposable local copies. Only this independent evidence directory is added to the project. Implementer records remain unchanged. Retest a newly identified artifact after the corruption defect is fixed; do not accept these exact artifacts.
