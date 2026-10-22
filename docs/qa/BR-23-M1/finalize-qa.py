"""Add exact-source-artifact verification to a fresh immutable QA bundle."""
from pathlib import Path
import datetime,hashlib,json,zipfile

root=Path.cwd();qa=root/'docs/qa/BR-23-M1';receiptPath=qa/'artifact-receipt.json'
receipt=json.loads(receiptPath.read_text());previous=receipt['qaBundle'];now=datetime.datetime.now(datetime.timezone.utc).isoformat()
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(Path(receipt['sourceSnapshot']['path']).read_bytes())==receipt['sourceSnapshot']['sha256']
validation=json.loads((qa/'artifact-validation.json').read_text())
assert validation['sourceArchiveSha256']==receipt['sourceSnapshot']['sha256']
assert validation['sourceIdentity']==receipt['sourceIdentity']
with zipfile.ZipFile(previous['path']) as z:
    entries={n:z.read(n) for n in z.namelist() if '/evidence/' not in n}
for file in qa.iterdir():
    if file.is_file() and not file.name.startswith('._') and file.name!='artifact-receipt.json':entries['BR23-M1-QA/evidence/'+file.name]=file.read_bytes()
temp=root/'release'/('osp-br23-m1-qa-final-'+datetime.datetime.now().strftime('%Y%m%dT%H%M%S')+'.zip')
with zipfile.ZipFile(temp,'x',compression=zipfile.ZIP_DEFLATED) as z:
    for name,data in sorted(entries.items()):
        info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,data)
with zipfile.ZipFile(temp) as z:
    assert z.testzip() is None
    for name,data in entries.items():assert z.read(name)==data,name
digest=sha(temp.read_bytes());dest=root/'release'/('osp-br23-m1-qa-'+digest+'.zip')
with dest.open('xb') as f:f.write(temp.read_bytes())
temp.chmod(0o444);dest.chmod(0o444)
receipt.setdefault('previousQaBundles',[]).append(previous)
receipt['qaBundle']={'path':str(dest),'sha256':digest,'bytes':dest.stat().st_size,'entries':len(entries),'builtAt':now}
receipt['exactSourceArtifactValidation']='artifact-validation.json';receipt['generatedAt']=now
receiptPath.write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n');print(json.dumps(receipt,indent=2))
