// Ordered sequence of sign events, kept apart from the message draft.
// Each event is one recognized and accepted sign: a label id, the label shown, the time, the
// recognizer it came from and whether a person confirmed it. A multi-word label (THANK YOU, I / ME)
// is one event and is removed as one. After every change the caller's phrase matcher is asked with
// the ordered label ids of the open sequence; its answer is shown and sent with the event
// handspeak:sign-sequence.
// Completed phrases (holdCompleted, on by default): when the open sequence matches a phrase, the
// sequence is complete and the phrase stays shown. The next sign starts a new sequence, and the
// completed phrase stays visible as the last phrase until the sequence is cleared or another phrase
// is completed. Removing the last sign right after a completion reopens that sequence. With
// holdCompleted false every sign extends one sequence and a match lasts only while it is exact.
// The module only keeps and shows the sequence: it never speaks, never writes to the message draft,
// and does nothing until a caller creates it. Refused or uncertain results are not events: the
// caller passes accepted signs only, and an entry marked refused or uncertain is turned away here too.
// No browser object is touched when the module loads.

export const SIGN_SEQUENCE_EVENT='handspeak:sign-sequence';
export const SIGN_SEQUENCE_LIMIT=8;
const SIGN_LABEL_ID=/^[A-Z][A-Z0-9 '\/-]{0,29}$/;
const SIGN_STATUS_WORDS=new Set(['NO RELIABLE MATCH','NOT ENOUGH FRAMES','CAPTURE INCOMPLETE','HANDS NOT TRACKED','—','…']);

// A label id is the recognizer's label in upper case with single spaces ("THANK YOU", "I / ME").
export function signLabelId(label){
  return typeof label==='string'?label.trim().replace(/\s+/g,' ').toUpperCase():'';
}

// A matcher answer is used only in this shape; anything else counts as no match.
export function validSequenceMatch(match){
  return Boolean(match)&&typeof match==='object'&&typeof match.phraseId==='string'&&match.phraseId.length>0
    &&typeof match.english==='string'&&match.english.length>0
    &&Array.isArray(match.glosses)&&match.glosses.every(gloss=>typeof gloss==='string');
}

export function createSignSequence({limit=SIGN_SEQUENCE_LIMIT,match=null,container=null,now=()=>Date.now(),emit=null,onChange=()=>{},holdCompleted=true}={}){
  if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Unsupported sequence limit');
  let events=[],matcher=typeof match==='function'?match:null,current=null,sequenceNumber=0;
  // completed: the open sequence matched and is held; last: the most recent completed phrase
  // ({match, events}); earlier: the one before it, restored when a completion is reopened.
  let completed=false,last=null,earlier=null;
  const copyMatch=m=>m?{...m,glosses:m.glosses.slice()}:null;
  const copyPhrase=p=>p?{match:copyMatch(p.match),events:p.events.map(e=>({...e})),labelIds:p.events.map(e=>e.id)}:null;
  const labelIds=()=>events.map(event=>event.id);
  const state=()=>!events.length?'empty':completed?'completed':'open';
  const snapshot=()=>({events:events.map(event=>({...event})),labelIds:labelIds(),match:copyMatch(current),state:state(),lastPhrase:copyPhrase(last),limit,full:events.length>=limit});
  function lookUp(){
    if(!matcher||!events.length)return null;
    try{const answer=matcher(labelIds());return validSequenceMatch(answer)?{...answer,glosses:answer.glosses.slice()}:null;}
    catch{return null;}
  }
  function render(){
    if(!container||typeof container.replaceChildren!=='function')return;
    const doc=container.ownerDocument||(typeof document!=='undefined'?document:null);
    if(!doc||typeof doc.createElement!=='function')return;
    const chips=events.map(event=>{
      const chip=doc.createElement('span');chip.className='sign-chip';chip.textContent=event.label;
      chip.dataset.labelId=event.id;chip.dataset.source=event.source;chip.dataset.confirmed=String(event.confirmed);
      return chip;
    });
    const nodes=[...chips];
    // The phrase shown: the open sequence's own match, otherwise the last completed phrase.
    const shown=current||last?.match||null;
    if(shown){
      const line=doc.createElement('p');line.className='sign-sequence-match';line.textContent=shown.english;
      line.dataset.phraseId=shown.phraseId;line.dataset.state=current?state():'last';nodes.push(line);
    }
    container.replaceChildren(...nodes);
    container.hidden=!events.length&&!shown;
    if(container.dataset)container.dataset.state=state();
  }
  function changed(reason){
    current=lookUp();
    if(holdCompleted){
      if(current&&!completed){earlier=last;last={match:current,events:events.map(e=>({...e}))};completed=true;}
      else if(!current)completed=false;
    }
    render();
    const detail={...snapshot(),reason};
    try{onChange(detail);}catch{}
    if(typeof emit==='function')emit(detail);
    else if(typeof document!=='undefined'&&typeof document.dispatchEvent==='function'&&typeof CustomEvent==='function')document.dispatchEvent(new CustomEvent(SIGN_SEQUENCE_EVENT,{detail}));
    return detail;
  }
  return {
    // entry: {label, id?, source, confirmed}. Returns the event added, or null when it was turned away.
    add(entry={}){
      if(!entry||entry.refused||entry.uncertain)return null;
      const id=signLabelId(entry.id??entry.label);
      if(!SIGN_LABEL_ID.test(id)||SIGN_STATUS_WORDS.has(id))return null;
      // A completed sequence is closed: the sign starts a new one (the phrase stays as the last phrase).
      if(holdCompleted&&completed){events=[];completed=false;current=null;}
      if(events.length>=limit)return null;
      const label=typeof entry.label==='string'&&entry.label.trim()?entry.label.trim().replace(/\s+/g,' '):id;
      const event={id,label,at:now(),source:typeof entry.source==='string'&&entry.source?entry.source:'unknown',confirmed:entry.confirmed===true,order:++sequenceNumber};
      events.push(event);
      changed('add');
      return {...event};
    },
    // Right after a completion this reopens that sequence: the last sign goes, the phrase is no
    // longer completed, and the phrase completed before it (if any) is the last phrase again.
    removeLast(){
      if(!events.length)return null;
      if(holdCompleted&&completed){last=earlier;earlier=null;completed=false;}
      const removed=events.pop();changed('remove');return {...removed};
    },
    clear(){if(!events.length&&!last)return false;events=[];completed=false;last=null;earlier=null;changed('clear');return true;},
    setMatcher(fn){matcher=typeof fn==='function'?fn:null;completed=false;return changed('matcher');},
    events:()=>snapshot().events,
    labelIds,
    match:()=>snapshot().match,
    lastPhrase:()=>copyPhrase(last),
    state:snapshot,
  };
}
