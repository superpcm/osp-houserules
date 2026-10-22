from pathlib import Path
import subprocess,shutil,hashlib,json,datetime
W=Path(__file__).resolve().parents[1];S=W/'source/BR25-M1-R1-SOURCE';F=W/'qa/BR25-M1-R1-QA/fixture';R=W/'regressions';R.mkdir();E=W/'evidence';results=[]
def hashes(p):return {str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in p.rglob('*') if f.is_file()}
def run(label,p,expected):
 out=R/(label+'-output');before=hashes(p);cmd=['node',str(S/'scripts/pack-snapshot.js'),'--root',str(p),'--output',str(out)];c=subprocess.run(cmd,capture_output=True,text=True,timeout=40)
 r=dict(case=label,timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),command=cmd,expected=expected,exit=c.returncode,stdout=c.stdout,stderr=c.stderr,sourceUnchanged=before==hashes(p),outputExists=out.exists());assert r['sourceUnchanged']
 if out.exists():r['diagnostics']=json.loads((out/'snapshot-manifest.json').read_text())['packDiagnostics']
 results.append(r);(E/'regressions.json').write_text(json.dumps(results,indent=2));return r
for label in ['original-wal-bitflip','wal-truncate-one','wal-invalid-type','wal-short-header','manifest-bitflip']:
 p=R/(label+'-input');shutil.copytree(F,p);wal=p/'packs/qa-fixture/000003.log';b=bytearray(wal.read_bytes())
 if label=='original-wal-bitflip':b[-1]^=255
 elif label=='wal-truncate-one':b=b[:-1]
 elif label=='wal-invalid-type':b[6]=9
 elif label=='wal-short-header':b=b[:3]
 else:wal=next((p/'packs/qa-fixture').glob('MANIFEST-*'));b=bytearray(wal.read_bytes());b[-1]^=255
 wal.write_bytes(b);r=run(label,p,'reject without output');assert r['exit']!=0 and not r['outputExists']
p=R/'locked-input';shutil.copytree(F,p);h=subprocess.Popen(['node',str(S/'qa-helper.mjs'),'lock',str(p/'packs/qa-fixture')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True);assert h.stdout.readline().strip()=='READY'
try:r=run('locked',p,'reject without output');assert r['exit']!=0 and not r['outputExists']
finally:h.communicate('close\n',timeout=10)
p=R/'sst-input';shutil.copytree(F,p);subprocess.run(['node',str(S/'qa-helper.mjs'),'sst',str(p/'packs/qa-fixture')],check=True)
r=run('sst-clean',p,'publish');assert r['exit']==0
for f in (p/'packs/qa-fixture').glob('*.ldb'):
 b=f.read_bytes()
 if b'SST original sentinel' in b:
  f.write_bytes(b.replace(b'SST original sentinel',b'SST modified sentinel'));break
else:raise AssertionError('uncompressed sentinel missing')
r=run('sst-payload-corruption',p,'full AC-25-1 would reject; R1 explicitly excludes SST validation')
print(json.dumps(results,indent=2))
