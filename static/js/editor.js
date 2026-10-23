/* FotoLab Studio · Editor de imágenes sin dependencias JavaScript externas. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('photoCanvas');
  const ctx = canvas.getContext('2d');
  const stage = $('stage');
  const holder = $('canvasHolder');
  const EMPTY_ADJ = Object.freeze({brightness: 100, contrast: 100, saturation: 100, warmth: 0, hue: 0, softness: 0});
  const PRESETS = {
    original: {...EMPTY_ADJ},
    vibrante: {brightness: 105, contrast: 112, saturation: 145, warmth: 5, hue: 0, softness: 0},
    calido: {brightness: 109, contrast: 105, saturation: 117, warmth: 36, hue: -5, softness: 0},
    frio: {brightness: 102, contrast: 107, saturation: 103, warmth: -37, hue: 5, softness: 0},
    bn: {brightness: 103, contrast: 115, saturation: 0, warmth: 0, hue: 0, softness: 0},
  };
  const EMOJIS = ['😀','😍','🥰','😎','🥳','🤩','😂','😊','😇','😮','😭','😱','😴','🤔','🥹','❤️','💖','💜','💙','💚','✨','🌟','🔥','🎉','🎈','🎓','👑','💯','👍','👏','🙌','💐','🌸','🌈','☀️','🌻','🦋','🐱','🐶','🍀'];
  const state = {
    loaded: false, name: '', width: 0, height: 0,
    adj: {...EMPTY_ADJ}, strokes: [], emojis: [],
    view: {x:0,y:0,w:0,h:0,outW:0,outH:0}, cropDraft: null, cropRatio: 'free',
    tool: 'adjust', selectedEmoji: null,
    brushSize: 64, blurStrength: 18, zoom: 100, comparing: false,
  };
  let sourceCanvas = document.createElement('canvas');
  let renderRequest = 0;
  let pointerAction = null;
  let history = [], historyIndex = -1;
  let toastTimer = 0;
  let nextEmojiId = 0;
  let nextStickerId = 0;
  const stickerAssets = new Map();
  let originalFile = null;

  function toast(message, error = false) {
    const element = $('toast');
    element.textContent = message;
    element.classList.toggle('error', error);
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), 3100);
  }
  function setStatus(message) { $('statusText').textContent = message; }
  function snapshot() {
    return JSON.stringify({adj: state.adj, strokes: state.strokes, emojis: state.emojis, view: state.view});
  }
  function pushHistory() {
    if (!state.loaded) return;
    const snap = snapshot();
    if (history[historyIndex] === snap) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snap);
    if (history.length > 45) history.shift();
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }
  function restoreHistory(index) {
    if (index < 0 || index >= history.length) return;
    const data = JSON.parse(history[index]);
    state.adj = data.adj; state.strokes = data.strokes; state.emojis = data.emojis;
    state.view = data.view; updateViewDimensions();
    historyIndex = index;
    if (!state.emojis.some(e => e.id === state.selectedEmoji)) state.selectedEmoji = null;
    syncAdjustControls(); syncEmojiControls(); syncResizeControls(); resetCropDraft(); updateHistoryButtons(); scheduleRender();
  }
  function updateHistoryButtons() {
    $('undoBtn').disabled = historyIndex <= 0;
    $('redoBtn').disabled = historyIndex >= history.length - 1;
  }
  function updateRangeAppearance(input) {
    const min = Number(input.min), max = Number(input.max), value = Number(input.value);
    input.style.setProperty('--pct', (100 * (value - min) / (max - min)).toFixed(2) + '%');
  }
  function rangeOutput(key, value) {
    const units = {brightness:'%', contrast:'%', saturation:'%', warmth:'', hue:'°', softness:' px'};
    $(key + 'Value').textContent = String(value) + units[key];
  }
  function syncAdjustControls() {
    for (const [name, value] of Object.entries(state.adj)) {
      const input = $(name); input.value = value;
      updateRangeAppearance(input); rangeOutput(name, value);
    }
    let active = 'custom';
    for (const [name, adj] of Object.entries(PRESETS)) {
      if (Object.keys(adj).every(key => adj[key] === state.adj[key])) { active = name; break; }
    }
    document.querySelectorAll('.preset').forEach(b => b.classList.toggle('active', b.dataset.preset === active));
  }
  function selectedEmoji() { return state.emojis.find(e => e.id === state.selectedEmoji); }
  function syncEmojiControls() {
    const item = selectedEmoji();
    $('emojiOptions').classList.toggle('hidden', !item);
    $('emojiEmptyTip').classList.toggle('hidden', !!item);
    if (item) {
      $('overlaySelectedTitle').textContent = item.kind === 'sticker' ? 'Sticker seleccionado' : 'Emoji seleccionado';
      $('emojiSize').value = item.size; $('emojiRotation').value = item.rotation;
      $('emojiSizeValue').textContent = `${item.size} px`;
      $('emojiRotationValue').textContent = `${item.rotation}°`;
      updateRangeAppearance($('emojiSize'));updateRangeAppearance($('emojiRotation'));
    }
  }
  function setTool(tool) {
    state.tool = tool;
    document.querySelectorAll('[data-tool]').forEach(el => el.classList.toggle('active', el.dataset.tool === tool));
    for (const name of ['adjust','crop','resize','blur','emoji','privacy']) $(name+'Panel').classList.toggle('active', name === (tool === 'select' ? 'emoji' : tool));
    const headings = {adjust:'Ajustes de imagen',crop:'Recortar fotografía',resize:'Cambiar dimensiones',blur:'Pincel de desenfoque',emoji:'Emojis y stickers',select:'Seleccionar y mover',privacy:'Privacidad y metadatos'};
    $('inspectorHeading').textContent = headings[tool];
    holder.classList.toggle('blur-mode', tool === 'blur');
    canvas.classList.toggle('is-blur', tool === 'blur');
    canvas.classList.toggle('is-move', tool === 'select');
    canvas.classList.toggle('is-crop', tool === 'crop');
    if (tool === 'crop' && state.loaded && !state.cropDraft) resetCropDraft();
    if (tool === 'resize') syncResizeControls();
    $('brushCursor').classList.add('hidden');
    if (tool === 'blur') setStatus('Pinta sobre la fotografía para desenfocar las zonas elegidas.');
    else if (tool === 'crop') setStatus('Delimita el área que deseas conservar y pulsa Aplicar recorte.');
    else if (tool === 'resize') setStatus('Configura el ancho y alto de la fotografía.');
    else if (tool === 'privacy') setStatus('Las exportaciones se guardan sin metadatos de ubicación.');
    else if (tool === 'select') setStatus('Toca o arrastra un emoji o sticker para moverlo.');
    else if (tool === 'emoji') setStatus('Elige un emoji o añade tu propia imagen como sticker.');
    else setStatus(state.loaded ? 'Desliza los controles de color para personalizar la imagen.' : 'Listo para empezar. Tu creatividad no tiene límites.');
    scheduleRender();
  }

  function cloneLayer(sourceSize = false) {
    const layer = document.createElement('canvas');
    layer.width = sourceSize ? sourceCanvas.width : state.width; layer.height = sourceSize ? sourceCanvas.height : state.height;
    return layer;
  }
  function applyAdjustments() {
    const base = cloneLayer(true), bctx = base.getContext('2d');
    const a = state.adj;
    bctx.filter = `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%) hue-rotate(${a.hue}deg) blur(${a.softness}px)`;
    bctx.drawImage(sourceCanvas, 0, 0);
    bctx.filter = 'none';
    if (a.warmth !== 0) {
      const alpha = (Math.abs(a.warmth) / 100 * .34).toFixed(3);
      bctx.globalCompositeOperation = 'soft-light';
      bctx.fillStyle = a.warmth > 0 ? `rgba(255,143,62,${alpha})` : `rgba(70,159,255,${alpha})`;
      bctx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
      bctx.globalCompositeOperation = 'source-over';
    }
    return base;
  }
  function paintStroke(maskCtx, stroke) {
    const points = stroke.points;
    if (!points.length) return;
    maskCtx.strokeStyle = '#fff'; maskCtx.fillStyle = '#fff';
    maskCtx.lineCap = 'round'; maskCtx.lineJoin = 'round'; maskCtx.lineWidth = stroke.size;
    if (points.length === 1) {
      maskCtx.beginPath(); maskCtx.arc(points[0][0], points[0][1], stroke.size / 2, 0, Math.PI*2); maskCtx.fill();
    } else {
      maskCtx.beginPath(); maskCtx.moveTo(points[0][0],points[0][1]);
      for (let i=1; i<points.length; i++) maskCtx.lineTo(points[i][0],points[i][1]);
      maskCtx.stroke();
    }
  }
  function paintSelectiveBlur(outCtx, base) {
    if (!state.strokes.length) return;
    // Group strokes by blur amount so a single blurred image is used per intensity.
    const groups = new Map();
    for (const stroke of state.strokes) {
      if (!groups.has(stroke.blur)) groups.set(stroke.blur, []);
      groups.get(stroke.blur).push(stroke);
    }
    for (const [radius, strokes] of groups) {
      const blurred = cloneLayer(true), blurCtx = blurred.getContext('2d');
      blurCtx.filter = `blur(${radius}px)`;
      blurCtx.drawImage(base, 0, 0);
      blurCtx.filter = 'none';
      const mask = cloneLayer(true), maskCtx = mask.getContext('2d');
      for (const stroke of strokes) paintStroke(maskCtx, stroke);
      const layer = cloneLayer(true), layerCtx = layer.getContext('2d');
      layerCtx.drawImage(blurred, 0, 0);
      layerCtx.globalCompositeOperation = 'destination-in';
      layerCtx.drawImage(mask, 0, 0);
      layerCtx.globalCompositeOperation = 'source-over';
      outCtx.drawImage(layer, 0, 0);
    }
  }
  function overlaySize(outCtx, item) {
    if (item.kind === 'sticker') {
      const asset = stickerAssets.get(item.assetId);
      if (!asset) return {w:item.size,h:item.size};
      const scale = item.size / Math.max(asset.width, asset.height);
      return {w:asset.width * scale,h:asset.height * scale};
    }
    outCtx.font = `${item.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    return {w:Math.max(item.size*.7,outCtx.measureText(item.text).width),h:item.size};
  }
  function drawOverlay(outCtx, item, highlighted) {
    outCtx.save();outCtx.translate(item.x,item.y);outCtx.rotate(item.rotation*Math.PI/180);
    const {w,h} = overlaySize(outCtx,item);
    if (item.kind === 'sticker') {
      const asset = stickerAssets.get(item.assetId);
      if (asset?.img?.complete) outCtx.drawImage(asset.img,-w/2,-h/2,w,h);
    } else {
      outCtx.textAlign='center';outCtx.textBaseline='middle';
      outCtx.fillText(item.text,0,item.size*.045);
    }
    if (highlighted) {
      outCtx.setLineDash([Math.max(5,item.size*.08),Math.max(4,item.size*.05)]);
      outCtx.strokeStyle='#faf7ff';outCtx.lineWidth=Math.max(1.5,sourceCanvas.width/1100);
      outCtx.strokeRect(-w/2-7,-h/2-7,w+14,h+14);
      outCtx.setLineDash([]);outCtx.fillStyle='#ad93ff';outCtx.beginPath();
      outCtx.arc(w/2+7,h/2+7,Math.max(5,item.size*.075),0,Math.PI*2);outCtx.fill();
    }
    outCtx.restore();
  }
  function drawCropGuides(renderCtx) {
    if (!state.cropDraft || state.comparing) return;
    const {x,y,w,h}=state.cropDraft;
    renderCtx.save();renderCtx.fillStyle='rgba(5,9,21,.66)';
    renderCtx.fillRect(0,0,state.width,y);renderCtx.fillRect(0,y,x,h);
    renderCtx.fillRect(x+w,y,state.width-x-w,h);
    renderCtx.fillRect(0,y+h,state.width,state.height-y-h);
    renderCtx.strokeStyle='#fff';renderCtx.lineWidth=Math.max(1.3,state.width/1400);
    renderCtx.setLineDash([9,5]);renderCtx.strokeRect(x,y,w,h);renderCtx.setLineDash([]);
    renderCtx.strokeStyle='rgba(255,255,255,.50)';renderCtx.lineWidth=1;
    for(let i=1;i<3;i++) {
      renderCtx.beginPath();renderCtx.moveTo(x+w*i/3,y);renderCtx.lineTo(x+w*i/3,y+h);renderCtx.stroke();
      renderCtx.beginPath();renderCtx.moveTo(x,y+h*i/3);renderCtx.lineTo(x+w,y+h*i/3);renderCtx.stroke();
    }
    const side=Math.max(7,Math.min(17,state.width/150));
    for(const [hx,hy] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]) {
      renderCtx.fillStyle='#e9e2ff';renderCtx.fillRect(hx-side/2,hy-side/2,side,side);
      renderCtx.strokeStyle='#453370';renderCtx.strokeRect(hx-side/2,hy-side/2,side,side);
    }
    renderCtx.restore();
  }
  function drawAll(target, showSelection=true) {
    if (!state.loaded) return;
    const renderCtx=target.getContext('2d');
    renderCtx.setTransform(1,0,0,1,0,0);
    renderCtx.clearRect(0,0,state.width,state.height);
    const v=state.view;
    const sx=state.width/v.w, sy=state.height/v.h;
    renderCtx.setTransform(sx,0,0,sy,-v.x*sx,-v.y*sy);
    if (state.comparing && showSelection) renderCtx.drawImage(sourceCanvas,0,0);
    else {
      const base=applyAdjustments();
      renderCtx.drawImage(base,0,0);
      paintSelectiveBlur(renderCtx,base);
      for(const item of state.emojis) drawOverlay(renderCtx,item,showSelection && state.selectedEmoji===item.id && state.tool!=='blur' && state.tool!=='crop');
    }
    renderCtx.setTransform(1,0,0,1,0,0);
    if (showSelection && state.tool==='crop') drawCropGuides(renderCtx);
  }
  function scheduleRender() {
    if (!state.loaded || renderRequest) return;
    renderRequest = requestAnimationFrame(() => {
      renderRequest = 0;
      try { drawAll(canvas); }
      catch(err) { console.error('FotoLab render:', err);toast('No se pudo actualizar la vista.',true); }
    });
  }
  function fitCanvas() {
    if (!state.loaded) return;
    const availableW = Math.max(150,stage.clientWidth-65);
    const availableH = Math.max(150,stage.clientHeight-65);
    const fit = Math.min(availableW/state.width,availableH/state.height);
    const visualScale = fit * (state.zoom/100);
    const shownWidth = Math.round(state.width*visualScale), shownHeight = Math.round(state.height*visualScale);
    canvas.style.width = shownWidth+'px';canvas.style.height = shownHeight+'px';
    $('zoomLabel').textContent = `${state.zoom}%`;
  }
  function updateBrushDemo() {
    $('brushDemo').firstElementChild.style.width = `${Math.max(14,Math.min(68,state.brushSize*.30))}px`;
    $('brushDemo').firstElementChild.style.height = `${Math.max(14,Math.min(68,state.brushSize*.30))}px`;
    $('brushDemo').firstElementChild.style.filter = `blur(${Math.round(state.blurStrength/7)}px)`;
  }
  function updateBrushCursor(event) {
    if (state.tool !== 'blur' || !state.loaded) return;
    const rect = canvas.getBoundingClientRect();
    const holderRect = holder.getBoundingClientRect();
    const cursor = $('brushCursor');
    cursor.style.left = `${event.clientX-holderRect.left}px`;
    cursor.style.top = `${event.clientY-holderRect.top}px`;
    const d = state.brushSize * rect.width / state.view.w;
    cursor.style.width = `${d}px`; cursor.style.height = `${d}px`;
    cursor.classList.toggle('hidden', event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  }
  function screenPoint(event) {
    const rect=canvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(state.width,(event.clientX-rect.left)*state.width/rect.width)),
      y:Math.max(0,Math.min(state.height,(event.clientY-rect.top)*state.height/rect.height))};
  }
  function canvasPoint(event) {
    const p=screenPoint(event),v=state.view;
    return {x:v.x+p.x*v.w/state.width,y:v.y+p.y*v.h/state.height};
  }
  function emojiAt(point) {
    for (let i=state.emojis.length-1;i>=0;i--) {
      const e = state.emojis[i], angle=-e.rotation*Math.PI/180;
      const dx=point.x-e.x,dy=point.y-e.y;
      const lx=dx*Math.cos(angle)-dy*Math.sin(angle);
      const ly=dx*Math.sin(angle)+dy*Math.cos(angle);
      const {w,h}=overlaySize(ctx,e);
      if (Math.abs(lx)<w/2+12 && Math.abs(ly)<h/2+12) return e;
    }
    return null;
  }
  function enableEditor() {
    ['exportBtn','compareBtn','zoomOutBtn','zoomInBtn','zoomLabel','fitBtn'].forEach(id => $(id).disabled = false);
    $('emptyState').classList.add('hidden');holder.classList.remove('hidden');
    canvas.width = state.width;canvas.height = state.height;
    fitCanvas();syncAdjustControls();syncResizeControls();updateHistoryButtons();syncEmojiControls();scheduleRender();
  }
  async function importPhoto(file) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return toast('Usa una imagen JPG, PNG o WebP.',true);
    if (file.size > 30*1024*1024) return toast('La fotografía no puede superar 30 MB.',true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      img.src=url;
      await img.decode();
      const originalW = img.naturalWidth, originalH=img.naturalHeight;
      if (!originalW||!originalH) throw Error('La imagen no tiene dimensiones válidas.');
      const ratio = Math.min(1,4200/Math.max(originalW,originalH));
      const w = Math.max(1,Math.round(originalW*ratio));
      const h = Math.max(1,Math.round(originalH*ratio));
      if (w*h>35_000_000) throw Error('La imagen tiene demasiados píxeles.');
      const temp = document.createElement('canvas');temp.width=w;temp.height=h;
      temp.getContext('2d').drawImage(img,0,0,w,h);
      sourceCanvas = temp;
      state.loaded = true;state.name=file.name;originalFile=file;
      state.view={x:0,y:0,w,h,outW:w,outH:h};updateViewDimensions();
      state.adj={...EMPTY_ADJ};state.strokes=[];state.emojis=[];state.selectedEmoji=null;
      state.zoom=100;state.comparing=false;state.cropRatio='free';history=[];historyIndex=-1;resetCropDraft();
      $('fileTitle').textContent=file.name;
      updateDimensionLabel();
      if(ratio<1) setStatus('Original optimizado para la edición (máximo 4200 px).');
      enableEditor();pushHistory();setTool('adjust');
      toast('Fotografía cargada. ¡Hora de crear!');
    } catch(error) {
      console.error('Import error:',error);toast('No se pudo abrir la imagen. Comprueba el archivo.',true);
    } finally {URL.revokeObjectURL(url);$('fileInput').value='';}
  }

  function addEmoji(symbol) {
    if (!state.loaded) return toast('Abre una fotografía antes de insertar emojis.',true);
    nextEmojiId++;
    const item = {id:nextEmojiId,kind:'emoji',text:symbol,x:state.view.x+state.view.w/2,y:state.view.y+state.view.h/2,size:Math.max(65,Math.round(state.view.w*.095)),rotation:0};
    item.size=Math.min(350,item.size);
    state.emojis.push(item);state.selectedEmoji=item.id;
    setTool('emoji');syncEmojiControls();pushHistory();scheduleRender();
    toast('Emoji añadido. Puedes moverlo con el cursor.');
  }
  function deleteEmoji() {
    if (!selectedEmoji()) return;
    state.emojis=state.emojis.filter(e => e.id!==state.selectedEmoji);
    state.selectedEmoji=null;syncEmojiControls();pushHistory();scheduleRender();toast('Emoji eliminado.');
  }

  // --- Geometría reversible: todos los elementos se conservan en coordenadas de la fuente. ---
  function updateViewDimensions() {
    state.width=state.view.outW;state.height=state.view.outH;
    canvas.width=state.width;canvas.height=state.height;
    if(state.loaded) {fitCanvas();updateDimensionLabel();}
  }
  function updateDimensionLabel() {
    $('fileDimensions').textContent=`${state.width.toLocaleString('es')} × ${state.height.toLocaleString('es')} px`;
  }
  function syncResizeControls() {
    if(!state.loaded)return;
    $('resizeWidth').value=state.width;$('resizeHeight').value=state.height;
    $('sizeReadout').textContent=`Tamaño actual: ${state.width.toLocaleString('es')} × ${state.height.toLocaleString('es')} px`;
  }
  function resetCropDraft() {
    if(!state.loaded)return;
    const ratio=cropNumberRatio();const limitW=state.width*.84,limitH=state.height*.84;
    let w=limitW,h=limitH;
    if(ratio) {w=Math.min(limitW,limitH*ratio);h=w/ratio;}
    state.cropDraft={x:(state.width-w)/2,y:(state.height-h)/2,w,h};updateCropReadout();scheduleRender();
  }
  function cropNumberRatio() {
    if(state.cropRatio==='free')return 0;
    if(state.cropRatio==='original')return state.width/state.height;
    return Number(state.cropRatio);
  }
  function updateCropReadout() {
    if(!state.cropDraft)return;
    const c=state.cropDraft;
    $('cropReadout').textContent=`Área seleccionada: ${Math.round(c.w)} × ${Math.round(c.h)} px · Esquina (${Math.round(c.x)}, ${Math.round(c.y)})`;
  }
  function rectFromCorners(ax,ay,bx,by) {
    ax=Math.max(0,Math.min(state.width,ax));bx=Math.max(0,Math.min(state.width,bx));
    ay=Math.max(0,Math.min(state.height,ay));by=Math.max(0,Math.min(state.height,by));
    let w=Math.abs(bx-ax),h=Math.abs(by-ay);
    const ratio=cropNumberRatio();
    if(ratio) {
      if(w/h>ratio)w=h*ratio;else h=w/ratio;
    }
    return {x:bx>=ax?ax:ax-w,y:by>=ay?ay:ay-h,w:Math.max(1,w),h:Math.max(1,h)};
  }
  function cropPointerDown(p) {
    const c=state.cropDraft;
    const tol=Math.max(9,state.width/140);
    if(c) {
      const corners=[['tl',c.x,c.y,c.x+c.w,c.y+c.h],['tr',c.x+c.w,c.y,c.x,c.y+c.h],['bl',c.x,c.y+c.h,c.x+c.w,c.y],['br',c.x+c.w,c.y+c.h,c.x,c.y]];
      for(const [id,hx,hy,ax,ay] of corners) {
        if(Math.abs(hx-p.x)<tol && Math.abs(hy-p.y)<tol) {pointerAction={kind:'crop-resize',anchorX:ax,anchorY:ay};return;}
      }
      if(p.x>c.x && p.x<c.x+c.w && p.y>c.y && p.y<c.y+c.h) {
        pointerAction={kind:'crop-move',start:p,initial:{...c}};return;
      }
    }
    state.cropDraft={x:p.x,y:p.y,w:1,h:1};pointerAction={kind:'crop-create',anchorX:p.x,anchorY:p.y};
  }
  function cropPointerMove(p) {
    if(!pointerAction)return;
    const a=pointerAction;
    if(a.kind==='crop-move') {
      const c=a.initial;
      state.cropDraft={...c,x:Math.max(0,Math.min(state.width-c.w,c.x+p.x-a.start.x)),y:Math.max(0,Math.min(state.height-c.h,c.y+p.y-a.start.y))};
    } else {
      const c=rectFromCorners(a.anchorX,a.anchorY,p.x,p.y);
      state.cropDraft=c;
    }
    updateCropReadout();
  }
  document.querySelectorAll('[data-ratio]').forEach(button => button.addEventListener('click',()=> {
    state.cropRatio=button.dataset.ratio;
    document.querySelectorAll('[data-ratio]').forEach(b=>b.classList.toggle('active',b===button));
    if(state.loaded)resetCropDraft();
  }));
  $('resetCropBtn').addEventListener('click',()=> {if(state.loaded)resetCropDraft();});
  $('applyCropBtn').addEventListener('click',()=> {
    if(!state.loaded||!state.cropDraft)return toast('Carga una fotografía para recortar.',true);
    const c=state.cropDraft;
    if(c.w<3 || c.h<3)return toast('Selecciona un área más grande.',true);
    const v=state.view,oldW=state.width,oldH=state.height;
    state.view={x:v.x+c.x*v.w/oldW,y:v.y+c.y*v.h/oldH,w:c.w*v.w/oldW,h:c.h*v.h/oldH,
      outW:Math.max(1,Math.round(c.w)),outH:Math.max(1,Math.round(c.h))};
    updateViewDimensions();resetCropDraft();pushHistory();scheduleRender();
    toast(`Recorte aplicado: ${state.width} × ${state.height} px`);
  });
  // Los campos de tamaño ajustan su par únicamente cuando el candado está activo.
  for(const [own,other] of [['resizeWidth','resizeHeight'],['resizeHeight','resizeWidth']]) {
    $(own).addEventListener('input',()=> {
      if(!state.loaded||!$('lockAspect').checked)return;
      const val=Number($(own).value);
      if(val>0) {
        const aspect=state.width/state.height;
        const maxWidth=Math.min(4200,Math.floor(4200*aspect));
        const maxHeight=Math.min(4200,Math.floor(4200/aspect));
        if(own==='resizeWidth') {
          const w=Math.min(4200,maxWidth,Math.max(1,Math.round(val)));
          $(own).value=w;$(other).value=Math.max(1,Math.round(w/aspect));
        } else {
          const h=Math.min(4200,maxHeight,Math.max(1,Math.round(val)));
          $(own).value=h;$(other).value=Math.max(1,Math.round(h*aspect));
        }
      }
    });
  }
  document.querySelectorAll('[data-resize]').forEach(button => button.addEventListener('click',()=> {
    if(!state.loaded)return;
    let mult=Number(button.dataset.resize);
    if($('lockAspect').checked)mult=Math.min(mult,4200/state.width,4200/state.height);
    $('resizeWidth').value=Math.max(1,Math.min(4200,Math.round(state.width*mult)));
    $('resizeHeight').value=Math.max(1,Math.min(4200,Math.round(state.height*mult)));
  }));
  $('applyResizeBtn').addEventListener('click',()=> {
    if(!state.loaded)return toast('Abre una fotografía primero.',true);
    const w=Number($('resizeWidth').value),h=Number($('resizeHeight').value);
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>4200||h>4200||w*h>35_000_000)
      return toast('Dimensiones inválidas. Máximo 4200 px por lado.',true);
    state.view={...state.view,outW:w,outH:h};updateViewDimensions();resetCropDraft();pushHistory();scheduleRender();
    toast(`Nuevas dimensiones: ${w} × ${h} px`);
  });
  // --- Stickers de imágenes del usuario. La carga se rasteriza localmente y no conserva EXIF. ---
  async function importSticker(file) {
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)return toast('Sticker: usa JPG, PNG o WebP hasta 10 MB.',true);
    if(stickerAssets.size>=24)return toast('Puedes cargar hasta 24 stickers por sesión.',true);
    const url=URL.createObjectURL(file);
    try {
      const img=new Image();img.src=url;await img.decode();
      if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>35_000_000)throw Error('Dimensiones excesivas');
      const scale=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight));
      const width=Math.max(1,Math.round(img.naturalWidth*scale));
      const height=Math.max(1,Math.round(img.naturalHeight*scale));
      const buf=document.createElement('canvas');buf.width=width;buf.height=height;
      buf.getContext('2d').drawImage(img,0,0,width,height);
      const clean=buf.toDataURL('image/png');
      const preview=new Image();preview.src=clean;await preview.decode();
      const id=++nextStickerId;
      stickerAssets.set(id,{img:preview,width,height,src:clean});
      const tile=document.createElement('button');tile.type='button';tile.className='sticker-tile';tile.title=file.name;
      const thumb=document.createElement('img');thumb.src=clean;thumb.alt='Sticker '+file.name;tile.appendChild(thumb);
      tile.addEventListener('click',()=>addSticker(id));$('stickerPalette').appendChild(tile);
      $('stickerEmpty').classList.add('hidden');
      if(state.loaded) addSticker(id);else toast('Sticker añadido a la biblioteca. Abre una foto para usarlo.');
    }catch(err){console.error('Sticker:',err);toast('No fue posible abrir este sticker.',true);}
    finally{URL.revokeObjectURL(url);}
  }
  function addSticker(assetId) {
    if(!state.loaded)return toast('Primero abre una fotografía.',true);
    const asset=stickerAssets.get(assetId);if(!asset)return;
    const item={id:++nextEmojiId,kind:'sticker',assetId,x:state.view.x+state.view.w/2,y:state.view.y+state.view.h/2,
      size:Math.max(50,Math.min(350,Math.round(state.view.w*.17))),rotation:0};
    state.emojis.push(item);state.selectedEmoji=item.id;
    setTool('emoji');syncEmojiControls();pushHistory();scheduleRender();toast('Sticker añadido. Arrástralo para colocarlo.');
  }
  // Limpieza del ORIGINAL cargado: no aplica ajustes ni recorte. La exportación
  // estándar ya usa el backend que reencodifica los píxeles sin metadatos.
  function downloadBlob(blob,filename) {
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  $('cleanOriginalBtn').addEventListener('click',async()=> {
    if(!originalFile)return toast('Abre una fotografía primero.',true);
    const button=$('cleanOriginalBtn');button.disabled=true;
    try {
      const ext=(originalFile.name.split('.').pop()||'png').toLowerCase();
      const fmt=ext==='jpeg'?'jpg':(['jpg','png','webp'].includes(ext)?ext:'png');
      const form=new FormData();form.append('image',originalFile,originalFile.name);form.append('format',fmt);
      const response=await fetch('/api/clean',{method:'POST',body:form});
      if(!response.ok){const err=await response.json().catch(()=>({}));throw Error(err.error||'No fue posible limpiar el archivo.');}
      downloadBlob(await response.blob(),(originalFile.name.replace(/\.[^.]+$/,'')||'fotografia')+'-sin-metadatos.'+fmt);
      toast('Descargaste una copia del original sin metadatos.');
    }catch(err){console.error('Metadata cleanup:',err);toast(err.message||'Error de limpieza.',true);}
    finally{button.disabled=false;}
  });

  // Import controls
  $('fileInput').addEventListener('change', e => importPhoto(e.target.files[0]));
  for (const id of ['newImageBtn','welcomeUploadBtn']) $(id).addEventListener('click',() => $('fileInput').click());
  for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click',() => setTool(button.dataset.tool));
  for (const button of document.querySelectorAll('[data-preset]')) {
    button.addEventListener('click',() => {
      if(!state.loaded) return toast('Primero abre una fotografía.',true);
      state.adj={...PRESETS[button.dataset.preset]};syncAdjustControls();pushHistory();scheduleRender();
    });
  }
  for (const key of Object.keys(EMPTY_ADJ)) {
    const input=$(key);
    input.addEventListener('input',() => {
      state.adj[key]=Number(input.value);
      rangeOutput(key,state.adj[key]);updateRangeAppearance(input);
      document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
      scheduleRender();
    });
    input.addEventListener('change',pushHistory);
  }
  $('resetAdjustBtn').addEventListener('click',() => {if(!state.loaded)return;state.adj={...EMPTY_ADJ};syncAdjustControls();pushHistory();scheduleRender();});
  for (const [inputID,stateKey] of [['brushSize','brushSize'],['blurStrength','blurStrength']]) {
    const input=$(inputID);
    input.addEventListener('input',() => {
      state[stateKey]=Number(input.value);updateRangeAppearance(input);
      $(inputID+'Value').textContent=input.value+' px';updateBrushDemo();
    });
  }
  $('clearBlurBtn').addEventListener('click',() => {
    if (!state.strokes.length) return toast('Todavía no has aplicado desenfoques.');
    state.strokes=[];pushHistory();scheduleRender();toast('Se eliminaron los desenfoques.');
  });
  for (const emoji of EMOJIS) {
    const b=document.createElement('button');b.type='button';b.className='emoji-choice';b.textContent=emoji;
    b.setAttribute('aria-label','Agregar emoji '+emoji);
    b.addEventListener('click',() => addEmoji(emoji));$('emojiPalette').appendChild(b);
  }
  for (const [inputID,key] of [['emojiSize','size'],['emojiRotation','rotation']]) {
    const input=$(inputID);
    input.addEventListener('input',() => {
      const e=selectedEmoji();if(!e)return;
      e[key]=Number(input.value);$(inputID+'Value').textContent=input.value+(key==='size'?' px':'°');
      updateRangeAppearance(input);scheduleRender();
    });
    input.addEventListener('change',pushHistory);
  }
  $('removeEmojiBtn').addEventListener('click',deleteEmoji);
  $('uploadStickerBtn').addEventListener('click',()=> $('stickerInput').click());
  $('stickerInput').addEventListener('change',async e => {await importSticker(e.target.files?.[0]);e.target.value='';});

  // Touch + mouse input: one pointer can paint, another can select/move an emoji.
  canvas.addEventListener('pointerdown', event => {
    if (!state.loaded || state.comparing) return;
    if(event.button !== 0 && event.pointerType === 'mouse')return;
    const p=canvasPoint(event);
      if (state.tool === 'crop') {
        cropPointerDown(screenPoint(event));canvas.setPointerCapture(event.pointerId);scheduleRender();
      } else if (state.tool === 'blur') {
      const stroke={size:state.brushSize,blur:state.blurStrength,points:[[p.x,p.y]]};
      state.strokes.push(stroke);pointerAction={kind:'stroke',stroke};
      canvas.setPointerCapture(event.pointerId);scheduleRender();
    } else if (state.tool === 'select' || state.tool === 'emoji') {
      const item=emojiAt(p);
      state.selectedEmoji=item ? item.id : null;
      syncEmojiControls();scheduleRender();
      if(item){
        // Bring to front in current layer ordering.
        state.emojis=state.emojis.filter(e => e.id!==item.id);state.emojis.push(item);
        pointerAction={kind:'move',id:item.id,offsetX:p.x-item.x,offsetY:p.y-item.y,startX:item.x,startY:item.y};
        canvas.setPointerCapture(event.pointerId);
      }
    }
  });
  canvas.addEventListener('pointermove',event => {
    updateBrushCursor(event);
    if (!pointerAction)return;
    const p=canvasPoint(event);
    if(pointerAction.kind.startsWith('crop-')) {cropPointerMove(screenPoint(event));scheduleRender();}
    else if(pointerAction.kind==='stroke'){
      const pts=pointerAction.stroke.points,last=pts[pts.length-1];
      if(Math.hypot(p.x-last[0],p.y-last[1])>Math.max(2,state.brushSize/12)){pts.push([p.x,p.y]);scheduleRender();}
    } else if(pointerAction.kind==='move'){
      const e=selectedEmoji();if (!e)return;
      e.x=Math.max(state.view.x,Math.min(state.view.x+state.view.w,p.x-pointerAction.offsetX));
      e.y=Math.max(state.view.y,Math.min(state.view.y+state.view.h,p.y-pointerAction.offsetY));
      scheduleRender();
    }
  });
  function endPointer() {
    if(!pointerAction)return;
    if(pointerAction.kind==='stroke' || pointerAction.kind==='move') pushHistory();
    pointerAction=null;scheduleRender();
  }
  canvas.addEventListener('pointerup',endPointer);
  canvas.addEventListener('pointercancel',endPointer);
  canvas.addEventListener('lostpointercapture',endPointer);
  canvas.addEventListener('pointerleave',() => {if(!pointerAction)$('brushCursor').classList.add('hidden');});

  $('undoBtn').addEventListener('click',() => restoreHistory(historyIndex-1));
  $('redoBtn').addEventListener('click',() => restoreHistory(historyIndex+1));
  $('zoomOutBtn').addEventListener('click',() => {state.zoom=Math.max(25,state.zoom-25);fitCanvas();});
  $('zoomInBtn').addEventListener('click',() => {state.zoom=Math.min(300,state.zoom+25);fitCanvas();});
  $('fitBtn').addEventListener('click',() => {state.zoom=100;fitCanvas();});
  $('zoomLabel').addEventListener('click',() => {state.zoom=100;fitCanvas();});
  if ('ResizeObserver' in window) new ResizeObserver(() => {if(state.loaded)fitCanvas();}).observe(stage);
  else window.addEventListener('resize',fitCanvas);

  function toggleCompare(value) {
    if(!state.loaded)return;
    state.comparing=value;
    $('compareBtn').classList.toggle('pressed',value);
    $('originalBadge').classList.toggle('hidden',!value);
    scheduleRender();
  }
  $('compareBtn').addEventListener('pointerdown',e => {if(state.loaded){e.preventDefault();toggleCompare(true);}});
  ['pointerup','pointerleave','pointercancel'].forEach(name=>$('compareBtn').addEventListener(name,()=>toggleCompare(false)));
  $('compareBtn').addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter')toggleCompare(true);});
  $('compareBtn').addEventListener('keyup',()=>toggleCompare(false));

  // Drag & drop on the canvas, with navigation prevention.
  let dragDepth=0;
  stage.addEventListener('dragenter',e=>{if(!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault();dragDepth++;$('dropOverlay').classList.remove('hidden');});
  stage.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
  stage.addEventListener('dragleave',e=>{e.preventDefault();dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropOverlay').classList.add('hidden');});
  stage.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('dropOverlay').classList.add('hidden');importPhoto(e.dataTransfer.files[0]);});
  window.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files'))e.preventDefault();});
  window.addEventListener('drop',e=>{if(e.dataTransfer?.types?.includes('Files'))e.preventDefault();});

  // Export: flatten all canvas layers, then ask the local Flask server to
  // validate and encode the desired PNG/JPEG/WebP file.
  const exportDialog=$('exportDialog');
  $('exportBtn').addEventListener('click',()=>{
    if(!state.loaded)return;
    $('exportMeta').textContent=`Resolución ${state.width.toLocaleString('es')} × ${state.height.toLocaleString('es')} px · Cambios incluidos · Sin metadatos.`;
    exportDialog.showModal();
  });
  $('closeExportBtn').addEventListener('click',()=>exportDialog.close());
  $('cancelExportBtn').addEventListener('click',()=>exportDialog.close());
  $('exportForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!state.loaded)return;
    const button=$('confirmExportBtn');button.disabled=true;button.textContent='Procesando…';
    try {
      const output=cloneLayer();drawAll(output,false);
      const blob=await new Promise((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(Error('No se pudo generar la imagen.')),'image/png'));
      const payload=new FormData();payload.append('image',blob,'edicion.png');payload.append('format',$('formatSelect').value);
      const response=await fetch('/api/export',{method:'POST',body:payload});
      if(!response.ok){
        let msg='No fue posible exportar la fotografía.';
        try {msg=(await response.json()).error||msg;}catch(_){}
        throw new Error(msg);
      }
      const result=await response.blob();
      const url=URL.createObjectURL(result);
      const a=document.createElement('a');a.href=url;
      a.download=(state.name.replace(/\.[^.]+$/,'')||'fotografia')+'-fotolab.'+$('formatSelect').value;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
      exportDialog.close();toast('¡Fotografía exportada correctamente!');
    } catch(error) {console.error('Export error:',error);toast(error.message||'Error de exportación.',true);}
    finally {button.disabled=false;button.innerHTML='<svg class="icon"><use href="#ic-download"/></svg> Descargar';}
  });
  const helpDialog=$('helpDialog');
  $('railHelpBtn').addEventListener('click',()=>helpDialog.showModal());
  $('closeHelpBtn').addEventListener('click',()=>helpDialog.close());
  $('gotItBtn').addEventListener('click',()=>helpDialog.close());
  document.addEventListener('keydown',event=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||exportDialog.open||helpDialog.open)return;
    const ctrl=event.ctrlKey||event.metaKey;
    if(ctrl&&event.key.toLowerCase()==='z') {event.preventDefault();restoreHistory(historyIndex+(event.shiftKey?1:-1));}
    else if(ctrl&&event.key.toLowerCase()==='y'){event.preventDefault();restoreHistory(historyIndex+1);}
    else if(event.key==='Delete'||event.key==='Backspace'){if(selectedEmoji()){event.preventDefault();deleteEmoji();}}
    else if(!ctrl&&event.key.toLowerCase()==='v')setTool('select');
    else if(!ctrl&&event.key.toLowerCase()==='b')setTool('blur');
    else if(!ctrl&&event.key.toLowerCase()==='c')setTool('crop');
  });
  document.querySelectorAll('input[type=range]').forEach(updateRangeAppearance);
  updateBrushDemo();syncAdjustControls();syncEmojiControls();updateHistoryButtons();
})();
