// Which hand the letters are read from when two hands are in the picture.
// Fingerspelling uses one hand. When the tracker reports two, the page keeps reading the hand it
// was already reading, and changes to the other one only when that hand has been clearly the larger
// in the picture for a moment: a second hand that drifts into view must not take over, and a signer
// who changes hands is followed after a short wait.
// Arithmetic only: no page access and no request. Points are fractions of the picture, imageAspect
// is height divided by width, times are milliseconds.

export const HAND_CHOICE_DEFAULTS={switchRatio:1.3,switchMs:400,sameHand:.15,forgetMs:500};

const palmWidth=(points,imageAspect)=>Math.hypot(points[5].x-points[17].x,(points[5].y-points[17].y)*imageAspect);

// choose(hands, imageAspect, now) returns the position in `hands` of the hand to read, or -1 when
// there is none. `hands` are the usable hands of one frame, in any order.
export function createLetterHandChoice(options={}){
  const {switchRatio,switchMs,sameHand,forgetMs}={...HAND_CHOICE_DEFAULTS,...options};
  let wrist=null,seenAt=-Infinity,rivalSince=null;
  return {
    choose(hands,imageAspect,now){
      if(!Array.isArray(hands)||!hands.length)return -1;
      const aspect=Number.isFinite(imageAspect)&&imageAspect>0?imageAspect:1;
      const widths=hands.map(points=>palmWidth(points,aspect));
      const largest=widths.indexOf(Math.max(...widths));
      // The hand read last, if it is still here: the one whose wrist is nearest to where it was.
      let current=-1;
      if(wrist&&now-seenAt<=forgetMs){
        let nearest=sameHand;
        hands.forEach((points,index)=>{const distance=Math.hypot(points[0].x-wrist.x,(points[0].y-wrist.y)*aspect);if(distance<=nearest){nearest=distance;current=index;}});
      }
      let chosen=current;
      if(current<0){chosen=largest;rivalSince=null;}
      else if(largest!==current&&widths[largest]>=widths[current]*switchRatio){
        if(rivalSince===null)rivalSince=now;
        if(now-rivalSince>=switchMs){chosen=largest;rivalSince=null;}
      }else rivalSince=null;
      wrist={x:hands[chosen][0].x,y:hands[chosen][0].y};seenAt=now;
      return chosen;
    },
    reset(){wrist=null;seenAt=-Infinity;rivalSince=null;}
  };
}
