# Usage: python3 reproduce-defect.py EXTRACTED_SOURCE EXTRACTED_QA NEW_WORK_DIR
from pathlib import Path
import sys,shutil,subprocess,json
source,qa,work=map(lambda p:Path(p).resolve(),sys.argv[1:]);work.mkdir(exist_ok=False)
root=work/'input';shutil.copytree(qa/'fixture',root)
wal=root/'packs/qa-fixture/000003.log';b=bytearray(wal.read_bytes());b[-1]^=255;wal.write_bytes(b)
c=subprocess.run(['node',str(source/'scripts/pack-snapshot.js'),'--root',str(root),'--output',str(work/'output')]);print('Expected nonzero/no output; observed exit',c.returncode)
if (work/'output/snapshot-manifest.json').exists():print(json.dumps(json.loads((work/'output/snapshot-manifest.json').read_text())['packDiagnostics'],indent=2))
