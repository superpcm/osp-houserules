import pathlib,subprocess,json,hashlib,shutil,datetime,os
W=pathlib.Path(__file__).resolve().parents[1]; E=W/'evidence'; S=W/'source/BR25-M1-R1-SOURCE'; F=W/'qa/BR25-M1-R1-QA/fixture'; R=W/'runs';R.mkdir(exist_ok=True)
results=[]
def hashes(p): return {str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.rglob('*')) if f.is_file()}
def run(label,root,ok=True,node='node',extra=None):
 out=R/label;cmd=[node,str(S/'scripts/pack-snapshot.js'),'--root',str(root),'--output',str(out)] if extra is None else extra
 before=hashes(root);t=datetime.datetime.now(datetime.timezone.utc).isoformat(); c=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
 (E/(label+'.log')).write_text(c.stdout+c.stderr)
 r=dict(case=label,command=cmd,timestamp=t,exit=c.returncode,expected='publish' if ok else 'reject without output',outputExists=out.exists(),sourceUnchanged=before==hashes(root),stdout=c.stdout,stderr=c.stderr)
 assert (c.returncode==0)==ok,r
 assert out.exists()==ok,r
 assert r['sourceUnchanged'],r
 if ok:
  m=json.loads((out/'snapshot-manifest.json').read_text());r['identity']=m['canonicalIdentity'];r['diagnostics']=m['packDiagnostics']
  for f,h in m['source']['sourceFiles'].items(): assert hashlib.sha256((out/f).read_bytes()).hexdigest()==h
  for f,h in m['outputFiles'].items(): assert hashlib.sha256((out/f).read_bytes()).hexdigest()==h
  assert not (out/'.inspect').exists() and not (out/'.roundtrip').exists()
 results.append(r);(E/'results.json').write_text(json.dumps(results,indent=2));return out
sm=json.loads((S/'SOURCE-MANIFEST.json').read_text());assert all(hashes(S)[f]==h for f,h in sm['sourceFiles'].items())
for name in ['pack-snapshot.js','pack-snapshot.py','pack-snapshot.test.js']: assert (S/'scripts'/name).read_bytes()==(W/'qa/BR25-M1-R1-QA/scripts'/name).read_bytes()
a=run('build-a',F);b=run('build-b',F,node='/opt/homebrew/opt/node@24/bin/node');c=run('saved-input-rebuild',a)
assert len({r['identity'] for r in results})==1
assert results[0]['identity']=='cf5dcfbaae859c631228f8d93fed66470906686b767999d4b4a3571dac311c97'
for label,edit in [('missing',lambda p:(p/'template.json').unlink()),('corrupt',lambda p:(p/'packs/fixture/CURRENT').write_text('bad manifest\n')),('no-packs',lambda p:(p/'system.json').write_text('{"packs":[]}')),('bad-json',lambda p:(p/'data/gear.json').write_text('{')),('symlink',lambda p:((p/'template.json').unlink(),(p/'template.json').symlink_to(p/'package.json')))]:
 p=R/(label+'-input');shutil.copytree(F,p)
 if label=='corrupt':
  pack=json.loads((p/'system.json').read_text())['packs'][0]['path'];(p/pack/'CURRENT').write_text('bad manifest\n')
 else:edit(p)
 run(label,p,False)
p=R/'changed-catalog-input';shutil.copytree(F,p);(p/'data/gear.json').write_text('[]');run('changed-catalog',p);assert results[-1]['identity']!=results[0]['identity']
print('independent cases passed',len(results))
