// ---- DOM references ----
const photoDropzone = document.getElementById('photoDropzone');
const photoInput = document.getElementById('photoInput');
const photoError = document.getElementById('photoError');
const photoStepBody = document.getElementById('photoStepBody');

const logoDropzone = document.getElementById('logoDropzone');
const logoInput = document.getElementById('logoInput');
const logoError = document.getElementById('logoError');
const logoLoaded = document.getElementById('logoLoaded');
const logoThumb = document.getElementById('logoThumb');
const logoName = document.getElementById('logoName');
const replaceLogoBtn = document.getElementById('replaceLogoBtn');
const removeLogoBtn = document.getElementById('removeLogoBtn');
const logoAppliesHint = document.getElementById('logoAppliesHint');

const wmTypeRadios = document.querySelectorAll('input[name="wmType"]');
const imageWmContainer = document.getElementById('imageWmContainer');
const textWmContainer = document.getElementById('textWmContainer');
const wmTextInput = document.getElementById('wmTextInput');
const wmFontSelect = document.getElementById('wmFontSelect');
const colorPresets = document.getElementById('colorPresets');
const wmCustomColor = document.getElementById('wmCustomColor');
const customColorWrapper = document.getElementById('customColorWrapper');
const wmShadowCheck = document.getElementById('wmShadowCheck');

const stepLogoCard = document.getElementById('stepLogoCard');
const stepAdjustCard = document.getElementById('stepAdjustCard');
const stepDownloadCard = document.getElementById('stepDownloadCard');

const canvasWrap = document.getElementById('canvasWrap');
const previewCanvas = document.getElementById('previewCanvas');
const ctx = previewCanvas.getContext('2d');
const coordReadout = document.getElementById('coordReadout');
const stageHint = document.getElementById('stageHint');
const previewFlag = document.getElementById('previewFlag');
const previewFlagName = document.getElementById('previewFlagName');

const scaleSlider = document.getElementById('scaleSlider');
const scaleValue = document.getElementById('scaleValue');
const opacitySlider = document.getElementById('opacitySlider');
const opacityValue = document.getElementById('opacityValue');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const presetGrid = document.getElementById('presetGrid');
const resetBtn = document.getElementById('resetBtn');
const downloadBtn = document.getElementById('downloadBtn');
const downloadHint = document.getElementById('downloadHint');

// ---- state ----
// Every uploaded photo: { img: HTMLImageElement, name: string }
let photos = [];
let activePhotoIndex = -1;   // which photo is currently shown in the canvas
let photoImg = null;         // convenience reference to photos[activePhotoIndex].img
let photoFileName = 'photo';

let watermarkType = 'image'; // 'image' | 'text'
let textWmState = {
  text: '© CYNOCOR',
  font: 'Inter, sans-serif',
  color: '#ffffff',
  shadow: true,
};

let logoImg = null;
let logoFileName = 'logo';
let logoSize = 0;

// Watermark placement - one shared setting, applied to every photo on export.
const DEFAULTS = { x: 0.5, y: 0.5, scale: 0.22, opacity: 0.8 };
let state = { ...DEFAULTS };

let dragMode = null;       // 'move' | 'resize' | null
let dragOffset = { x: 0, y: 0 };
let interacting = false;
let rafPending = false;

// ---- helpers ----
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function isSupportedImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('image/')) return true;
  // Some browsers report no MIME type for HEIC/HEIF - fall back to extension.
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '');
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!isSupportedImageFile(file)) {
      reject(new Error('unsupported-type'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode-failed'));
    };
    img.src = url;
  });
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}
function clearError(el) {
  el.hidden = true;
  el.textContent = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function stripExt(name) {
  return (name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
}

function enableStep(card) {
  card.classList.remove('is-disabled');
  card.querySelectorAll('[tabindex="-1"]').forEach((el) => el.setAttribute('tabindex', '0'));
  card.querySelectorAll('[aria-disabled]').forEach((el) => el.removeAttribute('aria-disabled'));
}
function disableStep(card) {
  card.classList.add('is-disabled');
}

function requestRedraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    redraw();
    rafPending = false;
  });
}

/* ==========================================================
   Photo upload (multiple files at once, appendable)
   ========================================================== */

async function handlePhotoFiles(files) {
  clearError(photoError);
  if (!files || files.length === 0) return;

  const valid = files.filter(isSupportedImageFile);
  if (valid.length === 0) {
    showError(photoError, "Couldn't open those files - please use JPG, PNG, WEBP, or HEIC photos.");
    return;
  }

  const wasEmpty = photos.length === 0;
  let failCount = 0;

  for (const file of valid) {
    try {
      const { img } = await loadImageFromFile(file);
      photos.push({ img, name: file.name || 'photo', size: file.size || (img.naturalWidth * img.naturalHeight * 0.25) });
    } catch (err) {
      failCount++;
    }
  }

  if (failCount > 0) {
    showError(
      photoError,
      `${failCount} file${failCount > 1 ? 's' : ''} couldn't be opened and ${failCount > 1 ? 'were' : 'was'} skipped.`
    );
  }

  if (photos.length === 0) return;

  if (wasEmpty) {
    setActivePhoto(0);
    photoDropzone.classList.add('hidden');
    canvasWrap.classList.remove('hidden');
    enableStep(stepLogoCard);
    updateWatermarkStepState();
  }

  renderPhotoStepBody();
  updateDownloadUi();
}

function setActivePhoto(i) {
  if (i < 0 || i >= photos.length) return;
  activePhotoIndex = i;
  photoImg = photos[i].img;
  photoFileName = photos[i].name;
  setupCanvasForPhoto();
  renderPhotoStepBody();
  updatePreviewFlag();
}

function removePhoto(i) {
  const wasActive = i === activePhotoIndex;
  photos.splice(i, 1);

  if (photos.length === 0) {
    activePhotoIndex = -1;
    photoImg = null;
    photoDropzone.classList.remove('hidden');
    canvasWrap.classList.add('hidden');
    disableStep(stepAdjustCard);
    disableStep(stepDownloadCard);
  } else {
    const nextIndex = wasActive ? Math.min(i, photos.length - 1) : Math.max(0, activePhotoIndex - (i < activePhotoIndex ? 1 : 0));
    setActivePhoto(nextIndex);
  }

  renderPhotoStepBody();
  updateDownloadUi();
}

function renderPhotoStepBody() {
  photoStepBody.innerHTML = '';

  if (photos.length === 0) {
    const p = document.createElement('p');
    p.className = 'step-empty';
    p.textContent = 'No photos yet.';
    photoStepBody.appendChild(p);
    return;
  }

  const count = document.createElement('p');
  count.className = 'photo-count';
  count.textContent = photos.length === 1 ? '1 photo added' : `${photos.length} photos added`;
  photoStepBody.appendChild(count);

  const list = document.createElement('div');
  list.className = 'photo-list';

  photos.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'photo-item' + (i === activePhotoIndex ? ' is-active' : '');

    const thumb = document.createElement('img');
    thumb.className = 'photo-thumb';
    thumb.src = p.img.src;
    thumb.alt = '';
    thumb.addEventListener('click', () => setActivePhoto(i));

    const info = document.createElement('div');
    info.className = 'photo-item-info';
    info.innerHTML = `<p class="photo-name">${escapeHtml(p.name)}</p><p class="photo-dims">${p.img.naturalWidth} × ${p.img.naturalHeight}px</p>`;
    info.addEventListener('click', () => setActivePhoto(i));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-btn';
    remove.setAttribute('aria-label', `Remove ${p.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      removePhoto(i);
    });

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(remove);
    list.appendChild(item);
  });

  photoStepBody.appendChild(list);

  const addMore = document.createElement('button');
  addMore.type = 'button';
  addMore.className = 'link-btn';
  addMore.textContent = '+ Add more photos';
  addMore.addEventListener('click', () => photoInput.click());
  photoStepBody.appendChild(addMore);
}

function updatePreviewFlag() {
  if (photos.length > 1) {
    previewFlagName.textContent = photoFileName;
    previewFlag.hidden = false;
  } else {
    previewFlag.hidden = true;
  }
}

function setupCanvasForPhoto() {
  const MAX_SIDE = 1600; // preview only - export always uses full resolution
  const w = photoImg.naturalWidth;
  const h = photoImg.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));

  previewCanvas.width = Math.max(1, Math.round(w * scale));
  previewCanvas.height = Math.max(1, Math.round(h * scale));

  redraw();
}

/* ==========================================================
   Logo upload / removal
   ========================================================== */

function hasActiveWatermark() {
  if (watermarkType === 'image') {
    return logoImg !== null;
  }
  return textWmState.text.trim().length > 0;
}

function updateWatermarkStepState() {
  if (photos.length === 0) return;
  if (hasActiveWatermark()) {
    enableStep(stepAdjustCard);
    enableStep(stepDownloadCard);
    coordReadout.hidden = false;
    stageHint.classList.add('hidden');
  } else {
    disableStep(stepAdjustCard);
    disableStep(stepDownloadCard);
    coordReadout.hidden = true;
    stageHint.classList.remove('hidden');
  }
  updateDownloadUi();
  requestRedraw();
}

/* ==========================================================
   Logo upload / removal
   ========================================================== */

async function handleLogoFile(file) {
  clearError(logoError);
  if (!file) return;

  try {
    const { img } = await loadImageFromFile(file);
    logoImg = img;
    logoFileName = file.name || 'logo';
    logoSize = file.size || 0;
    state = { ...DEFAULTS };
    syncControlsFromState();

    logoThumb.src = logoImg.src;
    logoName.textContent = logoFileName;
    logoDropzone.classList.add('hidden');
    logoLoaded.classList.remove('hidden');

    updateWatermarkStepState();
  } catch (err) {
    showError(
      logoError,
      "Couldn't open that logo - please use a JPG, PNG, WEBP, or HEIC image."
    );
  }
}

function removeLogo() {
  logoImg = null;
  logoSize = 0;
  logoLoaded.classList.add('hidden');
  logoAppliesHint.hidden = true;
  logoDropzone.classList.remove('hidden');
  clearError(logoError);

  updateWatermarkStepState();
}

/* ==========================================================
   Canvas drawing & Bounds Calculation
   ========================================================== */

function watermarkBounds(targetWidth, targetHeight, canvasCtx) {
  const w = targetWidth;
  const h = targetHeight;
  const cx = state.x * w;
  const cy = state.y * h;

  if (watermarkType === 'image') {
    if (!logoImg) return { cx, cy, logoW: 0, logoH: 0, left: cx, top: cy, right: cx, bottom: cy };
    const logoW = state.scale * w;
    const logoH = logoW * (logoImg.naturalHeight / logoImg.naturalWidth);
    return {
      cx, cy, logoW, logoH,
      left: cx - logoW / 2,
      top: cy - logoH / 2,
      right: cx + logoW / 2,
      bottom: cy + logoH / 2,
    };
  } else {
    const textStr = textWmState.text || ' ';
    const fontSize = Math.max(12, state.scale * w * 0.35);
    const activeCtx = canvasCtx || ctx;

    activeCtx.save();
    activeCtx.font = `${fontSize}px ${textWmState.font}`;
    const metrics = activeCtx.measureText(textStr);
    activeCtx.restore();

    const textW = Math.max(metrics.width || (fontSize * textStr.length * 0.6), 10);
    const textH = fontSize * 1.1;

    return {
      cx, cy, logoW: textW, logoH: textH, fontSize,
      left: cx - textW / 2,
      top: cy - textH / 2,
      right: cx + textW / 2,
      bottom: cy + textH / 2,
    };
  }
}

function redraw() {
  if (!photoImg) return;
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.drawImage(photoImg, 0, 0, previewCanvas.width, previewCanvas.height);
  if (!hasActiveWatermark()) return;

  const b = watermarkBounds(previewCanvas.width, previewCanvas.height, ctx);

  ctx.save();
  ctx.globalAlpha = state.opacity;

  if (watermarkType === 'image') {
    if (logoImg) {
      ctx.drawImage(logoImg, b.left, b.top, b.logoW, b.logoH);
    }
  } else {
    ctx.font = `${b.fontSize}px ${textWmState.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (textWmState.shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = Math.max(3, b.fontSize * 0.12);
      ctx.shadowOffsetX = Math.max(1, b.fontSize * 0.04);
      ctx.shadowOffsetY = Math.max(1, b.fontSize * 0.04);
    }

    ctx.fillStyle = textWmState.color;
    ctx.fillText(textWmState.text, b.cx, b.cy);
  }
  ctx.restore();

  if (interacting) {
    ctx.save();
    ctx.strokeStyle = 'rgba(201, 154, 75, 0.3)';
    ctx.lineWidth = 1;
    [1 / 3, 2 / 3].forEach((f) => {
      ctx.beginPath();
      ctx.moveTo(f * previewCanvas.width, 0);
      ctx.lineTo(f * previewCanvas.width, previewCanvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, f * previewCanvas.height);
      ctx.lineTo(previewCanvas.width, f * previewCanvas.height);
      ctx.stroke();
    });
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#C99A4B';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.left, b.top, b.logoW, b.logoH);
    ctx.restore();
  }

  drawHandle(b.cx, b.cy, 9, '#C99A4B');
  drawHandle(b.right, b.bottom, 7, '#EDEAE2');
}

function drawHandle(x, y, r, fill) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#12141A';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function updateReadout() {
  coordReadout.textContent =
    `X ${Math.round(state.x * 100)}% · Y ${Math.round(state.y * 100)}% · Scale ${Math.round(state.scale * 100)}%`;
}

function syncControlsFromState() {
  scaleSlider.value = Math.round(state.scale * 100);
  scaleValue.textContent = `${Math.round(state.scale * 100)}%`;
  opacitySlider.value = Math.round(state.opacity * 100);
  opacityValue.textContent = `${Math.round(state.opacity * 100)}%`;
  updateReadout();
}

/* ==========================================================
   Pointer interaction (drag to move / drag corner to resize)
   ========================================================== */

function getCanvasPos(e) {
  const rect = previewCanvas.getBoundingClientRect();
  const scaleX = previewCanvas.width / rect.width;
  const scaleY = previewCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function onPointerDown(e) {
  if (!hasActiveWatermark()) return;
  const p = getCanvasPos(e);
  const b = watermarkBounds(previewCanvas.width, previewCanvas.height, ctx);
  const distToResize = Math.hypot(p.x - b.right, p.y - b.bottom);
  const handleRadius = e.pointerType === 'touch' ? 32 : 18;

  if (distToResize < handleRadius) {
    dragMode = 'resize';
  } else if (p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom) {
    dragMode = 'move';
    dragOffset.x = p.x - b.cx;
    dragOffset.y = p.y - b.cy;
  } else {
    return;
  }

  interacting = true;
  previewCanvas.setPointerCapture(e.pointerId);
  e.preventDefault();
  requestRedraw();
}

function onPointerMove(e) {
  if (!dragMode) return;
  const p = getCanvasPos(e);
  const w = previewCanvas.width;
  const h = previewCanvas.height;

  if (dragMode === 'move') {
    const cx = p.x - dragOffset.x;
    const cy = p.y - dragOffset.y;
    state.x = clamp(cx / w, 0, 1);
    state.y = clamp(cy / h, 0, 1);
  } else if (dragMode === 'resize') {
    const b = watermarkBounds(w, h, ctx);
    const dx = p.x - b.cx;
    const newLogoW = Math.max(2 * dx, 10);
    state.scale = clamp(newLogoW / w, 0.03, 0.9);
    scaleSlider.value = Math.round(state.scale * 100);
    scaleValue.textContent = `${Math.round(state.scale * 100)}%`;
  }

  updateReadout();
  requestRedraw();
  e.preventDefault();
}

function onPointerUp() {
  if (!dragMode) return;
  dragMode = null;
  interacting = false;
  requestRedraw();
}

previewCanvas.addEventListener('pointerdown', onPointerDown);
previewCanvas.addEventListener('pointermove', onPointerMove);
previewCanvas.addEventListener('pointerup', onPointerUp);
previewCanvas.addEventListener('pointercancel', onPointerUp);

/* ==========================================================
   Controls: sliders, presets, reset
   ========================================================== */

scaleSlider.addEventListener('input', () => {
  state.scale = clamp(Number(scaleSlider.value) / 100, 0.03, 0.9);
  scaleValue.textContent = `${scaleSlider.value}%`;
  updateReadout();
  requestRedraw();
});

opacitySlider.addEventListener('input', () => {
  state.opacity = clamp(Number(opacitySlider.value) / 100, 0.08, 1);
  opacityValue.textContent = `${opacitySlider.value}%`;
  requestRedraw();
});

if (qualitySlider) {
  qualitySlider.addEventListener('input', () => {
    qualityValue.textContent = `${qualitySlider.value}%`;
  });
}

presetGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-x]');
  if (!btn || !hasActiveWatermark()) return;
  presetGrid.querySelectorAll('button').forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  state.x = Number(btn.dataset.x);
  state.y = Number(btn.dataset.y);
  updateReadout();
  requestRedraw();
});

resetBtn.addEventListener('click', () => {
  if (!hasActiveWatermark()) return;
  presetGrid.querySelectorAll('button').forEach(b => b.classList.remove('is-active'));
  state = { ...DEFAULTS };
  syncControlsFromState();
  requestRedraw();
});

replaceLogoBtn.addEventListener('click', () => logoInput.click());
removeLogoBtn.addEventListener('click', removeLogo);

/* ==========================================================
   Upload wiring: click-to-browse + drag & drop
   ========================================================== */

function wireDropzone(zoneEl, inputEl, onFiles, isEnabled) {
  const open = () => {
    if (isEnabled && !isEnabled()) return;
    inputEl.click();
  };
  zoneEl.addEventListener('click', open);
  zoneEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    zoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      if (isEnabled && !isEnabled()) return;
      zoneEl.classList.add('is-dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    zoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      zoneEl.classList.remove('is-dragover');
    })
  );
  zoneEl.addEventListener('drop', (e) => {
    if (isEnabled && !isEnabled()) return;
    onFiles(Array.from(e.dataTransfer.files || []));
  });

  inputEl.addEventListener('change', (e) => {
    onFiles(Array.from(e.target.files || []));
    inputEl.value = '';
  });
}

wireDropzone(photoDropzone, photoInput, handlePhotoFiles);
wireDropzone(
  logoDropzone,
  logoInput,
  (files) => handleLogoFile(files[0]),
  () => !stepLogoCard.classList.contains('is-disabled')
);

/* ==========================================================
   Export: PNG or JPG, single file or ZIP for multiple photos
   ========================================================== */

function updateDownloadUi() {
  if (photos.length > 1) {
    downloadBtn.textContent = `Download all as ZIP (${photos.length})`;
    downloadHint.textContent = "Every photo gets the same watermark, size, opacity, and position - exported at each photo's own full resolution, bundled into one .zip.";
  } else {
    downloadBtn.textContent = 'Download watermarked photo';
    downloadHint.textContent = "Exports at your photo's full original resolution.";
  }
  logoAppliesHint.hidden = hasActiveWatermark() ? photos.length <= 1 : true;
  updatePreviewFlag();
}

function renderWatermarkedBlob(photoObj, mime, qualityFactor) {
  return new Promise((resolve) => {
    const img = photoObj.img || photoObj;
    const photoSize = photoObj.size || (img.naturalWidth * img.naturalHeight * 0.25);
    const maxAllowedBytes = photoSize; // Strict cap: exported file will not exceed original photo size

    let w = img.naturalWidth;
    let h = img.naturalHeight;
    let exportQuality = qualityFactor;

    if (mime === 'image/png') {
      // Ensure PNG output file size does not exceed original photo size
      const maxPixels = maxAllowedBytes / 0.80;
      const naturalPixels = w * h;
      const scaleCap = Math.min(1.0, Math.sqrt(maxPixels / naturalPixels));
      const finalScale = Math.max(0.15, scaleCap * Math.sqrt(qualityFactor));
      w = Math.max(1, Math.round(w * finalScale));
      h = Math.max(1, Math.round(h * finalScale));
    } else if (mime === 'image/jpeg') {
      // Dynamically calculate matching JPEG quality so exported JPG matches original file size & density
      const naturalPixels = w * h;
      const matchingQuality = clamp(photoSize / (naturalPixels * 0.18), 0.35, 0.85);
      exportQuality = clamp(matchingQuality * qualityFactor, 0.1, 0.85);

      const estimatedJpgBytes = naturalPixels * (0.15 * exportQuality);
      if (estimatedJpgBytes > maxAllowedBytes) {
        const scaleCap = Math.min(1.0, Math.sqrt(maxAllowedBytes / estimatedJpgBytes));
        w = Math.max(1, Math.round(w * scaleCap));
        h = Math.max(1, Math.round(h * scaleCap));
      }
    }

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cctx = c.getContext('2d');

    if (mime === 'image/jpeg') {
      // JPEG has no alpha channel - flatten onto white first in case the
      // source photo itself has transparent areas (e.g. a PNG photo).
      cctx.fillStyle = '#ffffff';
      cctx.fillRect(0, 0, w, h);
    }

    cctx.drawImage(img, 0, 0, w, h);

    const b = watermarkBounds(w, h, cctx);

    cctx.save();
    cctx.globalAlpha = state.opacity;

    if (watermarkType === 'image') {
      if (logoImg) {
        cctx.drawImage(logoImg, b.left, b.top, b.logoW, b.logoH);
      }
    } else {
      cctx.font = `${b.fontSize}px ${textWmState.font}`;
      cctx.textAlign = 'center';
      cctx.textBaseline = 'middle';

      if (textWmState.shadow) {
        cctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        cctx.shadowBlur = Math.max(3, b.fontSize * 0.12);
        cctx.shadowOffsetX = Math.max(1, b.fontSize * 0.04);
        cctx.shadowOffsetY = Math.max(1, b.fontSize * 0.04);
      }

      cctx.fillStyle = textWmState.color;
      cctx.fillText(textWmState.text, b.cx, b.cy);
    }

    cctx.restore();

    c.toBlob((blob) => resolve(blob), mime, exportQuality);
  });
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

downloadBtn.addEventListener('click', async () => {
  if (photos.length === 0 || !hasActiveWatermark()) return;

  const format = document.querySelector('input[name="format"]:checked').value; // 'png' | 'jpg'
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = clamp(Number(qualitySlider ? qualitySlider.value : 100) / 100, 0.1, 1.0);

  downloadBtn.disabled = true;

  try {
    if (photos.length === 1) {
      downloadBtn.textContent = 'Preparing…';
      const blob = await renderWatermarkedBlob(photos[0], mime, quality);
      triggerBlobDownload(blob, `${stripExt(photos[0].name)}-watermarked.${format}`);
    } else {
      const zip = new JSZip();
      for (let i = 0; i < photos.length; i++) {
        downloadBtn.textContent = `Preparing ${i + 1} of ${photos.length}…`;
        const blob = await renderWatermarkedBlob(photos[i], mime, quality);
        zip.file(`${stripExt(photos[i].name)}-watermarked.${format}`, blob);
      }
      downloadBtn.textContent = 'Zipping…';
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(zipBlob, 'watermarked-photos.zip');
    }
  } finally {
    downloadBtn.disabled = false;
    updateDownloadUi();
  }
});

/* ==========================================================
   Custom Text Watermark Control Listeners
   ========================================================== */

wmTypeRadios.forEach((radio) => {
  radio.addEventListener('change', (e) => {
    watermarkType = e.target.value;
    if (watermarkType === 'image') {
      imageWmContainer.classList.remove('hidden');
      textWmContainer.classList.add('hidden');
    } else {
      imageWmContainer.classList.add('hidden');
      textWmContainer.classList.remove('hidden');
    }
    updateWatermarkStepState();
  });
});

if (wmTextInput) {
  wmTextInput.addEventListener('input', (e) => {
    textWmState.text = e.target.value;
    updateWatermarkStepState();
  });
}

if (wmFontSelect) {
  wmFontSelect.addEventListener('change', (e) => {
    textWmState.font = e.target.value;
    requestRedraw();
  });
}

if (colorPresets) {
  colorPresets.addEventListener('click', (e) => {
    const btn = e.target.closest('.color-btn');
    if (!btn) return;
    colorPresets.querySelectorAll('.color-btn').forEach(b => b.classList.remove('is-active'));
    if (customColorWrapper) customColorWrapper.classList.remove('is-active');
    btn.classList.add('is-active');
    textWmState.color = btn.dataset.color;
    if (wmCustomColor) wmCustomColor.value = btn.dataset.color;
    requestRedraw();
  });
}

if (wmCustomColor) {
  wmCustomColor.addEventListener('input', (e) => {
    if (colorPresets) colorPresets.querySelectorAll('.color-btn').forEach(b => b.classList.remove('is-active'));
    if (customColorWrapper) customColorWrapper.classList.add('is-active');
    textWmState.color = e.target.value;
    requestRedraw();
  });
}

if (wmShadowCheck) {
  wmShadowCheck.addEventListener('change', (e) => {
    textWmState.shadow = e.target.checked;
    requestRedraw();
  });
}

/* ==========================================================
   Keep the preview crisp on resize
   ========================================================== */

let resizeTimer = null;
window.addEventListener('resize', () => {
  if (!photoImg) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => requestRedraw(), 120);
});

/* ==========================================================
   Unsaved changes warning before page refresh or close
   ========================================================== */
window.addEventListener('beforeunload', (e) => {
  if (photos.length > 0 || logoImg !== null || (watermarkType === 'text' && textWmState.text.trim() !== '')) {
    e.preventDefault();
    e.returnValue = 'You have unsaved photos or watermark settings. Refreshing or leaving will clear your data.';
    return e.returnValue;
  }
});
