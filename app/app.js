import {createLetterCamera} from './letter-camera.js?v=20261113-refined-1';
import {classifyLetter,letterFeatures,isUsableLetterHand,sameObservedHand,createLetterConsensus} from './letter-recognition.js?v=20261113-refined-1';
import {createMultiHandMotionLetters} from './motion-letters.js?v=20261111-motion-geometry-1';
import {createExperienceUI} from './experience-ui.js?v=20261112-feedback-labels-1';
import {COMMON_WORDS,wordsInMessage} from './letter-words.js?v=20261114-letter-words-1';
import {loadVocabularySettings} from './vocabulary-settings.js?v=20261011-features-1';
import {createTemporalCamera} from './temporal-camera.js?v=20261112-local-runtime-1';
import {preferredVisionDelegate} from './camera-performance.js?v=20261010-single-1';
import {createResearchWords} from './research-words.js?v=20261112-explicit-consent-1';
import {createVocabularyLibrary} from './vocabulary-library.js?v=20261123-six-word-model-videos';
import {appendWord,finishSentence,removeLastWord} from './sentence-builder.js?v=20261002-sentences-1';
import { createFaceTracker } from './face-tracker.js?v=20261117-github-mint-overlay';
import { createMotionStudio } from './motion-studio.js?v=20261124-auto-add-1';
import { normalizeLandmarks, classifyFeatures, validSample, DEFAULT_PARAMETERS, validParameters, isUsableHand } from './gesture-model.js?v=20261113-refined-1';
import {unusedHandNotice} from './hand-notice.js?v=20261113-hand-notice-1';
import {createLandmarkSmoother,DISPLAY_SMOOTHING} from './landmark-smoothing.js?v=20261116-steady-hand-2';
import {createLetterHandChoice} from './letter-hand-choice.js?v=20261114-two-hands-1';
import {isDrawableHand,nearPicture,pulledInside,isCutOff,createHandHold,HAND_VIEW_DEFAULTS} from './hand-view.js?v=20261114-hand-view-1';
import {cameraRequest,describeCamera,createFrameMeter,CAMERA_DEVICE_KEY} from './camera-input.js?v=20261114-camera-input-1';
import {createSignSequence} from './sign-sequence.js?v=20261115-sequence-1';
import {createPhraseMatcher} from './phrase-bank.js?v=20261115-phrase-bank-1';

const $ = (selector) => document.querySelector(selector);
// A setting given in the page address (?name=value); null when it is absent.
const pageOption=name=>typeof URLSearchParams!=='undefined'&&typeof location!=='undefined'?new URLSearchParams(location.search).get(name):null;
const video = $('#webcam');
const canvas = $('#overlay');
const ctx = canvas.getContext('2d');
const cameraButton = $('#cameraButton');
const cameraStatus = $('#cameraStatus');
const placeholder = $('#cameraPlaceholder');
const liveResult = $('#liveResult');
const liveLetter = $('#liveLetter');
const liveConfidence = $('#liveConfidence');
let vocabularyLibrary;
// Pace of the live result: data-pace names the state and --hold (0 to 1) fills the progress bar.
// States are styled in css/recognition-pace.css.
function setPace(state,ratio=0){
  const share=Math.max(0,Math.min(1,Number.isFinite(ratio)?ratio:0));
  if(liveResult.dataset)liveResult.dataset.pace=state;
  liveResult.style?.setProperty?.('--hold',share.toFixed(3));
  $('#liveProgress')?.setAttribute?.('aria-valuenow',String(Math.round(share*100)));
}
// "Did you mean…?" When a sign was captured but no word clearly won, the closest words are offered
// as buttons. Nothing is added unless the user presses one; "None of these" just closes the row.
function renderWordChoices(words){
  const row=$('#wordChoices');
  if(!row?.replaceChildren||typeof document.createElement!=='function')return;
  if(!words.length){row.hidden=true;row.replaceChildren();return;}
  const lead=document.createElement('span');lead.className='word-choices-lead';lead.textContent='Was it one of these?';
  const buttons=words.map(word=>{
    const button=document.createElement('button');button.type='button';button.className='word-choice';button.dataset.word=word;button.textContent=word;
    button.addEventListener('click',()=>{const chosen=motionStudio.choose(word);if(chosen&&signSequence)signSequence.add({label:word,source:'choice',confirmed:true});if(chosen)setRecognitionFeedback(chosen==='finish'?'FINISH received — you chose it. It is not added to the draft.':`${word} added — you chose it. Verify the draft before speaking.`);});
    return button;
  });
  const none=document.createElement('button');none.type='button';none.className='word-choice-none';none.textContent='None of these';
  none.addEventListener('click',()=>{motionStudio.dismissChoices();setRecognitionFeedback('No word added. Sign again when you are ready.');});
  row.replaceChildren(lead,...buttons,none);row.hidden=false;
}
function setWordCameraResult(word,detail,daily=false,model=null){
  setPace(word==='—'?'none':'done');
  liveResult.hidden=word==='—';liveLetter.textContent=word;
  liveConfidence.textContent=detail||'Possible match — verify before adding';
  vocabularyLibrary?.showCameraAccuracy(model?null:word,{daily,personal:!daily&&motionStudio.hasPersonalWord(word)});
  document.dispatchEvent(new CustomEvent('handspeak:camera-match',{detail:{word,model:model||$('#activeVocabulary').textContent}}));
}
const messageText = $('#messageText');
const toast = $('#toast');

const SIGNS = [
  {
    "letter": "A",
    "name": "A",
    "hint": "Closed fist, thumb beside the fingers",
    "motion": false
  },
  {
    "letter": "B",
    "name": "B",
    "hint": "Four fingers up together, thumb across palm",
    "motion": false
  },
  {
    "letter": "C",
    "name": "C",
    "hint": "Curve the fingers and thumb into a C",
    "motion": false
  },
  {
    "letter": "D",
    "name": "D",
    "hint": "Index up; thumb touches the other fingertips",
    "motion": false
  },
  {
    "letter": "E",
    "name": "E",
    "hint": "Curl fingertips down toward the thumb",
    "motion": false
  },
  {
    "letter": "F",
    "name": "F",
    "hint": "Index and thumb touch; other three fingers raised",
    "motion": false
  },
  {
    "letter": "G",
    "name": "G",
    "hint": "Index and thumb point sideways, held apart",
    "motion": false
  },
  {
    "letter": "H",
    "name": "H",
    "hint": "Index and middle fingers together, pointing sideways",
    "motion": false
  },
  {
    "letter": "I",
    "name": "I",
    "hint": "Pinky raised, other fingers closed",
    "motion": false
  },
  {
    "letter": "J",
    "name": "J",
    "hint": "Start with the pinky raised, then trace the J path; requires motion recognition",
    "motion": true
  },
  {
    "letter": "K",
    "name": "K",
    "hint": "Index and middle raised; thumb between them",
    "motion": false
  },
  {
    "letter": "L",
    "name": "L",
    "hint": "Index and thumb form an L",
    "motion": false
  },
  {
    "letter": "M",
    "name": "M",
    "hint": "Thumb tucked under three fingers",
    "motion": false
  },
  {
    "letter": "N",
    "name": "N",
    "hint": "Thumb tucked under two fingers",
    "motion": false
  },
  {
    "letter": "O",
    "name": "O",
    "hint": "Curve all fingertips to meet the thumb",
    "motion": false
  },
  {
    "letter": "P",
    "name": "P",
    "hint": "K handshape pointing down",
    "motion": false
  },
  {
    "letter": "Q",
    "name": "Q",
    "hint": "G handshape pointing down",
    "motion": false
  },
  {
    "letter": "R",
    "name": "R",
    "hint": "Cross the index and middle fingers",
    "motion": false
  },
  {
    "letter": "S",
    "name": "S",
    "hint": "Fist with thumb across the front",
    "motion": false
  },
  {
    "letter": "T",
    "name": "T",
    "hint": "Thumb tucked between index and middle fingers",
    "motion": false
  },
  {
    "letter": "U",
    "name": "U",
    "hint": "Index and middle fingers up together",
    "motion": false
  },
  {
    "letter": "V",
    "name": "V",
    "hint": "Index and middle fingers spread",
    "motion": false
  },
  {
    "letter": "W",
    "name": "W",
    "hint": "Index, middle, and ring fingers raised",
    "motion": false
  },
  {
    "letter": "X",
    "name": "X",
    "hint": "Index bent into a hook",
    "motion": false
  },
  {
    "letter": "Y",
    "name": "Y",
    "hint": "Thumb and pinky extended",
    "motion": false
  },
  {
    "letter": "Z",
    "name": "Z",
    "hint": "Start with the index extended, then trace the Z path; requires motion recognition",
    "motion": true
  },
  {
    "letter": "5",
    "name": "Five",
    "hint": "All five fingers extended and spread",
    "motion": false
  }
];
// Letters and numbers are two modes of one classifier (signSet). 1, 3, 4, 5, 7 and 8 have handshapes
// of their own (references come from the user's samples, and from the loaded model when it has
// them). 0, 2, 6 and 9 share a handshape with O, V, W and F: in the numbers mode the references of
// those four letters count as the numbers, beside any samples the user has taught for them, and in
// the letters mode the letter is added and the number is offered as a one-press change.
SIGNS.splice(SIGNS.findIndex(sign=>sign.letter==='5'),1,...[['0','Zero','Curve all fingertips to meet the thumb, like the letter O'],['1','One','Index finger up, other fingers closed'],['2','Two','Index and middle fingers up and spread, like the letter V'],['3','Three','Thumb, index and middle fingers extended'],['4','Four','Four fingers up and spread, thumb folded across the palm'],['5','Five','All five fingers extended and spread'],['6','Six','Thumb touches the little finger, other fingers up, like the letter W'],['7','Seven','Thumb touches the ring finger, other fingers up'],['8','Eight','Thumb touches the middle finger, other fingers up'],['9','Nine','Thumb touches the index finger, other fingers up, like the letter F']].map(([letter,name,hint])=>({letter,name,hint,motion:false,digit:true})));
const DIGIT_LABELS=new Set(SIGNS.filter(sign=>sign.digit).map(sign=>sign.letter));
const SHARED_DIGITS={O:'0',V:'2',W:'6',F:'9'};
const SHARED_LETTER=Object.fromEntries(Object.entries(SHARED_DIGITS).map(([letter,digit])=>[digit,letter]));
const STATIC_SIGNS=SIGNS.filter(sign=>!sign.motion);
const MOTION_REFERENCE_VIDEOS={
  J:'./media/letters/j.mp4?v=20261122-drive-4',
  Z:'./media/letters/z.mp4?v=20261122-drive-4'
};
function renderSignLibrary(){
  const pretrained=new Set(baseSamples.map(sample=>sample.label));
  const renderSigns=signs=>signs.map(sign => {
    const media=sign.motion
      ? `<video src="${MOTION_REFERENCE_VIDEOS[sign.letter]}" poster="./media/letters/${sign.letter.toLowerCase()}.jpg?v=20261122-drive-4" aria-label="${sign.name} motion reference: ${sign.hint}" width="212" height="199" muted loop playsinline controls preload="metadata"></video>`
      : sign.digit
      // Number signs have their own photos; zero is the O handshape, so it shows the letter O picture.
      ? `<img src="./media/letters/${sign.letter==='0'?'o':sign.letter}.jpg?v=20261122-drive-4" alt="${sign.name} number sign: ${sign.hint}" width="240" height="240" loading="lazy" decoding="async">`
      : `<img src="./media/letters/${sign.letter.toLowerCase()}.jpg?v=20261122-drive-4" alt="${sign.name} hand sign: ${sign.hint}" width="400" height="400" loading="lazy" decoding="async">`;
    const visual=`<div class="sign-visual sign-photo">${media}</div>`;
    const badge=SHARED_LETTER[sign.letter]?`Same handshape as ${SHARED_LETTER[sign.letter]} · read in Numbers mode`:sign.digit&&pretrained.has(sign.letter)&&sign.letter!=='5'?'Pretrained · experimental':sign.digit&&sign.letter!=='5'?'Personal · teach first':sign.motion?(motionLetterReady?'Motion reference · experimental recognition':'Motion required · model unavailable'):pretrained.has(sign.letter)?'':'Personal · teach first';
    return `<article class="sign-card">${visual}<h3>${sign.name}</h3>${badge?`<small>${badge}</small>`:''}<p>${sign.hint}</p></article>`;
  }).join('');
  $('#signGrid').innerHTML=renderSigns(SIGNS.filter(sign=>!sign.digit));
  $('#numberGrid').innerHTML=renderSigns(SIGNS.filter(sign=>sign.digit));
}
// Every static sign can be taught, the ten numbers included. Samples of 0, 2, 6 and 9 are compared in
// the numbers mode only, beside the O, V, W and F references, which count as the same numbers there.
$('#trainingLabel').innerHTML = STATIC_SIGNS.map(sign=>`<option value="${sign.letter}">${sign.name} — ${sign.hint}</option>`).join('');

// The application site shows the camera picture alone: no hand skeleton and no face marks are drawn
// there, and the face and body models are not loaded. The evaluation site draws both.
const TRACKING_DRAWN=document.documentElement?.dataset?.site!=='app';
if(!TRACKING_DRAWN){const settingsSummary=$('.camera-settings > summary');if(settingsSummary)settingsSummary.textContent='Camera settings';}
const faceTracker=createFaceTracker((state,detail)=>{
  $('#faceTrackingStatus').textContent=state;
  $('#trackingFace').textContent=state.toUpperCase();
  $('#faceRetry').hidden=state!=='Unavailable';
  $('#faceTrackingHelp').textContent=detail||(state==='No face'?'Face the camera with your whole face visible and light in front of you.':'Visible facial movements · not a measure of emotion');
},expression=>{
  $('#faceExpression').textContent=expression;
},{preferredDelegate:preferredVisionDelegate(),
  // Each face reading is published for the expression check, a measurement tool of the evaluation site; the application site publishes none.
  onScores:detail=>{if(document.documentElement?.dataset?.site!=='app')document.dispatchEvent(new CustomEvent('handspeak:face-scores',{detail}));}});
// The face tracking choice is remembered on this device and applied before the tracker is first loaded.
try{if(!TRACKING_DRAWN||localStorage.getItem('handspeak-face-tracking')==='off'){$('#faceTrackingToggle').checked=false;faceTracker.setEnabled(false);}}catch{}
$('#faceTrackingToggle').addEventListener('change',event=>{
  faceTracker.setEnabled(event.target.checked);
  try{localStorage.setItem('handspeak-face-tracking',event.target.checked?'on':'off');}catch{}
});
$('#faceRetry').addEventListener('click',()=>{void prepareFaceTracker();});
// Only manual mirroring changes the preview; the full camera view stays fixed.
function applyStageTransform(){
  const transform=$('#mirrorPreview')?.checked?'scaleX(-1)':'none';
  for(const element of [video,canvas])if(element?.style){
    element.style.transition='none';element.style.transform=transform;
  }
}

// 'letters' is the handshape mode, for letters and for numbers alike (one camera path); 'words' is
// the motion-word mode. signSet says which handshapes are read in the handshape mode: 'letters' or
// 'numbers'. #recognitionMode shows the three as letters, numbers and words.
let recognitionMode = 'letters';
let signSet='letters';
const cameraDiagnostic={lastCapture:null,times:[],lastRender:0,rawHands:0,usableHands:0};
// Frames the video element receives from the camera (camera-input.js), counted apart from the frames the page processes.
let frameMeter=null;
let letterImageLandmarker=null,letterCamera=null,letterHands=[],letterFrameAt=-Infinity,motionCommittedId=null;
const useLetterWorker=()=>!CANDIDATE_LETTER_MODEL&&typeof Worker!=='undefined'&&new URLSearchParams(location.search).get('letterEngine')==='hybrid';
function renderCameraDiagnostic(){
 const times=cameraDiagnostic.times,span=times.length>1?times[times.length-1]-times[0]:0;
 $('#cameraDiagnostics').textContent=JSON.stringify({build:'20261111-architecture-2',recoveryWarning:cameraDiagnostic.recoveryWarning||null,letterWorker:letterCamera?.diagnostics()||null,staticCandidate:cameraDiagnostic.staticCandidate||null,letterMoving:cameraDiagnostic.letterMoving||false,trackerState:cameraDiagnostic.trackerState||'idle',trackerError:cameraDiagnostic.trackerError||null,delegate:handDelegate,processingLagMs:Math.round(temporalLagMs),input:video.videoWidth+'x'+video.videoHeight,camera:cameraDiagnostic.camera||null,cameraFrames:frameMeter?.summary()||null,processedFps:span?Math.round((times.length-1)*10000/span)/10:0,rawHands:cameraDiagnostic.rawHands,usableHands:cameraDiagnostic.usableHands,mode:recognitionMode,vocabulary:$('#activeVocabulary').textContent,model:$('#motionModelStatus').textContent,extraWords:$('#expandedWords').checked,serverPreview:$('#researchWordsToggle').checked,automaticWords:$('#automaticWords').checked,faceTracking:$('#faceTrackingToggle').checked,lastCapture:cameraDiagnostic.lastCapture},null,2);
}
$('#copyCameraDiagnostics').addEventListener('click',async()=>{renderCameraDiagnostic();try{await navigator.clipboard.writeText($('#cameraDiagnostics').textContent);notify('Diagnostics copied.');}catch{notify('Select and copy the text in Camera diagnostics.');}});
let handVision,handFiles,handRecovery=null;
// Hands tracked in the letters and numbers modes. Fingerspelling uses one hand, so one hand is
// tracked: a second tracked hand cost about a fifth of the frame rate, and more when it was in view
// (training/check_letter_two_hands.mjs). ?letterHands=2 tracks two and reads the letters from one
// of them (letter-hand-choice.js); DEFAULT_LETTER_HANDS is what the page does without it.
const DEFAULT_LETTER_HANDS=1;
const LETTER_HANDS=(value=>value==='1'?1:value==='2'?2:DEFAULT_LETTER_HANDS)(pageOption('letterHands'));
const letterHandChoice=createLetterHandChoice();
// Which hand the signer selected: 'auto' (either), 'right' or 'left'. The optional query setting is
// only used with two hands tracked (?letterHands=2); with one hand tracked the page reads the hand
// the tracker follows. It does not change how a hand is compared with the references:
// comparing one orientation only was measured and lost correct letters.
const requestedSigningHand=pageOption('signingHand');
const signingHand=requestedSigningHand==='right'||requestedSigningHand==='left'?requestedSigningHand:'auto';
// Hands at the edge of the picture (hand-view.js). A hand that is partly outside stays drawn. In
// the letters mode a hand that reaches no further outside than EDGE_MARGIN is still read, and a
// hand with several points at the edge is taken to be cut off and is not read (isCutOff).
// ?handEdge=strict is the rule of before 2026-11-14, for a comparison: a hand with a point outside
// the picture is neither drawn nor read, and a missed frame clears the outline. ?handEdge=<number>
// sets the margin (0 to 0.15 of the picture).
const HAND_EDGE=pageOption('handEdge'),EDGE_STRICT=HAND_EDGE==='strict',DEFAULT_EDGE_MARGIN=HAND_VIEW_DEFAULTS.edgeMargin;
const EDGE_MARGIN=EDGE_STRICT?0:(value=>HAND_EDGE&&Number.isFinite(value)&&value>=0&&value<=.15?value:DEFAULT_EDGE_MARGIN)(Number(HAND_EDGE));
const handHold=createHandHold();
// Words mode, a candidate that is off unless asked for: ?wordEdge=<number up to 0.15> also gives the
// word recognizers a hand whose points reach no further outside the picture than that, as it was
// tracked. Without it a hand with one point outside is left out of the capture, as before.
const WORD_EDGE_MARGIN=(value=>pageOption('wordEdge')&&Number.isFinite(value)&&value>0&&value<=.15?value:0)(Number(pageOption('wordEdge')));
const wordHandNearEdge=points=>WORD_EDGE_MARGIN>0&&nearPicture(points,WORD_EDGE_MARGIN)&&isUsableHand(pulledInside(points));
// How sure the tracker must be that the hand it follows is still a hand, in the letters and numbers
// modes (0.5 in the words mode). ?handPresence=<number> sets it for a comparison.
const DEFAULT_LETTER_HAND_PRESENCE=.5;
const LETTER_HAND_PRESENCE=(value=>pageOption('handPresence')&&Number.isFinite(value)&&value>=.1&&value<=.9?value:DEFAULT_LETTER_HAND_PRESENCE)(Number(pageOption('handPresence')));
let handLandmarker,handMaxHands=1,handDelegate='',temporalCamera=null,temporalHands=[],temporalFrameAt=-Infinity,temporalLagMs=0;
let stream;
let running = false;
let cameraStarting = false;
let cameraAttempt = 0;
let animationId;
let message = '';
// Undo for the draft: earlier drafts, newest last. Every change keeps the draft it replaces;
// a burst of typing in the editor keeps one.
const UNDO_LIMIT=50;
let undoStack=[],renderedMessage='',undoQuiet=false,typingAt=0,lastAddedWord='';
// How Words mode shows its result: 'message' collects the words into one draft that is reviewed and
// spoken as a whole; 'word' shows the newest word on the camera picture and speaks a word when its
// Add button is pressed. Recognition is the same in both.
let wordOutput='message';
let candidate = '';
let candidateSince = 0;
let committed = '';
let missingFrames = 0;
let missingSince=null;
let demoTimer;
let sessionStarted = Date.now();
let detectionLog = [];
// The detection committed last and the length of the draft right after it: when the Backspace
// button removes that letter while it is still the last character, the detection is marked as
// corrected (detections.correct = false). Nothing is marked as confirmed.
let lastDetection = null;
function logDetection(entry){detectionLog.push(entry);lastDetection={entry,length:message.length};}
let serverAvailable = false;
let systemLoadVersion = 0;
let trainingActive = false;
let trainingCaptured = 0;
let lastTrainingCapture = 0;
let trainingLabel = '';
let pendingSamples = [];
let lastVideoTime = -1;
let modelParameters = DEFAULT_PARAMETERS;
let aiSamples = loadAISamples();
let baseSamples = [];
let baseModelState = 'Loading pretrained letters…';
// Letter pace. A letter is added after it has been held for HOLD_MS. Recognition itself is kept
// quick; what is calm is the display (showLetterPace). The page can be opened with:
//   ?letterHold=fast        850 ms hold, as before the paced display existed (check scripts)
//   ?letterHold=deliberate  1300 ms hold and, after each letter, SETTLE_MS during which static
//                           letters are ignored so the next one cannot follow at once
const LETTER_PACE=typeof URLSearchParams!=='undefined'&&typeof location!=='undefined'?new URLSearchParams(location.search).get('letterHold'):null;
const HOLD_MS = LETTER_PACE==='fast'?850:LETTER_PACE==='deliberate'?1300:1000;
const SETTLE_MS = LETTER_PACE==='deliberate'?700:0;
// A candidate is shown only after it has lasted this long; until then the display says it is reading.
const CANDIDATE_SHOW_MS = 250;
// How long a letter is shown as added. Display only: the next letter is already being read meanwhile.
const ADDED_SHOW_MS = 700;
// "No reliable match" is shown only after this long without any candidate.
const NO_MATCH_SHOW_MS = 1200;
// Automatic word capture: wait after one capture before the next, and how long "checking" is shown.
const WORD_COOLDOWN_MS = 1000;
const WORD_REVEAL_MS = 350;
let settleUntil = 0;
let addedUntil = 0;
let noLetterSince = null;
// Experimental shorter hold for unanimous frames; off unless the page is opened with ?letterHold=adaptive.
const ADAPTIVE_HOLD_MS=LETTER_PACE==='adaptive'?500:0;
const letterConsensus=createLetterConsensus({holdMs:HOLD_MS,letterHoldMs:{I:2000,D:2000},earlyHoldMs:ADAPTIVE_HOLD_MS});
const motionLetters=createMultiHandMotionLetters();
let motionLetterReady=false;
let motionLetterHoldUntil=0;

let speechRevision=0;
// `spoken` is the text being voiced (only with state 'speaking'); `text` is the status line.
function sentenceState(state,text,spoken){document.dispatchEvent(new CustomEvent('handspeak:sentence-state',{detail:spoken?{state,text,spoken}:{state,text}}));}
function stopSpeech(){speechRevision++;window.speechSynthesis?.cancel();$('#pipelineVoice').classList.remove('active');sentenceState('stopped','Speech stopped · Your draft is unchanged.');}
function speakText(text){
  if(!('speechSynthesis' in window)){notify('Speech is unavailable in this browser');return;}
  const currentSpeech=++speechRevision;window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.rate=Number($('#speechRate')?.value||1);
  $('#pipelineVoice').classList.add('active');sentenceState('speaking','Speaking… Use Stop speech to cancel.',String(text||'').trim());
  utterance.onend=()=>{if(currentSpeech!==speechRevision)return;$('#pipelineVoice').classList.remove('active');sentenceState('complete','Speech complete · Ready for your next sentence.');};
  utterance.onerror=()=>{if(currentSpeech!==speechRevision)return;$('#pipelineVoice').classList.remove('active');sentenceState('error','Speech could not play. Try Speak message or check browser audio.');};
  window.speechSynthesis.speak(utterance);
}


const researchWords=createResearchWords({onWord:addWord,
 onStatus:(word,detail)=>{setWordCameraResult(word,detail,true);setRecognitionFeedback(detail||word);},
 onChange:enabled=>{motionStudio.cancel();liveResult.hidden=true;if(enabled)setRecognitionMode('words',true);}
});
// Sign sequence strip, off without ?signSequence=on (owner's decision of 2026-11-14: recognized signs
// enter it automatically). Every word the word recognizer suggests becomes a sign event (confirmed
// false), and a closest-word choice the user presses becomes one too (confirmed true); refusals and
// status results never do (sign-sequence.js turns them away). The strip is kept apart from the message
// draft: nothing is added to the draft or spoken because of it. A phrase-bank match
// (models/phrase-bank.json, phrase-bank.js) is shown beside the signs; only phrases marked active can
// match, unless the address also carries ?phrases=all (for trying the inactive ones).
const SIGN_SEQUENCE_ON=pageOption('signSequence')==='on';
const SIGN_SEQUENCE_SOURCE=pageOption('wordModel')?'network':'matcher';
const signSequence=SIGN_SEQUENCE_ON&&typeof document!=='undefined'&&$('#wordChoices')?(()=>{
  const style=document.createElement('style');style.textContent=".sign-sequence-box{display:grid;gap:.35rem;margin:.5rem 0}.sign-sequence-title{margin:0;font-size:.85em;font-weight:600;opacity:.8}.sign-sequence{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center}.sign-chip{padding:.15rem .6rem;border:1px solid currentColor;border-radius:999px;font-weight:600}.sign-chip[data-confirmed=\"true\"]{border-style:double}.sign-sequence-match{flex-basis:100%;margin:.2rem 0 0;font-size:1.15em;font-weight:700}.sign-sequence-match[data-state=\"last\"]{opacity:.75}.sign-sequence-match[data-state=\"last\"]::before{content:\"Last phrase: \"}.sign-sequence-actions{display:flex;flex-wrap:wrap;gap:.5rem}";document.head.append(style);
  const box=document.createElement('section');box.id='signSequenceBox';box.className='sign-sequence-box';box.hidden=true;box.setAttribute('aria-label','Sign sequence');
  const title=document.createElement('p');title.className='sign-sequence-title';title.textContent='Signs in order';
  const strip=document.createElement('div');strip.id='signSequence';strip.className='sign-sequence';strip.setAttribute('aria-live','polite');
  const actions=document.createElement('div');actions.className='sign-sequence-actions';
  const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.id='signSequenceRemove';remove.textContent='Remove last sign';
  const clear=document.createElement('button');clear.type='button';clear.className='text-button';clear.id='signSequenceClear';clear.textContent='Clear signs';
  actions.append(remove,clear);box.append(title,strip,actions);$('#wordChoices').after(box);
  // The box, its heading and its buttons are shown only while there is a sign or a last phrase.
  const sequence=createSignSequence({container:strip,onChange:detail=>{box.hidden=!detail.events.length&&!detail.lastPhrase;}});
  remove.addEventListener('click',()=>sequence.removeLast());clear.addEventListener('click',()=>sequence.clear());
  return sequence;
})():null;
if(signSequence)fetch('./models/phrase-bank.json?v=20261114-bank-1').then(reply=>reply.ok?reply.json():null).then(bank=>{try{if(bank)signSequence.setMatcher(createPhraseMatcher(bank,{includeInactive:pageOption('phrases')==='all'}));}catch(error){console.warn('Phrase bank unavailable',error);}}).catch(error=>console.warn('Phrase bank unavailable',error));
const motionStudio=createMotionStudio({
  isRunning:()=>running && recognitionMode==='words',
  onWord:addWord,
  speakAdded:()=>wordOutput==='word',
  onStatus:(word,detail)=>{if(signSequence)signSequence.add({label:word,source:SIGN_SEQUENCE_SOURCE,confirmed:false});setWordCameraResult(word,detail);setRecognitionFeedback(word==='—'?(detail||'Ready — sign once, then pause.'):`${word} — ${detail||'Possible match; verify before adding.'}`);},
  speak:speakText,
  automaticCooldownMs:WORD_COOLDOWN_MS,revealDelayMs:WORD_REVEAL_MS,onPace:setWordPace,onChoices:renderWordChoices,
  // Candidate, off without ?wordRetry=1: a capture without a usable sequence does not start the rest period.
  retryEmptyCapture:pageOption('wordRetry')==='1',
  // Candidate, off without ?teachCapture=automatic: personal examples are recorded with the automatic capture.
  teachWithAutomaticCapture:pageOption('teachCapture')==='automatic',
  onDiagnostic:data=>{
    const {sequence,...summary}=data;
    if(new URLSearchParams(location.search).has('motionAudit'))globalThis.__lastMotionSequence=sequence||null;
    cameraDiagnostic.lastCapture=summary;renderCameraDiagnostic();
  },
});
vocabularyLibrary=createVocabularyLibrary({onWord:addWord,isOffered:label=>motionStudio.offers(label),setVocabulary:(model,name)=>{researchWords.disable();const prior=motionStudio.usesTemporalModel(),accepted=motionStudio.setVocabulary(model,name);if(accepted){temporalCamera?.reset();if((running||cameraStarting)&&prior!==motionStudio.usesTemporalModel())stopCamera();}return accepted;}});
$('#motionTeach').addEventListener('click',()=>researchWords.disable(),true);

function setRecognitionMode(mode,keepResearch=false){
  // Letters and numbers share the handshape mode; signSet keeps which of the two was chosen.
  if(mode==='numbers'||mode==='letters')signSet=mode;
  if(mode==='numbers')mode='letters';
  researchWords.cancel();if(!keepResearch)researchWords.disable();
  if(temporalCamera&&mode!=='words')stopCamera();
  if(letterCamera&&mode!=='letters')stopCamera();
  recognitionMode=mode;withdrawDigitOffer();missingSince=null;motionCommittedId=null;letterConsensus.reset();motionLetters.reset();motionLetterHoldUntil=0;
  if((handLandmarker||cameraStarting)&&handMaxHands!==(mode==='letters'?LETTER_HANDS:2)){
    stopCamera();handLandmarker?.close?.();handLandmarker=null;
  }
  $('#recognitionMode').value=mode==='letters'?signSet:mode;
  document.querySelectorAll('[data-recognition-mode]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.recognitionMode===$('#recognitionMode').value));
  });
  $('#captureMode').textContent=recognitionMode==='words'?'WORDS IN MOTION':signSet==='numbers'?'NUMBERS':'LETTERS';
  $('#wordOutputLabel').hidden=recognitionMode!=='words';renderCaption();
  
  $('#pipelineMatch').classList.toggle('active',recognitionMode==='words');
  candidate='';candidateSince=0;committed='';
  if(trainingActive)endTraining();
  motionStudio.cancel();liveResult.hidden=true;
  setRecognitionFeedback(running?'Ready — bring your hand into view.':'Camera off — select Start Signing to begin.');
  $('#captureSamplesButton').disabled=recognitionMode==='words';
  $('#demoButton').disabled=recognitionMode==='words';
  clearInterval(demoTimer);
  $('#cameraHelp').textContent=recognitionMode==='words'?'With Automatic words enabled, sign once and pause briefly. Manual recording is also available.':lettersHelp();
}
// A change of mode that needs another tracker stops the camera (setRecognitionMode). When the
// person made the change on the mode control with the camera on, the camera is started again.
$('#recognitionMode').addEventListener('change',event=>{
  const wasLive=running||cameraStarting;
  setRecognitionMode(event.target.value);
  if(wasLive&&!running&&!cameraStarting)void startCamera();
});
document.querySelectorAll('[data-recognition-mode]').forEach(button=>button.addEventListener('click',()=>{
  const select=$('#recognitionMode');
  if(select.value===button.dataset.recognitionMode)return;
  select.value=button.dataset.recognitionMode;
  select.dispatchEvent(new Event('change',{bubbles:true}));
}));
$('#wordCaptureButton').addEventListener('click',async()=>{
  $('#wordCaptureButton').disabled=true;
  try{
    if(!running)await startCamera();
    if(!running)return;
    if(recognitionMode!=='words')setRecognitionMode('words');
    if(researchWords.active())researchWords.recognize();else motionStudio.recognize();
  }finally{$('#wordCaptureButton').disabled=motionStudio.isRecording();}
});

function loadAISamples(){
  try{
    const saved=JSON.parse(localStorage.getItem('handspeak-ai-samples-pixel-v3')||'[]');
    return Array.isArray(saved)?saved.filter(item=>validSample(item,STATIC_SIGNS.map(sign=>sign.letter))):[];
  }catch{return []}
}

// Reference samples, rebuilt only when either source array is replaced. `all` is the loaded model's
// samples plus the user's own. `letters` is `all` without the number labels: the letters mode
// compares letters only. `numbers` is `all` with the O, V, W and F references counted as 0, 2, 6 and
// 9 (the same handshapes): the numbers mode compares everything, so that a letter handshape is
// refused there and not forced into a number (readForSignSet). While personal samples are collected
// `all` is compared as labelled, so the sign being taught can show.
const sampleSets={base:null,personal:null,all:[],letters:[],numbers:[]};
function recognitionSamples(){
  if(sampleSets.base!==baseSamples||sampleSets.personal!==aiSamples){
    sampleSets.base=baseSamples;sampleSets.personal=aiSamples;
    sampleSets.all=baseSamples.concat(aiSamples);
    sampleSets.letters=sampleSets.all.filter(sample=>!DIGIT_LABELS.has(sample.label));
    sampleSets.numbers=sampleSets.all.map(sample=>SHARED_DIGITS[sample.label]?{label:SHARED_DIGITS[sample.label],features:sample.features}:sample);
  }
  return trainingActive?sampleSets.all:signSet==='numbers'?sampleSets.numbers:sampleSets.letters;
}
// What a classifier answer means in the current mode. Numbers: a number stands, a letter is not a
// number (O, V, W and F arrive as numbers from the reference set; the opt-in hybrid worker answers
// with letters, so they are read as their numbers here too). Letters: a number is not a letter.
function readForSignSet(result){
  if(!result||!result.letter)return result;
  if(signSet==='numbers'){
    const digit=DIGIT_LABELS.has(result.letter)?result.letter:SHARED_DIGITS[result.letter];
    return digit?{...result,letter:digit}:{letter:'',confidence:0};
  }
  return DIGIT_LABELS.has(result.letter)?{letter:'',confidence:0}:result;
}
// Help for the two handshape modes. A number with a handshape of its own can only be read when the
// reference set holds it (the user's samples, or a model that carries pretrained numbers).
function lettersHelp(){
  if(signSet==='numbers'){
    recognitionSamples();
    return sampleSets.all.some(sample=>DIGIT_LABELS.has(sample.label)&&!SHARED_LETTER[sample.label])
      ?'Hold a number steady. 0, 2, 6 and 9 are read from the same handshapes as O, V, W and F.'
      :'Hold a number steady. 0, 2, 6 and 9 can be read now; 1, 3, 4, 5, 7 and 8 need your own samples first (AI Studio).';
  }
  return 'Hold a letter steady. Trace J with your pinky or Z with your index, then pause. After O, V, W or F you can change the letter to 0, 2, 6 or 9; for other numbers choose Numbers.';
}
// After O, V, W or F is added, the number with the same handshape is offered for a few seconds.
// Pressing it replaces that one character; nothing else in the message is touched.
const DIGIT_OFFER_MS=6000;
let digitOffer=null;
let committedAlias=null;
function withdrawDigitOffer(){
  if(!digitOffer)return;
  if(typeof clearTimeout==='function')clearTimeout(digitOffer.timer);
  digitOffer=null;renderDigitOffer();
}
function offerDigit(letter,index){
  const digit=SHARED_DIGITS[letter];
  withdrawDigitOffer();
  if(!digit)return;
  digitOffer={letter,digit,index,timer:typeof setTimeout==='function'?setTimeout(withdrawDigitOffer,DIGIT_OFFER_MS):0};
  renderDigitOffer();
}
function acceptDigitOffer(){
  const offer=digitOffer;if(!offer)return false;
  withdrawDigitOffer();
  if(message[offer.index]!==offer.letter)return false;
  message=message.slice(0,offer.index)+offer.digit+message.slice(offer.index+1);renderMessage();
  const last=detectionLog[detectionLog.length-1];if(last&&last.symbol===offer.letter)last.symbol=offer.digit;
  // While the same hand is still held up, the display names the number the user chose.
  committedAlias={letter:offer.letter,digit:offer.digit};
  document.dispatchEvent(new CustomEvent('handspeak:letter-corrected',{detail:{from:offer.letter,to:offer.digit,index:offer.index}}));
  setRecognitionFeedback(`${offer.digit} added in place of ${offer.letter}. Verify the draft before speaking.`);
  return true;
}
function renderDigitOffer(){
  const row=$('#wordChoices');
  if(!row?.replaceChildren||typeof document.createElement!=='function')return;
  if(!digitOffer){if(row.dataset?.kind==='digit'){row.hidden=true;row.replaceChildren();delete row.dataset.kind;}return;}
  const {letter,digit}=digitOffer;
  const lead=document.createElement('span');lead.className='word-choices-lead';lead.textContent=`Added ${letter}. The number ${digit} has the same handshape.`;
  const change=document.createElement('button');change.type='button';change.className='word-choice';change.dataset.word=digit;change.textContent=`Change to ${digit}`;
  change.addEventListener('click',acceptDigitOffer);
  const keep=document.createElement('button');keep.type='button';keep.className='word-choice-none';keep.textContent=`Keep ${letter}`;
  keep.addEventListener('click',withdrawDigitOffer);
  row.replaceChildren(lead,change,keep);if(row.dataset)row.dataset.kind='digit';row.hidden=false;
}
function classifyAI(points,imageAspect=1){
  return classifyLetter(points,recognitionSamples(),modelParameters,imageAspect);
}

// The refined letter model (models/asl-knn-candidate-v3.json: letters with the hand-shape term, and
// the numbers 1, 3, 4, 5, 7 and 8) is the default since 2026-11-14, by the owner's decision. The
// earlier model (models/asl-knn.json) is loaded with ?letterModel=bundled; that choice is remembered
// in this browser so that it survives signing in and reloading, and ?letterModel=candidate returns
// to the default. The hybrid worker always uses the earlier model, so it runs only with that choice.
const CANDIDATE_LETTER_MODEL=(()=>{
  try{
    const choice=typeof URLSearchParams!=='undefined'&&typeof location!=='undefined'?new URLSearchParams(location.search).get('letterModel'):null;
    if(choice==='bundled')localStorage.setItem('handspeak-letter-model','bundled');
    else if(choice==='candidate')localStorage.removeItem('handspeak-letter-model');
    return localStorage.getItem('handspeak-letter-model')!=='bundled';
  }catch{return true;}
})();
async function loadPretrainedModel(){
  try{
    const response=await fetch(CANDIDATE_LETTER_MODEL?'./models/asl-knn-candidate-v3.json?v=20261113-digits-1':'./models/asl-knn.json?v=20261111-letter-calibrated-1');
    if(!response.ok)throw new Error('Pretrained model download failed');
    const model=await response.json();
    // A model may also carry samples of hands that are not letters, under the labels it lists as refused.
    const refused=Array.isArray(model.parameters?.rejectLabels)?model.parameters.rejectLabels:[];
    const labels=STATIC_SIGNS.map(sign=>sign.letter).concat(refused);
    if(model.version!==2 || !validParameters(model.parameters) || model.normalization!=='wrist-palm-orientation-v2'
      || !Array.isArray(model.samples) || !model.samples.length
      || !model.samples.every(sample=>validSample(sample,labels)))throw new Error('Invalid pretrained model');
    baseSamples=model.samples;
    modelParameters=model.parameters;
    const pretrainedLabels=[...new Set(baseSamples.map(sample=>sample.label))].filter(label=>!refused.includes(label));
    const pretrainedDigits=pretrainedLabels.filter(label=>DIGIT_LABELS.has(label)).length;
    baseModelState=`${pretrainedLabels.length-pretrainedDigits} pretrained letters${pretrainedDigits?` and ${pretrainedDigits} numbers`:''} · ${baseSamples.length} reference samples${CANDIDATE_LETTER_MODEL?' · refined model':' · earlier model'}`;
    // The help can only say which numbers are readable once the reference set is known.
    if(recognitionMode==='letters'&&!running)$('#cameraHelp').textContent=lettersHelp();
  }catch(error){
    console.warn(error);
    baseModelState='Pretrained letters unavailable · reload or teach at least two signs';
  }
  renderAIStatus();
}

function endTraining(){
  trainingActive=false;pendingSamples=[];
  $('#trainingLabel').disabled=false;
  $('#captureSamplesButton').disabled=false;
  $('#captureSamplesButton').textContent='Capture 30 samples';
}

function captureTrainingSample(points,now){
  if(!trainingActive||now-lastTrainingCapture<150||!isUsableLetterHand(points,video.videoHeight/video.videoWidth))return;
  lastTrainingCapture=now;
  pendingSamples.push({label:trainingLabel,features:letterFeatures(points,video.videoHeight/video.videoWidth)});
  trainingCaptured=pendingSamples.length;
  $('#trainingProgress').style.width=`${trainingCaptured/30*100}%`;
  $('#trainingHelp').textContent=`Captured ${trainingCaptured} of 30 samples. Slowly vary the hand angle.`;
  if(trainingCaptured>=30){
    const updated=aiSamples.concat(pendingSamples);
    try{
      localStorage.setItem('handspeak-ai-samples-pixel-v3',JSON.stringify(updated));
      aiSamples=updated;letterCamera?.setPersonalSamples(aiSamples);
      $('#trainingHelp').textContent='Examples saved. Try the sign with a slightly different hand position.';
      notify(`${trainingLabel} training complete`);
    }catch{
      $('#trainingHelp').textContent='Could not save examples. Free browser storage and try again.';
    }
    endTraining();renderAIStatus();
  }
}

function renderAIStatus(){
  renderSignLibrary();
  const counts=Object.fromEntries(SIGNS.map(sign=>[sign.letter,baseSamples.concat(aiSamples).filter(sample=>sample.label===sign.letter).length]));
  $('#aiModelStatus').textContent=`${baseModelState} · ${aiSamples.length} personal samples${motionLetterReady?' · J/Z motion loaded':''}`;
  $('#sampleCounts').innerHTML=SIGNS.map(sign=>`<span><b>${sign.letter}</b> ${counts[sign.letter]}</span>`).join('');
}

function notify(text){
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function pushUndo(text){
  if(undoStack[undoStack.length-1]===text)return;
  undoStack.push(text);if(undoStack.length>UNDO_LIMIT)undoStack.shift();
}
// The newest word of the draft: the word added last while the draft still ends with it (so that
// THANK YOU stays one word), otherwise the last run of characters.
function newestWord(){
  const text=message.trimEnd();
  if(lastAddedWord&&text.endsWith(lastAddedWord))return lastAddedWord;
  return (text.match(/\S+/g)||[]).pop()||'';
}
// The line shown on the camera picture: the whole draft, or only the newest word in Words mode with "Per word".
function renderCaption(){
  const perWord=wordOutput==='word'&&recognitionMode==='words';
  $('#captureTranscript').textContent=perWord?(newestWord()||'Your word will appear here.'):(message||'Your words will appear here.');
  $('#speakWordButton').disabled=!newestWord();
}
function renderMessage(){
  if(message!==renderedMessage){if(!undoQuiet)pushUndo(renderedMessage);renderedMessage=message;}
  messageText.innerHTML = message ? '' : '<span>Recognized words will appear here…</span>';
  if(message) messageText.textContent = message;
  // The editor always holds the draft, so typing in it changes the draft directly.
  if($('#messageEditor').value!==message)$('#messageEditor').value=message;
  $('#undoButton').disabled=!undoStack.length;
  renderCaption();
  $('#pipelineReview').classList.toggle('active',Boolean(message));
  document.dispatchEvent(new CustomEvent('handspeak:draft-changed'));
}

// Show the everyday words found in fingerspelled letters, as in the primary workspace.
const letterWords=$('#letterWords'),letterWordsList=$('#letterWordsList'),letterWordsUse=$('#letterWordsUse');
const knownLetterWords=new Set(COMMON_WORDS);
let suggestedLetterWords='';
function renderLetterWords(){
  const result=wordsInMessage(message,knownLetterWords);
  const show=result.found.length>0&&(result.split||(recognitionMode==='letters'&&signSet==='letters'));
  letterWords.hidden=!show;
  if(!show){suggestedLetterWords='';return;}
  letterWordsList.replaceChildren(...result.found.map(word=>{const chip=document.createElement('b');chip.textContent=word;return chip;}));
  suggestedLetterWords=result.text;
  letterWordsUse.hidden=!result.split;
}
document.addEventListener('handspeak:draft-changed',renderLetterWords);
letterWordsUse.addEventListener('click',()=>{if(suggestedLetterWords&&suggestedLetterWords!==message){message=suggestedLetterWords;renderMessage();}});

function updateSentence(next){
  if(next===null){notify('Message limit reached (1000 characters)');return false;}
  message=next;renderMessage();return true;
}
function addWord(word){
  const next=appendWord(message,word);
  if(next!==null)lastAddedWord=String(word).trim().replace(/\s+/g,' ');
  return updateSentence(next);
}
document.querySelectorAll('[data-typed-word]').forEach(button=>button.addEventListener('click',()=>{addWord(button.dataset.typedWord);}));
document.querySelectorAll('[data-punctuation]').forEach(button=>button.addEventListener('click',()=>{updateSentence(finishSentence(message,button.dataset.punctuation));}));
$('#removeWordButton').addEventListener('click',()=>{updateSentence(removeLastWord(message));});

function appendCharacter(char){
  if(message.length>=1000){notify('Message limit reached (1000 characters)');return;}
  message += char;
  renderMessage();
}

function setRecognitionFeedback(text){
  const node=$('#recognitionFeedback');
  if(!node)return;
  const value=String(text||'');
  const normalized=value.toLowerCase();
  node.dataset.state=(/unavailable|failed|stopped|error|timed out|not supported|no camera/.test(normalized))?'error':
    (/recognized| added\.|restored|ready/.test(normalized))?'success':'waiting';
  if(node.textContent!==value)node.textContent=value;
}
// Calm display for static letters and digits. The big character does not follow every frame: it
// shows a reading state until one candidate has lasted CANDIDATE_SHOW_MS, then the candidate with a
// bar that fills as the hold approaches the commit, then the committed letter as added for
// ADDED_SHOW_MS. "No reliable match" appears only after NO_MATCH_SHOW_MS without a candidate.
function showLetterPace(result,now){
  vocabularyLibrary?.showCameraAccuracy(null);
  liveResult.hidden=false;
  const held=letterConsensus.progress(now);
  if(held.label||result.letter)noLetterSince=null;
  else if(noLetterSince===null)noLetterSince=now;
  // After a one-press change from a letter to its number, the number is what was added.
  const shown=committedAlias&&committedAlias.letter===committed?committedAlias.digit:committed;
  if(committed&&now<Math.max(addedUntil,settleUntil)){
    setPace('added',1);liveLetter.textContent=shown;
    liveConfidence.textContent='Added to your message';
    setRecognitionFeedback(`${shown} added. Get the next sign ready.`);
  }else if(held.label&&held.label===committed){
    setPace('done',1);liveLetter.textContent=shown;
    liveConfidence.textContent='Added — change the sign, or lower your hand to repeat it';
    setRecognitionFeedback(`${shown} — recognized. Verify the draft before speaking.`);
  }else if(held.label&&held.elapsedMs>=CANDIDATE_SHOW_MS){
    setPace('holding',held.ratio);liveLetter.textContent=held.label;
    liveConfidence.textContent='Possible match — keep holding until the bar fills';
    setRecognitionFeedback(`Hand detected · ${held.label} — possible match. Hold steady.`);
  }else if(held.label||result.letter||now-noLetterSince<NO_MATCH_SHOW_MS){
    setPace('reading',0);liveLetter.textContent='…';
    liveConfidence.textContent='Reading your sign…';
    setRecognitionFeedback('Hand detected · Reading your sign… hold it steady.');
  }else{
    setPace('none',0);liveLetter.textContent='No reliable match';
    liveConfidence.textContent='Still looking — adjust your hand or try another supported sign';
    setRecognitionFeedback('Hand detected · No reliable match yet. Adjust your hand or try a supported sign.');
  }
}
// Automatic word capture: 'watching' while a sign is being captured, 'checking' between its end
// and the suggestion, then the bar drains until another capture may start.
function setWordPace(state){
  if(state==='watching'||state==='checking'){
    liveResult.hidden=false;liveLetter.textContent='…';
    liveConfidence.textContent=state==='watching'?'Watching your sign… pause when you finish':'Checking your sign…';
    setPace(state,0);
    if(state==='checking')setRecognitionFeedback('Checking your sign…');
  }else{
    liveResult.style?.setProperty?.('--rest-ms',`${Math.max(0,WORD_COOLDOWN_MS-WORD_REVEAL_MS)}ms`);
    setPace('rest',1);
  }
}
function setLive(letter){
  vocabularyLibrary?.showCameraAccuracy(null);
  setPace(letter?'done':'none');
  liveResult.hidden = false;
  liveLetter.textContent = letter || 'No reliable match';
  liveConfidence.textContent = letter?'Possible match — hold steady, then verify the text':'Adjust your hand and try a supported sign';
  setRecognitionFeedback(letter&&committed===letter?`${letter} — recognized. Verify the draft before speaking.`:letter?`Hand detected · ${letter} — possible match. Hold steady.`:'Hand detected · No reliable match. Try a supported sign.');
}

async function prepareFaceTracker(){
  try{
    const vision=await import('/vendor/mediapipe-tasks-vision-0.10.22-rc.20250304/vision_bundle.mjs');
    const files=await vision.FilesetResolver.forVisionTasks('/vendor/mediapipe-tasks-vision-0.10.22-rc.20250304/wasm');
    
    await faceTracker.load(vision,files);
  }catch{ $('#faceTrackingStatus').textContent='Unavailable';$('#faceRetry').hidden=false; }
}
function createHandRecognizer(delegate,runningMode='VIDEO'){
  const confidence=.5,presence=recognitionMode==='letters'?LETTER_HAND_PRESENCE:confidence;
  return handVision.HandLandmarker.createFromOptions(handFiles,{
    baseOptions:{modelAssetPath:'/vendor/mediapipe-models/hand_landmarker.task',delegate},
    runningMode,numHands:recognitionMode==='letters'?LETTER_HANDS:2,minHandDetectionConfidence:confidence,minHandPresenceConfidence:presence,minTrackingConfidence:presence
  });
}
function handTrackerFailed(error){
  console.warn('Hand tracking stopped',error);
  try{handLandmarker?.close?.();}catch{}
  handLandmarker=null;letterImageLandmarker?.close?.();letterImageLandmarker=null;motionStudio.cancel();researchWords.cancel();
  cameraDiagnostic.trackerError=String(error?.message||error).slice(0,500);
  const failed=()=>{cameraDiagnostic.trackerState='failed';$('#cameraHelp').textContent='Hand tracking stopped. Stop and restart the camera to retry.'+(document.documentElement?.dataset?.site==='app'?'':' Open Camera diagnostics for the error.');renderCameraDiagnostic();};
  if(handDelegate!=='GPU'||!handVision||handRecovery){failed();return;}
  const attempt=cameraAttempt;
  cameraDiagnostic.trackerState='recovering';
  $('#cameraHelp').textContent='Hand tracking is switching to CPU compatibility mode…';renderCameraDiagnostic();
  const recovery=createHandRecognizer('CPU').then(async model=>{
    if(attempt!==cameraAttempt||!running){model.close?.();return;}
    let independent=null;
    try{if(recognitionMode==='letters')independent=await createHandRecognizer('CPU','IMAGE');}catch(error){model.close?.();throw error;}
    if(attempt!==cameraAttempt||!running){model.close?.();independent?.close?.();return;}
    handLandmarker=model;letterImageLandmarker=independent;handDelegate='CPU';cameraDiagnostic.trackerState='ready';lastVideoTime=-1;
    $('#cameraHelp').textContent='Hand tracking restored in CPU compatibility mode. Bring your full hand into view, sign once, then pause.';renderCameraDiagnostic();
  }).catch(fallbackError=>{if(attempt===cameraAttempt&&running){cameraDiagnostic.trackerError=String(fallbackError?.message||fallbackError).slice(0,500);failed();}}).finally(()=>{if(handRecovery===recovery)handRecovery=null;});
  handRecovery=recovery;
}
async function loadRecognizer(){
  const targetHands=recognitionMode==='letters'?LETTER_HANDS:2;
  if(handLandmarker&&handMaxHands===targetHands){if(recognitionMode==='letters'&&!letterImageLandmarker)letterImageLandmarker=await createHandRecognizer(handDelegate,'IMAGE');void faceTracker.load();return;}
  if(handLandmarker){handLandmarker.close?.();handLandmarker=null;}
  letterImageLandmarker?.close?.();letterImageLandmarker=null;
  handMaxHands=targetHands;
  cameraButton.disabled=true;cameraButton.textContent='Loading recognizer…';cameraDiagnostic.trackerState='loading';cameraDiagnostic.trackerError=null;
  try{
    handVision=await import('/vendor/mediapipe-tasks-vision-0.10.22-rc.20250304/vision_bundle.mjs');
    handFiles=await handVision.FilesetResolver.forVisionTasks('/vendor/mediapipe-tasks-vision-0.10.22-rc.20250304/wasm');
    handDelegate=preferredVisionDelegate();
    try{handLandmarker=await createHandRecognizer(handDelegate);}
    catch(error){if(handDelegate==='CPU')throw error;handDelegate='CPU';handLandmarker=await createHandRecognizer(handDelegate);}
    if(recognitionMode==='letters'){letterImageLandmarker?.close?.();letterImageLandmarker=await createHandRecognizer(handDelegate,'IMAGE');}
    handMaxHands=targetHands;cameraDiagnostic.trackerState='ready';void faceTracker.load(handVision,handFiles);
  }catch(error){
    console.error(error);cameraDiagnostic.trackerState='failed';cameraDiagnostic.trackerError=String(error?.message||error).slice(0,500);
    throw new Error('The recognition model could not be loaded. Check your internet connection.');
  }finally{
    cameraButton.disabled=cameraStarting;cameraButton.innerHTML=cameraStarting?'Waiting for camera…':'<span aria-hidden="true">◉</span> Start camera';
  }
}

async function startCamera(){
  if(cameraStarting||running)return;
  setRecognitionFeedback('Starting camera… allow camera access when prompted.');
  cameraStarting=true;cameraButton.disabled=true;const attempt=++cameraAttempt;
  clearInterval(demoTimer);
  try{
    await loadVocabularySettings();if(attempt!==cameraAttempt)return;
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported by this browser.');
    if(recognitionMode==='letters'&&useLetterWorker()){
      letterCamera=createLetterCamera({personalSamples:aiSamples,
        onDetection:(data,lag)=>{if(!running)return;temporalLagMs=lag;letterHands=(data.landmarks||[]).filter(p=>isUsableLetterHand(p,data.imageAspect));letterFrameAt=performance.now();consumeDetection(data,data.timestamp,data.imageAspect);},
        onWarning:message=>{cameraDiagnostic.recoveryWarning=message;},
        onError:async message=>{
          if(!running||!letterCamera)return;const attempt=cameraAttempt;letterCamera.close();letterCamera=null;letterHands=[];
          cameraDiagnostic.recoveryWarning=message;
          try{await loadRecognizer();if(attempt===cameraAttempt&&running)setRecognitionFeedback('Compatibility detector restored — bring your hand into view.');}
          catch(error){if(attempt===cameraAttempt&&running){stopCamera();notify(error.message);}}
        }
      });
      try{const status=await letterCamera.ready;handDelegate=status.delegate;cameraDiagnostic.trackerState='ready';void prepareFaceTracker();}
      catch(error){letterCamera?.close();letterCamera=null;cameraDiagnostic.recoveryWarning=error.message;await loadRecognizer();}
    }else if(recognitionMode==='words'&&motionStudio.usesTemporalModel()){ 
      temporalCamera=createTemporalCamera({
        onDetection:(data,lag)=>{if(!running)return;handDelegate=temporalCamera?.getDelegate?.()||handDelegate;temporalLagMs=lag;temporalHands=(data.landmarks||[]).filter(hand=>isUsableHand(hand));temporalFrameAt=data.timestamp;consumeDetection(data,data.timestamp,data.imageAspect);},
        onGap:()=>{motionStudio.cancel();motionLetters.reset();motionLetterHoldUntil=0;temporalHands=[];setRecognitionFeedback('Camera timing changed or processing fell behind. Pause, then sign again.');},
        onError:message=>{cameraDiagnostic.trackerState='failed';cameraDiagnostic.trackerError=String(message).slice(0,500);if(running){stopCamera();$('#cameraHelp').textContent=message;renderCameraDiagnostic();notify(message);}}
      });
      handDelegate=await temporalCamera.ready;cameraDiagnostic.trackerState='ready';cameraDiagnostic.trackerError=null;void prepareFaceTracker();
    }else await loadRecognizer();
    if(attempt!==cameraAttempt)return;
    const devices=await navigator.mediaDevices.enumerateDevices();
    if(!devices.some(device=>device.kind==='videoinput'))throw new Error('No camera is available. Connect a webcam and retry.');
    // The default request is {facingMode:'user',width:{ideal:960},height:{ideal:720}}; ?cameraSize=, ?cameraFps=,
    // ?cameraResize= and the camera chosen in Camera settings change it (camera-input.js).
    const cameraAsk=cameraRequest(location.search,chosenCameraDevice());
    const pendingStream=navigator.mediaDevices.getUserMedia(cameraAsk.constraints);
    let cameraTimer;
    let cameraTimedOut=false;
    // A permission/device request can remain pending indefinitely. Late streams
    // are stopped, never attached to a cancelled/newer camera attempt.
    pendingStream.then(late=>{if(cameraTimedOut||attempt!==cameraAttempt)late.getTracks().forEach(t=>t.stop());},()=>{});
    let acquired;
    try{acquired=await Promise.race([pendingStream,new Promise((_,reject)=>{cameraTimer=setTimeout(()=>{cameraTimedOut=true;reject(new Error('Camera startup timed out. Check the browser permission prompt and camera connection.'));},20000);})]);}
    finally{clearTimeout(cameraTimer);}
    if(attempt!==cameraAttempt){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;
    video.muted=true;video.playsInline=true;video.srcObject = stream;
    await video.play();
    if(attempt!==cameraAttempt){acquired.getTracks().forEach(t=>t.stop());return;}
    running = true;
    cameraDiagnostic.camera=describeCamera(stream.getVideoTracks?.()?.[0],cameraAsk);
    frameMeter?.stop();frameMeter=createFrameMeter(video);void listCameraDevices();
    $('#trackingState').textContent='LIVE';$('#captureFeed').textContent='LIVE';
    $('#pipelineTrack').classList.add('active');
    placeholder.hidden = true;
    cameraStatus.classList.add('live');
    cameraStatus.innerHTML = '<i></i> Live';
    cameraButton.innerHTML = '<span aria-hidden="true">■</span> Stop camera';
    $('#cameraHelp').textContent = recognitionMode==='words'?'With Automatic words enabled, sign once and pause briefly. Manual recording is also available.':lettersHelp();
    setRecognitionFeedback('Camera ready — bring your hand into view.');
    detect();
  }catch(error){
    if(attempt!==cameraAttempt)return;
    stopCamera();
    setRecognitionFeedback('Camera unavailable — check permission and try again.');
    notify(error.message || 'Camera permission was not granted.');
    cameraDiagnostic.trackerError=String(error.name||'CameraError')+': '+String(error.message||'Camera failed');
    cameraDiagnostic.trackerState='failed';renderCameraDiagnostic();
    $('#cameraHelp').textContent = 'Camera unavailable. Check camera permission and close other camera apps, or use the demonstration videos.';
  }finally{if(attempt===cameraAttempt){cameraStarting=false;cameraButton.disabled=false;}}
}

function stopCamera(){
  letterCamera?.close();letterCamera=null;letterHands=[];missingSince=null;motionCommittedId=null;
  letterConsensus.reset();
  
  motionLetters.reset();motionLetterHoldUntil=0;
  temporalCamera?.close();temporalCamera=null;temporalHands=[];temporalLagMs=0;
  researchWords.cancel();
  setRecognitionFeedback('Camera off — select Start Signing to begin.');
  cameraAttempt++;
  cameraStarting=false;
  cameraButton.disabled=false;
  running = false;
  faceTracker.reset();handHold.reset();applyStageTransform();
  $('#trackingState').textContent='STANDBY';$('#trackingHands').textContent=`0 / ${recognitionMode==='letters'?LETTER_HANDS:2}`;$('#captureFeed').textContent='OFFLINE';
  $('#pipelineTrack').classList.remove('active');
  motionStudio.cancel();
  candidate='';candidateSince=0;committed='';lastVideoTime=-1;
  if(trainingActive){endTraining();$('#trainingHelp').textContent='Capture stopped. Start the camera to try again.';}
  cancelAnimationFrame(animationId);
  frameMeter?.stop();frameMeter=null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  placeholder.hidden = false;
  liveResult.hidden = true;
  cameraStatus.classList.remove('live');
  cameraStatus.innerHTML = '<i></i> Camera off';
  cameraButton.innerHTML = '<span aria-hidden="true">◉</span> Start camera';
}

function drawHand(points,alpha=1){
  if(!TRACKING_DRAWN)return;
  const links=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  // Thin lines and small joints, scaled with the picture so they look alike at any camera resolution.
  const unit=Math.max(.75,(canvas.width||960)/960);
  ctx.globalAlpha=alpha;ctx.strokeStyle='#7fe0ca';ctx.lineWidth=1.5*unit;ctx.lineCap='round';
  links.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(points[a].x*canvas.width,points[a].y*canvas.height);ctx.lineTo(points[b].x*canvas.width,points[b].y*canvas.height);ctx.stroke()});
  ctx.fillStyle='#fff';points.forEach(p=>{ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,2.5*unit,0,Math.PI*2);ctx.fill()});
  ctx.globalAlpha=1;
}

function stabilize(result, now){
  const stable=letterConsensus.push(result,now);
  if(stable&&committed!==stable.letter){
    const before=message.length;committedAlias=null;
    appendCharacter(stable.letter);
    logDetection({symbol:stable.letter,confidence:stable.confidence,latencyMs:Math.round(stable.latencyMs)});
    // O, V, W and F share a handshape with 0, 2, 6 and 9: offer the number as a one-press change.
    // Any other commit withdraws an offer that is still open.
    if(message.length===before+1)offerDigit(stable.letter,before);else withdrawDigitOffer();
    document.dispatchEvent(new CustomEvent('handspeak:letter-committed',{detail:{letter:stable.letter,kind:'static',timestamp:now,latencyMs:stable.latencyMs,observations:stable.evidenceFrames}}));
    committed=stable.letter;settleUntil=now+SETTLE_MS;addedUntil=now+ADDED_SHOW_MS;notify(`${stable.letter} added`);
  }
}

function detect(){
  if(!running) return;
  try{detectFrame();}
  catch(error){
    // One bad frame must not end the loop while the page still shows "Live".
    console.error(error);
    cameraDiagnostic.frameError=String(error?.message||error).slice(0,300);
    setRecognitionFeedback('A camera frame could not be processed. If this continues, stop and restart the camera.');
  }
  if(running)animationId=requestAnimationFrame(detect);
}
function detectFrame(){
  if(video.readyState>=2 && video.currentTime!==lastVideoTime){
    lastVideoTime=video.currentTime;
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    const now=performance.now();
    let detection={landmarks:[]};
    const auditStages=!letterCamera&&recognitionMode==='letters'&&typeof URLSearchParams!=='undefined'
      &&new URLSearchParams(location.search).has('letterAudit')?{}:null;
    if(handLandmarker&&!temporalCamera&&!letterCamera){
      try{
        const seenByTrackers=video;
        detection=handLandmarker.detectForVideo(seenByTrackers,now);
        if(auditStages)auditStages.videoMs=performance.now()-now;
        if(recognitionMode==='letters'&&letterImageLandmarker){
          const tracked=detection;
          const imageStarted=auditStages?performance.now():0;
          detection=letterImageLandmarker.detect(seenByTrackers);
            if(auditStages)auditStages.primaryMs=performance.now()-imageStarted;
          detection.trackedLandmarks=tracked.landmarks;
        }
      }
      catch(error){
        handTrackerFailed(error);
      }
    }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    faceTracker.draw(video,now,ctx,canvas.width,canvas.height,motionStudio.isCapturing()||researchWords.isCapturing(),letterCamera?250:100);
    if(letterCamera){letterCamera.push(video);if(now-letterFrameAt<400)letterHands.forEach(points=>drawHand(points));}
    else if(temporalCamera){
      temporalCamera.push(video,now,motionStudio.isCapturing());
      if(now-temporalFrameAt<200)temporalHands.forEach(points=>drawHand(points));
    }else if(handLandmarker){
      if(auditStages){detection.auditStages=auditStages;detection.timings=auditStages;}
      consumeDetection(detection,now,video.videoHeight/video.videoWidth);
      if(auditStages)auditStages.frameToUiMs=performance.now()-now;
    }
    else setRecognitionFeedback(cameraDiagnostic.trackerState==='recovering'?'Restoring hand tracking in CPU compatibility mode…':'Hand tracking unavailable — stop and restart the camera.');
  }
}

// Hand-point smoothing (landmark-smoothing.js). By default only the hand drawn over the picture is
// smoothed (DISPLAY_SMOOTHING: a hand held still is drawn still); what the recognizers get is unchanged. ?handSmoothing=on
// also smooths the points given to the letter classifier and to the word capture (a candidate, to
// be judged on replays), and ?handSmoothing=off draws the points as tracked.
const HAND_SMOOTHING=typeof URLSearchParams!=='undefined'&&typeof location!=='undefined'?new URLSearchParams(location.search).get('handSmoothing')||'':'';
const drawnHandSmoother=createLandmarkSmoother(DISPLAY_SMOOTHING),inputHandSmoother=createLandmarkSmoother();

function consumeDetection(detection,now,imageAspect){
    // What the tracker reported, before anything below changes it: used for drawing.
    const seenHands=Array.isArray(detection.landmarks)?detection.landmarks:[],seenTracked=Array.isArray(detection.trackedLandmarks)?detection.trackedLandmarks:[];
    // Letters mode: a hand that reaches a little outside the picture is still read. For the reading
    // its outside points are moved onto the edge (hand-view.js); trueShape keeps where they were.
    // A hand with several points at the edge is cut off by it: it is left out of the reading.
    const trueShape=new Map();let cutOffSeen=false;
    if(!EDGE_STRICT&&recognitionMode==='letters'&&!letterCamera){
      // Reject clipped hands at the edge of the full camera picture.
      const whole=points=>{const local=points,cut=isCutOff(local);if(cut&&isDrawableHand(local))cutOffSeen=true;return !cut;};
      const pull=points=>{const local=points,moved=EDGE_MARGIN>0&&nearPicture(local,EDGE_MARGIN)?pulledInside(local):local;if(moved===local)return points;const back=moved;trueShape.set(back,points);return back;};
      if(seenHands.length)detection.landmarks=seenHands.filter(whole).map(pull);
      if(seenTracked.length)detection.trackedLandmarks=seenTracked.filter(points=>!isCutOff(points)).map(pull);
    }
    if(HAND_SMOOTHING==='on'&&Array.isArray(detection.landmarks)){
      // Movement letters keep the points as tracked: a smoothed trace would lag behind the finger.
      if(!detection.motionHands)detection.motionHands=detection.trackedLandmarks||detection.landmarks;
      detection.landmarks=inputHandSmoother.smooth(detection.landmarks,now);
    }
    // With two hands tracked in the letters mode, letters are read from one of them: the hand the
    // signer chose, or else the one letter-hand-choice.js keeps to. The others are only drawn.
    let otherHands=[];
    if(LETTER_HANDS===2&&recognitionMode==='letters'&&Array.isArray(detection.landmarks)&&detection.landmarks.length>1){
      const usable=detection.landmarks.map((points,index)=>({points,side:detection.handedness?.[index]?.[0]?.categoryName})).filter(hand=>isUsableLetterHand(hand.points,imageAspect));
      // The tracker names a hand as if the picture were mirrored; the camera picture is not, so the
      // signer's right hand is the one it calls Left.
      const wanted=signingHand==='right'?'Left':signingHand==='left'?'Right':'';
      let pick=wanted?usable.findIndex(hand=>hand.side===wanted):-1;
      if(pick<0)pick=letterHandChoice.choose(usable.map(hand=>hand.points),imageAspect,now);
      if(pick>=0){otherHands=usable.filter((_,index)=>index!==pick).map(hand=>hand.points);detection.otherHands=otherHands;detection.landmarks=[usable[pick].points];}
    }
    const hands=(detection.landmarks||[]).filter(p=>recognitionMode==='letters'?isUsableLetterHand(p,imageAspect):isUsableHand(p));
    const processedAt=performance.now();cameraDiagnostic.times.push(processedAt);cameraDiagnostic.times=cameraDiagnostic.times.filter(t=>processedAt-t<=2000);cameraDiagnostic.rawHands=(detection.landmarks||[]).length;cameraDiagnostic.usableHands=hands.length;
    if(processedAt-cameraDiagnostic.lastRender>=1000){cameraDiagnostic.lastRender=processedAt;renderCameraDiagnostic();}
    // Drawn: the hands that are read, where they were tracked, and fainter the hands that are seen
    // but not read (partly outside the picture, too small, or followed by the tracker while the
    // detector missed them). A short loss does not clear the outline (handHold).
    const readShapes=hands.concat(otherHands).map(points=>trueShape.get(points)||points);
    const seenOnly=EDGE_STRICT||HAND_SMOOTHING==='on'?[]:(seenHands.some(points=>isDrawableHand(points))?seenHands:seenTracked).filter(points=>isDrawableHand(points)&&!readShapes.includes(points));
    if(!temporalCamera&&!letterCamera){
      const shapes=readShapes.concat(seenOnly);
      const smoothed=HAND_SMOOTHING==='on'||HAND_SMOOTHING==='off'?shapes:drawnHandSmoother.smooth(shapes,now);
      const shown=EDGE_STRICT?{hands:smoothed,held:false}:handHold.show(smoothed,now);
      shown.hands.forEach((points,index)=>drawHand(points,shown.held||index>=readShapes.length?.45:1));
      // Recording mode: how many hands were read and drawn in this frame, for the laboratory checks.
      if(pageOption('letterAudit')!==null)document.dispatchEvent(new CustomEvent('handspeak:hand-view',{detail:{mode:recognitionMode,read:hands.length,drawn:shown.hands.length,drawnHands:shown.hands,held:shown.held,seen:seenHands,timestamp:now}}));
    }
    $('#trackingHands').textContent=`${hands.length} / ${recognitionMode==='letters'?LETTER_HANDS:2}`;
    const motionHands=(detection.motionHands||detection.trackedLandmarks||detection.landmarks||[]).filter(p=>isUsableLetterHand(p,imageAspect));
    const auditStages=detection.auditStages;
    const motionStarted=auditStages?performance.now():0;
    const temporal=recognitionMode==='letters'&&signSet==='letters'&&!trainingActive?motionLetters.frame(motionHands,now,1/(imageAspect||1),Boolean(letterCamera&&detection.stableMotionGate)):{moving:false,result:null,presentIds:[]};
    if(auditStages)auditStages.motionMs=performance.now()-motionStarted;
    cameraDiagnostic.staticCandidate=detection.staticResult?.letter||null;cameraDiagnostic.letterMoving=Boolean(temporal.moving);
    if(recognitionMode==='letters'&&typeof URLSearchParams!=='undefined'&&new URLSearchParams(location.search).has('letterAudit'))document.dispatchEvent(new CustomEvent('handspeak:letter-frame',{detail:{detection,temporal,timestamp:now}}));
    if(temporal.result){
      const result=temporal.result;letterConsensus.reset();candidate='';candidateSince=0;committed=result.letter;motionCommittedId=result.handId;
      withdrawDigitOffer();appendCharacter(result.letter);logDetection({symbol:result.letter,confidence:result.confidence,latencyMs:result.latencyMs});
      document.dispatchEvent(new CustomEvent('handspeak:letter-committed',{detail:{letter:result.letter,kind:'motion',timestamp:now,latencyMs:result.latencyMs,observations:result.observationCount,handId:result.handId}}));
      motionLetterHoldUntil=Infinity;setLive(result.letter);
      setRecognitionFeedback(`${result.letter} — motion recognized. Lower your hand before the next letter; verify the draft before speaking.`);notify(`${result.letter} added`);return;
    }
    if(recognitionMode==='letters'&&!trainingActive&&now<motionLetterHoldUntil&&motionHands.length){
      if(!temporal.presentIds.includes(motionCommittedId)){liveResult.hidden=true;liveLetter.textContent='—';setRecognitionFeedback('Motion letter saved — lower your hands before the next letter.');}
      return;
    }
    if(recognitionMode==='words'){
      if(liveResult.hidden&&!motionStudio.isCapturing()&&!researchWords.active())setRecognitionFeedback(hands.length?($('#automaticWords').checked?'Hand detected — sign once, then pause.':'Hand detected — select Record a word to analyze.'):unusedHandNotice(detection.landmarks,true));
      // Keep original handedness indices when rejecting clipped/small hands.
      const indices=(detection.landmarks||[]).map((p,i)=>isUsableHand(p)||wordHandNearEdge(p)?i:-1).filter(i=>i>=0);
      const filtered={landmarks:indices.map(i=>detection.landmarks[i]),handedness:indices.map(i=>detection.handedness?.[i]),imageAspect:imageAspect};
      // Recording mode: every hand the tracker reported, with the indices of the ones passed on to the word recognizers.
      if(typeof URLSearchParams!=='undefined'&&new URLSearchParams(location.search).has('letterAudit'))document.dispatchEvent(new CustomEvent('handspeak:word-frame',{detail:{detection,usable:indices,imageAspect,timestamp:now}}));
      (researchWords.active()?researchWords:motionStudio).frame(filtered,now);
    }else if(hands.length===1){
      missingFrames=0;missingSince=null;
      const points=hands[0];
      const wasTraining=trainingActive;
      captureTrainingSample(points,now);
      const tracked=(detection.trackedLandmarks||[]).find(p=>sameObservedHand(points,p,imageAspect));
      if(wasTraining)motionLetters.reset();
      const classifierStarted=auditStages?performance.now():0;
      const answer=temporal.moving?{letter:'',confidence:0}:(Object.prototype.hasOwnProperty.call(detection,'staticResult')?detection.staticResult:(classifyAI(points,imageAspect)||(tracked?classifyAI(tracked,imageAspect):null)))||{letter:'',confidence:0};
      // While samples are collected the answer is shown as classified; otherwise as the mode reads it.
      const result=wasTraining?answer:readForSignSet(answer);
      if(auditStages)auditStages.classifierMs=performance.now()-classifierStarted;
      const uiStarted=auditStages?performance.now():0;
      if(wasTraining){
        // Collecting personal samples shows each frame's result and is not paced.
        setLive(result.letter,result.confidence);
        letterConsensus.reset();candidate='';candidateSince=0;
        setRecognitionFeedback('Hand detected — collecting personal training examples.');
      }else{
        // Just after a letter is added, static letters are ignored so the next one is not chained.
        if(now<settleUntil)letterConsensus.reset();
        else stabilize(result,now);
        showLetterPace(result,now);
      }
      if(auditStages)auditStages.staticUiMs=performance.now()-uiStarted;
    }else{
      if(!motionHands.length){motionLetters.reset();motionLetterHoldUntil=0;motionCommittedId=null;}letterConsensus.reset();
      liveResult.hidden=true;liveLetter.textContent='—';liveConfidence.textContent='';setPace('none');noLetterSince=null;
      setRecognitionFeedback(hands.length?'Use one hand for letters.':cutOffSeen?'Hand at the edge — move your hand fully into the picture.':seenOnly.length&&!seenHands.length?'Hand not clear — show your whole hand to the camera.':unusedHandNotice(detection.landmarks));
      candidate='';candidateSince=0;
      missingFrames++;if(missingSince===null)missingSince=now;if(now-missingSince>=500)committed='';
      if(hands.length>1)$('#cameraHelp').textContent='Use one hand for letters, or switch to Words in motion.';
    }
}

$('#pipelineVoice').addEventListener('click',()=>{if(message)speakText(message);else notify('Add a message first');});

$('#startSigning').addEventListener('click',()=>{$('#workspace').scrollIntoView({behavior:'smooth'});void startCamera();});
cameraButton.addEventListener('click',()=>running?stopCamera():startCamera());
// Clear all takes a second press within four seconds when there is text; Undo brings the text back afterwards.
let clearArmed=0;
function disarmClear(){clearTimeout(clearArmed);clearArmed=0;$('#clearButton').textContent='Clear all';$('#clearButton').removeAttribute('data-confirm');}
$('#clearButton').addEventListener('click',()=>{
  if(message&&!clearArmed){$('#clearButton').textContent='Press again to clear';$('#clearButton').setAttribute('data-confirm','1');clearArmed=setTimeout(disarmClear,4000);notify('Press Clear all again to remove the whole message');return;}
  if(clearArmed)disarmClear();
  const hadText=Boolean(message);
  clearInterval(demoTimer);message='';detectionLog=[];sessionStarted=Date.now();renderMessage();notify(hadText?'Message cleared · Undo brings it back':'Message cleared');
});
$('#spaceButton').addEventListener('click',()=>appendCharacter(' '));
$('#backspaceButton').addEventListener('click',()=>{if(lastDetection&&message.length===lastDetection.length&&message.endsWith(lastDetection.entry.symbol))lastDetection.entry.correct=false;lastDetection=null;message=message.slice(0,-1);renderMessage()});
$('#deleteWordButton').addEventListener('click',()=>{if(!message.trim())return notify('There is no word to delete');updateSentence(removeLastWord(message));});
$('#undoButton').addEventListener('click',()=>{
  if(!undoStack.length)return notify('Nothing to undo');
  message=undoStack.pop();typingAt=0;undoQuiet=true;renderMessage();undoQuiet=false;notify('Undone');
});
$('#copyButton').addEventListener('click',async()=>{if(!message)return notify('There is no message to copy');try{await navigator.clipboard.writeText(message);notify('Message copied')}catch{notify('Copy is unavailable in this browser')}});
$('#speakButton').addEventListener('click',()=>{if(!message)return notify('Add a message first');speakText(message)});
$('#demoButton').addEventListener('click',()=>{
  if(running) stopCamera();
  clearInterval(demoTimer);
  const demo=['I','L','Y'];let index=0;
  placeholder.hidden=true;liveResult.hidden=false;cameraStatus.classList.add('live');cameraStatus.innerHTML='<i></i> Demo';
  $('#captureFeed').textContent='DEMO';$('#trackingState').textContent='DEMO';
  const tick=()=>{if(index>=demo.length){clearInterval(demoTimer);notify('Demo complete');return}const letter=demo[index++];setLive(letter);liveConfidence.textContent='Simulated example · not camera recognition';setRecognitionFeedback('Demo — simulated letters, not camera recognition.');appendCharacter(letter)};
  tick();demoTimer=setInterval(tick,700);
});

window.addEventListener('beforeunload',stopCamera);

async function api(path, options){
  const response = await fetch(path, options);
  const data = await response.json();
  if(!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function saveSession(){
  if(!message.trim()) return notify('There is no message to save');
  $('#saveButton').disabled=true;
  try{
    await api('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,detections:detectionLog,durationMs:Date.now()-sessionStarted})});
    notify('Translation saved');
    detectionLog=[];sessionStarted=Date.now();
    await loadSystemData();
  }catch(error){notify(error.message||'Saving is temporarily unavailable. Your message is still here.')}finally{$('#saveButton').disabled=false;}
}

function renderHistory(sessions){
  const list=$('#historyList');list.innerHTML='';
  if(!sessions.length){list.innerHTML='<p class="empty-state">No saved sessions yet.</p>';return}
  sessions.forEach(session=>{
    const item=document.createElement('article');item.className='history-item';
    const text=document.createElement('strong');text.textContent=session.message;
    const date=document.createElement('time');date.dateTime=session.created_at;date.textContent=new Date(session.created_at).toLocaleString();
    const meta=document.createElement('small');meta.textContent=`${session.character_count} characters · ${(session.duration_ms/1000).toFixed(1)} seconds`;
    const actions=document.createElement('div');actions.className='history-buttons';
    const restore=document.createElement('button');restore.type='button';restore.className='text-button';restore.textContent='Use message';restore.onclick=()=>{message=session.message;detectionLog=[];sessionStarted=Date.now();renderMessage();document.dispatchEvent(new CustomEvent('handspeak:navigate',{detail:{target:'#messageBox'}}));$('#messageBox').scrollIntoView({block:'center'});notify('Message loaded for review');};
    const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Delete';remove.setAttribute('aria-label','Delete saved message');remove.onclick=async()=>{remove.disabled=true;try{await api('/api/sessions/'+session.id,{method:'DELETE'});await loadSystemData();notify('Saved message deleted');}catch(e){remove.disabled=false;notify(e.message);}};
    actions.append(restore,remove);item.append(text,date,meta,actions);list.append(item);
  });
}

function renderMetrics(metrics){
  $('#metricSessions').textContent=metrics.sessions;
  $('#metricDetections').textContent=metrics.detections;
  $('#metricConfidence').textContent=`${Math.round(metrics.averageConfidence*100)}%`;
  $('#metricLatency').textContent=`${metrics.averageLatencyMs} ms`;
  $('#evaluationCount').textContent=metrics.evaluations;
  const hasRatings=metrics.evaluations>0;
  $('#ratingAccuracy').textContent=hasRatings?`${metrics.ratings.accuracy}/5`:'—';
  $('#ratingUsability').textContent=hasRatings?`${metrics.ratings.usability}/5`:'—';
  $('#ratingPerformance').textContent=hasRatings?`${metrics.ratings.performance}/5`:'—';
}

async function loadSystemData(){
  const version=++systemLoadVersion;
  try{
    const health=await api('/api/health');
    const [sessions,metrics,gestures]=await Promise.all([api('/api/sessions?limit=20'),api('/api/metrics'),api('/api/gestures')]);
    if(version!==systemLoadVersion)return;
    serverAvailable=health.status==='ok';renderHistory(sessions.sessions);renderMetrics(metrics);$('#systemStatus').textContent='Connected · Showing your latest 20 saved messages';
    if(gestures.gestures.length!==SIGNS.length) console.warn('Gesture database and client classifier differ.');
  }catch{if(version!==systemLoadVersion)return;serverAvailable=false;$('#systemStatus').textContent='Saved messages are unavailable. Your current message is still on this page. Try Refresh.';}
}

$('#saveButton').addEventListener('click',saveSession);
$('#refreshHistory').addEventListener('click',async()=>{await loadSystemData();notify(serverAvailable?'History refreshed':'Server is unavailable')});
const RATING_FIELDS=['accuracy','usability','performance'];
RATING_FIELDS.forEach(name=>{$(`#${name}`).addEventListener('input',event=>$(`#${name}Value`).textContent=event.target.value)});
$('#evaluationForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const formElement=event.currentTarget;const submit=formElement.querySelector('button[type=submit]');submit.disabled=true;
  const form=new FormData(formElement);
  const payload=Object.fromEntries(form.entries());
  try{
    await api('/api/evaluations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    formElement.reset();RATING_FIELDS.forEach(name=>$(`#${name}Value`).textContent='5');
    notify('Thank you—evaluation submitted');await loadSystemData();
  }catch(error){notify(error.message||'Feedback could not be submitted. Please try again.')}finally{submit.disabled=false;}
});

window.addEventListener('handspeak-auth-changed',()=>{renderHistory([]);$('#systemStatus').textContent='Loading your saved messages…';void loadSystemData();});
// The editor changes the draft while it is typed in. Done closes it; Cancel puts back the draft from when
// it was opened with Edit message.
let editSnapshot=null;
$('#editMessageButton').addEventListener('click',()=>{editSnapshot=message;$('#messageEditForm').hidden=false;$('#messageEditor').value=message;$('#messageEditor').focus();});
$('#messageEditor').addEventListener('input',event=>{
  const next=$('#messageEditor').value.slice(0,1000);
  if(next===message)return;
  // One undo step for a burst of typing, not one for each key. A change written by the page (an input
  // event dispatched by script, as when a control rewrites the draft) is always a step of its own and
  // ends the burst, so Undo returns to the text as it was just before that control was pressed.
  const typed=event?.isTrusted!==false,now=Date.now();
  if(!typed||now-typingAt>1500)pushUndo(message);
  typingAt=typed?now:0;
  withdrawDigitOffer();message=next;undoQuiet=true;renderMessage();undoQuiet=false;
});
$('#cancelMessageEdit').addEventListener('click',()=>{if(editSnapshot!==null&&editSnapshot!==message){message=editSnapshot;renderMessage();notify('Edits taken back');}editSnapshot=null;$('#messageEditForm').hidden=true;$('#editMessageButton').focus();});
$('#messageEditForm').addEventListener('submit',event=>{event.preventDefault();const next=$('#messageEditor').value.slice(0,1000);if(next!==message){message=next;renderMessage();}editSnapshot=null;$('#messageEditForm').hidden=true;$('#editMessageButton').focus();notify('Message updated');});
// Words mode output choice (see wordOutput above), remembered on this device.
function setWordOutput(mode,remember=true){
  wordOutput=mode==='word'?'word':'message';
  $('#wordOutput').value=wordOutput;$('#cameraStage').dataset.wordOutput=wordOutput;
  $('#motionAccept').textContent=wordOutput==='word'?'Add and speak word':'Add matched word';
  $('#speakWordButton').hidden=wordOutput!=='word';
  if(remember){try{localStorage.setItem('handspeak-word-output',wordOutput);}catch{}}
  renderCaption();
  document.dispatchEvent(new CustomEvent('handspeak:word-output',{detail:{mode:wordOutput}}));
}
$('#wordOutput').addEventListener('change',()=>setWordOutput($('#wordOutput').value));
// Speaks the newest word again: like Speak message, only on a press.
$('#speakWordButton').addEventListener('click',()=>{const word=newestWord();if(!word)return notify('Add a word first');speakText(word);});
{let storedOutput=null;try{storedOutput=localStorage.getItem('handspeak-word-output');}catch{}setWordOutput(storedOutput,false);$('#wordOutputLabel').hidden=recognitionMode!=='words';}
loadSystemData();
renderAIStatus();
loadPretrainedModel();

$('#captureSamplesButton').addEventListener('click',()=>{
  if(!running)return notify('Start the camera before training');
  if(recognitionMode!=='letters')return notify('Switch to Static letters to capture letter samples');
  trainingActive=true;trainingCaptured=0;lastTrainingCapture=0;
  trainingLabel=$('#trainingLabel').value;pendingSamples=[];
  $('#trainingLabel').disabled=true;
  candidate='';candidateSince=0;
  $('#trainingProgress').style.width='0';
  $('#captureSamplesButton').disabled=true;$('#captureSamplesButton').textContent='Capturing…';
  $('#trainingHelp').textContent='Hold the selected gesture steady and slowly vary its angle.';
});

$('#resetModelButton').addEventListener('click',()=>{
  aiSamples=[];letterCamera?.setPersonalSamples(aiSamples);endTraining();localStorage.removeItem('handspeak-ai-samples-pixel-v3');
  $('#trainingProgress').style.width='0';$('#captureSamplesButton').disabled=false;$('#captureSamplesButton').textContent='Capture 30 samples';
  $('#trainingHelp').textContent='Personal examples cleared. Pretrained letters remain available.';
  renderAIStatus();notify('Personalized AI model reset');
});
// Removes the personal samples of one sign (event detail: {label}); pretrained letters are untouched.
$('#sampleCounts').addEventListener('handspeak:remove-samples',event=>{
  const label=event.detail?.label,updated=aiSamples.filter(sample=>sample.label!==label);
  if(trainingActive||typeof label!=='string'||updated.length===aiSamples.length)return;
  try{if(updated.length)localStorage.setItem('handspeak-ai-samples-pixel-v3',JSON.stringify(updated));else localStorage.removeItem('handspeak-ai-samples-pixel-v3');}
  catch{notify('Could not update browser storage');return;}
  aiSamples=updated;letterCamera?.setPersonalSamples(aiSamples);
  $('#trainingHelp').textContent=`Your samples for ${label} were removed.`;
  renderAIStatus();notify(`${label} samples removed`);
});

// Camera chooser in Camera settings, shown on the evaluation site only (site-focus.css). The choice is
// kept per site, an empty value leaves the choice to the browser, and a change restarts a running camera.
function chosenCameraDevice(){try{return localStorage.getItem(CAMERA_DEVICE_KEY)||'';}catch{return '';}}
async function listCameraDevices(){
  const select=$('#cameraDevice');
  if(!select||typeof navigator==='undefined'||!navigator.mediaDevices?.enumerateDevices)return;
  let cameras=[];
  try{cameras=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='videoinput'&&device.deviceId);}catch{return;}
  const chosen=chosenCameraDevice();
  select.replaceChildren(new Option('Browser default',''),...cameras.map((device,index)=>new Option(device.label||`Camera ${index+1}`,device.deviceId)));
  select.value=cameras.some(device=>device.deviceId===chosen)?chosen:'';
}
$('#cameraDevice')?.addEventListener('change',event=>{
  try{if(event.target.value)localStorage.setItem(CAMERA_DEVICE_KEY,event.target.value);else localStorage.removeItem(CAMERA_DEVICE_KEY);}catch{}
  if(running||cameraStarting){stopCamera();void startCamera();}
});
if(typeof navigator!=='undefined'&&navigator.mediaDevices?.addEventListener)navigator.mediaDevices.addEventListener('devicechange',()=>{void listCameraDevices();});
void listCameraDevices();
// Mirror picture: display only. The camera picture and the drawing over it are flipped by CSS; every tracker
// receives the frame as the camera sends it. The choice describes this machine's camera and is kept in this
// browser under handspeak-mirror-preview ('off' when switched off; absent means mirrored).
// Video and overlay share the same manual mirror transform.
try{$('#mirrorPreview').checked=localStorage.getItem('handspeak-mirror-preview')!=='off';}catch{}
applyStageTransform();
$('#mirrorPreview').addEventListener('change',()=>{applyStageTransform();try{localStorage.setItem('handspeak-mirror-preview',$('#mirrorPreview').checked?'on':'off');}catch{}notify('Preview orientation changed. Recognition uses the original camera input.');});

createExperienceUI({getMessage:()=>message,setMessage:text=>{message=text;renderMessage();},stopSpeech});

async function loadMotionLetterModel(){
  try{
    const response=await fetch('./models/motion-letters.json?v=20261109-jz-2');
    if(!response.ok)throw Error('Motion letter model unavailable');
    motionLetterReady=motionLetters.setModel(await response.json());
  }catch(error){console.warn(error);motionLetterReady=false;}
  renderAIStatus();
}
void loadMotionLetterModel();
document.documentElement.dataset.handspeakReady='true';
