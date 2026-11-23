// Which tracked hands are shown over the camera picture, and what is done with a hand at its edge.
// Three small rules, kept apart from the recognizers:
//   - a hand that is partly outside the picture is still drawn, as long as enough of it is inside;
//   - a hand that reaches only a little outside may still be read: its outside points are moved onto
//     the edge, because the reading rules (isUsableHand, isUsableLetterHand) want every point inside;
//     a hand with several points at the edge is cut off by it and is not read;
//   - when no hand is reported for a moment, the last drawn hands stay on screen for a short time,
//     so that the outline does not blink when the tracker misses a frame or two.
// Arithmetic only: no page access and no request. Points are fractions of the picture, times are
// milliseconds.

export const HAND_VIEW_DEFAULTS={minInside:8,holdMs:250,edgeMargin:.04,edgeBand:.03,maxAtEdge:3};

const wellFormed=points=>Array.isArray(points)&&points.length===21&&points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
const inside=p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;

// How many of the 21 points lie inside the picture; 0 for anything that is not a hand.
export function pointsInside(points){return wellFormed(points)?points.filter(inside).length:0;}

// A hand is drawn when at least minInside of its points are inside the picture.
export function isDrawableHand(points,minInside=HAND_VIEW_DEFAULTS.minInside){return pointsInside(points)>=minInside;}

// How many points lie outside the picture or within `band` of its edge. A hand that is cut off by
// the edge has many: the tracker places the points it cannot see close to the edge.
export function pointsAtEdge(points,band=HAND_VIEW_DEFAULTS.edgeBand){
  return wellFormed(points)?points.filter(p=>Math.min(p.x,1-p.x,p.y,1-p.y)<=band).length:0;
}

// A hand is taken to be cut off, and is not read, when more than maxAtEdge of its points are at the edge.
export function isCutOff(points,band=HAND_VIEW_DEFAULTS.edgeBand,maxAtEdge=HAND_VIEW_DEFAULTS.maxAtEdge){return pointsAtEdge(points,band)>maxAtEdge;}

// True when every point is inside the picture or no further outside than margin.
export function nearPicture(points,margin){
  return wellFormed(points)&&Number.isFinite(margin)&&margin>=0
    &&points.every(p=>p.x>=-margin&&p.x<=1+margin&&p.y>=-margin&&p.y<=1+margin);
}

// The same hand with its outside points moved onto the edge. A hand that is wholly inside is
// returned as it is (the same array), so callers can tell whether anything was moved.
export function pulledInside(points){
  if(!wellFormed(points)||points.every(inside))return points;
  return points.map(p=>inside(p)?p:{x:Math.min(1,Math.max(0,p.x)),y:Math.min(1,Math.max(0,p.y)),z:p.z});
}

// show(hands, now) returns {hands, held}: the hands to draw in this frame. When `hands` is empty and
// hands were drawn no longer than holdMs ago, those are returned again with held true.
export function createHandHold({holdMs=HAND_VIEW_DEFAULTS.holdMs}={}){
  let last=[],at=-Infinity;
  return {
    show(hands,now){
      if(Array.isArray(hands)&&hands.length){last=hands;at=now;return {hands,held:false};}
      if(last.length&&Number.isFinite(now)&&now>=at&&now-at<=holdMs)return {hands:last,held:true};
      last=[];at=-Infinity;
      return {hands:[],held:false};
    },
    reset(){last=[];at=-Infinity;}
  };
}
