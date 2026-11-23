"""Vocabulary presentation overrides and consented match feedback; no automatic training."""
import json

SQLITE_SCHEMA='''
CREATE TABLE IF NOT EXISTS vocabulary_settings(word_id TEXT PRIMARY KEY,description TEXT NOT NULL,video_path TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS match_feedback(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,predicted TEXT NOT NULL,expected TEXT NOT NULL,verdict TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL);
'''
class ExperienceStore:
 def __init__(self,connect,root,error,now):self.connect=connect;self.root=root;self.error=error;self.now=now
 def catalog(self):
  items=json.loads((self.root/'models/motion-vocabulary.json').read_text(encoding='utf-8'))['items']
  existing={item['id'] for item in items}
  for label in ['HELLO','THANK YOU','PLEASE','YES','NO','FINISH','DRINK','WATER','BOOK','FOOD','HUNGRY','LIKE','GO','NAME','HOME','HAVE','WANT','LOVE']:
   word=label.lower().replace(' ','-')
   if word not in existing:items.append({'id':word,'label':label,'note':''})
  return items
 def settings(self):
  with self.connect() as db:rows=db.execute('SELECT word_id,description,video_path,hidden,updated_at FROM vocabulary_settings').fetchall()
  labels={x['id']:x['label'] for x in self.catalog()}
  return {'items':{r['word_id']:{'description':r['description'],'video':r['video_path'],'hidden':bool(r['hidden']),'label':labels.get(r['word_id'],'')} for r in rows}}
