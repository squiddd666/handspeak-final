const KEY='handspeak-skeleton-overlay';
let enabled=document.documentElement?.dataset?.site!=='app';
try{
 const saved=localStorage.getItem(KEY);
 if(saved==='on'||saved==='off')enabled=saved==='on';
 else{
  const hand=localStorage.getItem('handspeak-hand-skeleton'),body=localStorage.getItem('handspeak-head-shoulder-skeleton');
  if(hand==='on'||body==='on')enabled=true;
  else if(hand==='off')enabled=false;
 }
}catch{}
export const handSkeletonEnabled=()=>enabled;
export const headShoulderSkeletonEnabled=()=>enabled;
export function setHandSkeletonEnabled(value){
 enabled=Boolean(value);
 try{localStorage.setItem(KEY,enabled?'on':'off');}catch{}
 document.dispatchEvent(new CustomEvent('handspeak:hand-skeleton',{detail:{enabled}}));
}
export const setHeadShoulderSkeletonEnabled=setHandSkeletonEnabled;
