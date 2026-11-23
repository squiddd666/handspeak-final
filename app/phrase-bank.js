// Phrase-bank matching: an ordered sequence of sign label ids to a stored English sentence, from the
// data file models/phrase-bank.json (schema handspeak-phrase-bank-v1). The caller loads and parses the
// file; this module only reads the parsed object. Matching is exact: after aliases are replaced, the
// sequence must equal a phrase's signs (or one of its variants' signs) in order and in full. Only
// active phrases match unless includeInactive is given. This is a lookup of stored sentences, not
// translation. No browser object is touched when the module loads.

export const PHRASE_BANK_SCHEMA='handspeak-phrase-bank-v1';
const PHRASE_JOIN='\u0001';
const phraseLabelForm=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').toUpperCase():'';

// Problems that would make matching unreliable, as plain sentences; an empty list means none found.
export function phraseBankProblems(bank){
  const problems=[];
  if(!bank||typeof bank!=='object')return ['the file is not an object'];
  if(bank.schema!==PHRASE_BANK_SCHEMA)problems.push(`schema is ${JSON.stringify(bank.schema)}, not ${PHRASE_BANK_SCHEMA}`);
  if(!bank.labels||typeof bank.labels!=='object'||Array.isArray(bank.labels))problems.push('labels is missing');
  if(!Array.isArray(bank.phrases))problems.push('phrases is missing');
  if(problems.length)return problems;
  const labels=new Set(Object.keys(bank.labels)),aliasOwner=new Map(),ids=new Set();
  for(const [id,entry] of Object.entries(bank.labels)){
    if(phraseLabelForm(id)!==id)problems.push(`label ${JSON.stringify(id)} is not in label-id form`);
    for(const alias of entry?.aliases||[]){
      const key=phraseLabelForm(alias);
      if(labels.has(key)&&key!==id)problems.push(`alias ${alias} of ${id} is itself a label`);
      if(aliasOwner.has(key)&&aliasOwner.get(key)!==id)problems.push(`alias ${alias} belongs to ${aliasOwner.get(key)} and ${id}`);
      aliasOwner.set(key,id);
    }
  }
  const sequenceProblems=(owner,signs,glosses)=>{
    if(!Array.isArray(signs)||!signs.length){problems.push(`${owner}: signs is empty`);return;}
    for(const sign of signs)if(!labels.has(sign))problems.push(`${owner}: sign ${JSON.stringify(sign)} is not among the labels`);
    if(!Array.isArray(glosses)||glosses.length!==signs.length||!glosses.every(g=>typeof g==='string'&&g))problems.push(`${owner}: glosses do not give one gloss per sign`);
  };
  for(const phrase of bank.phrases){
    const owner=phrase?.id||'a phrase without an id';
    if(typeof phrase?.id!=='string'||!phrase.id)problems.push('a phrase has no id');
    else if(ids.has(phrase.id))problems.push(`phrase id ${phrase.id} is used twice`);
    ids.add(phrase?.id);
    if(typeof phrase?.english!=='string'||!phrase.english.trim())problems.push(`${owner}: english is empty`);
    if(typeof phrase?.active!=='boolean')problems.push(`${owner}: active is not true or false`);
    sequenceProblems(owner,phrase?.signs,phrase?.glosses);
    if(phrase?.variants!==undefined&&!Array.isArray(phrase.variants))problems.push(`${owner}: variants is not a list`);
    (Array.isArray(phrase?.variants)?phrase.variants:[]).forEach((variant,index)=>sequenceProblems(`${owner} variant ${index+1}`,variant?.signs,variant?.glosses));
  }
  return problems;
}

// Every sequence that can match: each phrase's signs and each variant's signs.
function phraseSequences(bank,includeInactive){
  const list=[];
  for(const phrase of bank.phrases){
    if(!phrase.active&&!includeInactive)continue;
    list.push({phraseId:phrase.id,english:phrase.english,signs:phrase.signs.slice(),glosses:phrase.glosses.slice(),variant:false,active:phrase.active});
    for(const variant of phrase.variants||[])list.push({phraseId:phrase.id,english:phrase.english,signs:variant.signs.slice(),glosses:variant.glosses.slice(),variant:true,active:phrase.active});
  }
  return list;
}

// Sequences that would make the first-match rule ambiguous: two equal sequences, or one sequence
// that is the start of another (the shorter would complete before the longer could be signed).
export function phraseSequenceClashes(bank,{includeInactive=false}={}){
  const list=phraseSequences(bank,includeInactive),clashes=[];
  for(let i=0;i<list.length;i++)for(let j=0;j<list.length;j++){
    if(i===j)continue;
    const a=list[i].signs,b=list[j].signs;
    if(a.length>b.length||!a.every((sign,k)=>sign===b[k]))continue;
    if(a.length===b.length){if(i<j)clashes.push({kind:'same sequence',first:list[i].phraseId,second:list[j].phraseId,signs:a.slice()});}
    else clashes.push({kind:'prefix',shorter:list[i].phraseId,longer:list[j].phraseId,signs:a.slice()});
  }
  return clashes;
}

// match(labelIds) -> {phraseId, english, glosses, glossLine, variant} or null.
export function createPhraseMatcher(bank,{includeInactive=false}={}){
  const problems=phraseBankProblems(bank);
  if(problems.length)throw new Error(`The phrase bank cannot be used: ${problems[0]}`);
  const alias=new Map();
  for(const [id,entry] of Object.entries(bank.labels)){alias.set(id,id);for(const name of entry.aliases||[])alias.set(phraseLabelForm(name),id);}
  const table=new Map();
  for(const item of phraseSequences(bank,includeInactive)){const key=item.signs.join(PHRASE_JOIN);if(!table.has(key))table.set(key,item);}
  const match=labelIds=>{
    if(!Array.isArray(labelIds)||!labelIds.length)return null;
    const ids=labelIds.map(value=>{const key=phraseLabelForm(value);return alias.get(key)||key;});
    const item=table.get(ids.join(PHRASE_JOIN));
    return item?{phraseId:item.phraseId,english:item.english,glosses:item.glosses.slice(),glossLine:item.glosses.join(' '),variant:item.variant}:null;
  };
  // Label id of a recognizer label or alias, or null when the bank does not know it.
  match.labelId=value=>alias.get(phraseLabelForm(value))||null;
  return match;
}
