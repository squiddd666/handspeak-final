import {mountStudioOverlay} from './studio-overlay.js';
import {handSkeletonEnabled,setHandSkeletonEnabled} from './hand-overlay.js';
const $=selector=>document.querySelector(selector);
const make=(tag,properties={},children=[])=>{const node=Object.assign(document.createElement(tag),properties);node.append(...children);return node;};
function popup(id,title,children){
  const shut=make('button',{type:'button',className:'welcome-close',textContent:'×'});
  shut.setAttribute('aria-label','Close');
  const dialog=make('dialog',{id,className:'teach-dialog'},[shut,make('h3',{textContent:title}),...children]);
  shut.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  document.body.append(dialog);
  return dialog;
}
// A destructive button asks once more: the first press arms it for four seconds, the second goes through.
// Only real presses are held back, so a script that calls click() still gets the button's own action.
const armedButtons=new WeakMap();
const confirmFirst=(event,button,question)=>{
  if(!event.isTrusted)return true;
  const state=armedButtons.get(button);
  if(state){clearTimeout(state.timer);button.textContent=state.text;button.classList.remove('is-armed');armedButtons.delete(button);return true;}
  event.preventDefault();event.stopImmediatePropagation();
  const text=button.textContent;
  button.textContent=question;button.classList.add('is-armed');
  armedButtons.set(button,{text,timer:setTimeout(()=>{button.textContent=text;button.classList.remove('is-armed');armedButtons.delete(button);},4000)});
  return false;
};

const studio=$('#teach-a-sign');
// Numbers whose handshape is nearly a letter's; shown as a heads-up where such a number can be taught.
const letterTwins={0:'O',2:'V',6:'W',9:'F'};
// Which numbers still have to be taught depends on the letter model in use, so it is read from the sign cards the
// hub module renders in Learn: a card whose status line says "teach first" names a number with no references.
const digitWords={Zero:'0',One:'1',Two:'2',Three:'3',Four:'4',Five:'5',Six:'6',Seven:'7',Eight:'8',Nine:'9'};
const teachFirstDigits=()=>new Set([...document.querySelectorAll('#signGrid .sign-card')].filter(card=>/teach first/i.test(card.querySelector('small')?.textContent||'')).map(card=>digitWords[(card.querySelector('h3')?.textContent||'').trim()]).filter(Boolean));
if(studio&&$('#trainingLabel')){
  const select=$('#trainingLabel'),capture=$('#captureSamplesButton'),webcam=$('#webcam'),mode=$('#recognitionMode'),cameraButton=$('#cameraButton');
  const source=studio.querySelector('.trainer-card'),wordsBox=studio.querySelector('.optional-training'),copy=studio.querySelector('.ai-copy'),wordInput=$('#motionLabel');
  const isDigit=value=>value.length===1&&value>='0'&&value<='9';
  const tidy=value=>value.trim().split(' ').filter(Boolean).join(' ').toUpperCase();
  const stored=(key,valid)=>{const counts={};try{const rows=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(rows))for(const row of rows)if(typeof row?.label==='string'&&valid(row))counts[row.label]=(counts[row.label]||0)+1;}catch{}return counts;};
  const mySamples=()=>stored('handspeak-ai-samples-pixel-v3',()=>true);
  const myWords=()=>stored('handspeak-motion-v3',row=>row.label!=='OTHER MOVEMENT'&&Array.isArray(row.sequence));
  const contextualWordCounts=()=>stored('handspeak-motion-v3',row=>row.bodyEncoding==='head-shoulders-v1'&&Array.isArray(row.bodySequence));
  const setMode=value=>{if(mode.value!==value){mode.value=value;mode.dispatchEvent(new Event('change',{bubbles:true}));}};
  // Letters are captured in letters mode, words in words mode, and digits in numbers mode (5 belongs to both)
  // for as long as the select offers a separate numbers mode.
  const numbersMode=()=>[...mode.options].some(option=>option.value==='numbers');
  const wantedMode=()=>studio.dataset.teach==='words'?'words':!numbersMode()?'letters':isDigit(select.value)?'numbers':'letters';

  const name=make('b',{id:'teachName',textContent:'—'}),hint=make('p',{id:'teachHint'});
  const preview=make('video',{id:'teachVideo',muted:true,autoplay:true,playsInline:true});
  preview.setAttribute('aria-label','Camera preview');
  const teachOverlay=make('canvas',{id:'teachOverlay'});teachOverlay.setAttribute('aria-hidden','true');
  Object.assign(teachOverlay.style,{position:'absolute',pointerEvents:'none',objectFit:'cover',objectPosition:'center',zIndex:'1'});
  const teachSkeleton=make('button',{type:'button',className:'secondary-button',id:'teachSkeletonToggle'});
  const syncTeachSkeleton=()=>{teachSkeleton.textContent=`Skeleton overlay: ${handSkeletonEnabled()?'On':'Off'}`;teachSkeleton.setAttribute('aria-pressed',String(handSkeletonEnabled()));};
  teachSkeleton.addEventListener('click',()=>setHandSkeletonEnabled(!handSkeletonEnabled()));
  document.addEventListener('handspeak:hand-skeleton',syncTeachSkeleton);syncTeachSkeleton();
  const start=make('button',{type:'button',className:'primary-button',id:'teachStart',textContent:'Start camera'});
  const stop=make('button',{type:'button',id:'teachStop',textContent:'Stop camera',hidden:true});
  const seenValue=make('b'),seen=make('p',{className:'teach-seen',id:'teachSeen',hidden:true},[make('span',{textContent:'HandSpeak sees'}),seenValue]);
  const stage=make('div',{className:'teach-preview'},[preview,teachOverlay,make('div',{className:'teach-off'},[make('small',{className:'stage-warning',textContent:'The camera is off. Start it to record.'}),start]),seen]);
  stage.dataset.state='off';
  const wordStatus=make('p',{id:'teachWordStatus',textContent:'Type the word, then record at least three examples of it.'});
  wordStatus.setAttribute('role','status');
  const tryLink=make('a',{className:'teach-try',id:'teachTry',href:'#workspace',textContent:'Try it in Sign Language'});
  const remove=make('button',{type:'button',className:'text-button',id:'teachRemove',hidden:true});
  // The page follows Recognize: a camera card on the left with its status pill and Stop camera in the heading,
  // and on the right two tabs over one panel. The explanation and the reset are dialogs opened from two
  // buttons beside the page title.
  const pill=make('span',{className:'status-pill',id:'teachStatus'},[make('i'),document.createTextNode(' Camera off')]);
  stop.className='head-stop';
  const recorder=make('article',{className:'teach-recorder'},[
    make('div',{className:'teach-bar'},[make('h3',{textContent:'Record'}),pill,stop,teachSkeleton,make('p',{className:'teach-selected'},[make('span',{textContent:'Recording for'}),name])]),
    stage,
    make('div',{className:'teach-foot'},[
      hint,
      make('div',{className:'teach-actions teach-for-signs'},[capture,source.querySelector('.training-progress'),$('#trainingHelp')]),
      make('div',{className:'teach-actions teach-for-words'},[wordsBox.querySelector('.camera-actions'),wordStatus]),
      make('div',{className:'teach-after'},[tryLink,remove,make('span',{className:'teach-privacy',textContent:'Hand and optional head/shoulder positions stay in this browser. No images are stored.'})]),
    ]),
  ]);
  recorder.setAttribute('aria-label','Record');
  const groups=make('div',{className:'teach-groups teach-for-signs'});
  // "Your words" has two parts, shown one at a time: adding a word, and the words this person has
  // taught. The six words the camera knows without recording are offered in the first part as
  // suggestions; a press puts the word into the field, and it is then recorded like any other.
  const builtIn=['HELLO','PLEASE','FINISH','WATER','FOOD','HUNGRY'];
  const wordList=make('div',{className:'teach-word-list'});
  const contextChoice=make('input',{type:'checkbox',id:'wordBodyContext',checked:true});
  const contextLabel=make('label',{className:'speech-option teach-for-words'},[contextChoice,' Record hands + head/shoulders (recommended)']);
  const contextNote=make('p',{className:'camera-tip teach-for-words',textContent:'Keep your head, shoulders and both hands visible. New examples store body reference points, not video or facial expressions. Record 3 new examples to use body-aware matching; older hand-only examples remain available.'});
  recorder.append(contextLabel,contextNote);
  const suggested=make('div',{className:'teach-suggest'});
  const wordParts=[['add','Add a word'],['taught','Words you taught']].map(([id,label])=>{
    const button=make('button',{type:'button',id:'teachWords-'+id},[make('span',{textContent:label})]);
    button.setAttribute('role','tab');button.setAttribute('aria-controls','teachWordsPanel-'+id);button.dataset.words=id;
    button.addEventListener('click',()=>setWords(id));
    return button;
  });
  const taughtCount=make('b',{className:'teach-words-count',hidden:true});
  wordParts[1].append(taughtCount);
  const wordSwitch=make('div',{className:'teach-word-tabs'},wordParts);
  wordSwitch.setAttribute('role','tablist');wordSwitch.setAttribute('aria-label','Your words');
  // The hub's button removes the examples of the word in the field, at once. It stays beside "Record
  // example" under the picture; describe() makes it name that word and switches it off while the
  // field names no recorded word, and a second press is asked for before the hub acts. It is looked
  // up inside the Record card: that card is not in the page yet, so the document cannot find it.
  const removeWord=recorder.querySelector('#motionRemove');
  const addPart=make('div',{className:'teach-words-part',id:'teachWordsPanel-add'},[wordsBox,suggested]);
  const taughtPart=make('div',{className:'teach-words-part',id:'teachWordsPanel-taught'},[wordList,make('p',{className:'teach-words-foot',textContent:'To remove the examples of a word, press the word here, then "Remove examples of …" under the camera picture.'})]);
  for(const [part,id] of [[addPart,'add'],[taughtPart,'taught']]){part.setAttribute('role','tabpanel');part.setAttribute('aria-labelledby','teachWords-'+id);part.dataset.words=id;}
  const wordsPanel=make('div',{className:'teach-words teach-for-words'},[wordSwitch,addPart,taughtPart]);
  const tabs=make('div',{className:'teach-tabs side-tabs'});
  tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','What to teach');
  const tabButtons=[['signs','Letters & numbers','hand shapes you hold'],['words','Your words','movements you record']].map(([id,label,about])=>{
    const button=make('button',{type:'button',id:'teachTab-'+id},[make('span',{textContent:label}),make('small',{textContent:about})]);
    button.setAttribute('role','tab');button.dataset.teach=id;
    button.addEventListener('click',()=>setTab(id));
    return button;
  });
  tabs.append(...tabButtons);
  // What this page is for, in plain words. It opens by itself the first time the view is shown in this browser
  // (remembered under handspeak-teach-a-sign-intro) and from the button beside the title afterwards.
  const understood=make('button',{type:'button',className:'primary-button',id:'teachIntroDone',textContent:'Got it'});
  const infoDialog=popup('teachInfoDialog','Teach A Sign',[
    make('p',{className:'teach-intro-lead',textContent:'Teach HandSpeak your own hand, so the camera recognizes the way you sign.'}),
    make('ol',{className:'teach-intro-steps'},[
      ['Choose a sign','Pick a letter or a number in the list. A sign marked "Not taught" works only after you record it.'],
      ['Record it','Start the camera, hold the sign steady and capture samples. Recognition then adapts to your hand.'],
      ['Add your own words','Open Your words, type a word and record at least three examples of it.'],
      ['Try it','Open Sign Language and make the sign. You can remove or reset your samples at any time.'],
    ].map(([title,text])=>make('li',{},[make('b',{textContent:title}),make('span',{textContent:text})]))),
    make('p',{className:'teach-intro-note',textContent:'Your samples stay in this browser on this device. They are not sent to the server and do not follow you to another device.'}),
    make('details',{className:'teach-intro-more'},[make('summary',{textContent:'How it works'}),copy.querySelector('p'),copy.querySelector('.ai-badges'),make('p',{className:'teach-model'},[$('#aiModelStatus')])]),
    make('div',{className:'teach-dialog-actions'},[understood]),
  ]);
  understood.addEventListener('click',()=>infoDialog.close());
  const INTRO_KEY='handspeak-teach-a-sign-intro';
  const introduce=()=>{
    if(studio.hidden||document.querySelector('dialog[open]'))return;
    let seen=true;
    try{seen=localStorage.getItem(INTRO_KEY)==='seen';if(!seen)localStorage.setItem(INTRO_KEY,'seen');}catch{}
    // Introduction popup disabled.
  };
  document.addEventListener('handspeak:view',event=>{if(event.detail?.view==='teach-a-sign')setTimeout(introduce,0);});
  const keep=make('button',{type:'button',className:'secondary-button',textContent:'Cancel'});
  const resetDialog=popup('teachResetDialog','Reset letters and numbers',[
    make('p',{textContent:'Removes every letter and number sample recorded in this browser. Built-in letters stay, and the words you taught are not touched.'}),
    make('div',{className:'teach-dialog-actions'},[keep,$('#resetModelButton')]),
  ]);
  keep.addEventListener('click',()=>resetDialog.close());
  const infoButton=make('button',{type:'button',className:'teach-head-button',id:'teachInfo',textContent:'About this page'});
  const resetOpen=make('button',{type:'button',className:'teach-head-button teach-head-danger',id:'teachResetOpen',textContent:'Reset samples'});
  infoButton.hidden=true;
  resetOpen.addEventListener('click',()=>resetDialog.showModal());
  const layout=make('div',{className:'teach-layout'},[recorder,make('div',{className:'teach-picker'},[tabs,make('div',{className:'teach-panel'},[groups,wordsPanel])])]);
  studio.append(
    make('div',{className:'teach-head'},[
      make('div',{className:'teach-title'},[make('div',{},[make('span',{className:'teach-eyebrow',textContent:'Teach A Sign'}),make('h2',{textContent:'Teach HandSpeak your signs'})]),infoButton,resetOpen]),

    ]),
    layout);
  // On a desktop screen the two cards take the height the window has left under the page head.
  const roomy=matchMedia('(min-width:1000px) and (min-height:600px)');
  let fitting=0;
  const fitTeach=()=>{
    fitting=0;
    if(studio.hidden)return;
    if(!roomy.matches){studio.style.removeProperty('--teach-h');return;}
    studio.style.setProperty('--teach-h',Math.max(480,Math.round(window.innerHeight-(layout.getBoundingClientRect().top+window.scrollY)-16))+'px');
  };
  const fitSoon=()=>{if(!fitting)fitting=requestAnimationFrame(fitTeach);};
  window.addEventListener('resize',fitSoon);
  roomy.addEventListener('change',fitSoon);
  document.addEventListener('handspeak:view',fitSoon);
  new MutationObserver(fitSoon).observe(studio,{attributes:true,attributeFilter:['hidden']});
  if(typeof ResizeObserver==='function'){const sizes=new ResizeObserver(fitSoon);sizes.observe(studio.querySelector('.teach-head'));if($('.site-header'))sizes.observe($('.site-header'));}
  fitSoon();
  copy.classList.add('teach-source');source.classList.add('teach-source');

  const describe=()=>{
    if(studio.dataset.teach==='words'){
      const word=tidy(wordInput.value);
      const recorded=myWords()[word]||0;
      name.textContent=word||'A word';hint.textContent=word?`${recorded} of 3 examples recorded.`:'';
      if(removeWord){
        // A question that was open belongs to the word that was in the field then.
        const asked=armedButtons.get(removeWord);
        if(asked){clearTimeout(asked.timer);removeWord.classList.remove('is-armed');armedButtons.delete(removeWord);}
        removeWord.disabled=!recorded;
        removeWord.textContent=recorded?`Remove examples of ${word}`:'Remove personal examples';
      }
      remove.hidden=true;return;
    }
    const option=select.selectedOptions[0];if(!option)return;
    const [title,...rest]=option.textContent.split(' — ');
    // A number whose handshape is nearly a letter's gets a heads-up, so it is taught with that in mind.
    const twin=letterTwins[option.value];
    name.textContent=title;hint.textContent=rest.join(' — ')+(twin?`${rest.length?' ':''}Heads-up: this is nearly the same handshape as the letter ${twin}${numbersMode()?`; Letters mode reads it as ${twin}, Numbers mode as ${option.value}.`:', so the camera can mix the two up.'}`:'');
    const count=mySamples()[option.value]||0;
    remove.hidden=!count;
    if(!armedButtons.has(remove))remove.textContent=`Remove my ${count} samples for ${option.value}`;
    for(const tile of groups.querySelectorAll('.teach-tile'))tile.setAttribute('aria-pressed',String(tile.dataset.label===option.value));
  };
  const renderTiles=()=>{
    const counts=mySamples(),options=[...select.options];
    if(!options.length)return;
    const unread=teachFirstDigits();
    const tile=option=>{
      // With a Numbers mode a number is "not taught" only while the model in use has no references for it.
      const count=counts[option.value]||0,digit=isDigit(option.value)&&(!numbersMode()||unread.has(option.value));
      const button=make('button',{type:'button',className:'teach-tile',disabled:select.disabled},[make('b',{textContent:option.value}),make('small',{textContent:count?`${count} yours`:digit?'Not taught':'Built in'})]);
      button.dataset.label=option.value;button.dataset.state=count?'taught':digit?'needed':'builtin';
      if(letterTwins[option.value]){button.dataset.twin=letterTwins[option.value];button.title=`Nearly the same handshape as the letter ${letterTwins[option.value]}`;}
      button.setAttribute('aria-label',`${option.textContent}. ${count?`${count} of your samples`:digit?'Not taught yet':'Built in, no samples of yours'}`);
      button.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));describe();});
      return button;
    };
    const group=(title,note,list)=>make('section',{className:'teach-group'},[make('h3',{textContent:title}),make('p',{textContent:note}),make('div',{className:'teach-tiles'},list.map(tile))]);
    const digits=options.filter(option=>isDigit(option.value)),letters=options.filter(option=>!isDigit(option.value));
    const taught=digits.filter(option=>counts[option.value]).length;
    // Which digits can be taught is the hub module's list; a digit it leaves out shares its handshape with a letter.
    const listed=digits.map(option=>option.value),left=['0','1','2','3','4','5','6','7','8','9'].filter(digit=>!listed.includes(digit));
    const said=list=>list.length>1?`${list.slice(0,-1).join(', ')} and ${list[list.length-1]}`:list.join('');
    const needed=listed.filter(digit=>unread.has(digit)),ready=listed.filter(digit=>!unread.has(digit));
    const numbersNote=numbersMode()?needed.length?`${said(needed)} work after you record them.${ready.length?` ${said(ready)} work in Numbers mode as they are; your samples adapt them to your hand.`:''}`:'These work in Numbers mode as they are; your samples adapt them to your hand.':`${said(listed)} work after you record them.${left.length&&left.length<10?` ${said(left)} share a handshape with a letter and are offered as a change after that letter.`:''}`;
    const twins=listed.filter(digit=>letterTwins[digit]);
    const twinNote=twins.length?` Heads-up: ${said(twins)} ${twins.length>1?'have':'has'} nearly the same handshape as the ${twins.length>1?'letters':'letter'} ${said(twins.map(digit=>letterTwins[digit]))} (marked ≈)${numbersMode()?'; the mode you choose decides which is read.':', so the camera can mix them up.'}`:'';
    groups.replaceChildren(...[digits.length?group('Numbers',`${numbersNote}${twinNote} · ${taught} of ${digits.length} taught.`.replace('. ·',' ·'),digits):null,group('Letters','Built in. Your samples adapt them to your hand.',letters)].filter(Boolean));
    describe();
  };
  // Choosing a word, from the list or from the suggestions, puts it into the field and opens "Add a word".
  const pickWord=label=>{wordInput.value=label;describe();setWords('add');};
  const renderWords=()=>{
    const counts=myWords(),labels=Object.keys(counts).sort(),said=label=>`${label} · ${counts[label]>=3?counts[label]+' examples':counts[label]+' of 3'}`;
    const begin=make('button',{type:'button',className:'secondary-button',id:'teachWordsStart',textContent:'Add a word'});
    begin.addEventListener('click',()=>{setWords('add');wordInput.focus();});
    wordList.replaceChildren(make('h3',{textContent:'Words you taught'}),...(labels.length?labels.map(label=>{
      const ready=counts[label]>=3;
      const chip=make('button',{type:'button',className:'teach-word',textContent:said(label)});
      chip.dataset.state=ready?'taught':'needed';
      chip.title='Record more examples of '+label;
      chip.addEventListener('click',()=>pickWord(label));
      return make('div',{className:'teach-word-row'},[chip,make('small',{textContent:ready?(contextualWordCounts()[label]>=3?`Hands + head/shoulders: ${contextualWordCounts()[label]} examples. Experimental recognition.`:'Hand-only recognition. Record 3 head/shoulder examples to upgrade.'):`Needs ${3-counts[label]} more before the camera can suggest it.`})]);
    }):[make('p',{textContent:'None yet. A word needs three recorded examples before the camera can suggest it.'}),begin]));
    taughtPart.dataset.empty=String(!labels.length);
    taughtCount.textContent=String(labels.length);taughtCount.hidden=!labels.length;
    suggested.replaceChildren(make('h3',{textContent:'Or start with a built-in word'}),
      make('p',{textContent:'The camera knows these six without recording. Recording one adds the way you sign it.'}),
      make('div',{className:'teach-suggest-words'},builtIn.map(label=>{
        const chip=make('button',{type:'button',className:'teach-word',textContent:counts[label]?said(label):label});
        chip.dataset.state=counts[label]>=3?'taught':counts[label]?'needed':'builtin';
        chip.addEventListener('click',()=>pickWord(label));
        return chip;
      })));
    describe();
  };
  function setWords(id){
    studio.dataset.words=id;
    for(const button of wordParts){const selected=button.dataset.words===id;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
  }
  function setTab(id){
    studio.dataset.teach=id;
    for(const button of tabButtons){const selected=button.dataset.teach===id;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    describe();showSeen();
  }
  tabs.addEventListener('keydown',event=>{if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft')return;event.preventDefault();const next=studio.dataset.teach==='signs'?'words':'signs';setTab(next);$('#teachTab-'+next).focus();});
  wordSwitch.addEventListener('keydown',event=>{if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft')return;event.preventDefault();const next=studio.dataset.words==='add'?'taught':'add';setWords(next);$('#teachWords-'+next).focus();});
  // The word block must stay an open <details>: other modules open it through closest('details').
  wordsBox.open=true;wordsBox.addEventListener('toggle',()=>{if(!wordsBox.open)wordsBox.open=true;});
  wordInput.addEventListener('input',describe);
  document.addEventListener('handspeak:personal-words',renderWords);
  document.addEventListener('handspeak:navigate',event=>{if(event.detail?.target==='#motionLabel'){setTab('words');setWords('add');}});
  new MutationObserver(renderTiles).observe(select,{childList:true});
  new MutationObserver(renderTiles).observe($('#sampleCounts'),{childList:true});
  // The sign cards say which numbers the model in use cannot read yet; they are rendered again when it has loaded.
  if($('#signGrid'))new MutationObserver(renderTiles).observe($('#signGrid'),{childList:true});
  new MutationObserver(()=>{for(const tile of groups.querySelectorAll('.teach-tile'))tile.disabled=select.disabled;}).observe(select,{attributes:true,attributeFilter:['disabled']});
  select.addEventListener('change',describe);
  if($('#motionHelp'))new MutationObserver(()=>{wordStatus.textContent=$('#motionHelp').textContent;}).observe($('#motionHelp'),{childList:true,characterData:true,subtree:true});

  // The camera itself belongs to Recognize; this page shows the same stream and presses the same button.
  const placeholder=$('#cameraPlaceholder'),liveResult=$('#liveResult'),liveLetter=$('#liveLetter');
  const studioOverlay=mountStudioOverlay({video:preview,overlay:teachOverlay,source:$('#overlay'),visible:()=>!studio.hidden&&Boolean(webcam.srcObject),enabled:handSkeletonEnabled});
  const syncCamera=()=>{
    const stream=webcam.srcObject||null,shown=studio.hidden?null:stream;
    if(preview.srcObject!==shown)preview.srcObject=shown;
    // Mirrored like the picture in Sign Language. The choice is read from the hub's checkbox: the computed style of
    // #webcam cannot say, because that element has no box while this page is shown and its transform reads "none".
    if(shown){const mirrorChoice=$('#mirrorPreview');preview.style.transform=mirrorChoice?(mirrorChoice.checked?'scaleX(-1)':'none'):getComputedStyle(webcam).transform;preview.play?.().catch(()=>{});}
    stage.dataset.state=stream?'on':'off';stop.hidden=!stream;
    pill.classList.toggle('live',Boolean(stream));pill.lastChild.textContent=stream?' Live':' Camera off';
    start.disabled=cameraButton.disabled;studioOverlay.sync();
  };
  // The match shown at the camera is repeated here once it names a sign; while the camera is still reading
  // (data-pace on #liveResult says so) nothing is shown.
  function showSeen(){
    const pace=liveResult.dataset.pace,value=liveLetter.textContent.trim();
    seen.hidden=!webcam.srcObject||liveResult.hidden||studio.dataset.teach!=='signs'||!/^[A-Z0-9]$/.test(value)||['reading','watching','checking','rest','none'].includes(pace);
    seenValue.textContent=value;
  }
  new MutationObserver(()=>{syncCamera();showSeen();}).observe(placeholder,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(syncCamera).observe(studio,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(syncCamera).observe(cameraButton,{attributes:true,attributeFilter:['disabled']});
  new MutationObserver(showSeen).observe(liveResult,{attributes:true,attributeFilter:['hidden','data-pace'],childList:true,characterData:true,subtree:true});
  for(const type of ['loadedmetadata','emptied','playing'])webcam.addEventListener(type,()=>{syncCamera();showSeen();});
  $('#mirrorPreview')?.addEventListener('change',()=>setTimeout(syncCamera));
  start.addEventListener('click',()=>{setMode(wantedMode());if(!webcam.srcObject)cameraButton.click();});
  stop.addEventListener('click',()=>{if(webcam.srcObject)cameraButton.click();});
  // Recording needs the matching mode; set it before the page's own handler checks it.
  capture.addEventListener('click',()=>setMode(wantedMode()),true);
  $('#motionTeach').addEventListener('click',event=>{
    setMode('words');
    if(webcam.srcObject)return;
    event.stopImmediatePropagation();wordStatus.textContent='Start the camera first, then record.';start.focus();
  },true);
  // Removing asks for a second press; the first one never reaches the hub's own handler.
  removeWord?.addEventListener('click',event=>{confirmFirst(event,removeWord,`Press again to remove ${tidy(wordInput.value)}`);},true);
  tryLink.addEventListener('click',()=>setMode(wantedMode()));
  remove.addEventListener('click',event=>{if(confirmFirst(event,remove,'Press again to remove them'))$('#sampleCounts').dispatchEvent(new CustomEvent('handspeak:remove-samples',{detail:{label:select.value}}));});
  // Opening the reset dialog is the confirmation; pressing its button resets and closes it.
  $('#resetModelButton').addEventListener('click',()=>resetDialog.close());
  setWords('add');setTab('signs');renderTiles();renderWords();syncCamera();
}

