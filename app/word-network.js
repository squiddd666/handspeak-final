// Word network: a small network that answers one of its words, or "none of these", for a word
// capture in the page's own encoding (two-hand-motion-v3: 20 frames of 128 numbers).
// Arithmetic on a model file only: no page access and no request. The layers are those written by
// training/train_word_network.py: two convolutions over time, the largest and the mean value of
// each channel over the capture, one dense layer, and one output per word plus one for "none".
import {mirrorMotion,validMotion} from './motion-model.js?v=20261109-vm-sync-1';

export const WORD_NETWORK_KIND='word-network-v1';
const FRAMES=20,WIDTH=128;
const tensor=(value,shape)=>shape.length?Array.isArray(value)&&value.length===shape[0]&&value.every(item=>tensor(item,shape.slice(1))):Number.isFinite(value);

export function validWordNetwork(model){
  if(!model||model.version!==1||model.kind!==WORD_NETWORK_KIND||model.encoding!=='two-hand-motion-v3')return false;
  const labels=model.labels;
  if(!Array.isArray(labels)||labels.length<2||labels.length>40||new Set(labels).size!==labels.length
    ||!labels.every(label=>typeof label==='string'&&/^[A-Z][A-Z0-9 '\/-]{0,29}$/.test(label))
    ||typeof model.none!=='string'||labels.includes(model.none)
    ||!Number.isFinite(model.threshold)||model.threshold<0||model.threshold>1)return false;
  if(model.thresholdByLabel!==undefined&&(!model.thresholdByLabel||typeof model.thresholdByLabel!=='object'
    ||!Object.entries(model.thresholdByLabel).every(([label,value])=>labels.includes(label)&&Number.isFinite(value)&&value>=0&&value<=1)))return false;
  const layers=model.layers;
  if(!layers||!layers.conv1||!layers.conv2||!layers.dense||!layers.out)return false;
  const hidden=layers.conv1.bias?.length,kernel=layers.conv1.weight?.[0]?.[0]?.length,dense=layers.dense.bias?.length;
  if(!(hidden>=1&&hidden<=256)||![1,3,5].includes(kernel)||!(dense>=1&&dense<=256))return false;
  return tensor(layers.conv1.weight,[hidden,WIDTH,kernel])&&tensor(layers.conv1.bias,[hidden])
    &&tensor(layers.conv2.weight,[hidden,hidden,kernel])&&tensor(layers.conv2.bias,[hidden])
    &&tensor(layers.dense.weight,[dense,2*hidden])&&tensor(layers.dense.bias,[dense])
    &&tensor(layers.out.weight,[labels.length+1,dense])&&tensor(layers.out.bias,[labels.length+1]);
}

// A convolution over time with zeros beyond both ends, followed by max(0, x).
function convolve(frames,layer){
  const kernel=layer.weight[0][0].length,pad=kernel>>1,inputs=frames[0].length;
  return frames.map((_,t)=>layer.weight.map((channel,o)=>{
    let sum=layer.bias[o];
    for(let k=0;k<kernel;k++){
      const frame=frames[t+k-pad];
      if(!frame)continue;
      for(let i=0;i<inputs;i++)sum+=channel[i][k]*frame[i];
    }
    return sum>0?sum:0;
  }));
}
const dense=(input,layer,rectify)=>layer.weight.map((row,o)=>{let sum=layer.bias[o];for(let i=0;i<input.length;i++)sum+=row[i]*input[i];return rectify&&sum<0?0:sum;});

function shares(model,sequence){
  const hidden=convolve(convolve(sequence,model.layers.conv1),model.layers.conv2);
  const channels=hidden[0].length,largest=new Array(channels).fill(-Infinity),mean=new Array(channels).fill(0);
  for(const frame of hidden)for(let c=0;c<channels;c++){if(frame[c]>largest[c])largest[c]=frame[c];mean[c]+=frame[c]/hidden.length;}
  const scores=dense(dense(largest.concat(mean),model.layers.dense,true),model.layers.out,false);
  const top=Math.max(...scores),weights=scores.map(score=>Math.exp(score-top)),total=weights.reduce((sum,value)=>sum+value,0);
  return weights.map(value=>value/total);
}

// The share of each word, in the order of model.labels, followed by the share of "none".
// With mirrorAverage the answer is the mean of the answers for the capture and its mirror image,
// so a sign made with the other hand is read the same way.
export function wordNetworkShares(model,sequence){
  const plain=shares(model,sequence);
  if(!model.mirrorAverage)return plain;
  const mirrored=shares(model,mirrorMotion(sequence));
  return plain.map((value,index)=>(value+mirrored[index])/2);
}

// {label, confidence} when a word has the largest share of all answers and reaches its threshold;
// null when "none" is the largest, the word is under its threshold, or the capture is not valid.
export function recognizeWordNetwork(model,sequence){
  if(!validMotion(sequence)||sequence.length!==FRAMES)return null;
  const share=wordNetworkShares(model,sequence),none=model.labels.length;
  let best=0;
  for(let index=1;index<share.length;index++)if(share[index]>share[best])best=index;
  if(best===none)return null;
  const label=model.labels[best];
  return share[best]>=(model.thresholdByLabel?.[label]??model.threshold)?{label,confidence:share[best]}:null;
}
