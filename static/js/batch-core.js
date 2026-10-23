// Geometry is independent of preview resolution. Presets contain no image pixels.
export const DEFAULT_MARK = Object.freeze({size:18, margin:3, opacity:65, ax:1, ay:1, x:null, y:null});
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function validateMark(value) {
  if (!value || typeof value !== 'object') throw Error('Ajustes del preset no válidos.');
  const mark = {};
  for (const [key, min, max] of [['size',2,100], ['margin',0,20], ['opacity',0,100], ['ax',0,1], ['ay',0,1]]) {
    if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw Error('Ajustes del preset no válidos.');
    mark[key] = value[key];
  }
  for (const key of ['x', 'y']) {
    if (value[key] !== null && (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1)) throw Error('Posición del preset no válida.');
    mark[key] = value[key];
  }
  return mark;
}

export function markRect(width, height, logoWidth, logoHeight, mark) {
  const side = Math.min(width, height);
  const margin = side * mark.margin / 100;
  const desiredWidth = side * mark.size / 100;
  const scale = Math.min(desiredWidth / logoWidth, (width - 2 * margin) / logoWidth, (height - 2 * margin) / logoHeight);
  const w = logoWidth * scale, h = logoHeight * scale;
  return {
    x: mark.x === null ? margin + (width - w - 2 * margin) * mark.ax : (width - w) * mark.x,
    y: mark.y === null ? margin + (height - h - 2 * margin) * mark.ay : (height - h) * mark.y,
    w, h,
  };
}

export function outputName(original, index, format) {
  const stem = original.replace(/\.[^.]+$/, '').normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100) || 'fotografia';
  return `${String(index + 1).padStart(2, '0')}_${stem}_marca.${format}`;
}
