"""Run bounded BR23 evidence on local copies; never opens native databases."""
from pathlib import Path
import hashlib,json,shutil,subprocess,tempfile,datetime

root=Path.cwd(); qa=root/'docs/qa/BR-23-M1'
local=Path(tempfile.mkdtemp(prefix='osp-br23-evidence-',dir='/private/tmp'))
files=['migrations/br23-world.js','migrations/fixtures/br23-legacy-world.json','scripts/br23-world-migrate.js','scripts/br23-world-migrate.test.js','src/module/actor/level-up-state.js','src/config/progression.js','package.json','package-lock.json','vitest.config.js','template.json','system.json']
files+=['data/'+n+'.json' for n in ['ammunition','armor','clothing','gear','livestock','misc','spells','tack','treasure','vehicles','weapons']]
sha=lambda b:hashlib.sha256(b).hexdigest()
hashes={}
for name in files:
    data=(root/name).read_bytes(); target=local/name; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data); hashes[name]=sha(data)
deps=Path('/private/tmp/osp-br25-r2-tests-jfhou_kd/node_modules')
shutil.copytree(deps,local/'node_modules',symlinks=True)
records=[]
def run(label,args,expected=0):
    p=subprocess.run(['rtk','proxy']+args,cwd=local,capture_output=True,text=True,timeout=60)
    (qa/(label+'.stdout.txt')).write_text(p.stdout);(qa/(label+'.stderr.txt')).write_text(p.stderr)
    records.append({'label':label,'command':['rtk','proxy']+args,'exitCode':p.returncode,'expectedExitCode':expected})
    assert p.returncode==expected,(label,p.returncode,p.stdout,p.stderr)
    return p
run('fixture-tests',['npm','test','--','scripts/br23-world-migrate.test.js'])
fixture=local/'migrations/fixtures/br23-legacy-world.json'; original=fixture.read_bytes()
run('help',['node','scripts/br23-world-migrate.js','--help'])
run('dry-run',['node','scripts/br23-world-migrate.js','dry-run','--input',str(fixture)])
assert fixture.read_bytes()==original
out=local/'apply';run('apply-copy',['node','scripts/br23-world-migrate.js','apply-copy','--input',str(fixture),'--output',str(out)])
assert fixture.read_bytes()==original and (out/'backup.json').read_bytes()==original
repeat=local/'repeat';p=run('repeat-copy',['node','scripts/br23-world-migrate.js','apply-copy','--input',str(out/'world.json'),'--output',str(repeat)])
assert json.loads(p.stdout)['changes']==[]
assert json.loads((out/'world.json').read_bytes())==json.loads((repeat/'world.json').read_bytes())
restored=local/'restore';run('restore',['node','scripts/br23-world-migrate.js','restore','--backup',str(out),'--output',str(restored)])
assert (restored/'restored.json').read_bytes()==original
bad=local/'corrupt-backup';shutil.copytree(out,bad);(bad/'backup.json').write_bytes(original+b' ')
rejected=local/'rejected';run('corrupt-backup',['node','scripts/br23-world-migrate.js','restore','--backup',str(bad),'--output',str(rejected)],1)
assert not rejected.exists()
for name,digest in hashes.items():assert sha((root/name).read_bytes())==digest,('repository changed during evidence',name)
evidence={'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'synthetic JSON fixtures only; no native or production data','localWorkspace':str(local),'dependencies':'copied existing locked BR25 test dependencies; no clean install claimed','sourceFiles':hashes,'commands':records,'originalSha256':sha(original),'backupSha256':sha((out/'backup.json').read_bytes()),'restoredSha256':sha((restored/'restored.json').read_bytes()),'sourceUnchanged':fixture.read_bytes()==original,'repeatChanges':0,'corruptRestoreOutputExists':rejected.exists()}
(qa/'fixture-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(json.dumps(evidence,indent=2))
