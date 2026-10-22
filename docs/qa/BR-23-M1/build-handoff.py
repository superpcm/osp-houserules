# Bounded offline BR23 source/evidence archive; excludes all native databases.
from pathlib import Path
import datetime,hashlib,json,subprocess,zipfile
root=Path.cwd();qa=root/'docs/qa/BR-23-M1';release=root/'release';now=datetime.datetime.now(datetime.timezone.utc).isoformat()
sha=lambda b:hashlib.sha256(b).hexdigest();enc=lambda x:(json.dumps(x,indent=2,sort_keys=True)+'\n').encode()
files=['migrations/br23-world.js','scripts/br23-world-migrate.js','scripts/br23-world-migrate.test.js','migrations/fixtures/br23-legacy-world.json','src/module/actor/level-up-state.js','template.json','system.json','package.json','package-lock.json','vitest.config.js','docs/BR-23-OFFLINE-MIGRATIONS.md','migrations/README.md','PRODUCTION-READINESS-BURNDOWN.md','docs/qa/BR-23-M1/build-handoff.py']
files+=['src/config/progression.js','docs/qa/BR-23-M1/run-fixture-evidence.py']
files+=['data/'+n+'.json' for n in ['ammunition','armor','clothing','gear','livestock','misc','spells','tack','treasure','vehicles','weapons']]
payload={n:(root/n).read_bytes() for n in files}
revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
manifest={'capturedAt':now,'revision':revision,'branch':'main','dirtyWorkspace':True,'scope':'offline synthetic migration and byte rollback; no native databases or runtime integration','sourceFiles':{n:sha(b) for n,b in sorted(payload.items())},'independentAcceptance':'pending'};manifest['sourceIdentity']=sha(enc(manifest['sourceFiles']))
for n,b in payload.items():assert (root/n).read_bytes()==b,n
(qa/'SOURCE-MANIFEST.json').write_bytes(enc(manifest))
def archive(kind,entries):
 temp=release/('osp-br23-m1-'+kind+'-'+datetime.datetime.now().strftime('%Y%m%dT%H%M%S')+'.zip')
 with zipfile.ZipFile(temp,'x',compression=zipfile.ZIP_DEFLATED) as z:
  for n,b in sorted(entries.items()):
   info=zipfile.ZipInfo(n,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,b)
 with zipfile.ZipFile(temp) as z:
  assert z.testzip() is None
  for n,b in entries.items():assert z.read(n)==b,n
 digest=sha(temp.read_bytes());dest=release/('osp-br23-m1-'+kind+'-'+digest+'.zip')
 with dest.open('xb') as f:f.write(temp.read_bytes())
 temp.chmod(0o444);dest.chmod(0o444)
 return {'path':str(dest),'sha256':digest,'bytes':dest.stat().st_size,'entries':len(entries),'builtAt':now}
source=archive('source',{'BR23-M1-SOURCE/'+n:b for n,b in payload.items()}|{'BR23-M1-SOURCE/SOURCE-MANIFEST.json':enc(manifest)})
entries={'BR23-M1-QA/source/'+n:b for n,b in payload.items()}
for f in qa.iterdir():
 if f.is_file() and not f.name.startswith('._') and f.name!='artifact-receipt.json':entries['BR23-M1-QA/evidence/'+f.name]=f.read_bytes()
entries['BR23-M1-QA/SOURCE-RECEIPT.json']=enc(source)
qaArchive=archive('qa',entries)
receipt={'sourceSnapshot':source,'qaBundle':qaArchive,'generatedAt':now,'revision':revision,'dirtyWorkspace':True,'sourceIdentity':manifest['sourceIdentity'],'status':'ready for independent QA; full BR23 remains open'}
(qa/'artifact-receipt.json').write_bytes(enc(receipt));print(json.dumps(receipt,indent=2))
