// =============================================
// DVARA Loading Form v2 — Main Application
// =============================================

import { CONFIG } from './config.js';
import { generateLoadingPDF, sendEmailCopy, fetchHistory, deleteLoading } from './api.js';

// ── State ──
let activeView = 'form';
let currentStep = 1;
const TOTAL_STEPS = 4;
let jadwals = [];
let signatureMode = 'canvas'; // 'canvas' | 'upload'
let signatureUploadData = null;
let signatureFileName = '';
let isDrawing = false;
let resultData = null; // { url, accessCode, fileName }

// ── Utility Functions ──

/**
 * Smart capitalize: Title Case each word. If entire input is ALL CAPS, keep unchanged.
 */
function smartCapitalize(str) {
  if (!str) return '';
  str = str.trim();
  // Check if entire string is UPPER CASE
  const alphaOnly = str.replace(/[^a-zA-Z]/g, '');
  if (alphaOnly.length > 0 && alphaOnly === alphaOnly.toUpperCase()) {
    return str;
  }
  return str.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function swalTheme() {
  return {
    popup: 'swal-dvara-popup',
    title: 'swal-dvara-title',
    confirmButton: 'swal-dvara-confirm',
    cancelButton: 'swal-dvara-cancel',
    input: 'swal-dvara-input'
  };
}

function showToast(icon, title) {
  Swal.fire({
    toast: true, position: 'top-end', icon, title,
    showConfirmButton: false, timer: 2500,
    customClass: { popup: 'swal-dvara-popup' }
  });
}

// ── Initialization ──

document.addEventListener('DOMContentLoaded', () => {
  addJadwal(); // Start with 1 jadwal
  renderStep();
  bindStepperClicks();
  initSignatureCanvas();
});

// ── View Management ──
function switchView(view) {
  activeView = view;
  const navForm = document.getElementById('navBtnForm');
  const navHistory = document.getElementById('navBtnHistory');
  const viewForm = document.getElementById('viewForm');
  const viewHistory = document.getElementById('viewHistory');

  if (view === 'form') {
    if(navForm) navForm.className = 'btn btn-primary btn-pill';
    if(navHistory) navHistory.className = 'btn btn-ghost btn-pill';
    if(viewForm) viewForm.style.display = 'block';
    if(viewHistory) viewHistory.style.display = 'none';
  } else {
    if(navForm) navForm.className = 'btn btn-ghost btn-pill';
    if(navHistory) navHistory.className = 'btn btn-primary btn-pill';
    if(viewForm) viewForm.style.display = 'none';
    if(viewHistory) viewHistory.style.display = 'block';
  }
}
window.switchView = switchView;

// ── Stepper Navigation ──

function bindStepperClicks() {
  document.querySelectorAll('.stepper-item').forEach(item => {
    item.addEventListener('click', () => {
      const step = parseInt(item.dataset.step);
      if (step < currentStep) {
        currentStep = step;
        renderStep();
      }
    });
  });
}

function updateStepper() {
  document.querySelectorAll('.stepper-item').forEach(item => {
    const step = parseInt(item.dataset.step);
    item.classList.remove('active', 'completed');
    if (step === currentStep) item.classList.add('active');
    else if (step < currentStep) item.classList.add('completed');
  });

  document.querySelectorAll('.stepper-line').forEach(line => {
    const afterStep = parseInt(line.dataset.after);
    line.classList.remove('completed', 'active');
    if (afterStep < currentStep) line.classList.add('completed');
    else if (afterStep === currentStep - 1) line.classList.add('active');
  });
}

function renderStep() {
  updateStepper();
  document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
  const activeSection = document.getElementById(`step-${currentStep}`);
  if (activeSection) {
    activeSection.classList.add('active');
    // Re-animate
    activeSection.style.animation = 'none';
    activeSection.offsetHeight; // trigger reflow
    activeSection.style.animation = '';
  }

  // Render dynamic content
  if (currentStep === 2) renderJadwals();
  if (currentStep === 3) renderSignature();

  // Scroll to top of wizard card
  document.querySelector('.wizard-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function goNext() {
  if (validateStep(currentStep)) {
    currentStep = Math.min(currentStep + 1, TOTAL_STEPS);
    renderStep();
    if (currentStep === 4) handleGenerate();
  }
}

function goPrev() {
  currentStep = Math.max(currentStep - 1, 1);
  renderStep();
}

// Make global for onclick handlers
window.goNext = goNext;
window.goPrev = goPrev;

// ── Validation ──

function validateStep(step) {
  switch (step) {
    case 1: return validateStep1();
    case 2: return validateStep2();
    case 3: return validateStep3();
    default: return true;
  }
}

function validateStep1() {
  const vendor = document.getElementById('vendorName');
  const lantai = document.getElementById('lantai');
  let valid = true;

  // Clear errors
  clearFieldError(vendor);
  clearFieldError(lantai);

  const vendorVal = vendor.value.trim();
  const lantaiVal = lantai.value.trim();

  if (!vendorVal) {
    setFieldError(vendor, 'Nama Vendor wajib diisi');
    valid = false;
  } else if (vendorVal.length < CONFIG.MIN_VENDOR_NAME) {
    setFieldError(vendor, `Minimal ${CONFIG.MIN_VENDOR_NAME} karakter`);
    valid = false;
  } else if (vendorVal.length > CONFIG.MAX_VENDOR_NAME) {
    setFieldError(vendor, `Maksimal ${CONFIG.MAX_VENDOR_NAME} karakter`);
    valid = false;
  }

  if (!lantaiVal) {
    setFieldError(lantai, 'Unit / Lantai wajib diisi');
    valid = false;
  } else if (lantaiVal.length > CONFIG.MAX_LANTAI) {
    setFieldError(lantai, `Maksimal ${CONFIG.MAX_LANTAI} karakter`);
    valid = false;
  }

  if (!valid) {
    showToast('warning', 'Lengkapi data yang diperlukan');
  }

  return valid;
}

function validateStep2() {
  saveJadwalFieldsFromDOM();

  if (jadwals.length === 0) {
    showToast('warning', 'Tambahkan minimal 1 rincian loading');
    return false;
  }

  for (let i = 0; i < jadwals.length; i++) {
    const j = jadwals[i];

    if (j.type === 'Masuk') {
      if (!j.waktu || !j.pembawa || !j.nopol) {
        showError(`Lengkapi semua field pada Rincian ${i + 1}`);
        return false;
      }
    } else if (j.type === 'Keluar') {
      if (!j.waktu || !j.pembawa || !j.nopol) {
        showError(`Lengkapi semua field pada Rincian ${i + 1}`);
        return false;
      }
    } else if (j.type === 'Keduanya') {
      if (!j.waktuMasuk || !j.pembawaMasuk || !j.nopolMasuk || !j.waktuKeluar) {
        showError(`Lengkapi semua field pada Rincian ${i + 1}`);
        return false;
      }
      if (!j.isSama && (!j.pembawaKeluar || !j.nopolKeluar)) {
        showError(`Lengkapi data keluar pada Rincian ${i + 1}`);
        return false;
      }

      const inDate = new Date(j.waktuMasuk).getTime();
      const outDate = new Date(j.waktuKeluar).getTime();

      if (inDate === outDate) {
        showError(`Waktu Masuk dan Keluar pada Rincian ${i + 1} tidak boleh sama persis.`);
        return false;
      }
      if (outDate < inDate) {
        showError(`Waktu Keluar pada Rincian ${i + 1} tidak boleh lebih awal dari Waktu Masuk.`);
        return false;
      }
    }

    // Validate items
    for (let k = 0; k < j.items.length; k++) {
      if (!j.items[k].barang || !j.items[k].jml) {
        showError(`Lengkapi Nama Barang dan Jumlah pada Rincian ${i + 1}, item ${k + 1}`);
        return false;
      }
    }
  }

  return true;
}

function validateStep3() {
  if (signatureMode === 'canvas') {
    const canvas = document.getElementById('sigCanvas');
    if (canvas && isCanvasBlank(canvas)) {
      showError('Buat tanda tangan terlebih dahulu, atau upload gambar.');
      return false;
    }
  } else {
    if (!signatureUploadData) {
      showError('Upload gambar tanda tangan terlebih dahulu, atau gunakan canvas.');
      return false;
    }
  }
  return true;
}

function isCanvasBlank(canvas) {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

function setFieldError(input, msg) {
  input.classList.add('error');
  const errEl = input.parentElement.querySelector('.form-error');
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.add('show');
  }
}

function clearFieldError(input) {
  input.classList.remove('error');
  const errEl = input.parentElement.querySelector('.form-error');
  if (errEl) errEl.classList.remove('show');
}

function showError(text) {
  Swal.fire({
    title: 'Oops!', text, icon: 'warning',
    confirmButtonColor: '#800000',
    customClass: swalTheme()
  });
}

// ── Step 2: Jadwals Management ──

function createDefaultJadwal() {
  return {
    id: Date.now() + Math.random(),
    type: 'Keduanya',
    waktu: '', pembawa: '', nopol: '',
    waktuMasuk: '', waktuKeluar: '',
    pembawaMasuk: '', nopolMasuk: '',
    pembawaKeluar: '', nopolKeluar: '',
    isSama: true,
    items: [{ barang: '', jml: '', ket: '' }],
    isExpanded: true
  };
}

function addJadwal() {
  // Collapse existing
  jadwals.forEach(j => j.isExpanded = false);
  jadwals.push(createDefaultJadwal());
  if (currentStep === 2) renderJadwals();
}

function removeJadwal(index) {
  jadwals.splice(index, 1);
  if (jadwals.length > 0 && !jadwals.some(j => j.isExpanded)) {
    jadwals[jadwals.length - 1].isExpanded = true;
  }
  renderJadwals();
}

function toggleJadwal(index) {
  jadwals[index].isExpanded = !jadwals[index].isExpanded;
  renderJadwals();
}

function saveJadwalFieldsFromDOM() {
  jadwals.forEach((j, jIdx) => {
    const card = document.querySelector(`[data-jadwal-index="${jIdx}"]`);
    if (!card) return;

    j.type = card.querySelector('.jadwal-type-select')?.value || j.type;

    if (j.type === 'Masuk' || j.type === 'Keluar') {
      j.waktu = card.querySelector('[data-field="waktu"]')?.value || j.waktu;
      j.pembawa = card.querySelector('[data-field="pembawa"]')?.value || j.pembawa;
      j.nopol = card.querySelector('[data-field="nopol"]')?.value || j.nopol;
    } else {
      j.waktuMasuk = card.querySelector('[data-field="waktuMasuk"]')?.value || j.waktuMasuk;
      j.pembawaMasuk = card.querySelector('[data-field="pembawaMasuk"]')?.value || j.pembawaMasuk;
      j.nopolMasuk = card.querySelector('[data-field="nopolMasuk"]')?.value || j.nopolMasuk;
      j.waktuKeluar = card.querySelector('[data-field="waktuKeluar"]')?.value || j.waktuKeluar;
      j.pembawaKeluar = card.querySelector('[data-field="pembawaKeluar"]')?.value || j.pembawaKeluar;
      j.nopolKeluar = card.querySelector('[data-field="nopolKeluar"]')?.value || j.nopolKeluar;
      const samaCheckbox = card.querySelector('[data-field="isSama"]');
      if (samaCheckbox) j.isSama = samaCheckbox.checked;
    }

    // Save items
    const itemRows = card.querySelectorAll('.item-row');
    itemRows.forEach((row, iIdx) => {
      if (j.items[iIdx]) {
        j.items[iIdx].barang = row.querySelector('[data-field="barang"]')?.value || '';
        j.items[iIdx].jml = row.querySelector('[data-field="jml"]')?.value || '';
        j.items[iIdx].ket = row.querySelector('[data-field="ket"]')?.value || '';
      }
    });
  });
}

function addItem(jIndex) {
  saveJadwalFieldsFromDOM();
  jadwals[jIndex].items.push({ barang: '', jml: '', ket: '' });
  renderJadwals();
}

function removeItem(jIndex, iIndex) {
  saveJadwalFieldsFromDOM();
  jadwals[jIndex].items.splice(iIndex, 1);
  renderJadwals();
}

function handleCopyItems(targetIndex) {
  saveJadwalFieldsFromDOM();
  if (jadwals.length <= 1) return;

  const options = {};
  jadwals.forEach((j, idx) => {
    if (idx !== targetIndex) {
      options[idx] = `Rincian ${idx + 1} (${j.type === 'Keduanya' ? 'Masuk & Keluar' : j.type})`;
    }
  });

  Swal.fire({
    title: 'Salin Daftar Barang',
    text: 'Pilih rincian sumber:',
    input: 'select',
    inputOptions: options,
    inputPlaceholder: '-- Pilih Rincian --',
    showCancelButton: true,
    confirmButtonText: 'Salin',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#800000',
    customClass: swalTheme()
  }).then((result) => {
    if (result.isConfirmed && result.value !== '') {
      const sourceIndex = parseInt(result.value);
      jadwals[targetIndex].items = JSON.parse(JSON.stringify(jadwals[sourceIndex].items));
      renderJadwals();
      showToast('success', 'Barang berhasil disalin!');
    }
  });
}

// Make functions global for onclick
window.addJadwal = addJadwal;
window.removeJadwal = removeJadwal;
window.toggleJadwal = toggleJadwal;
window.addItem = addItem;
window.removeItem = removeItem;
window.handleCopyItems = handleCopyItems;

function renderJadwals() {
  saveJadwalFieldsFromDOM();
  const container = document.getElementById('jadwalsContainer');
  if (!container) return;

  container.innerHTML = '';

  jadwals.forEach((j, jIdx) => {
    const typeLabel = j.type === 'Keduanya' ? 'Masuk & Keluar' : j.type;
    const expanded = j.isExpanded ? 'expanded' : '';

    let fieldsHTML = '';

    if (j.type === 'Masuk') {
      fieldsHTML = `
        <div class="field-box masuk">
          <div>
            <div class="field-box-label masuk-label"><i class="fas fa-arrow-down"></i> Waktu (Masuk)</div>
            <input type="datetime-local" class="form-input" data-field="waktu" value="${j.waktu}" required>
          </div>
          <div>
            <div class="field-box-label" style="color:var(--text-secondary)">Pembawa Barang</div>
            <input type="text" class="form-input" data-field="pembawa" value="${escapeHtml(j.pembawa)}" placeholder="Nama Supir" required>
          </div>
          <div>
            <div class="field-box-label" style="color:var(--text-secondary)">No. Polisi</div>
            <input type="text" class="form-input text-uppercase" data-field="nopol" value="${escapeHtml(j.nopol)}" placeholder="Plat Nomor" required>
          </div>
        </div>
      `;
    } else if (j.type === 'Keluar') {
      fieldsHTML = `
        <div class="field-box keluar">
          <div>
            <div class="field-box-label keluar-label"><i class="fas fa-arrow-up"></i> Waktu (Keluar)</div>
            <input type="datetime-local" class="form-input" data-field="waktu" value="${j.waktu}" required>
          </div>
          <div>
            <div class="field-box-label" style="color:var(--text-secondary)">Pembawa Barang</div>
            <input type="text" class="form-input" data-field="pembawa" value="${escapeHtml(j.pembawa)}" placeholder="Nama Supir" required>
          </div>
          <div>
            <div class="field-box-label" style="color:var(--text-secondary)">No. Polisi</div>
            <input type="text" class="form-input text-uppercase" data-field="nopol" value="${escapeHtml(j.nopol)}" placeholder="Plat Nomor" required>
          </div>
        </div>
      `;
    } else {
      // Keduanya
      fieldsHTML = `
        <div class="field-box masuk">
          <div>
            <div class="field-box-label masuk-label"><i class="fas fa-arrow-down"></i> Waktu (Masuk)</div>
            <input type="datetime-local" class="form-input" data-field="waktuMasuk" value="${j.waktuMasuk}" required>
          </div>
          <div>
            <div class="field-box-label" style="color:var(--text-secondary)">${j.isSama ? 'Pembawa Barang' : 'Pembawa (Masuk)'}</div>
            <input type="text" class="form-input" data-field="pembawaMasuk" value="${escapeHtml(j.pembawaMasuk)}" placeholder="Nama Supir" required>
          </div>
          <div>
            <div class="field-box-label" style="color:var(--text-secondary)">${j.isSama ? 'No. Polisi' : 'No. Pol (Masuk)'}</div>
            <input type="text" class="form-input text-uppercase" data-field="nopolMasuk" value="${escapeHtml(j.nopolMasuk)}" placeholder="Plat Nomor" required>
          </div>
        </div>

        <label class="checkbox-wrapper">
          <input type="checkbox" data-field="isSama" ${j.isSama ? 'checked' : ''} onchange="saveJadwalFieldsFromDOM(); jadwals[${jIdx}].isSama = this.checked; renderJadwals();">
          Data Keluar sama dengan Masuk?
        </label>

        <div class="field-box keluar">
          <div>
            <div class="field-box-label keluar-label"><i class="fas fa-arrow-up"></i> Waktu (Keluar)</div>
            <input type="datetime-local" class="form-input" data-field="waktuKeluar" value="${j.waktuKeluar}" required>
          </div>
          ${!j.isSama ? `
          <div>
            <div class="field-box-label" style="color:var(--text-secondary)">Pembawa (Keluar)</div>
            <input type="text" class="form-input" data-field="pembawaKeluar" value="${escapeHtml(j.pembawaKeluar)}" placeholder="Nama Supir" required>
          </div>
          <div>
            <div class="field-box-label" style="color:var(--text-secondary)">No. Pol (Keluar)</div>
            <input type="text" class="form-input text-uppercase" data-field="nopolKeluar" value="${escapeHtml(j.nopolKeluar)}" placeholder="Plat Nomor" required>
          </div>
          ` : ''}
        </div>
      `;
    }

    // Items
    let itemsHTML = j.items.map((item, iIdx) => `
      <div class="item-row">
        <input class="form-input" type="text" data-field="barang" value="${escapeHtml(item.barang)}" placeholder="Nama Barang" required>
        <input class="form-input" type="text" data-field="jml" value="${escapeHtml(item.jml)}" placeholder="Jml" required>
        <input class="form-input" type="text" data-field="ket" value="${escapeHtml(item.ket)}" placeholder="Ket (Opsional)">
        ${j.items.length > 1 ? `<button type="button" class="btn-remove-item" onclick="removeItem(${jIdx}, ${iIdx})" title="Hapus"><i class="fas fa-times"></i></button>` : '<div></div>'}
      </div>
    `).join('');

    const cardHTML = `
      <div class="jadwal-card ${expanded}" data-jadwal-index="${jIdx}">
        <div class="jadwal-header" onclick="toggleJadwal(${jIdx})">
          <span class="jadwal-number">Rincian ${jIdx + 1}</span>
          <select class="form-input jadwal-type-select" style="width:auto;padding:6px 32px 6px 10px;font-size:13px;border-radius:8px;" onclick="event.stopPropagation()" onchange="saveJadwalFieldsFromDOM(); jadwals[${jIdx}].type = this.value; renderJadwals();">
            <option value="Masuk" ${j.type === 'Masuk' ? 'selected' : ''}>Masuk</option>
            <option value="Keluar" ${j.type === 'Keluar' ? 'selected' : ''}>Keluar</option>
            <option value="Keduanya" ${j.type === 'Keduanya' ? 'selected' : ''}>Masuk & Keluar</option>
          </select>
          <span class="jadwal-spacer"></span>
          <div class="jadwal-actions">
            ${jadwals.length > 1 ? `<button type="button" class="btn btn-danger btn-sm" onclick="event.stopPropagation(); removeJadwal(${jIdx})" title="Hapus Rincian"><i class="fas fa-trash"></i></button>` : ''}
            <button type="button" class="jadwal-toggle" onclick="event.stopPropagation(); toggleJadwal(${jIdx})"><i class="fas fa-chevron-down"></i></button>
          </div>
        </div>
        <div class="jadwal-body">
          <div class="jadwal-body-inner">
            ${fieldsHTML}

            <div style="margin-top:20px; padding-top:20px; border-top:1px dashed #cbd5e1;">
              <div class="items-section-title"><i class="fas fa-boxes-stacked"></i> Daftar Barang (${typeLabel})</div>
              ${itemsHTML}
              <div class="items-actions">
                <button type="button" class="btn btn-brand-outline btn-sm btn-pill" onclick="addItem(${jIdx})">
                  <i class="fas fa-plus"></i> Tambah Barang
                </button>
                ${jadwals.length > 1 ? `
                <button type="button" class="btn btn-secondary btn-sm btn-pill" onclick="handleCopyItems(${jIdx})">
                  <i class="fas fa-copy"></i> Salin dari Rincian Lain
                </button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', cardHTML);
  });
}

// Expose jadwals & save function for inline handlers
window.jadwals = jadwals;
window.saveJadwalFieldsFromDOM = saveJadwalFieldsFromDOM;
window.renderJadwals = renderJadwals;

// ── Step 3: Signature ──

function renderSignature() {
  const canvasWrap = document.getElementById('sigCanvasWrap');
  const uploadWrap = document.getElementById('sigUploadWrap');
  const tabCanvas = document.getElementById('tabCanvas');
  const tabUpload = document.getElementById('tabUpload');

  if (signatureMode === 'canvas') {
    canvasWrap.style.display = 'block';
    uploadWrap.style.display = 'none';
    tabCanvas.classList.add('active');
    tabUpload.classList.remove('active');
    initSignatureCanvas();
  } else {
    canvasWrap.style.display = 'none';
    uploadWrap.style.display = 'block';
    tabCanvas.classList.remove('active');
    tabUpload.classList.add('active');
    updateUploadLabel();
  }
}

function setSignatureMode(mode) {
  signatureMode = mode;
  renderSignature();
}
window.setSignatureMode = setSignatureMode;

function initSignatureCanvas() {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas) return;

  if (canvas.dataset.initialized === 'true') return;
  canvas.dataset.initialized = 'true';

  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const start = (e) => {
    if (e.cancelable) e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const end = (e) => {
    if (e.cancelable) e.preventDefault();
    isDrawing = false;
  };

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', end, { passive: false });
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
}

function clearCanvas() {
  const canvas = document.getElementById('sigCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
window.clearCanvas = clearCanvas;

function handleSignatureUpload(input) {
  const file = input.files[0];
  if (!file) return;
  signatureFileName = file.name;
  const reader = new FileReader();
  reader.onload = (ev) => {
    signatureUploadData = ev.target.result;
    updateUploadLabel();
  };
  reader.readAsDataURL(file);
}
window.handleSignatureUpload = handleSignatureUpload;

function updateUploadLabel() {
  const textEl = document.querySelector('.sig-upload-text');
  if (textEl) {
    textEl.textContent = signatureFileName || 'Klik untuk memilih foto Tanda Tangan';
    if (signatureFileName) {
      textEl.style.color = 'var(--text)';
      textEl.style.fontWeight = '700';
    }
  }
}

// ── Step 4: Generate & Result ──

async function handleGenerate() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('show');

  // Collect payload
  const vendorName = smartCapitalize(document.getElementById('vendorName').value);
  const lantai = smartCapitalize(document.getElementById('lantai').value);
  const ttdName = smartCapitalize(document.getElementById('ttdName').value);

  // Get signature
  let ttdBase64 = null;
  if (signatureMode === 'canvas') {
    const canvas = document.getElementById('sigCanvas');
    if (canvas) ttdBase64 = canvas.toDataURL('image/png').split(',')[1];
  } else if (signatureUploadData) {
    ttdBase64 = signatureUploadData.split(',')[1];
  }

  // Save jadwal fields from DOM
  saveJadwalFieldsFromDOM();

  // Format jadwals
  const formattedJadwals = jadwals.map(j => ({
    ...j,
    pembawa: smartCapitalize(j.pembawa),
    nopol: (j.nopol || '').toUpperCase(),
    pembawaMasuk: smartCapitalize(j.pembawaMasuk),
    nopolMasuk: (j.nopolMasuk || '').toUpperCase(),
    pembawaKeluar: smartCapitalize(j.pembawaKeluar),
    nopolKeluar: (j.nopolKeluar || '').toUpperCase(),
    items: j.items.map(item => ({
      ...item,
      barang: smartCapitalize(item.barang),
      ket: smartCapitalize(item.ket)
    }))
  }));

  const payload = {
    vendorName,
    lantai,
    ttdName: ttdName || vendorName,
    ttdBase64,
    status: 'Tenant',
    jadwals: formattedJadwals
  };

  try {
    const res = await generateLoadingPDF(payload);
    overlay.classList.remove('show');

    if (res.status === 'success') {
      resultData = {
        url: res.url,
        accessCode: res.accessCode,
        fileName: res.fileName
      };
      renderResult();
    } else {
      Swal.fire({
        title: 'Gagal!',
        text: res.message || 'Terjadi kesalahan saat membuat surat.',
        icon: 'error',
        confirmButtonColor: '#800000',
        customClass: swalTheme()
      });
      // Go back to step 3 so user can retry
      currentStep = 3;
      renderStep();
    }
  } catch (error) {
    overlay.classList.remove('show');
    Swal.fire({
      title: 'Error!',
      text: 'Koneksi gagal. Silakan coba lagi.',
      icon: 'error',
      confirmButtonColor: '#800000',
      customClass: swalTheme()
    });
    currentStep = 3;
    renderStep();
  }
}

function renderResult() {
  if (!resultData) return;

  document.getElementById('resultCode').textContent = resultData.accessCode;
  document.getElementById('resultFileName').textContent = resultData.fileName;

  const now = new Date();
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  document.getElementById('resultDate').textContent = dateStr;

  // Set PDF links
  document.getElementById('btnViewPDF').href = resultData.url;

  const fileIdMatch = resultData.url.match(/[-\w]{25,}/);
  if (fileIdMatch) {
    document.getElementById('btnDownloadPDF').href = `https://drive.google.com/uc?export=download&id=${fileIdMatch[0]}`;
  }
}

function handleSendEmail() {
  if (!resultData) return;

  Swal.fire({
    title: 'Kirim ke Email',
    html: `
      <p style="font-size:14px;color:#475569;margin-bottom:16px;">Masukkan alamat email untuk menerima salinan PDF dan Access Code.</p>
      <input type="email" id="swal-email" class="swal2-input" placeholder="contoh@email.com" style="border-radius:12px;font-family:Inter,sans-serif;font-size:14px;">
    `,
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-paper-plane"></i> Kirim',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#800000',
    customClass: swalTheme(),
    preConfirm: () => {
      const email = document.getElementById('swal-email').value;
      if (!email) {
        Swal.showValidationMessage('Email tidak boleh kosong');
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        Swal.showValidationMessage('Format email tidak valid');
        return false;
      }
      return email;
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      Swal.fire({ title: 'Mengirim Email...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      const res = await sendEmailCopy({
        email: result.value,
        url: resultData.url,
        accessCode: resultData.accessCode,
        fileName: resultData.fileName
      });

      if (res.status === 'success') {
        Swal.fire({
          title: 'Terkirim!',
          text: res.message,
          icon: 'success',
          confirmButtonColor: '#800000',
          customClass: swalTheme()
        });
      } else {
        Swal.fire({
          title: 'Gagal',
          text: res.message || 'Gagal mengirim email.',
          icon: 'error',
          confirmButtonColor: '#800000',
          customClass: swalTheme()
        });
      }
    }
  });
}
window.handleSendEmail = handleSendEmail;

function resetWizard() {
  // Reset state
  currentStep = 1;
  jadwals = [];
  window.jadwals = jadwals;
  signatureMode = 'canvas';
  signatureUploadData = null;
  signatureFileName = '';
  resultData = null;

  // Reset form inputs
  document.getElementById('vendorName').value = '';
  document.getElementById('lantai').value = '';
  document.getElementById('ttdName').value = '';

  // Clear canvas
  clearCanvas();

  // Add default jadwal
  addJadwal();

  // Go to step 1
  renderStep();
}
window.resetWizard = resetWizard;

// ── History View ──

async function searchHistory() {
  const codeInput = document.getElementById('historyAccessCode');
  const code = codeInput.value.replace(/[^0-9]/g, '');
  if (code.length !== 6) {
    showError('Access Code harus 6 digit angka.');
    return;
  }

  const overlay = document.getElementById('loadingOverlay');
  overlay.querySelector('.loading-text').textContent = 'Mencari Surat...';
  overlay.querySelector('.loading-subtext').textContent = 'Mohon tunggu sebentar.';
  overlay.classList.add('show');

  try {
    const res = await fetchHistory(code);
    overlay.classList.remove('show');
    overlay.querySelector('.loading-text').textContent = 'Memproses Dokumen...';
    overlay.querySelector('.loading-subtext').textContent = 'Mohon tunggu sebentar, surat sedang di-generate.';

    if (res.status === 'success') {
      renderHistoryResults(res.data, code);
    } else {
      renderHistoryResults([], code);
      Swal.fire({ title: 'Tidak Ditemukan', text: res.message || 'Surat tidak ditemukan.', icon: 'info', customClass: swalTheme(), confirmButtonColor: '#800000' });
    }
  } catch (err) {
    overlay.classList.remove('show');
    overlay.querySelector('.loading-text').textContent = 'Memproses Dokumen...';
    overlay.querySelector('.loading-subtext').textContent = 'Mohon tunggu sebentar, surat sedang di-generate.';
    showError('Gagal memuat data dari server.');
  }
}
window.searchHistory = searchHistory;

function renderHistoryResults(results, code) {
  const container = document.getElementById('historyResultsContainer');
  if (!results || results.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fas fa-folder-open" style="font-size: 48px; margin-bottom: 16px;"></i>
          <div>Surat tidak ditemukan. Periksa kembali kode Anda.</div>
      </div>
    `;
    return;
  }

  let html = `<h4 style="color: var(--text); margin-bottom: 16px; font-weight: 700;">Ditemukan ${results.length} Surat:</h4>`;
  html += `<div style="display: flex; flex-direction: column; gap: 16px;">`;

  results.forEach((r, idx) => {
    let downloadUrl = r.url;
    const match = r.url.match(/[-\w]{25,}/);
    if (match) {
      downloadUrl = `https://drive.google.com/uc?export=download&id=${match[0]}`;
    }

    html += `
      <div style="background: #fafbfc; padding: 20px; border-radius: var(--radius-lg); border: 1.5px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div style="flex: 1; min-width: 200px;">
              <div style="font-weight: 700; color: var(--text); font-size: 15px;">${escapeHtml(r.fileName)}</div>
              <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;"><i class="far fa-clock"></i> ${escapeHtml(r.date)}</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
              <a href="${r.url}" target="_blank" class="btn btn-brand-outline btn-sm"><i class="fas fa-eye"></i> Lihat</a>
              <a href="${downloadUrl}" class="btn btn-primary btn-sm"><i class="fas fa-download"></i> Download</a>
              <button onclick="handleDeleteHistory('${r.url}', '${code}')" class="btn btn-danger btn-sm"><i class="fas fa-trash"></i> Hapus</button>
          </div>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

function handleDeleteHistory(url, code) {
  Swal.fire({
      title: 'Hapus Surat ini?', 
      text: "Surat akan dihapus permanen dari sistem.", 
      icon: 'warning',
      showCancelButton: true, 
      confirmButtonColor: '#ef4444', 
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      customClass: swalTheme()
  }).then(async (result) => {
      if(result.isConfirmed) {
          Swal.fire({title: 'Menghapus...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
          try {
            const res = await deleteLoading(url, code);
            if(res.status === 'success') {
                Swal.fire({title: 'Terhapus!', text: res.message, icon: 'success', customClass: swalTheme(), confirmButtonColor: '#800000'});
                searchHistory(); // Refresh the list
            } else {
                Swal.fire({title: 'Gagal', text: res.message, icon: 'error', customClass: swalTheme(), confirmButtonColor: '#800000'});
            }
          } catch(err) {
            Swal.fire({title: 'Error', text: 'Gagal menghapus surat', icon: 'error', customClass: swalTheme(), confirmButtonColor: '#800000'});
          }
      }
  });
}
window.handleDeleteHistory = handleDeleteHistory;
