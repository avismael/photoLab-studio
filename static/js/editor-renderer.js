import {textLayout,drawText,drawShape} from './elements-core.js';

function layer(width,height) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
}
export function overlaySize(context,item,assets) {
  if(item.kind==='text')return textLayout(context,item);
  if(item.kind==='shape')return {w:item.width+item.strokeWidth,h:(item.shape==='line'?Math.max(16,item.strokeWidth):item.height)+item.strokeWidth};
  if(item.kind==='sticker') {
    const asset=assets.get(item.assetId);if(!asset)return {w:item.size,h:item.size};
    const scale=item.size/Math.max(asset.width,asset.height);return {w:asset.width*scale,h:asset.height*scale};
  }
  context.font=`${item.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  return {w:Math.max(item.size*.7,context.measureText(item.text).width),h:item.size};
}
function adjustedImage(source,adjustments) {
  const base=layer(source.width,source.height),context=base.getContext('2d'),a=adjustments;
  context.filter=`brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%) hue-rotate(${a.hue}deg) blur(${a.softness}px)`;
  context.drawImage(source,0,0);context.filter='none';
  if(a.warmth!==0) {
    const alpha=(Math.abs(a.warmth)/100*.34).toFixed(3);
    context.globalCompositeOperation='soft-light';
    context.fillStyle=a.warmth>0?`rgba(255,143,62,${alpha})`:`rgba(70,159,255,${alpha})`;
    context.fillRect(0,0,source.width,source.height);context.globalCompositeOperation='source-over';
  }
  return base;
}
function paintStroke(context,stroke) {
  const points=stroke.points;if(!points.length)return;
  context.strokeStyle='#fff';context.fillStyle='#fff';context.lineCap='round';context.lineJoin='round';context.lineWidth=stroke.size;
  context.beginPath();
  if(points.length===1){context.arc(points[0][0],points[0][1],stroke.size/2,0,Math.PI*2);context.fill();}
  else {context.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)context.lineTo(points[i][0],points[i][1]);context.stroke();}
}
function selectiveBlur(context,base,strokes) {
  const groups=new Map();
  for(const stroke of strokes){if(!groups.has(stroke.blur))groups.set(stroke.blur,[]);groups.get(stroke.blur).push(stroke);}
  for(const [radius,group] of groups) {
    const blurred=layer(base.width,base.height),blurCtx=blurred.getContext('2d');
    const mask=layer(base.width,base.height),maskCtx=mask.getContext('2d');
    try {
      blurCtx.filter=`blur(${radius}px)`;blurCtx.drawImage(base,0,0);blurCtx.filter='none';
      for(const stroke of group)paintStroke(maskCtx,stroke);
      blurCtx.globalCompositeOperation='destination-in';blurCtx.drawImage(mask,0,0);context.drawImage(blurred,0,0);
    }finally{blurred.width=blurred.height=mask.width=mask.height=1;}
  }
}
function drawOverlay(context,item,assets) {
  context.save();
  try {
    context.translate(item.x,item.y);context.rotate(item.rotation*Math.PI/180);
    const {w,h}=overlaySize(context,item,assets);context.globalAlpha=(item.opacity??100)/100;
    if(item.kind==='text')drawText(context,item);
    else if(item.kind==='shape')drawShape(context,item);
    else if(item.kind==='sticker') {
      const asset=assets.get(item.assetId);if(!asset?.img?.complete)throw Error('Un sticker de esta fotografía no está disponible.');
      context.drawImage(asset.img,-w/2,-h/2,w,h);
    }else{context.textAlign='center';context.textBaseline='middle';context.fillText(item.text,0,item.size*.045);}
  }finally{context.restore();}
}
// Stateless rendering allows sequential exports and thumbnails without changing the active editor.
export function renderDocument(target,source,state,assets,{compare=false,skipElementId=null}={}) {
  const context=target.getContext('2d'),v=state.view;
  context.save();
  try {
    context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,target.width,target.height);
    context.setTransform(target.width/v.w,0,0,target.height/v.h,-v.x*target.width/v.w,-v.y*target.height/v.h);
    if(compare){context.drawImage(source,0,0);return;}
    const base=adjustedImage(source,state.adj);
    try {
      context.drawImage(base,0,0);selectiveBlur(context,base,state.strokes);
      for(const item of state.elements)if(item.id!==skipElementId)drawOverlay(context,item,assets);
    }finally{base.width=base.height=1;}
  }finally{context.restore();}
}
