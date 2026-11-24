import {isWordEnabled} from './vocabulary-settings.js?v=20261011-features-1';
import {isTemporalWordModel,validTemporalWordModel,recognizeTemporalWord} from './temporal-word-model.js?v=20261020-short-runs-1';
import {recognizeExpandedMotion} from './expanded-motion.js?v=20261109-vm-sync-1';
import {createAutomaticMotion} from './automatic-motion.js?v=20261112-pace-1';
import {motionFrame,encodeMotion,validMotion,recognizeMotion,validMotionParameters,motionDistance,mirrorMotion} from './motion-model.js?v=20261109-vm-sync-1';
import {validBinaryTemporalModel,recognizeBinaryTemporal} from './hello-binary.js?v=20261021-binary-2';
import {validWordNetwork,recognizeWordNetwork,wordNetworkShares} from './word-network.js?v=20261113-network-1';

// Pace options (automatic capture only; matching is not affected):
//   automaticCooldownMs  shortest wait after one capture before the next may start
//   revealDelayMs        how long "checking" is shown between the end of a capture and its result
//   onPace(state)        'watching' when a capture starts, 'checking' when it ends, 'result' when shown
//   retryEmptyCapture    candidate rule, off by default: an automatic capture that gives no usable
//                        sequence does not start the rest period, so a sign made right after a
//                        brief glimpse of a hand can still be captured
//   teachWithAutomaticCapture  candidate rule, off by default: a personal example is recorded with the
//                        automatic capture that recognition uses (it starts when the hands move and ends
//                        when they pause) instead of the fixed 2.5 s window after a countdown, so that a
//                        taught example and a later capture of the same sign are cut the same way
// The words offered in Words mode: the six default words and the four of the extra-word model with
// the best recorded results (models/motion-word-accuracy.json). The other extra words (BOOK, LIKE,
// GO) and the single-word BABY detector stay loaded, so that their signs are still told apart from
// these ten, but a match to one of them is not suggested. A word the user taught is always offered,
// and so is every word of a vocabulary chosen in the library. To change the ten, edit this list.
export const OFFERED_WORDS=Object.freeze(['HELLO','THANK YOU','PLEASE','YES','NO','FINISH','DRINK','WATER','FOOD','HUNGRY']);
const OFFERED=new Set(OFFERED_WORDS);
const EXTRA_WORDS=['DRINK','WATER','BOOK','FOOD','HUNGRY','LIKE','GO'];
const OFFERED_EXTRA=EXTRA_WORDS.filter(word=>OFFERED.has(word));

export function createMotionStudio({isRunning,onWord,onStatus,speak,onDiagnostic=()=>{},automaticCooldownMs=800,revealDelayMs=0,onPace=()=>{},onChoices=()=>{},speakAdded=()=>false,retryEmptyCapture=false,teachWithAutomaticCapture=false}){
  const $=s=>document.querySelector(s), key='handspeak-motion-v3';
  let examples=[],baseExamples=[],parameters,baseState='Loading pretrained words…',capture=null,pending=null,lastSample=-Infinity,legacyExamples=false;
  let automatic=createAutomaticMotion({cooldownMs:automaticCooldownMs});
  let autoWasActive=false,review=null,expansion=null,defaultModel=null,categoryModel=null,binaryModels=[];
  // A teaching capture in progress with teachWithAutomaticCapture: {label, deadline, segmenter}.
  let teachAuto=null;
  const TEACH_AUTOMATIC_MS=10000;
  const expandedEnabled=()=>!categoryModel && $('#expandedWords').checked && expansion;
  const taughtWord=label=>examples.filter(e=>e.label===label).length>=3;
  const offered=label=>Boolean(categoryModel)||OFFERED.has(label)||taughtWord(label);
  // Whether a word may be suggested or offered as a choice now: enabled by the administrator, one of
  // the offered words, and, for a word of the extra-word model, only while those words are switched on.
  const suggestable=label=>isWordEnabled(label)&&offered(label)&&(Boolean(categoryModel)||Boolean(expandedEnabled())||!EXTRA_WORDS.includes(label)||taughtWord(label));
  // Decision rule for the default six words (models/asl-words-gate.json), the default since
  // 2026-11-13. It replaces the acceptance gate stored in the word model (and may drop the fallback
  // profile or add "not a vocabulary word" references); the vocabulary references themselves are
  // unchanged. Opening the page with ?wordGate=shipped keeps the model's own gate, for comparison.
  const wantWordGate=!(typeof URLSearchParams!=='undefined'&&typeof location!=='undefined'&&new URLSearchParams(location.search).get('wordGate')==='shipped');
  let wordGate=null;
  // Candidate word network, loaded only when the page is opened with ?wordModel=network (trained on
  // two landmark sources) or ?wordModel=network-open (the openly licensed source alone). It then
  // answers for its own words and has a "none of these" answer of its own. The matcher below is still
  // asked, but only a word the network does not have (a personal word) is taken from it, and the
  // single-word detectors are not heard for the network's words. Without the flag none of this runs.
  const NETWORK_FILES={network:'asl-words-network-candidate.json','network-open':'asl-words-network-open-candidate.json'};
  const wantWordNetwork=typeof URLSearchParams!=='undefined'&&typeof location!=='undefined'?NETWORK_FILES[new URLSearchParams(location.search).get('wordModel')]||null:null;
  // A word is offered as a choice when the network gives it at least this share of its answer.
  const NETWORK_CHOICE_SHARE=.12;
  let wordNetwork=null;
  const networkHas=label=>Boolean(wordNetwork)&&wordNetwork.labels.includes(label);
  // With a word network loaded, every capture that has a sequence reports the share the network
  // gave each of its words (handspeak:word-shares), just before the result is announced. A lesson
  // that knows which word was asked for may read it; nothing in this module acts on it, and
  // without a network nothing is sent.
  const reportShares=sequence=>{
    if(!wordNetwork||!sequence||categoryModel||typeof document==='undefined'||typeof CustomEvent!=='function')return;
    const share=wordNetworkShares(wordNetwork,sequence);
    document.dispatchEvent(new CustomEvent('handspeak:word-shares',{detail:{shares:Object.fromEntries(wordNetwork.labels.map((label,index)=>[label,share[index]]))}}));
  };
  const nearNegative=(sequence,matchDistance,gate)=>{const mirrored=gate.parameters.mirror?mirrorMotion(sequence):null;return gate.negatives.some(reference=>Math.min(motionDistance(sequence,reference),mirrored?motionDistance(mirrored,reference):Infinity)<=matchDistance*gate.negativeMargin);};
  const defaultMatch=sequence=>{
    if(!wordNetwork)return matcherMatch(sequence);
    const answer=recognizeWordNetwork(wordNetwork,sequence);
    if(answer)return {label:answer.label,distance:1-answer.confidence,confidence:answer.confidence};
    const match=matcherMatch(sequence);
    return match&&!networkHas(match.label)?match:null;
  };
  const strictMatch=(sequence,strict)=>{
    const match=recognizeExpandedMotion(sequence,allExamples(),strict.parameters,false,strict.useFallback?defaultModel?.cameraCompatibility:null);
    return match&&strict.negativeMargin>0&&nearNegative(sequence,match.distance,strict)?null:match;
  };
  const matcherMatch=sequence=>{
    if(!wordGate)return recognizeExpandedMotion(sequence,allExamples(),parameters,expandedEnabled(),defaultModel?.cameraCompatibility);
    if(!expandedEnabled())return strictMatch(sequence,wordGate);
    // With the extra words on, they compete as before; an answer that is not one of them (a default
    // word, or a word the user taught) also has to pass the stricter rule of the default words.
    const match=recognizeExpandedMotion(sequence,allExamples(),parameters,expandedEnabled(),defaultModel?.cameraCompatibility);
    if(!match||EXTRA_WORDS.includes(match.label))return match;
    const strict=strictMatch(sequence,wordGate);
    return strict&&strict.label===match.label?strict:null;
  };
  // Closest vocabulary words for a capture that passed no gate. They are offered to the user as
  // choices (onChoices) and are never added by themselves. A word is offered when its nearest
  // reference is within CHOICE_REACH times that word's own cutoff; at most three, nearest first.
  const CHOICE_REACH=1.5;
  let choices=[];
  const nearestWords=sequence=>{
    if(categoryModel||!sequence||!parameters)return [];
    // With the word network on, the choices are the words it gave the largest shares to.
    if(wordNetwork){const share=wordNetworkShares(wordNetwork,sequence);return wordNetwork.labels.map((label,index)=>[label,share[index]]).filter(([label,value])=>value>=NETWORK_CHOICE_SHARE&&suggestable(label)).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([label])=>label);}
    // The offered extra words are among the choices too, each judged by the cutoff of its own model.
    const extra=expandedEnabled()?expansion.samples.filter(e=>offered(e.label)):[];
    const cutoff=label=>{const own=extra.length&&EXTRA_WORDS.includes(label)?expansion.parameters:parameters;return own.maxDistanceByLabel?.[label]??own.maxDistance;};
    const pool=allExamples().concat(extra),counts={},best={};pool.forEach(e=>counts[e.label]=(counts[e.label]||0)+1);
    const mirrored=parameters.mirror?mirrorMotion(sequence):null;
    for(const e of pool){
      if(counts[e.label]<3||e.label==='OTHER MOVEMENT'||!suggestable(e.label))continue;
      const d=Math.min(motionDistance(sequence,e.sequence),mirrored?motionDistance(mirrored,e.sequence):Infinity);
      if(!(best[e.label]<=d))best[e.label]=d;
    }
    return Object.entries(best).filter(([label,d])=>d<=cutoff(label)*CHOICE_REACH).sort((a,b)=>a[1]-b[1]).slice(0,3).map(([label])=>label);
  };
  const offer=list=>{if(!list.length&&!choices.length)return;choices=list;onChoices(list.slice());};
  // Tells a guided recording step how a personal-example recording ended.
  const taught=(label,saved,reason='')=>{if(label)document.dispatchEvent?.(new CustomEvent('handspeak:word-example',{detail:{label,saved,reason,count:examples.filter(e=>e.label===label).length}}));};
  const recognizeRaw=(sequence,frames,aspect)=>{if(isTemporalWordModel(categoryModel))return recognizeTemporalWord(categoryModel,frames,aspect);if(!categoryModel){const existing=defaultMatch(sequence);if(existing)return existing;for(const model of binaryModels){const match=recognizeBinaryTemporal(model,frames,aspect);if(match&&!networkHas(match.label))return match;}return null;}const match=recognizeMotion(sequence,allExamples(),parameters);return match&&match.label!=='OTHER MOVEMENT'?match:null;};
  const recognize=(sequence,frames,aspect)=>{const match=recognizeRaw(sequence,frames,aspect);return match&&suggestable(match.label)?match:null;};
  const allExamples=()=>baseExamples.concat(examples);
  function setHelp(message){$('#motionHelp').textContent=message;$('#motionCaptureStatus').textContent=message;}
  const labelOK=label=>typeof label==='string'&&/^[a-zA-Z][a-zA-Z /'-]{0,29}$/.test(label);
  try{
    const saved=JSON.parse(localStorage.getItem(key)||'[]');
    if(Array.isArray(saved))examples=saved.slice(0,96).filter(e=>labelOK(e.label)&&validMotion(e.sequence));
    const legacy=JSON.parse(localStorage.getItem('handspeak-motion-v2')||localStorage.getItem('handspeak-motion-v1')||'[]');
    legacyExamples=Array.isArray(legacy)&&legacy.length>0;
  }catch{}
  async function loadPretrained(){
    try{
      const response=await fetch('./models/asl-words.json?v=20261020-camera-compatibility-2');
      if(!response.ok)throw new Error('Word model download failed');
      const model=await response.json();
      if(model.version!==1||model.encoding!=='two-hand-motion-v3'||!validMotionParameters(model.parameters)
        ||!Array.isArray(model.samples)||model.samples.length<6||model.samples.length>600
        ||!model.samples.every(e=>labelOK(e.label)&&validMotion(e.sequence)))throw new Error('Invalid word model');
      const counts={};model.samples.forEach(e=>counts[e.label]=(counts[e.label]||0)+1);
      if(Object.keys(counts).length<2||Object.values(counts).some(n=>n<3))throw new Error('Insufficient word references');
      defaultModel=model;
      if(!categoryModel){baseExamples=model.samples;parameters=model.parameters;}
      baseState=`${new Set(baseExamples.map(e=>e.label)).size} pretrained words loaded`;
      if(!wantWordGate){if(!categoryModel)baseState+=' · earlier matching rule (comparison)';}
      if(wantWordGate){
        try{
          const reply=await fetch('./models/asl-words-gate.json?v=20261113-gate-2');
          const gate=reply.ok?await reply.json():null;
          if(gate&&gate.version===1&&gate.appliesTo==='models/asl-words.json'&&validMotionParameters(gate.parameters)
            &&Array.isArray(gate.negatives)&&gate.negatives.length<=200&&gate.negatives.every(entry=>validMotion(entry.sequence))
            &&(gate.negativeMargin===0||(Number.isFinite(gate.negativeMargin)&&gate.negativeMargin>=1&&gate.negativeMargin<=3))){
            wordGate={parameters:gate.parameters,useFallback:gate.useCameraCompatibility!==false,negativeMargin:gate.negativeMargin,negatives:gate.negatives.map(entry=>entry.sequence)};
          }else{console.warn('The word gate file is missing or invalid; the gate stored in the word model is used.');if(!categoryModel)baseState+=' · stricter rule unavailable, earlier rule in use';}
        }catch(error){console.warn(error);}
      }
      if(wantWordNetwork){
        try{
          const reply=await fetch(`./models/${wantWordNetwork}?v=20261113-network-1`);
          const network=reply.ok?await reply.json():null;
          if(validWordNetwork(network)){wordNetwork=network;if(!categoryModel)baseState=`${network.labels.length}-word network loaded (candidate)`;}
          else{console.warn('The word network file is missing or invalid; the bundled word matcher is used.');if(!categoryModel)baseState+=' · word network unavailable';}
        }catch(error){console.warn(error);}
      }
    }catch(error){console.warn(error);baseState='Pretrained words unavailable — reload to retry';}
    render();
  }
  async function loadExpansion(){
    try {
      const response=await fetch('./models/asl-extra-words.json?v=20261023-hungry-cutoff-1');
      if(!response.ok)throw new Error('Extra words unavailable');
      const model=await response.json();
      if(model.version!==1||model.encoding!=='two-hand-motion-v3'||!validMotionParameters(model.parameters)
        ||!Array.isArray(model.labels)||model.labels.length!==7||new Set(model.labels).size!==7||!model.labels.every(l=>['DRINK','WATER','BOOK','FOOD','HUNGRY','LIKE','GO'].includes(l))
        ||!Array.isArray(model.samples)||model.samples.length>200||!model.samples.every(e=>model.labels.includes(e.label)&&validMotion(e.sequence))
        ||!model.labels.every(l=>model.samples.filter(e=>e.label===l).length>=3))throw new Error('Invalid extra word model');
      const prior=model.baselineExtra;
      if(!prior || !validMotionParameters(prior.parameters) || !Array.isArray(prior.labels)
        || prior.labels.length!==3 || new Set(prior.labels).size!==3 || !prior.labels.every(l=>['DRINK','WATER','BOOK'].includes(l))
        || !Array.isArray(prior.samples) || prior.samples.length>200 || !prior.samples.every(e=>prior.labels.includes(e.label)&&validMotion(e.sequence))
        || !prior.labels.every(l=>prior.samples.filter(e=>e.label===l).length>=3)
        || !Array.isArray(model.newLabels) || model.newLabels.length!==4 || new Set(model.newLabels).size!==4
        || !model.newLabels.every(l=>['FOOD','HUNGRY','LIKE','GO'].includes(l)))throw new Error('Invalid preview stages');
      expansion=model;
      $('#expandedWords').disabled=false;
      let wanted=null;try{wanted=localStorage.getItem('handspeak-extra-words');}catch{}
      $('#expandedWords').checked=wanted!=='off';
      $('#expandedWordsStatus').textContent=`Ready: ${OFFERED_EXTRA.join(' · ')}. Lower recorded accuracy than the first six words; may mistake other movements for words. Review every suggestion.`;
    } catch {
      $('#expandedWordsStatus').textContent=`${OFFERED_EXTRA.join(', ')} could not load. The first six words still work; reload to retry.`;
    }
    render();
  }
  async function loadBinaryModels(){
    const loaded=[];
    for(const [path,word] of [
      ['./models/hello-binary.json?v=20261021-binary-2','HELLO'],
      ['./models/baby-binary.json?v=20261021-baby-1','BABY'],
      ['./models/water-binary.json?v=20261021-water-1','WATER']
    ])try{
      const response=await fetch(path);
      if(!response.ok)throw new Error(`${word} model download failed`);
      const model=await response.json();
      if(!validBinaryTemporalModel(model)||model.word!==word)throw new Error(`Invalid ${word} model`);
      loaded.push(model);
    }catch(error){console.warn(error);}
    binaryModels=loaded;render();
  }
  // What the line under the Words heading says is offered now.
  function renderOffered(){
    const line=$('#tenWords');
    if(!line||!('textContent' in line))return;
    line.hidden=Boolean(categoryModel);
    line.textContent=expandedEnabled()?`The camera suggests ten words: ${OFFERED_WORDS.join(' · ')}. The last four have lower recorded accuracy. Review every suggestion.`
      :`The camera suggests six words: ${OFFERED_WORDS.filter(word=>!EXTRA_WORDS.includes(word)).join(' · ')}. ${expansion?OFFERED_EXTRA.join(', ')+' are switched off under “Other vocabulary & recording options”.':OFFERED_EXTRA.join(', ')+' are not loaded.'} Review every suggestion.`;
  }
  $('#expandedWords').addEventListener('change',event=>{
    // Only the user's own choice is remembered, not a lesson switching the words on.
    if(event?.isTrusted){try{localStorage.setItem('handspeak-extra-words',$('#expandedWords').checked?'on':'off');}catch{}}
    cancel();onStatus('—');render();
    renderOffered();
    setHelp(expandedEnabled()?`All ten words are on: the first six and ${OFFERED_EXTRA.join(', ')}. Sign once, then pause.`:'Using the first six words only.');
  });
  function render(){
    const counts={};allExamples().filter(e=>e.label!=='OTHER MOVEMENT').forEach(e=>counts[e.label]=(counts[e.label]||0)+1);
    binaryModels.forEach(model=>{if(offered(model.word)&&(model.word!=='WATER'||expandedEnabled()))counts[model.word]=Math.max(3,counts[model.word]||0);});
    $('#expandedWords').disabled=Boolean(categoryModel)||!expansion;renderOffered();
    if(expandedEnabled())expansion.samples.forEach(e=>{if(offered(e.label))counts[e.label]=(counts[e.label]||0)+1;});
    $('#motionLibrary').textContent=isTemporalWordModel(categoryModel)?categoryModel.labels.join(' · '):Object.keys(counts).map(label=>counts[label]>=3?label:`${label} (needs ${3-counts[label]} more examples)`).join(' · ')||'No word examples loaded yet.';
    $('#motionModelStatus').textContent=`${baseState}${expandedEnabled()?` + ${OFFERED_EXTRA.length} more words`:''} · ${examples.length} personal examples${legacyExamples?' · Older personal recordings use a previous format; re-record those words if you want to use them.':''}`;
    $('#motionReady').textContent=isTemporalWordModel(categoryModel)?`Word model loaded: ${categoryModel.labels.join(' · ')}. Review each suggestion.`:(categoryModel||Object.values(counts).filter(n=>n>=3).length>=2)
      ?(baseExamples.length?'Pretrained words ready — no personal training required for these. New personal words need three examples each.':'Personal vocabulary ready')
      :'Waiting for pretrained words (or teach two words, three examples each).';
    $('#motionAccept').disabled=!pending;
    document.dispatchEvent?.(new CustomEvent('handspeak:personal-words'));
  }
  function finish(force=false){
    const active=capture;if(!active)return;
    clearTimeout(active.timer);
    // Give slow streams a bounded chance to reach the existing sample minimum.
    if(!force&&active.frames.length<12&&performance.now()<active.deadline){
      setHelp(`Camera is slow — collecting more frames (${active.frames.length}/12). Keep your hands in view.`);
      active.timer=setTimeout(()=>finish(true),Math.max(0,active.deadline-performance.now()));
      return;
    }
    capture=null;
    $('#motionTeach').disabled=false;$('#motionRecognize').disabled=false;$('#motionLabel').disabled=false;
    $('#motionCancel').disabled=true;$('#wordCaptureButton').disabled=false;
    const tracked=active.frames.filter(frame=>frame.some(Boolean)).length;
    if(active.frames.length<12){onStatus('Not enough frames',`The camera gave too few frames for this sign (${active.frames.length} of 12). Try brighter light or close other apps, then record again.`);setHelp(`Not enough camera frames: ${active.frames.length}/12 minimum. Try again with fewer apps open or a faster device.`);taught(active.label,false,'frames');return;}
    const sequence=encodeMotion(active.frames,active.imageAspect||1);
    onDiagnostic({capture:'manual',frames:active.frames.length,trackedFrames:tracked,validSequence:Boolean(sequence)});
    if(!sequence){onStatus('Hands not tracked',`Your hands were not clearly visible for the whole sign (${tracked} of ${active.frames.length} frames). Keep them inside the picture.`);setHelp(`Not enough clear hand tracking: hands visible in ${tracked}/${active.frames.length} frames. Keep your hands fully in view and use front lighting.`);taught(active.label,false,'tracking');return;}
    if(active.label){
      const updated=examples.concat({label:active.label,sequence});
      try{localStorage.setItem(key,JSON.stringify(updated));examples=updated;
        setHelp(`Saved an example of “${active.label}”. Record it again with a slightly different speed.`);onStatus('—','Personal example saved — record another example or try recognition.');
        taught(active.label,true);
      }catch{setHelp('Could not save this recording. Browser storage may be full.');taught(active.label,false,'storage');}
    }else{
      reportShares(sequence);
      pending=recognize(sequence,active.frames,active.imageAspect||1);
      onDiagnostic({capture:'manual',frames:active.frames.length,trackedFrames:tracked,validSequence:true,match:pending?.label||null,sequence});
      const near=pending?[]:nearestWords(sequence);
      setHelp(pending?`Possible match: “${pending.label}”. Check it before adding it to your message.`:`Captured ${active.frames.length} frames, but the model found no clear match. This experimental model may not recognize your signing reliably.`);
      onStatus(pending?.label||'No reliable match',pending?'Possible match — verify before adding':near.length?'Close to a word, but not close enough to be sure. Choose below if one of them is right.':'This did not look like any of the words in use. Your sign may still be correct.');
      offer(near);
      maybeAddToSentence();
    }
    render();
  }
  function start(teach){
    if(!isRunning()){setHelp('Select Words in motion above the camera, then start the camera.');return;}
    if(capture||teachAuto)return;
    const label=$('#motionLabel').value.trim().replace(/\s+/g,' ').toUpperCase();
    if(teach && !labelOK(label)){setHelp('Enter a word or short phrase using letters (up to 30 characters).');return;}
    if(teach && (examples.length>=96 || examples.filter(e=>e.label===label).length>=8)){
      setHelp('Library limit reached (8 recordings per word, 96 total). Remove a word to record more.');return;
    }
    const counts={};allExamples().forEach(e=>counts[e.label]=(counts[e.label]||0)+1);
    // A category preview is a trained classifier with no template samples, so the
    // "two words with three examples" rule does not apply to it. Without this the
    // manual Record button silently did nothing for single-word previews.
    if(!teach && !isTemporalWordModel(categoryModel) && Object.values(counts).filter(n=>n>=3).length<2){setHelp('The word model is not ready. Wait for it to load, or reload the page.');return;}
    if(teach&&teachWithAutomaticCapture){
      automatic.reset();autoWasActive=false;review=null;pending=null;offer([]);render();
      teachAuto={label,deadline:performance.now()+TEACH_AUTOMATIC_MS,segmenter:createAutomaticMotion({cooldownMs:automaticCooldownMs})};
      $('#motionTeach').disabled=true;$('#motionRecognize').disabled=true;$('#motionLabel').disabled=true;
      $('#motionCancel').disabled=false;$('#wordCaptureButton').disabled=true;
      onStatus('—','Sign once now; the recording ends when your hands pause.');
      setHelp(`Hold still for a moment, then sign “${label}” once. The recording starts when your hands move and ends when they pause.`);
      return;
    }
    automatic.reset();autoWasActive=false;review=null;
    pending=null;offer([]);render();onStatus('—','Get ready — recording starts after the countdown.');lastSample=-Infinity;
    const now=performance.now();
    capture={label:teach?label:null,start:now+1500,end:now+4000,deadline:now+6000,frames:[],timer:setTimeout(()=>finish(),4050)};
    $('#motionTeach').disabled=true;$('#motionRecognize').disabled=true;$('#motionLabel').disabled=true;
    $('#motionCancel').disabled=false;$('#wordCaptureButton').disabled=true;
    setHelp('Get ready… recording starts in 1.5 seconds. Perform the sign once over 2.5 seconds.');
  }
  function cancel(){
    automatic.reset();autoWasActive=false;review=null;
    if(teachAuto){const label=teachAuto.label;teachAuto=null;setHelp('Recording canceled. Nothing was saved.');taught(label,false,'canceled');}
    if(capture){const label=capture.label;clearTimeout(capture.timer);capture=null;setHelp('Recording canceled. Nothing was saved.');taught(label,false,'canceled');}
    pending=null;offer([]);$('#motionAccept').disabled=true;
    $('#motionTeach').disabled=false;$('#motionRecognize').disabled=false;$('#motionLabel').disabled=false;$('#motionCancel').disabled=true;$('#wordCaptureButton').disabled=false;
  }
  // Teaching with the automatic capture (teachWithAutomaticCapture): one capture, cut as recognition
  // cuts it, then saved as the manual recorder saves its examples. Nothing is recognized meanwhile.
  function endTeach(){teachAuto=null;$('#motionTeach').disabled=false;$('#motionRecognize').disabled=false;$('#motionLabel').disabled=false;$('#motionCancel').disabled=true;$('#wordCaptureButton').disabled=false;}
  function saveTaught(label,sequence){
    const updated=examples.concat({label,sequence});
    try{localStorage.setItem(key,JSON.stringify(updated));examples=updated;
      setHelp(`Saved an example of “${label}”. Record it again with a slightly different speed.`);onStatus('—','Personal example saved — record another example or try recognition.');
      taught(label,true);
    }catch{setHelp('Could not save this recording. Browser storage may be full.');taught(label,false,'storage');}
  }
  // A capture the segmenter opened only because a hand came into view, with no movement in it, is not a
  // sign: it is dropped and teaching waits for the next capture (the same 0.08 palm-width test per sample).
  const clipMoved=clip=>clip.frames.some((frame,i)=>i>0&&[0,1].some(side=>{
    const a=clip.frames[i-1][side],b=frame[side],aspect=clip.imageAspect||1;
    if(!a||!b)return false;
    const width=Math.max(.035,Math.hypot(b[5].x-b[17].x,(b[5].y-b[17].y)*aspect));
    return b.reduce((sum,p,k)=>sum+Math.hypot(p.x-a[k].x,(p.y-a[k].y)*aspect),0)/21/width>.08;
  }));
  function teachFrame(detection,now){
    const active=teachAuto;
    if(now>=active.deadline){endTeach();onStatus('—','No sign was seen. Nothing was saved.');setHelp(`No movement was seen within ${TEACH_AUTOMATIC_MS/1000} seconds. Nothing was saved; press Record and sign again.`);taught(active.label,false,'frames');render();return;}
    const clip=active.segmenter.push(motionFrame(detection),now,detection.imageAspect||1);
    if(!clip||!clipMoved(clip))return;
    endTeach();
    const tracked=clip.frames.filter(frame=>frame.some(Boolean)).length,sequence=encodeMotion(clip.frames,clip.imageAspect);
    onDiagnostic({capture:'teach-automatic',frames:clip.frames.length,trackedFrames:tracked,validSequence:Boolean(sequence)});
    if(clip.frames.length<12){onStatus('Not enough frames',`The camera gave too few frames for this sign (${clip.frames.length} of 12). Try brighter light, then record again.`);setHelp(`Not enough camera frames: ${clip.frames.length}/12 minimum. Nothing was saved.`);taught(active.label,false,'frames');render();return;}
    if(!sequence){onStatus('Hands not tracked',`Your hands were not clearly visible for the whole sign (${tracked} of ${clip.frames.length} frames). Keep them inside the picture.`);setHelp(`Not enough clear hand tracking: hands visible in ${tracked}/${clip.frames.length} frames. Nothing was saved.`);taught(active.label,false,'tracking');render();return;}
    saveTaught(active.label,sequence);render();
  }
  $('#automaticWords').addEventListener('change',()=>{
    cancel();onStatus('—');
    setHelp($('#automaticWords').checked?'Automatic words enabled. Sign once, then pause briefly.':'Automatic words off. Select Record a word to capture a sign.');
  });
  function automaticFrame(detection,now){
    if(!$('#automaticWords').checked||!isRunning()||(!baseExamples.length&&!isTemporalWordModel(categoryModel)))return;
    const clip=automatic.push(motionFrame(detection),now,detection.imageAspect||1);
    const active=automatic.isActive();
    if(active&&!autoWasActive){review=null;pending=null;offer([]);render();onStatus('—','Hand detected · Analyzing movement… pause when finished.');setHelp('Watching your sign… pause briefly when finished.');onPace('watching');}
    autoWasActive=active;
    if(clip){
      // Candidate rule: a capture without a usable sequence is reported at once and the capture
      // state is reset, so the rest period does not hide the sign that follows. Nothing is added.
      if(retryEmptyCapture&&!encodeMotion(clip.frames,clip.imageAspect)){automatic.reset();autoWasActive=false;showAutomatic(clip,now);return;}
      if(revealDelayMs>0){
        // Hold the result back for a moment; frames keep arriving, so the wait is counted in frames' time.
        review={clip,at:now};pending=null;render();setHelp('Checking your sign…');onPace('checking');return;
      }
      showAutomatic(clip,now);return;
    }
    if(review&&now-review.at>=revealDelayMs){const due=review;review=null;showAutomatic(due.clip,due.at);}
  }
  function showAutomatic(clip,now){
    const sequence=encodeMotion(clip.frames,clip.imageAspect);
    reportShares(sequence);
    pending=sequence?recognize(sequence,clip.frames,clip.imageAspect):null;
    const tracked=clip.frames.filter(f=>f.some(Boolean)).length;
    onDiagnostic({capture:'automatic',frames:clip.frames.length,trackedFrames:tracked,durationMs:Math.round(now-clip.start),validSequence:Boolean(sequence),match:pending?.label||null,sequence});
    const detail=pending?'Possible match — verify before adding':!sequence?`Capture incomplete: ${tracked}/${clip.frames.length} frames had usable hands. Keep the full hand visible; check Camera diagnostics.`:'Hands captured, but no word passed the matching checks. Check the active vocabulary and Camera diagnostics.';
    // The result card gets a plain reason; the help line below the camera keeps the technical wording.
    const near=!pending&&sequence?nearestWords(sequence):[];
    const reason=pending?detail
      :clip.frames.length<12?`The camera gave too few frames for this sign (${clip.frames.length} of 12). Try brighter light, or use Record a word.`
      :!sequence?`Your hands were not clearly visible for the whole sign (${tracked} of ${clip.frames.length} frames). Keep them inside the picture.`
      :near.length?'Close to a word, but not close enough to be sure. Choose below if one of them is right.'
      :'This did not look like any of the words in use. Your sign may still be correct.';
    onStatus(pending?.label||(clip.frames.length<12?'Not enough frames':!sequence?'Capture incomplete':'No reliable match'),reason);
    offer(near);
    onPace('result');
    setHelp(pending?`Possible match: “${pending.label}”. Pause before your next sign. Review it before adding it.`:detail);
    maybeAddToSentence();render();
  }
  function acceptPending(automaticAdd=false){
    if(!pending)return;
    const word=pending.label;
    if(onWord(word)===false){setHelp('Message is full. Edit or clear it before adding another word.');return;}
    pending=null;
    // A pressed Add speaks the word when that setting is on or the page asks for it (speakAdded);
    // a word that was added automatically is never spoken.
    if(!automaticAdd && ($('#motionAutoSpeak').checked||speakAdded()))speak(word);
    setHelp(`Added “${word}” to your draft. Review it before speaking.`);render();
  }
  // The user picks one of the offered closest words; it is then added like a reviewed match.
  function choose(label){
    if(!choices.includes(label))return false;
    offer([]);
    // With the FINISH setting on, a chosen FINISH acts as a recognized one: it is not added as a word.
    pending={label,chosen:true};acceptPending();
    return true;
  }
  function dismissChoices(){if(choices.length){offer([]);setHelp('No word was added. Sign again when you are ready.');}}
  // The visible Automatic words option should both capture and add a reliable motion match.
  function maybeAddToSentence(){if($('#automaticWords').checked||$('#sentenceAutoAdd').checked)acceptPending(true);}
  $('#motionTeach').addEventListener('click',()=>start(true));
  $('#motionRecognize').addEventListener('click',()=>start(false));
  $('#motionCancel').addEventListener('click',cancel);
  $('#motionAccept').addEventListener('click',()=>acceptPending());
  $('#sentenceAutoAdd').addEventListener('change',()=>{if($('#sentenceAutoAdd').checked&&pending&&pending.label!=='FINISH'){acceptPending(true);render();}});
  $('#motionRemove').addEventListener('click',()=>{
    if(capture)return;
    const label=$('#motionLabel').value.trim().replace(/\s+/g,' ').toUpperCase();
    const updated=examples.filter(e=>e.label!==label);
    if(updated.length===examples.length){setHelp('Enter the name of a recorded word to remove it.');return;}
    try{localStorage.setItem(key,JSON.stringify(updated));examples=updated;pending=null;render();setHelp(`Removed “${label}”.`);}
    catch{setHelp('Could not update browser storage.');}
  });
  render();
  void loadPretrained();
  void loadExpansion();
  void loadBinaryModels();
  return {
    usesTemporalModel:()=>isTemporalWordModel(categoryModel),
    offers:label=>offered(label),
    hasPersonalWord:label=>!isTemporalWordModel(categoryModel)&&examples.some(example=>example.label===label),
    setVocabulary(model,name=''){
      if(!defaultModel)return false;
      if(isTemporalWordModel(model)&&!validTemporalWordModel(model))return false;
      if(model && !isTemporalWordModel(model) && (model.version!==1||model.encoding!=='two-hand-motion-v3'||!validMotionParameters(model.parameters)
        ||!Array.isArray(model.labels)||!model.labels.length||model.labels.length>30||!model.labels.every(labelOK)
        ||!Array.isArray(model.samples)||model.samples.length>450||!model.samples.every(e=>labelOK(e.label)&&(model.labels.includes(e.label)||e.label==='OTHER MOVEMENT')&&validMotion(e.sequence))
        ||!model.labels.every(l=>model.samples.filter(e=>e.label===l).length>=3)))return false;
      cancel();categoryModel=model;const active=model||defaultModel;baseExamples=active.samples||[];parameters=active.parameters;automatic=createAutomaticMotion({sampleIntervalMs:isTemporalWordModel(model)?30:80,cooldownMs:automaticCooldownMs});
      baseState=model?`${name} category preview (${model.labels.length} ${model.labels.length===1?'word':'words'})`:`${new Set(baseExamples.map(e=>e.label)).size} pretrained words loaded`;
      pending=null;onStatus('—');render();setHelp(model?'Category preview enabled. Use only its listed words; review every match.':'Default vocabulary restored.');return true;
    },
    cancel,
    isCapturing:()=>Boolean(capture)||Boolean(teachAuto)||automatic.isActive(),
    isRecording:()=>Boolean(capture)||Boolean(teachAuto),
    isReviewing:()=>Boolean(review),
    choose,dismissChoices,
    restMs:now=>review?0:automatic.restMs(now),
    recognize:()=>start(false),
    frame(detection,now){
      if(teachAuto){teachFrame(detection,now);return;}
      if(!capture){automaticFrame(detection,now);return;}
      if(now<capture.start){setHelp(`Get ready… ${Math.ceil((capture.start-now)/1000)}. Keep your hands in view.`);return;}
      if(now>=capture.deadline){finish(true);return;}
      if(now>=capture.end&&capture.frames.length>=12){finish(true);return;}
      onStatus('—',capture.label?'Hand detected — recording a personal example.':'Analyzing movement… finish your sign and pause.');
      setHelp(now>=capture.end?`Camera is slow — collecting more frames (${capture.frames.length}/12). Keep your hands in view.`:`Recording… ${((capture.end-now)/1000).toFixed(1)} seconds left`);
      if(now-lastSample>=(isTemporalWordModel(categoryModel)?30:80)){
        const aspect=detection.imageAspect||1;
        if(capture.imageAspect&&Math.abs(capture.imageAspect-aspect)>.01){cancel();setHelp('Camera orientation changed. Record the sign again.');return;}
        capture.imageAspect=aspect;capture.frames.push(motionFrame(detection));lastSample=now;
        if(now>=capture.end&&capture.frames.length>=12)finish(true);
      }
    }
  };
}
