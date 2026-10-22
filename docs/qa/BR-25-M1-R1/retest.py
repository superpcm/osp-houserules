# Synthetic-only corrective retest; no campaign packs opened.
from pathlib import Path
import datetime,hashlib,json,shutil,subprocess,tempfile
root=Path.cwd(); evidence=root/'docs/qa/BR-25-M1-R1'
fixture=Path('/private/tmp/osp-br25-exact-artifact-gv42mi20/BR25-M1-QA/fixture')
work=Path(tempfile.mkdtemp(prefix='osp-br25-r1-retest-',dir='/private/tmp'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
tree=lambda p:{f.relative_to(p).as_posix():sha(f) for f in p.rglob('*') if f.is_file()}
results=[]
for label,node,source,corrupt in [('valid22','node',fixture,False),('valid24','/opt/homebrew/opt/node@24/bin/node',fixture,False),('corrupt','node',fixture,True)]:
 inp=work/(label+'-input');shutil.copytree(source,inp)
 if corrupt:
  wal=inp/'packs/qa-fixture/000003.log';b=bytearray(wal.read_bytes());assert len(b)==466;b[-1]^=255;wal.write_bytes(b)
 before=tree(inp);out=work/(label+'-output');cmd=[node,str(root/'scripts/pack-snapshot.js'),'--root',str(inp),'--output',str(out)]
 proc=subprocess.run(cmd,capture_output=True,text=True)
 (evidence/(label+'.stdout.txt')).write_text(proc.stdout);(evidence/(label+'.stderr.txt')).write_text(proc.stderr)
 result={'case':label,'command':cmd,'exit':proc.returncode,'published':out.exists(),'sourceUnchanged':before==tree(inp),'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 if out.exists():
  m=json.loads((out/'snapshot-manifest.json').read_text());result.update(canonicalIdentity=m['canonicalIdentity'],packDiagnostics=m['packDiagnostics'])
 assert result['sourceUnchanged']
 assert (proc.returncode!=0 and not out.exists()) if corrupt else (proc.returncode==0 and out.exists())
 results.append(result)
# Rebuild from saved valid input bytes, rather than from a reopened database.
inp=work/'saved-input';shutil.copytree(work/'valid22-output',inp);out=work/'saved-output'
cmd=['node',str(root/'scripts/pack-snapshot.js'),'--root',str(inp),'--output',str(out)]
proc=subprocess.run(cmd,capture_output=True,text=True);assert proc.returncode==0,proc.stderr
m=json.loads((out/'snapshot-manifest.json').read_text());assert m['canonicalIdentity']==results[0]['canonicalIdentity']==results[1]['canonicalIdentity']
results.append({'case':'saved-input','command':cmd,'exit':proc.returncode,'canonicalIdentity':m['canonicalIdentity']})
report={'work':str(work),'results':results,'status':'implementer checks passed; independent retest pending'}
(evidence/'retest.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
