# Create new content-addressed, read-only QA archives; preserve all originals.
import datetime, hashlib, json, os, shutil, zipfile
from pathlib import Path
root = Path.cwd()
qa = root / 'docs/qa/BR-25-M1'
release = root / 'release'
fixture = Path('/private/tmp/osp-br25-m1-qa-20261003-a')
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
sha = lambda b: hashlib.sha256(b).hexdigest()
encoded = lambda x: (json.dumps(x, indent=2, sort_keys=True) + '\n').encode()
files = ['scripts/pack-snapshot.js', 'scripts/pack-snapshot.py', 'scripts/pack-snapshot.test.js', 'package.json', 'package-lock.json', 'system.json', 'template.json', 'data/item-templates.js', 'scripts/package-release.js', 'scripts/validate-release.js', '.github/workflows/quality.yml', 'vitest.config.js', 'src/module/dialog/add-item/catalog-schema.js', 'LOCAL-DEVELOPMENT.md', 'PRODUCTION-READINESS-BURNDOWN.md', 'docs/BR-07-RULE-AUTHORITY.md', 'docs/BR-07-RULE-MATRIX.json', 'docs/BR-25-CLOSED-SNAPSHOT.md', 'docs/qa/BR-25-M1/build-handoff.py', 'docs/qa/BR-25-M1/create-fixture.mjs', 'docs/qa/BR-25-M1/verify-snapshot.py', 'docs/qa/BR-25-M1/inspect-remote-locks.py']
files += ['data/' + name + '.json' for name in ['ammunition','armor','clothing','gear','livestock','misc','spells','tack','treasure','vehicles','weapons']]
payloads = {name: (root / name).read_bytes() for name in sorted(files)}
source_manifest = {'classification': 'bounded BR-25 milestone 1 source snapshot; no real databases or full release freeze', 'capturedAt': now, 'revision': '327fbc73048223b9875045e6468fc53beca3de4a', 'branch': 'main', 'dirtyWorkspace': True, 'sourceFiles': {name: sha(data) for name, data in payloads.items()}, 'excluded': ['active real LevelDB packs', 'runtime modules beyond the declared milestone scope', 'node_modules', 'artwork', 'campaign/world data'], 'validation': 'implementer-reported; independent QA pending'}
(qa / 'source-snapshot-manifest.json').write_bytes(encoded(source_manifest))
for name, data in payloads.items():
    if (root / name).read_bytes() != data:
        raise RuntimeError('source changed during freeze: ' + name)
manifest = json.loads((fixture / 'snapshot-manifest.json').read_text())
for name, expected in manifest['provenance']['toolHashes'].items():
    if sha(payloads['scripts/' + name]) != expected:
        raise RuntimeError('fixture/tool source mismatch: ' + name)

def archive(base, entries):
    path = release / (base + '-20261003.zip')
    with zipfile.ZipFile(path, 'x', compression=zipfile.ZIP_DEFLATED) as z:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, (1980,1,1,0,0,0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data)
    with zipfile.ZipFile(path) as z:
        if z.testzip() is not None:
            raise RuntimeError('archive CRC failure')
        for name, expected in entries.items():
            if z.read(name) != expected:
                raise RuntimeError('archive entry mismatch: ' + name)
    digest = sha(path.read_bytes())
    addressed = release / (base + '-' + digest + '.zip')
    with addressed.open('xb') as dest:
        dest.write(path.read_bytes())
    path.chmod(0o444)
    addressed.chmod(0o444)
    return {'path': str(addressed), 'alias': str(path), 'sha256': digest, 'bytes': addressed.stat().st_size, 'entries': len(entries), 'entryChecksPassed': True, 'builtAt': now, 'identity': 'content-addressed archive plus SHA-256; read-only retained file'}

source_entries = {'BR25-M1-SOURCE/' + name: data for name, data in payloads.items()}
source_entries['BR25-M1-SOURCE/SOURCE-MANIFEST.json'] = encoded(source_manifest)
source = archive('osp-br25-m1-source', source_entries)
(qa / 'source-archive-receipt.json').write_bytes(encoded(source))
handoff = {'milestone': 'BR-25 M1', 'status': 'implementation ready for independent QA; BR-25 remains open', 'validation': 'implementer-reported with internal verifier review; synthetic fixture only', 'source': source, 'revision': source_manifest['revision'], 'branch': 'main', 'dirtyWorkspace': True, 'canonicalIdentity': manifest['canonicalIdentity'], 'canonicalExportSha256': manifest['packDiagnostics']['qa-fixture']['canonicalFileSha256'], 'fixtureBuiltAt': manifest['builtAt'], 'fixtureRecords': 2, 'checks': {'focusedTests': '11 passed', 'syntaxAndPythonCompilation': 'passed', 'repositoryLint': 'passed', 'Node22_Node24_Rehydration': 'three identical identities', 'rawAndOutputHashes': 'passed', 'archiveEntryBytesAndCRC': 'checked'}, 'blocked': ['real source capture: three locks held by PID 3035 in foundryvtt_narlington on the-citadel', 'full catalog/Foundry/release acceptance', 'live BR-21/22/30'], 'neverRun': ['full runtime suite/build for this milestone', 'release install or Foundry/browser acceptance', 'native Linux/Windows execution', 'forced round-trip mismatch injection'], 'reproduce': ['rtk npm ci', 'rtk npm test -- scripts/pack-snapshot.test.js --maxWorkers=2 --hookTimeout=30000', 'rtk proxy node scripts/pack-snapshot.js --root fixture --output /private/tmp/osp-br25-independent-UNIQUE', 'rtk proxy python3 evidence/verify-snapshot.py fixture'], 'assets': 'All synthetic input bytes included; Node/Python/dependencies needed. Core icon referenced, UI not exercised; no campaign/runtime/Foundry assets in QA bundle.', 'projectSpace': str(root), 'releaseCommitCreated': False, 'minimumSafeRealCapture': 'Approval for graceful shutdown of identified Foundry instance, wait for lock release, capture before restart; or verified closed backup. No stop/kill performed.'}
(qa / 'HANDOFF.json').write_bytes(encoded(handoff))
qa_entries = {'BR25-M1-QA/scripts/' + name: payloads['scripts/' + name] for name in ['pack-snapshot.js', 'pack-snapshot.py', 'pack-snapshot.test.js']}
for name in ['package.json','package-lock.json']:
    qa_entries['BR25-M1-QA/' + name] = payloads[name]
qa_entries['BR25-M1-QA/BR-25-CLOSED-SNAPSHOT.md'] = payloads['docs/BR-25-CLOSED-SNAPSHOT.md']
qa_entries['BR25-M1-QA/HANDOFF.json'] = encoded(handoff)
for file in fixture.rglob('*'):
    if file.is_file():
        qa_entries['BR25-M1-QA/fixture/' + file.relative_to(fixture).as_posix()] = file.read_bytes()
for file in qa.iterdir():
    if file.is_file() and not file.name.startswith('._') and file.name != 'artifact-receipt.json':
        qa_entries['BR25-M1-QA/evidence/' + file.name] = file.read_bytes()
qa_artifact = archive('osp-br25-m1-qa', qa_entries)
receipt = {'classification': 'bounded source and synthetic QA artifacts; no campaign/release acceptance', 'sourceSnapshot': source, 'qaBundle': qa_artifact, 'canonicalPackCatalogIdentity': manifest['canonicalIdentity'], 'canonicalExportSha256': manifest['packDiagnostics']['qa-fixture']['canonicalFileSha256'], 'fixtureBuiltAt': manifest['builtAt'], 'generatedAt': now}
(qa / 'artifact-receipt.json').write_bytes(encoded(receipt))
print(json.dumps(receipt, indent=2))
