# Verify sealed artifacts and execute their exact source, using existing dependencies.
from pathlib import Path
import hashlib,json,zipfile,tempfile,subprocess,os,datetime
root=Path.cwd();qa=root/'docs/qa/BR-25-M1-R2';r=json.loads((qa/'artifact-receipt.json').read_text());work=Path(tempfile.mkdtemp(prefix='osp-br25-r2-exact-',dir='/private/tmp'))
for key in ['sourceSnapshot','qaBundle']:
 p=Path(r[key]['path']);assert hashlib.sha256(p.read_bytes()).hexdigest()==r[key]['sha256']
 with zipfile.ZipFile(p) as z:assert z.testzip() is None;z.extractall(work)
s=work/'BR25-M1-R2-SOURCE';q=work/'BR25-M1-R2-QA';m=json.loads((s/'SOURCE-MANIFEST.json').read_text())
for n,h in m['sourceFiles'].items():assert hashlib.sha256((s/n).read_bytes()).hexdigest()==h,n
os.symlink(root/'node_modules',s/'node_modules')
results=[]
for label,inp,ok in [('wal',q/'fixture',True),('sst-clean',q/'sst-fixtures/sst-clean-output',True),('sst-corrupt',q/'sst-fixtures/sst-input',False)]:
 tree=lambda:{str(f.relative_to(inp)):hashlib.sha256(f.read_bytes()).hexdigest() for f in inp.rglob('*') if f.is_file()}
 before=tree();out=work/(label+'-output');cmd=['node',str(s/'scripts/pack-snapshot.js'),'--root',str(inp),'--output',str(out)]
 c=subprocess.run(cmd,capture_output=True,text=True,timeout=60);assert tree()==before
 assert (c.returncode==0 and out.exists()) if ok else (c.returncode!=0 and not out.exists())
 row={'case':label,'command':cmd,'exit':c.returncode,'published':out.exists(),'sourceUnchanged':True,'stderr':c.stderr}
 if ok:row['identity']=json.loads((out/'snapshot-manifest.json').read_text())['canonicalIdentity']
 results.append(row)
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'work':str(work),'hashesCRCAndSourceEntries':'passed','results':results,'status':'implementer exact-artifact checks; independent QA pending'}
(qa/'exact-artifact-check.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
