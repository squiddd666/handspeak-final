import {normalizeLandmarks,classifyFeatures,isUsableHand} from './gesture-model.js?v=20261113-refined-1';

const stableSamples=new WeakMap();
export function stablePalmFeatures(features){
  // The projected MCP span approaches zero for edge-on C/O poses. A second
  // anatomical palm dimension prevents division by an arbitrarily tiny span.
  const span=Math.hypot(features[15]-features[51],features[16]-features[52]);
  const length=Math.hypot(features[27]-features[0],features[28]-features[1]);
  const scale=Math.max(span,.65*length);
  return scale>1e-8?features.map(v=>v/scale):null;
}

function stableReferences(samples){
  return samples.map(sample=>{
    if(!stableSamples.has(sample))stableSamples.set(sample,{...sample,features:stablePalmFeatures(sample.features)});
    return stableSamples.get(sample);
  }).filter(s=>s.features);
}

// MediaPipe x/z are measured in image-width units; y is in image-height
// units. Convert once to an isotropic coordinate system, never try the
// inverse aspect ratio to obtain a more convenient classification.
export function letterFeatures(points,imageAspect=1){
  if(!Number.isFinite(imageAspect)||imageAspect<=0)return null;
  return normalizeLandmarks(points.map(p=>({...p,y:p.y*imageAspect})), 'wrist-palm-orientation-v2');
}

export function isUsableLetterHand(points,imageAspect=1){
  if(!isUsableHand(points,0)||!Number.isFinite(imageAspect)||imageAspect<=0)return false;
  const length=(a,b)=>Math.hypot(points[a].x-points[b].x,(points[a].y-points[b].y)*imageAspect);
  // An edge-on palm can have almost coincident index/little MCPs. It is
  // not a small hand if its wrist-to-middle-MCP length is still substantial.
  return Math.max(length(5,17),.65*length(0,9))>=.025;
}

export function classifyLetter(points,samples,parameters,imageAspect=1,audit=null){
  if(!isUsableLetterHand(points,imageAspect))return null;
  const features=letterFeatures(points,imageAspect);
  const span=Math.hypot(features[15]-features[51],features[16]-features[52]);
  const length=Math.hypot(features[27],features[28]);
  if(span*2<.65*length){
    // Apply the SAME scale to both sides of the comparison, and use stricter
    // separation/agreement for this ill-conditioned view. No class override.
    return classifyFeatures(stablePalmFeatures(features),stableReferences(samples),{
      ...parameters,maxDistance:Math.min(parameters.maxDistance,.25),
      minAgreement:Math.max(parameters.minAgreement,.9),minRatio:Math.max(parameters.minRatio,1.5)
    },audit);
  }
  const primary=classifyFeatures(features,samples,parameters,audit);
  if(primary)return primary;
  // Retain the existing distance allowance, but only in the physically
  // correct geometry. Neither agreement nor class separation is relaxed.
  return classifyFeatures(features,samples,{...parameters,maxDistance:Math.max(parameters.maxDistance,.45)},audit);
}

export function sameObservedHand(a,b,imageAspect=1){
  if(!isUsableLetterHand(a,imageAspect)||!isUsableLetterHand(b,imageAspect))return false;
  const scale=Math.max(...[a,b].map(p=>Math.hypot(p[0].x-p[9].x,(p[0].y-p[9].y)*imageAspect)));
  return Math.hypot(a[0].x-b[0].x,(a[0].y-b[0].y)*imageAspect)<scale*.6;
}

// Short abstentions may interrupt a good observation, but they never count as
// positive evidence. A competing accepted letter starts a fresh hold period.
// earlyHoldMs (0 = off) allows a shorter hold, but only while no frame has abstained and
// every accepted frame reached earlyConfidence, and never for a letter that has its own
// longer hold. One abstention or one weaker frame returns the label to the normal hold.
export function createLetterConsensus({holdMs=850,letterHoldMs={},maxGapMs=500,minFrames=6,minAgreement=.7,earlyHoldMs=0,earlyConfidence=1}={}){
  let label='',start=0,last=-Infinity,lastPositive=-Infinity,hits=0,total=0,weakest=Infinity;
  function reset(){label='';start=0;last=-Infinity;lastPositive=-Infinity;hits=0;total=0;weakest=Infinity;}
  // The hold the current label has to reach; one place so push and progress cannot disagree.
  function hold(){
    const normal=Number.isFinite(letterHoldMs[label])?Math.max(holdMs,letterHoldMs[label]):holdMs;
    const early=earlyHoldMs>0&&earlyHoldMs<normal&&!Number.isFinite(letterHoldMs[label])&&hits===total&&weakest>=earlyConfidence;
    return {normal,early,required:early?earlyHoldMs:normal};
  }
  return {reset,push(result,now){
    if(!Number.isFinite(now)){reset();return null;}
    if(now<last||now-lastPositive>maxGapMs)reset();
    last=now;
    if(!result?.letter){if(label)total++;return null;}
    if(label!==result.letter){label=result.letter;start=now;hits=0;total=0;weakest=Infinity;}
    hits++;total++;lastPositive=now;weakest=Math.min(weakest,Number.isFinite(result.confidence)?result.confidence:0);
    const {normal,early,required}=hold();
    return now-start>=required&&hits>=minFrames&&hits/total>=minAgreement
      ?{...result,latencyMs:now-start,evidenceFrames:hits,observedFrames:total,...(early&&now-start<normal?{earlyCommit:true}:{})}:null;
  },
  // Read-only view for a progress display: which label is being held and how far along its hold is.
  // It never changes the state, and an empty label means nothing is being held.
  progress(now){
    if(!label||!Number.isFinite(now)||now<last||now-lastPositive>maxGapMs)return {label:'',elapsedMs:0,requiredMs:holdMs,ratio:0};
    const {required}=hold(),elapsedMs=Math.max(0,now-start);
    return {label,elapsedMs,requiredMs:required,ratio:Math.min(1,elapsedMs/required)};
  }};
}
