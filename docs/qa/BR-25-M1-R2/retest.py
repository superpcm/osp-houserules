# Synthetic-only corrective retest; no campaign packs opened.
from pathlib import Path
import datetime,hashlib,json,shutil,subprocess,tempfile
root=Path.cwd(); evidence=root/'docs/qa/BR-25-M1-R2'
fixture=Path('/Users/paul/Documents/Codex/2026-10-03/task-2/r1/qa/BR25-M1-R1-QA/fixture')
work=Path(tempfile.mkdtemp(prefix='osp-br25-r2-retest-',dir='/private/tmp'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
tree=lambda p:{f.relative_to(p).as_posix():sha(f) for f in p.rglob('*') if f.is_file()}
results=[]
for label,node,source,corrupt in [('valid22','node',fixture,False),('valid24','/opt/homebrew/opt/node@24/bin/node',fixture,False),('corrupt','node',fixture,True),('sst-clean','node',Path('/Users/paul/Documents/Codex/2026-10-03/task-2/r1/evidence/regression-fixtures/sst-clean-output'),False),('sst-corrupt','node',Path('/Users/paul/Documents/Codex/2026-10-03/task-2/r1/evidence/regression-fixtures/sst-input'),False)]:
 inp=work/(label+'-input');shutil.copytree(source,inp)
 if corrupt:
  wal=inp/'packs/qa-fixture/000003.log';b=bytearray(wal.read_bytes());assert len(b)==466;b[-1]^=255;wal.write_bytes(b)
 before=tree(inp);out=work/(label+'-output');cmd=[node,str(root/'scripts/pack-snapshot.js'),'--root',str(inp),'--output',str(out)]
 proc=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
 (evidence/(label+'.stdout.txt')).write_text(proc.stdout);(evidence/(label+'.stderr.txt')).write_text(proc.stderr)
 result={'case':label,'command':cmd,'exit':proc.returncode,'published':out.exists(),'sourceUnchanged':before==tree(inp),'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 if out.exists():
  m=json.loads((out/'snapshot-manifest.json').read_text());result.update(canonicalIdentity=m['canonicalIdentity'],packDiagnostics=m['packDiagnostics'])
 assert result['sourceUnchanged']
 assert (proc.returncode!=0 and not out.exists()) if (corrupt or label=='sst-corrupt') else (proc.returncode==0 and out.exists())
 results.append(result)
assert results[3]['canonicalIdentity']=='c73ca09885e3c5f852fa1f9301665efeabb2e9b9ad0b77d967d520bfeda8602c'
# Rebuild from saved valid input bytes, rather than from a reopened database.
inp=work/'saved-input';shutil.copytree(work/'valid22-output',inp);out=work/'saved-output'
cmd=['node',str(root/'scripts/pack-snapshot.js'),'--root',str(inp),'--output',str(out)]
proc=subprocess.run(cmd,capture_output=True,text=True,timeout=60);assert proc.returncode==0,proc.stderr
m=json.loads((out/'snapshot-manifest.json').read_text());assert m['canonicalIdentity']==results[0]['canonicalIdentity']==results[1]['canonicalIdentity']
results.append({'case':'saved-input','command':cmd,'exit':proc.returncode,'canonicalIdentity':m['canonicalIdentity']})
report={'work':str(work),'results':results,'status':'implementer checks passed; independent retest pending'}
(evidence/'retest.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
