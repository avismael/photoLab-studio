import {DEFAULT_MARK, clamp, markRect, outputName, validateMark} from './batch-core.js';
import {ZipArchive} from './batch-zip.js';

const $ = id => document.getElementById(id);
const canvas = $('batchCanvas'), ctx = canvas.getContext('2d');
const photos = [];
let selected = null, logo = null, settings = {...DEFAULT_MARK}, preview = null;
let busy = false, importing = false, controller = null, previewToken = 0, drag = null;
const PRESET_KEY = 'fotolab.watermarks.v1';
const status = message => { $('batchStatus').textContent = message; };
const error = message => { const li = document.createElement('li'); li.textContent = message; $('batchErrors').append(li); };
const active = () => photos.find(photo => photo.id === selected);
const effective = photo => photo?.custom || settings;
const edited = () => $('editScope').value === 'photo' && active() ? effective(active()) : settings;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function refreshButtons() {
  const locked = busy || importing;
  $('batchSettings').disabled = locked;
  $('photosInput').disabled = locked;
  $('removePhoto').disabled = locked || !active();
  $('clearPhotos').disabled = locked || !photos.length;
  $('exportBatch').disabled = locked || !photos.length || !logo;
  $('resetPhoto').disabled = locked || !active()?.custom;
  $('applyAll').disabled = locked || !active();
  $('photoCount').textContent = `${photos.length} / 50 fotos`;
  $('batchDrop').setAttribute('aria-busy', String(locked));
}

function syncControls() {
  const mark = edited();
  $('anchor').value = `${mark.ax},${mark.ay}`;
  for (const [id, key] of [['markSize','size'], ['markMargin','margin'], ['markOpacity','opacity']]) {
    $(id).value = mark[key]; $(id + 'Value').textContent = `${mark[key]} %`;
    $(id).style.setProperty('--pct', `${100 * (mark[key] - Number($(id).min)) / (Number($(id).max) - Number($(id).min))}%`);
  }
  $('scopeHint').textContent = $('editScope').value === 'photo'
    ? 'Tus cambios solo afectan a esta fotografía.' : 'Los cambios generales conservan las fotos personalizadas.';
  refreshButtons();
}

function updateTiles() {
  for (const photo of photos) {
    photo.tile.setAttribute('aria-pressed', String(photo.id === selected));
    photo.badge.textContent = photo.custom ? 'Personalizada' : 'Ajustes del lote';
    const context = photo.display.getContext('2d');
    context.clearRect(0, 0, photo.display.width, photo.display.height);
    context.drawImage(photo.thumbnail, 0, 0);
    if (logo) {
      const mark = effective(photo), rect = markRect(photo.display.width, photo.display.height, logo.width, logo.height, mark);
      context.save(); context.globalAlpha = mark.opacity / 100;
      context.drawImage(logo.image, rect.x, rect.y, rect.w, rect.h); context.restore();
    }
  }
  const photo = active();
  $('selectedName').textContent = photo?.file.name || 'Sin fotografía seleccionada';
  $('selectedDetails').textContent = photo ? `${photo.width} × ${photo.height} px · ${photo.width > photo.height ? 'Horizontal' : photo.width < photo.height ? 'Vertical' : 'Cuadrada'}${photo.custom ? ' · Personalizada' : ''}` : 'Añade fotografías para comenzar.';
  refreshButtons();
}

function render() {
  if (!preview) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
  if (logo) {
    const mark = effective(active());
    const rect = markRect(canvas.width, canvas.height, logo.width, logo.height, mark);
    ctx.save(); ctx.globalAlpha = mark.opacity / 100;
    ctx.drawImage(logo.image, rect.x, rect.y, rect.w, rect.h); ctx.restore();
  }
}

async function decode(file, maxBytes = 42 * 1024 * 1024) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || !file.size || file.size > maxBytes) throw Error('Usa JPG, PNG o WebP dentro del límite de tamaño.');
  const image = await createImageBitmap(file, {imageOrientation:'from-image'});
  if (!image.width || !image.height || image.width * image.height > 35_000_000) {
    image.close(); throw Error('La imagen supera 35 millones de píxeles.');
  }
  return image;
}

async function selectPhoto(id) {
  if (busy || importing) return;
  selected = id; const token = ++previewToken;
  preview?.close(); preview = null;
  const photo = active();
  updateTiles(); syncControls();
  canvas.classList.add('hidden'); $('batchEmpty').classList.toggle('hidden', !!photo);
  if (!photo) return;
  try {
    const source = await decode(photo.file);
    try {
      const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
      const small = await createImageBitmap(source, {resizeWidth:Math.max(1, Math.round(source.width * scale)), resizeHeight:Math.max(1, Math.round(source.height * scale)), resizeQuality:'high'});
      if (token !== previewToken) { small.close(); return; }
      preview = small; canvas.width = small.width; canvas.height = small.height;
      canvas.classList.remove('hidden'); render();
    } finally { source.close(); }
  } catch (err) { if (token === previewToken) status(`No se pudo abrir la vista previa: ${err.message}`); }
}

async function importPhotos(files) {
  if (busy || importing) return;
  const candidates = Array.from(files), room = 50 - photos.length;
  if (candidates.length > room) status(`Máximo 50 fotografías. Se intentarán añadir ${room}.`);
  importing = true; refreshButtons();
  let added = 0;
  try {
    for (const file of candidates.slice(0, room)) {
      status(`Cargando fotografía ${added + 1}…`);
      let image;
      try {
        image = await decode(file);
        const thumb = document.createElement('canvas');
        const scale = Math.min(1, 240 / Math.max(image.width, image.height));
        thumb.width = Math.max(1, Math.round(image.width * scale)); thumb.height = Math.max(1, Math.round(image.height * scale));
        thumb.getContext('2d').drawImage(image, 0, 0, thumb.width, thumb.height);
        const tile = document.createElement('button');
        tile.type = 'button'; tile.className = 'batch-tile';
        const display = document.createElement('canvas'); display.width = thumb.width; display.height = thumb.height; display.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span'); label.textContent = file.name; tile.title = file.name;
        const badge = document.createElement('small');
        tile.append(display, label, badge);
        const photo = {id:crypto.randomUUID(), file, width:image.width, height:image.height, custom:null, thumbnail:thumb, display, tile, badge};
        tile.addEventListener('click', () => selectPhoto(photo.id));
        photos.push(photo); $('photoList').append(tile); added++;
      } catch (err) { error(`${file.name}: ${err.message}`); }
      finally { image?.close(); }
      await tick();
    }
  } finally { importing = false; refreshButtons(); }
  status(`${added} fotografías añadidas. ${photos.length} en el lote.${candidates.length > room ? ' Se alcanzó el límite; los archivos restantes no se añadieron.' : ''}`);
  if (!selected && photos.length) await selectPhoto(photos[0].id);
  else updateTiles();
}

function toBlob(surface, type = 'image/png', quality) {
  return new Promise((resolve, reject) => surface.toBlob(blob => blob ? resolve(blob) : reject(Error('No se pudo codificar la imagen.')), type, quality));
}

async function prepareLogo(file) {
  const image = await decode(file, 10 * 1024 * 1024);
  try {
    // Bound persistent logos and strip their metadata without sacrificing normal logo resolution.
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
    const surface = document.createElement('canvas');
    surface.width = Math.max(1, Math.round(image.width * scale)); surface.height = Math.max(1, Math.round(image.height * scale));
    surface.getContext('2d').drawImage(image, 0, 0, surface.width, surface.height);
    const source = surface.toDataURL('image/png');
    const clean = await createImageBitmap(await toBlob(surface));
    return {image:clean, width:surface.width, height:surface.height, source, name:file.name};
  } finally { image.close(); }
}

function installLogo(next) {
  logo?.image.close(); logo = next;
  $('logoPreview').src = logo.source; $('logoPreview').classList.remove('hidden');
  $('logoName').textContent = logo.name; updateTiles(); render();
}

function changeSettings(patch) {
  if (busy || importing) return;
  if ($('editScope').value === 'photo') {
    const photo = active(); if (!photo) return status('Selecciona una fotografía primero.');
    photo.custom = {...effective(photo), ...patch};
  } else settings = {...settings, ...patch};
  updateTiles(); syncControls(); render();
}

function positionFromEvent(event) {
  const bounds = canvas.getBoundingClientRect();
  return {x:(event.clientX - bounds.left) * canvas.width / bounds.width, y:(event.clientY - bounds.top) * canvas.height / bounds.height};
}

canvas.addEventListener('pointerdown', event => {
  if (busy || importing || !logo || !preview || !active() || event.button !== 0) return;
  const point = positionFromEvent(event), rect = markRect(canvas.width, canvas.height, logo.width, logo.height, effective(active()));
  if (point.x < rect.x || point.y < rect.y || point.x > rect.x + rect.w || point.y > rect.y + rect.h) return;
  $('editScope').value = 'photo'; syncControls();
  drag = {id:event.pointerId, dx:point.x - rect.x, dy:point.y - rect.y};
  canvas.setPointerCapture(event.pointerId); canvas.focus();
});
canvas.addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId || busy || importing) return;
  const point = positionFromEvent(event), rect = markRect(canvas.width, canvas.height, logo.width, logo.height, edited());
  changeSettings({x:clamp((point.x - drag.dx) / Math.max(1, canvas.width - rect.w), 0, 1), y:clamp((point.y - drag.dy) / Math.max(1, canvas.height - rect.h), 0, 1)});
});
for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name, () => { drag = null; });
canvas.addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) || !logo || !preview || busy || importing) return;
  event.preventDefault(); $('editScope').value = 'photo';
  const rect = markRect(canvas.width, canvas.height, logo.width, logo.height, effective(active()));
  const step = event.shiftKey ? .05 : .005;
  changeSettings({x:clamp(rect.x / Math.max(1, canvas.width - rect.w) + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), 0, 1), y:clamp(rect.y / Math.max(1, canvas.height - rect.h) + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0), 0, 1)});
});

function readPresets() {
  const stored = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]');
  if (!Array.isArray(stored)) throw Error('Biblioteca de presets no válida.');
  return stored;
}
function refreshPresets() {
  $('presetSelect').replaceChildren(new Option('Selecciona un preset', ''));
  try { for (const preset of readPresets()) $('presetSelect').add(new Option(preset.name, preset.id)); }
  catch { status('No se pudo acceder a los presets locales. Puedes seguir trabajando sin guardarlos.'); }
}
$('savePreset').addEventListener('click', () => {
  if (!logo) return status('Carga un logo para guardar el preset.');
  const name = $('presetName').value.trim();
  if (!name) return status('Escribe un nombre para el preset.');
  try {
    const presets = readPresets(), existing = presets.find(item => item.name === name);
    const preset = {id:existing?.id || crypto.randomUUID(), name, mark:{...edited()}, logo:logo.source, logoName:logo.name};
    if (existing) presets.splice(presets.indexOf(existing), 1, preset); else presets.push(preset);
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); refreshPresets(); $('presetSelect').value = preset.id;
    status('Preset guardado en este navegador. Un preset con el mismo nombre se reemplaza.');
  } catch { status('No se pudo guardar: el almacenamiento local está lleno o no está disponible. El lote sigue intacto.'); }
});
$('loadPreset').addEventListener('click', async () => {
  importing = true; refreshButtons();
  try {
    const preset = readPresets().find(item => item.id === $('presetSelect').value);
    if (!preset) throw Error('Selecciona un preset.');
    const mark = validateMark(preset.mark);
    if (typeof preset.logo !== 'string' || !preset.logo.startsWith('data:image/png;base64,') || preset.logo.length > 14 * 1024 * 1024) throw Error('Logo del preset no válido.');
    const bytes = Uint8Array.from(atob(preset.logo.split(',')[1]), char => char.charCodeAt(0));
    const blob = new Blob([bytes], {type:'image/png'});
    const next = await prepareLogo(new File([blob], preset.logoName || 'logo.png', {type:'image/png'}));
    settings = mark; installLogo(next); $('editScope').value = 'all';
    status('Preset aplicado al lote. Se conservan las posiciones personalizadas.');
  } catch (err) { status(err.message); }
  finally { importing = false; updateTiles(); syncControls(); render(); }
});
$('deletePreset').addEventListener('click', () => {
  try {
    const id = $('presetSelect').value; if (!id) return status('Selecciona un preset.');
    localStorage.setItem(PRESET_KEY, JSON.stringify(readPresets().filter(item => item.id !== id)));
    refreshPresets(); status('Preset eliminado.');
  } catch { status('No fue posible eliminar el preset.'); }
});

async function exportBatch() {
  if (busy || importing || !logo || !photos.length) return;
  busy = true; drag = null; controller = new AbortController();
  const signal = controller.signal, archive = new ZipArchive(), format = $('batchFormat').value;
  $('batchErrors').replaceChildren(); $('batchProgress').max = photos.length; $('batchProgress').value = 0;
  $('cancelBatch').classList.remove('hidden'); refreshButtons();
  let completed = 0, failed = 0;
  try {
    for (let index = 0; index < photos.length; index++) {
      signal.throwIfAborted();
      const photo = photos[index]; let source, surface;
      status(`Procesando ${index + 1} de ${photos.length}: ${photo.file.name}`);
      try {
        source = await decode(photo.file); signal.throwIfAborted();
        surface = document.createElement('canvas'); surface.width = source.width; surface.height = source.height;
        const context = surface.getContext('2d'); context.drawImage(source, 0, 0);
        const mark = effective(photo), rect = markRect(source.width, source.height, logo.width, logo.height, mark);
        context.globalAlpha = mark.opacity / 100; context.drawImage(logo.image, rect.x, rect.y, rect.w, rect.h);
        context.globalAlpha = 1;
        // Lossless transport; only the final backend conversion uses lossy encoding.
        const blob = await toBlob(surface); signal.throwIfAborted();
        if (blob.size > 42 * 1024 * 1024) throw Error('El resultado supera 42 MB y no puede enviarse a la API.');
        const form = new FormData(); form.append('image', blob, 'marca.png'); form.append('format', format);
        const response = await fetch('/api/export', {method:'POST', body:form, signal});
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw Error(data.error || `Error de exportación (${response.status}).`);
        }
        await archive.add(outputName(photo.file.name, index, format), await response.blob(), signal); completed++;
      } catch (err) {
        if (signal.aborted) throw err;
        failed++; error(`${photo.file.name}: ${err.message}`);
        if (err.message.includes('512 MB')) throw err;
      } finally { source?.close(); if (surface) surface.width = surface.height = 1; }
      $('batchProgress').value = index + 1;
      await tick();
    }
    signal.throwIfAborted();
    if (completed) {
      const url = URL.createObjectURL(archive.finish()), link = document.createElement('a');
      link.href = url; link.download = 'fotolab-marcas.zip'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    status(completed ? `ZIP listo: ${completed} fotografías exportadas${failed ? `; ${failed} con errores (consulta los detalles)` : ''}.` : 'No se exportaron fotografías. Consulta los errores e inténtalo de nuevo.');
  } catch (err) {
    status(signal.aborted ? 'Proceso cancelado. No se descargó un ZIP parcial; tus fotos y ajustes se conservan.' : `Proceso detenido: ${err.message} No se descargó el ZIP; divide el lote e inténtalo de nuevo.`);
  } finally { busy = false; controller = null; $('cancelBatch').classList.add('hidden'); refreshButtons(); }
}

$('photosInput').addEventListener('change', async event => { const files = Array.from(event.target.files); event.target.value = ''; await importPhotos(files); });
$('logoInput').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file || busy || importing) return;
  importing = true; refreshButtons();
  try { installLogo(await prepareLogo(file)); status('Logo listo. Ajusta su posición o aplica un preset.'); }
  catch (err) { status(`No se pudo cargar el logo: ${err.message}`); }
  finally { importing = false; refreshButtons(); }
});
for (const [id, key] of [['markSize','size'], ['markMargin','margin'], ['markOpacity','opacity']]) $(id).addEventListener('input', () => changeSettings({[key]:Number($(id).value), ...(key === 'margin' ? {x:null, y:null} : {})}));
$('anchor').addEventListener('change', () => { const [ax, ay] = $('anchor').value.split(',').map(Number); changeSettings({ax, ay, x:null, y:null}); });
$('editScope').addEventListener('change', syncControls);
$('applyAll').addEventListener('click', () => {
  settings = {...edited()};
  if ($('editScope').value === 'photo' && active()) active().custom = null;
  $('editScope').value = 'all'; updateTiles(); syncControls(); render();
  status('Ajustes aplicados al lote. Se conservan las excepciones de otras fotografías.');
});
$('resetPhoto').addEventListener('click', () => { if (active()) active().custom = null; updateTiles(); syncControls(); render(); });
$('removePhoto').addEventListener('click', () => {
  if (busy || importing) return;
  const index = photos.findIndex(photo => photo.id === selected); if (index < 0) return;
  const [photo] = photos.splice(index, 1); photo.thumbnail.width = photo.thumbnail.height = 1; photo.tile.remove();
  selectPhoto(photos[Math.min(index, photos.length - 1)]?.id || null);
});
$('clearPhotos').addEventListener('click', () => {
  if (busy || importing || !window.confirm('¿Quitar todas las fotografías del lote?')) return;
  for (const photo of photos) photo.thumbnail.width = photo.thumbnail.height = 1;
  photos.length = 0; $('photoList').replaceChildren(); selectPhoto(null); status('Lote vacío. El logo y tus presets se conservan.');
});
for (const name of ['dragenter','dragover']) $('batchDrop').addEventListener(name, event => { event.preventDefault(); if (!busy && !importing) $('batchDrop').classList.add('drag-over'); });
$('batchDrop').addEventListener('dragleave', () => $('batchDrop').classList.remove('drag-over'));
$('batchDrop').addEventListener('drop', event => { event.preventDefault(); $('batchDrop').classList.remove('drag-over'); importPhotos(event.dataTransfer.files); });
// Prevent dropped files outside the stage from navigating away from the batch.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
$('exportBatch').addEventListener('click', exportBatch);
$('cancelBatch').addEventListener('click', () => { controller?.abort(); status('Cancelando…'); });
window.addEventListener('beforeunload', event => { if (photos.length || busy) { event.preventDefault(); event.returnValue = ''; } });
refreshPresets(); syncControls();
