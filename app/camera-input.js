// Camera request and read-back. Builds the getUserMedia request from the page address and the
// camera the user chose, and reports what the camera actually delivered: its own settings, what it
// says it supports, and how many frames reach the page and how evenly. It changes no picture and
// sets no exposure, focus or colour control. Without an address flag the request is the page's
// default (CAMERA_DEFAULT_VIDEO), so nothing changes for a user.

export const CAMERA_DEFAULT_VIDEO={facingMode:'user',width:{ideal:960},height:{ideal:720}};
// The camera chosen in Camera settings (evaluation site). Each site keeps its own (another port is another origin).
export const CAMERA_DEVICE_KEY='handspeak-camera-device-v1';
// Properties read back from getSettings() and getCapabilities(); anything else the browser reports is left out.
export const CAMERA_PROPERTIES=['width','height','aspectRatio','frameRate','resizeMode','facingMode','exposureMode','exposureTime','exposureCompensation',
  'focusMode','focusDistance','whiteBalanceMode','colorTemperature','brightness','contrast','saturation','sharpness','zoom','backgroundBlur'];

// Experiment flags: ?cameraSize=1280x720, ?cameraFps=30, ?cameraResize=none|crop-and-scale.
// Each is an ideal (a wish the browser may not meet), and what was met is reported by cameraApplied.
export function cameraFlags(search=''){
  const query=new URLSearchParams(search||''),flags={},ignored=[];
  const size=query.get('cameraSize');
  if(size!==null){
    const match=/^(\d{3,4})x(\d{3,4})$/.exec(size.trim());
    const width=match?Number(match[1]):0,height=match?Number(match[2]):0;
    if(width>=160&&width<=3840&&height>=120&&height<=2160)flags.size={width,height};else ignored.push('cameraSize');
  }
  const fps=query.get('cameraFps');
  if(fps!==null){const value=Number(fps);if(Number.isFinite(value)&&value>=1&&value<=120)flags.fps=value;else ignored.push('cameraFps');}
  const resize=query.get('cameraResize');
  if(resize!==null){if(resize==='none'||resize==='crop-and-scale')flags.resize=resize;else ignored.push('cameraResize');}
  return {flags,ignored};
}

// The request for getUserMedia. A chosen camera replaces the front-camera preference and is asked
// for as an ideal, so a camera that has been unplugged falls back to the browser's choice.
export function cameraRequest(search='',deviceId=''){
  const {flags,ignored}=cameraFlags(search);
  const video={...CAMERA_DEFAULT_VIDEO};
  if(flags.size){video.width={ideal:flags.size.width};video.height={ideal:flags.size.height};}
  if(flags.fps)video.frameRate={ideal:flags.fps};
  if(flags.resize)video.resizeMode=flags.resize;
  if(typeof deviceId==='string'&&deviceId){delete video.facingMode;video.deviceId={ideal:deviceId};}
  return {constraints:{video,audio:false},flags,ignored,device:Boolean(typeof deviceId==='string'&&deviceId)};
}

function pick(source){
  const out={};
  if(!source||typeof source!=='object')return out;
  for(const key of CAMERA_PROPERTIES)if(key in source){
    const value=source[key];
    if(typeof value==='number')out[key]=Math.round(value*1000)/1000;
    else if(typeof value==='string'||typeof value==='boolean')out[key]=value;
    else if(Array.isArray(value))out[key]=value.filter(item=>typeof item==='string'||typeof item==='boolean').slice(0,12);
    else if(value&&typeof value==='object'){const range={};for(const part of ['min','max','step'])if(Number.isFinite(value[part]))range[part]=Math.round(value[part]*1000)/1000;out[key]=range;}
  }
  return out;
}

// Whether each flag was met by what the camera delivered (true, false), or not asked (absent).
export function cameraApplied(flags={},settings={}){
  const applied={};
  if(flags.size)applied.size=settings.width===flags.size.width&&settings.height===flags.size.height;
  if(flags.fps)applied.fps=Number.isFinite(settings.frameRate)&&Math.abs(settings.frameRate-flags.fps)<1;
  if(flags.resize)applied.resize=settings.resizeMode===flags.resize;
  return applied;
}

// What the opened camera reports. The device id is left out: it identifies the camera to this site only and is not needed in a report.
export function describeCamera(track,request={}){
  if(!track)return null;
  let settings={},capabilities=null;
  try{settings=pick(track.getSettings?.());}catch{}
  try{capabilities=typeof track.getCapabilities==='function'?pick(track.getCapabilities()):null;}catch{capabilities=null;}
  const flags=request.flags||{};
  return {label:String(track.label||'').slice(0,120),chosenCamera:Boolean(request.device),requested:flags,ignoredFlags:request.ignored||[],
    applied:cameraApplied(flags,settings),settings,capabilities};
}

const percentile=(sorted,p)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]:0;
const tenth=value=>Math.round(value*10)/10;

// Frames that reached the page, from the times of frame callbacks (ms) and the presented-frame counter.
export function summarizeFrames(times=[],presented=[]){
  const intervals=[];
  for(let i=1;i<times.length;i++)intervals.push(times[i]-times[i-1]);
  const sorted=intervals.slice().sort((a,b)=>a-b),span=times.length>1?times[times.length-1]-times[0]:0;
  const frames=presented.length>1?presented[presented.length-1]-presented[0]:times.length-1;
  return {cameraFps:span>0?tenth(frames*1000/span):0,callbacks:times.length,
    intervalMs:{p50:tenth(percentile(sorted,.5)),p95:tenth(percentile(sorted,.95)),max:tenth(sorted.length?sorted[sorted.length-1]:0)},
    gapsOver100ms:intervals.filter(value=>value>100).length,missedCallbacks:Math.max(0,frames-(times.length-1)),seconds:tenth(span/1000)};
}

// Counts frames as the video element receives them (requestVideoFrameCallback). The last five
// seconds give the current rate; the totals cover the whole time the camera has been on.
// Display only: it does not touch the frames the trackers read.
export function createFrameMeter(video,{windowMs=5000}={}){
  if(!video||typeof video.requestVideoFrameCallback!=='function')return null;
  let times=[],presented=[],id=null,stopped=false,first=null,last=null,gaps=0,previous=null,total=0;
  function onFrame(now,metadata){
    if(stopped)return;
    id=video.requestVideoFrameCallback(onFrame);
    const count=Number.isFinite(metadata?.presentedFrames)?metadata.presentedFrames:null;
    total++;
    if(previous!==null&&now-previous>100)gaps++;
    previous=now;
    if(first===null)first={now,count};
    last={now,count};
    times.push(now);if(count!==null)presented.push(count);
    while(times.length&&now-times[0]>windowMs){times.shift();if(presented.length>times.length)presented.shift();}
  }
  id=video.requestVideoFrameCallback(onFrame);
  return {
    summary(){
      const recent=summarizeFrames(times,presented.length===times.length?presented:[]);
      let quality=null;
      try{const q=video.getVideoPlaybackQuality?.();if(q)quality={totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames};}catch{}
      const span=first&&last?last.now-first.now:0,frames=first&&last&&first.count!==null&&last.count!==null?last.count-first.count:Math.max(0,total-1);
      return {recent,sinceStart:{seconds:tenth(span/1000),cameraFps:span>0?tenth(frames*1000/span):0,gapsOver100ms:gaps},playback:quality};
    },
    stop(){stopped=true;if(id!==null&&typeof video.cancelVideoFrameCallback==='function')video.cancelVideoFrameCallback(id);id=null;}
  };
}
