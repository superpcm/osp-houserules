#!/usr/bin/env python3
"""Read-only hash/content audit of a BR-25 snapshot; not Foundry acceptance."""
import argparse, base64, collections, hashlib, json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('snapshot', type=Path)
parser.add_argument('--source', type=Path)
a = parser.parse_args()
raw = json.loads((a.snapshot / 'raw-manifest.json').read_text())
errors = []
for name, expected in raw['sourceFiles'].items():
    copied = a.snapshot / name
    if not copied.is_file() or hashlib.sha256(copied.read_bytes()).hexdigest() != expected:
        errors.append('snapshot hash mismatch: ' + name)
    if a.source:
        source = a.source / name
        if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != expected:
            errors.append('source hash mismatch: ' + name)
reports = {}
for file in sorted((a.snapshot / 'canonical').glob('*.json')):
    export = json.loads(file.read_text())
    keys = [base64.b64decode(row['key'], validate=True) for row in export['entries']]
    if keys != sorted(keys) or len(set(keys)) != len(keys):
        errors.append('key order/uniqueness: ' + file.name)
    types = collections.Counter()
    items = []
    non_documents = 0
    invalid_json = 0
    for row in export['entries']:
        try:
            document = json.loads(base64.b64decode(row['value'], validate=True))
        except (ValueError, UnicodeDecodeError):
            invalid_json += 1
            continue
        if isinstance(document, dict) and 'name' in document and 'type' in document:
            types[str(document['type'])] += 1
            items.append({'key': base64.b64decode(row['key']).decode('utf8', errors='replace'), 'id': document.get('_id'), 'name': document.get('name'), 'type': document.get('type'), 'image': document.get('img')})
        else:
            non_documents += 1
    reports[file.stem] = {'records': len(keys), 'canonicalFileSha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'types': dict(types), 'invalidJsonValues': invalid_json, 'nonDocumentValues': non_documents, 'items': items}
print(json.dumps({'validation': 'implementer-reported read-only audit; catalog/Foundry acceptance pending', 'snapshot': str(a.snapshot), 'sourceCompared': str(a.source) if a.source else None, 'errors': errors, 'packs': reports}, indent=2, sort_keys=True))
raise SystemExit(1 if errors else 0)
