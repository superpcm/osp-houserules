# New archives only; all old artifacts remain untouched.
from pathlib import Path
import datetime,hashlib,json,subprocess,zipfile
root=Path.cwd();qa=root/'docs/qa/BR-25-M1-R1';release=root/'release'
sha=lambda b:hashlib.sha256(b).hexdigest()
enc=lambda x:(json.dumps(x,indent=2,sort_keys=True)+'\n').encode()
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
old=release/'osp-br25-m1-source-af40be68fe43663f58b15afb50bc76f1b9268d5ce361527dc1fed8b4d15103a6.zip'
with zipfile.ZipFile(old) as z: names=[n.split('/',1)[1] for n in z.namelist() if not n.endswith('SOURCE-MANIFEST.json')]
names+=['scripts/leveldb-log-integrity.js','scripts/leveldb-log-integrity.test.js','docs/qa/BR-25-M1-R1/package.py','docs/qa/BR-25-M1-R1/retest.py']
payload={n:(root/n).read_bytes() for n in sorted(set(names))}
revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
manifest={'capturedAt':now,'revision':revision,'branch':'main','dirtyWorkspace':True,'sourceFiles':{n:sha(b) for n,b in payload.items()},'scope':'bounded WAL corruption correction; no real packs/full release','independentAcceptance':'pending','limitations':['SST block checksum validation pending','real closed-pack capture blocked','Foundry/catalog/release acceptance not run']}
manifest['sourceIdentity']=sha(enc(manifest['sourceFiles']))
(qa/'source-snapshot-manifest.json').write_bytes(enc(manifest))
for n,b in payload.items():assert (root/n).read_bytes()==b,n
report=json.loads((qa/'retest.json').read_text());fixture=Path(report['work'])/'valid22-output'
m=json.loads((fixture/'snapshot-manifest.json').read_text())
for n,h in m['provenance']['toolHashes'].items():assert sha(payload['scripts/'+n])==h,n

def archive(base,entries):
 temp=release/(base+'-'+datetime.datetime.now().strftime('%Y%m%dT%H%M%S')+'.zip')
 with zipfile.ZipFile(temp,'x',compression=zipfile.ZIP_DEFLATED) as z:
  for n,b in sorted(entries.items()):
   i=zipfile.ZipInfo(n,(1980,1,1,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o100644<<16;z.writestr(i,b)
 with zipfile.ZipFile(temp) as z:
  assert z.testzip() is None
  for n,b in entries.items():assert z.read(n)==b,n
 digest=sha(temp.read_bytes());dest=release/(base+'-'+digest+'.zip')
 with dest.open('xb') as f:f.write(temp.read_bytes())
 temp.chmod(0o444);dest.chmod(0o444)
 return {'path':str(dest),'sha256':digest,'bytes':dest.stat().st_size,'entries':len(entries),'builtAt':now}
source=archive('osp-br25-m1-r1-source',{'BR25-M1-R1-SOURCE/'+n:b for n,b in payload.items()}|{'BR25-M1-R1-SOURCE/SOURCE-MANIFEST.json':enc(manifest)})
entries={'BR25-M1-R1-QA/'+n:b for n,b in payload.items() if n.startswith('scripts/pack-snapshot') or n.startswith('scripts/leveldb-log-integrity') or n in ['package.json','package-lock.json','vitest.config.js']}
for f in fixture.rglob('*'):
 if f.is_file():entries['BR25-M1-R1-QA/fixture/'+f.relative_to(fixture).as_posix()]=f.read_bytes()
for f in qa.iterdir():
 if f.is_file() and not f.name.startswith('._') and f.name!='artifact-receipt.json':entries['BR25-M1-R1-QA/evidence/'+f.name]=f.read_bytes()
entries['BR25-M1-R1-QA/evidence/independent-original-REPORT.md']=(root/'docs/qa/BR-25-M1-independent/REPORT.md').read_bytes()
entries['BR25-M1-R1-QA/SOURCE-RECEIPT.json']=enc(source)
artifact=archive('osp-br25-m1-r1-qa',entries)
receipt={'sourceSnapshot':source,'qaBundle':artifact,'generatedAt':now,'revision':revision,'dirtyWorkspace':True,'sourceIdentity':manifest['sourceIdentity'],'canonicalIdentity':m['canonicalIdentity'],'status':'ready for independent retest; BR-25 unaccepted'}
(qa/'artifact-receipt.json').write_bytes(enc(receipt));print(json.dumps(receipt,indent=2))
