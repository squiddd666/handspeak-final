// Feature normalization must match training/train_asl.py.
export function normalizeLandmarks(points,normalization='wrist-palm-rotation-v1'){
  const wrist=points[0], middleBase=points[9];
  const scale=Math.hypot(points[5].x-points[17].x,points[5].y-points[17].y)||1;
  if(normalization==='wrist-palm-orientation-v2')return points.flatMap(point=>[
    (point.x-wrist.x)/scale,(point.y-wrist.y)/scale,(point.z-wrist.z)/scale
  ]);
  const angle=Math.atan2(middleBase.y-wrist.y,middleBase.x-wrist.x)-Math.PI/2;
  const cosine=Math.cos(-angle),sine=Math.sin(-angle);
  return points.flatMap(point=>{
    const x=(point.x-wrist.x)/scale,y=(point.y-wrist.y)/scale;
    return [x*cosine-y*sine,x*sine+y*cosine,(point.z-wrist.z)/scale];
  });
}

export function validSample(sample, labels){
  return sample && labels.includes(sample.label) && Array.isArray(sample.features)
    && sample.features.length===63 && sample.features.every(Number.isFinite);
}

export const DEFAULT_PARAMETERS = Object.freeze({zWeight:.5,k:3,minAgreement:.7,maxDistance:.25,minRatio:1.5});

export function validParameters(p){
  return p && Number.isFinite(p.zWeight) && p.zWeight>0 && p.zWeight<=1
    && Number.isInteger(p.k) && p.k>=1 && p.k<=15
    && Number.isFinite(p.minAgreement) && p.minAgreement>=.5 && p.minAgreement<=1
    && Number.isFinite(p.maxDistance) && p.maxDistance>0 && p.maxDistance<=1
    && Number.isFinite(p.minRatio) && p.minRatio>=1 && p.minRatio<=5
    && (p.shapeWeight===undefined || (Number.isFinite(p.shapeWeight) && p.shapeWeight>=0 && p.shapeWeight<=5))
    && (p.rejectLabels===undefined || (Array.isArray(p.rejectLabels) && p.rejectLabels.length<=8
      && p.rejectLabels.every(label=>typeof label==='string' && /^[A-Z]{2,12}$/.test(label))))
    && (p.orientation===undefined || p.orientation==='direct' || p.orientation==='mirrored');
}

export function isUsableHand(points,minPalmWidth=.035){
  return Array.isArray(points) && points.length===21
    && points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)
      && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1)
    && Math.hypot(points[5].x-points[17].x,points[5].y-points[17].y)>=minPalmWidth;
}

// Hand-shape measurements derived from one 63-number feature vector: fingertip-to-fingertip
// distances (10), fingertip to wrist (5), fingertip to its knuckle (5), sideways spread or
// crossing of neighbouring fingertips relative to their knuckles (3), thumb tip to the other
// fingers' joints (8). None of them changes when the hand is mirrored. They take part in
// the distance only when the model's parameters carry a positive shapeWeight.
const SHAPE_TIPS=[4,8,12,16,20],SHAPE_KNUCKLES=[2,5,9,13,17],SHAPE_THUMB_JOINTS=[6,10,14,18,5,9,13,17];
export function shapeFeatures(features,zWeight=.5){
  const point=i=>[features[i*3],features[i*3+1],features[i*3+2]*zWeight];
  const distance=(a,b)=>{const p=point(a),q=point(b);return Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);};
  const out=[];
  for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)out.push(distance(SHAPE_TIPS[a],SHAPE_TIPS[b]));
  for(const tip of SHAPE_TIPS)out.push(distance(tip,0));
  for(let finger=0;finger<5;finger++)out.push(distance(SHAPE_TIPS[finger],SHAPE_KNUCKLES[finger]));
  let ax=features[51]-features[15],ay=features[52]-features[16];const length=Math.hypot(ax,ay)||1;ax/=length;ay/=length;
  const along=(a,b)=>(features[a*3]-features[b*3])*ax+(features[a*3+1]-features[b*3+1])*ay;
  for(let finger=1;finger<4;finger++){
    const base=along(SHAPE_KNUCKLES[finger],SHAPE_KNUCKLES[finger+1]),tips=along(SHAPE_TIPS[finger],SHAPE_TIPS[finger+1]);
    out.push(Math.abs(base)>1e-6?Math.max(-3,Math.min(3,tips/base)):0);
  }
  for(const joint of SHAPE_THUMB_JOINTS)out.push(distance(4,joint));
  return out;
}
const sampleShapes=new WeakMap();
function sampleShape(sample,zWeight){
  let cached=sampleShapes.get(sample);
  if(!cached||cached.zWeight!==zWeight){cached={zWeight,values:shapeFeatures(sample.features,zWeight)};sampleShapes.set(sample,cached);}
  return cached.values;
}

export function classifyFeatures(features, samples, parameters=DEFAULT_PARAMETERS, audit=null){
  if(!Array.isArray(features)||features.length!==63||!features.every(Number.isFinite))return null;
  const counts={};samples.forEach(s=>counts[s.label]=(counts[s.label]||0)+1);
  if(Object.values(counts).filter(count=>count>=10).length<2)return null;
  const neighbors=[], nearestByLabel={};
  const shapeWeight=parameters.shapeWeight>0?parameters.shapeWeight:0;
  const queryShape=shapeWeight?shapeFeatures(features,parameters.zWeight):null;
  for(const sample of samples){
    if(counts[sample.label]<10)continue;
    let direct=0, mirrored=0;
    for(let i=0;i<63;i++){
      const weight=i%3===2?parameters.zWeight:1;
      const delta=(features[i]-sample.features[i])*weight;
      const mirrorDelta=((i%3===0?-features[i]:features[i])-sample.features[i])*weight;
      direct+=delta*delta;mirrored+=mirrorDelta*mirrorDelta;
    }
    let shape=0;
    if(shapeWeight){const reference=sampleShape(sample,parameters.zWeight);for(let i=0;i<queryShape.length;i++){const delta=queryShape[i]-reference[i];shape+=delta*delta;}}
    // A hand is compared as it is and as its mirror image, and the nearer counts, so that either hand
    // can sign. With parameters.orientation only one of the two is compared: 'direct' for the hand the
    // references were made with, 'mirrored' for the other hand.
    const planar=parameters.orientation==='direct'?direct:parameters.orientation==='mirrored'?mirrored:Math.min(direct,mirrored);
    const distance=Math.sqrt((planar+shapeWeight*shapeWeight*shape)/63);
    nearestByLabel[sample.label]=Math.min(nearestByLabel[sample.label]??Infinity,distance);
    // Keep only the k best neighbors rather than sorting the entire dataset each frame.
    const index=neighbors.findIndex(n=>n.distance>distance);
    neighbors.splice(index<0?neighbors.length:index,0,{label:sample.label,distance});
    if(neighbors.length>parameters.k)neighbors.pop();
  }
  if(!neighbors.length)return null;
  const votes={};neighbors.forEach(n=>votes[n.label]=(votes[n.label]||0)+1/(n.distance+.001));
  const ranked=Object.entries(votes).sort((a,b)=>b[1]-a[1]);
  const agreement=ranked[0][1]/ranked.reduce((sum,item)=>sum+item[1],0);
  const label=ranked[0][0], nearest=neighbors[0].distance;
  const other=Math.min(...Object.entries(nearestByLabel).filter(([key])=>key!==label).map(([,distance])=>distance));
  const margin=other/(nearest+1e-8);
  // A model may carry reference samples for hands that are not one of its letters, under
  // labels listed in rejectLabels. A hand that matches them best is refused, never reported.
  const refused=Array.isArray(parameters.rejectLabels)&&parameters.rejectLabels.includes(label);
  if(audit)audit({label,agreement,nearest,margin,
    reason:agreement<parameters.minAgreement?'neighbor-disagreement':nearest>parameters.maxDistance?'distance':margin<parameters.minRatio?'margin':refused?'reject-label':'accepted'});
  if(agreement<parameters.minAgreement || nearest>parameters.maxDistance
    || margin<parameters.minRatio || refused)return null;
  return {letter:label,confidence:agreement,source:'ai'};
}
