// Reuse the camera's transparent drawing, not a second detector or a saved video.
export function mountStudioOverlay({video,overlay,source,visible,enabled}){
 const ctx=overlay.getContext('2d');let frame=0;
 function paint(){
  frame=0;
  if(!visible()){ctx.clearRect(0,0,overlay.width,overlay.height);return;}
  if(overlay.width!==source.width)overlay.width=source.width;
  if(overlay.height!==source.height)overlay.height=source.height;
  // Match the video element's own layout box, object-fit crop and mirror transform.
  Object.assign(overlay.style,{left:video.offsetLeft+'px',top:video.offsetTop+'px',width:video.offsetWidth+'px',height:video.offsetHeight+'px',transform:video.style.transform||'none'});
  ctx.clearRect(0,0,overlay.width,overlay.height);
  if(enabled()&&source.width&&source.height)ctx.drawImage(source,0,0);
  frame=requestAnimationFrame(paint);
 }
 return {
  sync(){if(!visible()){if(frame)cancelAnimationFrame(frame);frame=0;ctx.clearRect(0,0,overlay.width,overlay.height);}else if(!frame)frame=requestAnimationFrame(paint);},
  stop(){if(frame)cancelAnimationFrame(frame);frame=0;ctx.clearRect(0,0,overlay.width,overlay.height);}
 };
}
