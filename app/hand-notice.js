// Status sentence for a frame in which no hand can be used.
// The tracker may have found a hand that the page then sets aside: one with a point outside the
// camera picture, or one too small in the picture to read. Saying which helps the signer correct it;
// "no hand" is kept for frames in which the tracker found none. This module only words the notice:
// which hands are usable is decided by isUsableHand and isUsableLetterHand, not here.

// 'edge' when a point lies outside the picture, 'small' for any other well-formed hand, '' otherwise.
export function unusedHandReason(points){
  if(!Array.isArray(points)||points.length!==21||!points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return '';
  return points.some(p=>p.x<0||p.x>1||p.y<0||p.y>1)?'edge':'small';
}

// landmarks: every hand the tracker reported for the frame, none of which was usable.
export function unusedHandNotice(landmarks,bothHands=false){
  const hand=bothHands?'your hands':'your hand';
  const reasons=(Array.isArray(landmarks)?landmarks:[]).map(unusedHandReason).filter(Boolean);
  if(!reasons.length)return `No hand detected — bring ${hand} into view.`;
  if(reasons.includes('edge'))return `Hand at the edge — move ${hand} fully into the picture.`;
  return `Hand too small — move ${hand} closer to the camera.`;
}
