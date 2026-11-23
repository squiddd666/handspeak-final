import {loadVocabularySettings,wordSettings,applyVocabularySettings} from './vocabulary-settings.js?v=20261011-features-1';
import {loadAccuracyProfiles,referenceAccuracy,publishedAccuracy,accuracyText,validAccuracy} from './motion-accuracy.js?v=20261021-baby-1';
const video = document.querySelector('#signExampleVideo');
const status = document.querySelector('#signExampleStatus');
const speed = document.querySelector('#signExampleSpeed');
const referenceClipIds=new Set(['hello','water','food','hungry','please','finish']);
const buttons = [...document.querySelectorAll('[data-sign-example]')].filter(button=>referenceClipIds.has(button.dataset.signExample));
for(const button of document.querySelectorAll('[data-sign-example]'))if(!referenceClipIds.has(button.dataset.signExample))button.remove();
for(const button of buttons)button.dataset.signLabel=button.textContent;
const embed=document.querySelector('#signExampleEmbed');
const lesson=document.querySelector('#signExampleLesson');
const playback=document.querySelector('.example-playback');
const embedded={};
const availableLocalExamples=new Set(["after", "after-popsign", "airplane", "angry", "baby", "bad", "bag", "baseballcap", "bathroom", "because", "bed", "before", "belt", "bicycle", "book", "boy", "bread", "breakfast", "bring", "brother", "bus", "buy", "call", "can", "car", "careful", "chair", "chicken", "child", "clothes", "coffee", "cold", "come", "deaf", "demand", "dinner", "door", "drag", "drink", "drive", "duck", "eat", "edit", "empty", "family", "father", "find", "fine", "finish", "fish", "food", "friend", "full", "girl", "give", "go", "good", "good-afternoon", "good-morning", "good-night", "goodbye", "goodbye-popsign", "grandfather", "grandmother", "happy", "have", "he-she", "he-she-popsign", "hear", "hello", "help", "help-popsign", "here", "home", "hospital", "hot", "how", "hungry", "i-me", "inside", "know", "later", "like", "listen", "lock", "look", "love", "lunch", "man", "mechanic", "microscope", "milk", "money", "morning", "mother", "mother-popsign", "motorcycle", "my-mine", "need", "need-popsign", "night", "no", "now", "nurse", "okay", "other", "outside", "pain", "party", "peg", "pen", "pencil", "phone", "plate", "please", "read", "ride", "room", "run", "sad", "scared", "school", "see", "shoes", "shower", "sick", "sister", "sister-popsign", "sit", "sleep", "slow", "soccer", "sorry", "speak", "squeeze", "stand", "stay", "stop", "stop-popsign", "store", "student", "table", "take", "teacher", "test-i-want-water-please-finish", "test-water-please-finish", "test-water-please-finish-portrait", "test-water-please-finish-portrait-slow", "thank-you", "that", "that-popsign", "there", "they", "thirsty", "this", "time", "time-popsign", "tired", "today", "tomorrow", "train", "vlog", "wait", "wake-up", "walk", "walk-popsign", "want", "watch", "water", "we", "we-popsign", "welcome", "what", "whatfor", "when", "where", "where-popsign", "which", "which-popsign", "who", "why", "window", "work", "write", "yes", "yesterday", "you", "your-yours"]);
const daily=new Set(['name','home','have','want','love']);
const extra=new Set(['drink','water','book','food','hungry','like','go']);
const publishedExamples=new Map();
const referenceClipVersion='20261123-reference-words-six-only-1';
let accuracyProfiles={},publishedPacks=[];
function exampleAccuracy(name){
  const pack=publishedPacks.find(pack=>pack.labels?.includes(name));
  return pack?publishedAccuracy(pack,name):referenceAccuracy(accuracyProfiles,name);
}
function updateAccuracy(){
 const metrics=exampleAccuracy(label);
 document.querySelector('#signExampleAccuracy').textContent=`${accuracyText(metrics)}${metrics?` · ${metrics.model}. ${metrics.scope}`:'. No measured test result is available for this word.'}`;
 for(const button of buttons){
  const name=button.dataset.signLabel||button.textContent,m=exampleAccuracy(name);
  let badge=button.querySelector('[data-word-accuracy]');
  if(!badge){badge=document.createElement('small');badge.dataset.wordAccuracy='';badge.style.display='block';button.append(badge);}
  badge.textContent=validAccuracy(m)?`${(100*m.correct/m.total).toFixed(1).replace(/\.0$/,'')}% test · ${m.correct}/${m.total}`:'Not measured';
  button.title=m?`${accuracyText(m)} · ${m.model}. ${m.scope}`:'Recorded accuracy not measured';
 }
}
let external=false;
function preparePractice(id){
  document.dispatchEvent(new CustomEvent('handspeak:prepare-practice',{detail:{id}}));
}
function pauseAll(){video.pause();if(external&&embed.getAttribute('src'))embed.src=embed.getAttribute('src');}
function instructions(id){const standard=buttons.some(b=>b.dataset.signExample===id),published=publishedExamples.get(id);document.querySelector("#signExampleMode").textContent=published?`${published.label} · Experimental word preview. Select Practice at camera to load its vocabulary, then start the camera, sign once and pause. Review every match; live-camera accuracy is unverified.`:daily.has(id)?`${id.toUpperCase()} · Five-word server preview prepared automatically. Start the camera, sign once, then pause. Review the match before signing again.`:extra.has(id)?`${id.toUpperCase()} · Extra-word preview prepared automatically. Start the camera, sign once, then pause. Review every match; live-camera accuracy is unverified.`:standard?`${id.toUpperCase()} · Automatic capture: start the camera, sign once, then pause. Review the match. You can also use Record a word.`:"Learning example · No enabled model for this word. Personal training is needed before camera practice.";const description=wordSettings(id).description;if(description)document.querySelector("#signExampleMode").textContent+=` ${description}`;}
function chooseEmbedded(id,button=null){
 instructions(id);
 preparePractice(id);
 selection++;pauseAll();label=id.toUpperCase();libraryId=id;external=true;video.hidden=true;embed.hidden=false;playback.hidden=true;
 embed.title=`${label} ASL lesson by ASL University`;embed.src=`https://www.youtube-nocookie.com/embed/${embedded[id]}?playsinline=1&rel=0`;
 lesson.hidden=false;lesson.href=`https://www.lifeprint.com/asl101/pages-signs/${id[0]}/${id}.htm`;lesson.textContent=`${label} lesson · ASL University / Bill Vicars (opens in a new tab)`;
 status.textContent=`${label} · Press play in the YouTube player. If it is unavailable, open the lesson below. Playback loads from YouTube.`;
 updateAccuracy();
 for(const other of buttons)other.setAttribute('aria-pressed',String(other===button));
}
let label = 'HELLO';
let selection = 0;
const applySpeed = () => { video.playbackRate = Number(speed.value); };
async function play() {
  const requested = selection;
  try { applySpeed(); await video.play(); }
  catch { if (requested === selection) status.textContent = `${label} · Use the video play button to start.`; }
}
let libraryId=null;
function chooseExample(name,src,button=null,id=null){
  const selectedId=id||src.split("/").pop().split('?')[0].replace(".mp4","");
  if(referenceClipIds.has(selectedId)&&src.split('?')[0]===`media/signs/${selectedId}.mp4`){const clipUrl=new URL(src,location.href);clipUrl.searchParams.set('v',referenceClipVersion);src=clipUrl.pathname+clipUrl.search;}
  instructions(selectedId);preparePractice(selectedId);selection++;pauseAll();external=false;embed.hidden=true;embed.removeAttribute('src');video.hidden=false;playback.hidden=false;lesson.hidden=true;label=name;libraryId=id;
  for(const other of buttons)other.setAttribute('aria-pressed',String(other===button));
  video.src=src;video.setAttribute('aria-label',`${label} ASL gesture example`);
  const fallback=video.querySelector('a');fallback.href=video.src;fallback.textContent=`Download the ${label} example`;
  status.textContent=`${label} · Press play to watch. Review recognition availability in the vocabulary library.`;video.load();
  updateAccuracy();
}
for(const button of buttons)button.addEventListener('click',()=>{const id=button.dataset.signExample;if(wordSettings(id).video)chooseExample(button.dataset.signLabel,wordSettings(id).video,button,id);else if(embedded[id])chooseEmbedded(id,button);else chooseExample(button.dataset.signLabel,`media/signs/${id}.mp4?v=20261020-practice-2`,button,daily.has(id)?id:null);});
document.addEventListener('handspeak:example',event=>{const data=event.detail;if(!referenceClipIds.has(data.id))return;if(wordSettings(data.id).video){chooseExample(data.label,wordSettings(data.id).video,null,data.id);return;}if(embedded[data.id]){chooseEmbedded(data.id,buttons.find(b=>b.dataset.signExample===data.id));return;}if(typeof data.label==='string'&&/^media\/signs\/[a-z0-9-]+\.mp4$/.test(data.src))chooseExample(data.label,data.src,null,data.id);});
speed.addEventListener('change', applySpeed);
video.addEventListener('loadedmetadata', () => { video.dataset.orientation = video.videoWidth >= video.videoHeight ? 'landscape' : 'portrait'; applySpeed(); });
video.addEventListener('playing', () => { if(external)return;status.textContent = `${label} · ${video.playbackRate === 1 ? 'Normal speed' : `${video.playbackRate}× speed`}`; });
video.addEventListener('ended', () => { if(external)return;status.textContent = `${label} · Play again or try it at the camera.`; });
video.addEventListener('error',()=>{if(!external)status.textContent=`${label} · Video could not load. Select the word again to retry.`;});
document.querySelector('#signExampleLoop').addEventListener('change', event => { video.loop = event.target.checked; });
document.querySelector('#signExampleReplay').addEventListener('click', () => { video.currentTime = 0; play(); });
document.querySelector('#signExamplePractice').addEventListener('click', () => {
  pauseAll();
  if(libraryId){document.dispatchEvent(new CustomEvent('handspeak:practice',{detail:{id:libraryId}}));return;}
  document.dispatchEvent(new CustomEvent('handspeak:default-practice',{detail:{label}}));
});
// Do not keep decoding a looping example while the visitor is using the camera.
new IntersectionObserver(entries => { if (!entries[0].isIntersecting) pauseAll(); }).observe(document.querySelector('.example-player'));
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); });

document.addEventListener('handspeak:view',pauseAll);

// Keep this panel in sync with published camera vocabularies and their existing lessons.
async function loadPublishedExamples(){
  try{
    const responses=await Promise.all([
      fetch('models/motion-vocabulary.json',{cache:'no-store'}),
      fetch('models/motion-categories/index.json',{cache:'no-store'})
    ]);
    if(responses.some(response=>!response.ok))return;
    const [catalog,index]=await Promise.all(responses.map(response=>response.json()));
    if(!Array.isArray(catalog.items)||!Array.isArray(index.groups))return;
    publishedPacks=index.groups;
    const container=document.querySelector('.example-words');
    await loadVocabularySettings();
    for(const item of applyVocabularySettings(catalog.items)){
      if(!referenceClipIds.has(item.id))continue;
      if(typeof item.id!=='string'||typeof item.label!=='string'||!/^media\/signs\/[a-z0-9-]+\.mp4$/.test(item.video||''))continue;
      const enabled=index.groups.some(pack=>Array.isArray(pack.labels)&&pack.labels.includes(item.label)&&item.cameraGroups?.includes(pack.id));
      if(!enabled||!availableLocalExamples.has(item.video.split('/').pop().replace('.mp4','')))continue;
      publishedExamples.set(item.id,item);
      if(buttons.some(button=>button.dataset.signExample===item.id))continue;
      const button=document.createElement('button');button.type='button';button.className='secondary-button';
      button.dataset.signExample=item.id;button.setAttribute('aria-pressed','false');button.textContent=item.label;
      button.dataset.signLabel=item.label;
      button.addEventListener('click',()=>chooseExample(item.label,item.video,button,item.id));
      buttons.push(button);container.append(button);
    }
    if(libraryId&&publishedExamples.has(libraryId))instructions(libraryId);
    updateAccuracy();
  }catch{ /* Existing practice examples remain available when the library cannot load. */ }
}
// Category recognition is not enabled here: do not add its learning videos.
void loadAccuracyProfiles().then(profiles=>{accuracyProfiles=profiles;updateAccuracy();});

void loadVocabularySettings().then(()=>{for(const button of buttons){button.hidden=Boolean(wordSettings(button.dataset.signExample).hidden);}for(const option of document.querySelectorAll('#practiceWord option'))option.hidden=Boolean(wordSettings(option.value).hidden);for(const card of document.querySelectorAll('[data-daily-word]'))card.hidden=Boolean(wordSettings(card.dataset.dailyWord.toLowerCase()).hidden);if(buttons.find(b=>b.getAttribute('aria-pressed')==='true')?.hidden)buttons.find(b=>!b.hidden)?.click();});
