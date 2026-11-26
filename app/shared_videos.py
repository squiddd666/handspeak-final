import json, os, uuid, re, threading
from pathlib import Path
from urllib.parse import urlparse,unquote
LOCK=threading.Lock()
ROOT=Path(os.environ.get('HANDSPEAK_DATA_DIR',str(Path(__file__).parent.parent/'data')))/'reference-videos'
ROOT.mkdir(parents=True,exist_ok=True)
def handle(h,method):
 path=urlparse(h.path).path
 if not path.startswith('/api/reference-videos'): return False
 if method!='GET': h.check_origin()
 match=re.fullmatch(r'/api/reference-videos/([a-f0-9]{32})',path)
 if method=='GET' and path=='/api/reference-videos':
  with LOCK: rows=[json.loads(p.read_text()) for p in ROOT.glob('*.json')]
  h.json_response({'videos':rows});return True
 if method=='POST' and path=='/api/reference-videos':
  label=unquote(h.headers.get('X-Video-Label','')).strip()[:60]
  kind=h.headers.get('Content-Type','').split(';')[0]
  try: size=int(h.headers.get('Content-Length','0'))
  except ValueError: size=0
  if not label or kind not in ('video/mp4','video/webm','video/ogg','video/quicktime') or not 0<size<=104857600:
   h.json_response({'error':'Enter a word and choose MP4, WebM, Ogg or MOV up to 100 MB.'},422);return True
  key=uuid.uuid4().hex;blob=h.rfile.read(size)
  if len(blob)!=size: h.send_error(400);return True
  row={'id':key,'label':label.upper(),'type':kind,'url':'/api/reference-videos/'+key}
  with LOCK:
   (ROOT/(key+'.video')).write_bytes(blob)
   (ROOT/(key+'.json')).write_text(json.dumps(row))
  h.json_response(row,201);return True
 if match:
  key=match[1]
  if method=='DELETE':
   with LOCK:
    for ext in ('.json','.video'): (ROOT/(key+ext)).unlink(missing_ok=True)
   h.json_response({'deleted':True});return True
  if method=='GET' and (ROOT/(key+'.json')).exists():
   row=json.loads((ROOT/(key+'.json')).read_text());clip=ROOT/(key+'.video')
   h.send_response(200);h.send_header('Content-Type',row['type']);h.send_header('Content-Length',str(clip.stat().st_size));h.send_header('X-Content-Type-Options','nosniff');h.end_headers()
   with clip.open('rb') as f:
    while chunk:=f.read(65536): h.wfile.write(chunk)
   return True
 h.send_error(404);return True
