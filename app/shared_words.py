import json,math,hashlib,threading,os
from pathlib import Path
LOCK=threading.Lock()
FILE=Path(os.environ.get('HANDSPEAK_DATA_DIR',str(Path(__file__).parent.parent/'data')))/'shared-words.json'
def digest(row): return hashlib.sha256(json.dumps(row,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def handle(h,method):
 if h.path.split('?')[0]!='/api/shared-words': return False
 if method not in ('GET','POST'): h.send_error(405);return True
 if method=='POST':
  h.check_origin();data=h.read_json();adds=data.get('add',[]);remove=data.get('remove',[])
  if not isinstance(adds,list) or len(adds)>96 or not isinstance(remove,list) or len(remove)>2000: h.send_error(422);return True
  for r in adds:
   if not isinstance(r,dict) or not isinstance(r.get('label'),str) or not 1<=len(r['label'])<=30: h.send_error(422);return True
   seq=r.get('sequence')
   if not isinstance(seq,list) or len(seq)!=20 or any(not isinstance(f,list) or len(f)!=128 or any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>=50 for v in f) or f[0] not in (0,1) or f[64] not in (0,1) for f in seq): h.send_error(422);return True
 with LOCK:
  rows=json.loads(FILE.read_text()) if FILE.exists() else []
  if method=='POST':
   labels=data.get('removeLabels',[])
   if not isinstance(labels,list) or any(not isinstance(x,str) for x in labels): h.send_error(422);return True
   byid={digest(r):r for r in rows if digest(r) not in remove and r['label'] not in labels}
   for r in adds: byid[digest(r)]=r
   if len(byid)>2000: h.send_error(413);return True
   rows=list(byid.values());FILE.parent.mkdir(parents=True,exist_ok=True);temp=FILE.with_suffix('.tmp');temp.write_text(json.dumps(rows));temp.replace(FILE)
 h.json_response({'samples':rows});return True
