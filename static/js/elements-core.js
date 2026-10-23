// Shared vector geometry: coordinates are in the original editing image, never CSS pixels.
export const FONT_FAMILIES = Object.freeze(['Inter','Roboto','Montserrat','Oswald','Bebas Neue','Playfair Display','Lora','Caveat']);
export const SHAPES = Object.freeze(['rect','rounded','ellipse','triangle','line','arrow']);
export function textFont(item) {
  const family = FONT_FAMILIES.includes(item.font) ? item.font : 'Inter';
  return `${item.italic ? 'italic ' : ''}${item.bold && family !== 'Bebas Neue' ? 700 : 400} ${item.size}px "${family}"`;
}
export function textLayout(context, item) {
  context.font = textFont(item);
  const lines = item.text.split('\n');
  return {lines, w:Math.max(item.size * .25, ...lines.map(line => context.measureText(line).width)), h:lines.length * item.size * 1.2};
}
export function drawText(context, item) {
  const layout = textLayout(context, item);
  context.fillStyle = item.color; context.textAlign = item.align; context.textBaseline = 'alphabetic';
  const x = item.align === 'left' ? -layout.w / 2 : item.align === 'right' ? layout.w / 2 : 0;
  layout.lines.forEach((line, index) => context.fillText(line, x, -layout.h / 2 + item.size * .95 + index * item.size * 1.2));
}
export function drawShape(context, item) {
  const w = item.width, h = item.height;
  context.beginPath();
  if (item.shape === 'ellipse') context.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (item.shape === 'rounded') context.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * .16);
  else if (item.shape === 'triangle') { context.moveTo(0, -h / 2); context.lineTo(w / 2, h / 2); context.lineTo(-w / 2, h / 2); context.closePath(); }
  else if (item.shape === 'line') { context.moveTo(-w / 2, 0); context.lineTo(w / 2, 0); }
  else if (item.shape === 'arrow') {
    context.moveTo(-w / 2, -h * .18); context.lineTo(w * .12, -h * .18);
    context.lineTo(w * .12, -h / 2); context.lineTo(w / 2, 0); context.lineTo(w * .12, h / 2);
    context.lineTo(w * .12, h * .18); context.lineTo(-w / 2, h * .18); context.closePath();
  } else context.rect(-w / 2, -h / 2, w, h);
  if (item.shape !== 'line' && item.fillOpacity > 0) {
    context.save(); context.globalAlpha *= item.fillOpacity / 100; context.fillStyle = item.fill; context.fill(); context.restore();
  }
  if (item.strokeWidth > 0) {
    context.strokeStyle = item.stroke; context.lineWidth = item.strokeWidth;
    context.lineJoin = 'round'; context.lineCap = 'round'; context.stroke();
  }
}
export function reorderElement(elements, id, direction) {
  const index = elements.findIndex(item => item.id === id);
  if (index < 0) return elements;
  const next = [...elements], [item] = next.splice(index, 1);
  const target = direction === 'front' ? next.length : direction === 'back' ? 0 : Math.max(0, Math.min(next.length, index + (direction === 'up' ? 1 : -1)));
  next.splice(target, 0, item);
  return next;
}

export function resizeHandles(item, box) {
  const directions = item.kind === 'shape'
    ? item.shape === 'line' ? [[-1,0],[1,0]] : [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]]
    : [[-1,-1],[1,-1],[1,1],[-1,1]];
  const angle = item.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  return directions.map(([hx,hy]) => {
    const x = hx * box.w / 2, y = hy * box.h / 2;
    return {hx,hy,x:item.x + x * cos - y * sin,y:item.y + x * sin + y * cos};
  });
}

// Anchor the opposite corner/side. Work in the element's unrotated coordinate system
// so resizing also behaves correctly after crop, output resize or CSS zoom.
export function resizeElement(initial, box, handle, delta, limits, keepRatio = false) {
  const angle = initial.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = delta.x * cos + delta.y * sin, dy = -delta.x * sin + delta.y * cos;
  const {hx,hy} = handle;
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  let w = box.w, h = box.h, size = initial.size;
  if (initial.kind !== 'shape' || (keepRatio && initial.shape !== 'line')) {
    let scale = hx && hy ? (box.w * (box.w + hx * dx) + box.h * (box.h + hy * dy)) / (box.w ** 2 + box.h ** 2)
      : hx ? (box.w + hx * dx) / box.w : (box.h + hy * dy) / box.h;
    const min = initial.kind === 'shape' ? Math.max(limits.minW / box.w,limits.minH / box.h) : limits.minSize / initial.size;
    const max = initial.kind === 'shape' ? Math.min(limits.maxW / box.w,limits.maxH / box.h) : limits.maxSize / initial.size;
    scale = clamp(scale,min,max); w *= scale; h *= scale;
    if (initial.kind !== 'shape') size *= scale;
  } else {
    if (hx) w = clamp(box.w + hx * dx,limits.minW,limits.maxW);
    if (hy) h = clamp(box.h + hy * dy,limits.minH,limits.maxH);
  }
  const shiftX = hx * (w - box.w) / 2, shiftY = hy * (h - box.h) / 2;
  const result = {x:initial.x + shiftX * cos - shiftY * sin,y:initial.y + shiftX * sin + shiftY * cos};
  if (initial.kind === 'shape') { result.width = w; result.height = initial.shape === 'line' ? initial.height : h; }
  else result.size = size;
  return result;
}
