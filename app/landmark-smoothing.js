// Smoothing of tracked hand points over time, so that a hand held still does not tremble on screen
// and a moving hand is still followed without a visible delay.
// The method is the "one euro" filter (Casiez, Roussel and Vogel, 2012): a low-pass filter whose
// cutoff rises with the speed of the point. At rest the cutoff is low and removes jitter; when the
// point moves fast the cutoff is high and the filter adds little lag.
// Arithmetic only: no page access and no request. Coordinates are fractions of the picture, times
// are milliseconds, speeds are fractions of the picture per second.

// Chosen on synthetic jitter: a still hand trembles about 0.4 times as much, a hand crossing a third
// of the picture per second is followed within 1.5% of the picture, and it settles in about 4 frames.
export const SMOOTHING_DEFAULTS={minCutoff:1,beta:8,derivativeCutoff:1,maxGapMs:250,maxJump:.2,deadband:0,stillWithin:0,glide:.15,handBeta:0,handCutoff:3,handFloor:0};
// For the hand drawn over the picture only, never for what a recognizer reads: a lower cutoff at
// rest, and a dead band around each drawn point.
//   - while the filtered position stays within `stillWithin` of the drawn point, the point is not
//     moved at all, so a hand held still is drawn perfectly still;
//   - between `stillWithin` and `deadband` it glides toward the filtered position by the share
//     `glide` of the remaining distance per frame, so that it ends where the hand is and not beside it;
//   - beyond `deadband` it follows at that distance (under half a percent of the picture).
// So low a cutoff alone would leave the drawing behind when a movement starts. The speed of the
// hand as a whole (handBeta, handCutoff, handFloor) opens the filter as soon as the hand really
// moves, which jitter, different from point to point, does not do.
// The figures measured on synthetic jitter are in training/test_landmark_smoothing.mjs.
export const DISPLAY_SMOOTHING={minCutoff:.12,beta:10,derivativeCutoff:.4,maxGapMs:250,maxJump:.2,deadband:.0045,stillWithin:.002,glide:.1,handBeta:60,handCutoff:2,handFloor:.08};

const TWO_PI=Math.PI*2;
// Weight of the new value for a cutoff frequency (Hz) and a time step (seconds).
export const smoothingWeight=(cutoff,seconds)=>1/(1+1/(TWO_PI*cutoff*seconds));

const validPoints=points=>Array.isArray(points)&&points.length===21&&points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));

// Keeps one filter per hand. smooth(hands, now) returns the hands in the same order with smoothed
// points; a hand that is not 21 finite points is passed through unchanged.
// A hand is taken to be the same one as before when its wrist is within maxJump of that hand's
// last smoothed wrist; otherwise, or after maxGapMs without it, its filter starts again from the
// new position, so a hand that reappears elsewhere is not dragged across the picture.
export function createLandmarkSmoother(options={}){
  const {minCutoff,beta,derivativeCutoff,maxGapMs,maxJump,deadband,stillWithin,glide,handBeta,handCutoff,handFloor}={...SMOOTHING_DEFAULTS,...options};
  let tracks=[];
  // With a dead band the filter's own positions are kept in track.points and the positions that are
  // shown in track.shown (see DISPLAY_SMOOTHING for the three ranges).
  function held(track){
    if(!(deadband>0))return track.points;
    track.shown=track.points.map((point,index)=>{
      const shown=track.shown?.[index];
      if(!shown)return {x:point.x,y:point.y,z:point.z};
      const dx=point.x-shown.x,dy=point.y-shown.y,distance=Math.hypot(dx,dy);
      if(distance<=stillWithin)return shown;
      const step=distance<=deadband?glide*(distance-stillWithin)/distance:(distance-deadband)/distance;
      return {x:shown.x+dx*step,y:shown.y+dy*step,z:point.z};
    });
    return track.shown;
  }
  function advance(track,points,now){
    const seconds=Math.max(1e-3,(now-track.at)/1000),speedWeight=smoothingWeight(derivativeCutoff,seconds);
    track.at=now;
    // The velocity of the hand as a whole (the mean of its points). Jitter differs from point to
    // point and mostly cancels in the mean, so this speed tells a real movement from jitter far
    // sooner than a single point's speed does, and with handBeta it opens the filter of every point.
    // Speeds below handFloor are what jitter alone produces and count as none.
    let handSpeed=0;
    if(handBeta>0){
      const mean=list=>{let x=0,y=0;for(const p of list){x+=p.x;y+=p.y;}return {x:x/list.length,y:y/list.length};};
      const before=mean(track.raw),after=mean(points),handWeight=smoothingWeight(handCutoff,seconds);
      track.hand||={x:0,y:0};
      track.hand.x+=((after.x-before.x)/seconds-track.hand.x)*handWeight;
      track.hand.y+=((after.y-before.y)/seconds-track.hand.y)*handWeight;
      handSpeed=Math.max(0,Math.hypot(track.hand.x,track.hand.y)-handFloor);
    }
    track.points=points.map((point,index)=>{
      const previous=track.points[index];
      // The point's velocity in the picture, smoothed with its sign so that jitter cancels out, sets
      // how much of the new value is taken: the faster the point really moves, the more.
      const velocity=track.velocity[index];
      velocity.x+=((point.x-track.raw[index].x)/seconds-velocity.x)*speedWeight;
      velocity.y+=((point.y-track.raw[index].y)/seconds-velocity.y)*speedWeight;
      const weight=smoothingWeight(minCutoff+beta*Math.hypot(velocity.x,velocity.y)+handBeta*handSpeed,seconds);
      return {x:previous.x+(point.x-previous.x)*weight,y:previous.y+(point.y-previous.y)*weight,z:previous.z+(point.z-previous.z)*weight};
    });
    track.raw=points.map(point=>({x:point.x,y:point.y}));
    return held(track);
  }
  return {
    smooth(hands,now){
      if(!Array.isArray(hands)||!Number.isFinite(now))return hands;
      tracks=tracks.filter(track=>now-track.at<=maxGapMs&&now>=track.at);
      const free=new Set(tracks),next=[];
      const out=hands.map(points=>{
        if(!validPoints(points))return points;
        let best=null,bestDistance=maxJump;
        for(const track of free){
          const distance=Math.hypot(points[0].x-track.points[0].x,points[0].y-track.points[0].y);
          if(distance<=bestDistance){best=track;bestDistance=distance;}
        }
        if(best){free.delete(best);next.push(best);return now>best.at?advance(best,points,now):(best.shown||best.points);}
        const track={at:now,points:points.map(point=>({x:point.x,y:point.y,z:point.z})),raw:points.map(point=>({x:point.x,y:point.y})),velocity:points.map(()=>({x:0,y:0}))};
        next.push(track);
        return held(track);
      });
      // A hand that was not seen in this frame keeps its filter until maxGapMs has passed.
      tracks=next.concat([...free]);
      return out;
    },
    reset(){tracks=[];},
    get hands(){return tracks.length;}
  };
}
