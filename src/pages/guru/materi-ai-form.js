/**
 * HTML & CSS pembangun form Materi AI (dipisah agar file tetap kecil & valid).
 */

export const KELAS_OPTIONS = ['X', 'XI', 'XII'];
export const FASE_OPTIONS = ['E', 'F'];
export const SEMESTER_OPTIONS = ['Ganjil', 'Genap'];
export const ALOKASI_OPTIONS = ['2 JP', '3 JP', '4 JP', '5 JP', '6 JP', '8 JP'];
export const KEDALAMAN_OPTIONS = [
  { value: 'pengenalan', label: 'Pengenalan', desc: 'Konsep dasar, mudah dipahami' },
  { value: 'menengah', label: 'Menengah', desc: 'Lengkap dengan contoh kontekstual' },
  { value: 'hots', label: 'Mendalam (HOTS)', desc: 'Analisis & penalaran tinggi' },
];
export const GAYA_OPTIONS = [
  { value: 'hangat', label: 'Hangat' },
  { value: 'formal', label: 'Formal' },
  { value: 'santai', label: 'Santai' },
  { value: 'memotivasi', label: 'Memotivasi' },
];
export const FITUR_OPTIONS = [
  { value: 'contoh', label: 'Contoh soal bertahap' },
  { value: 'highlight', label: 'Highlight penting' },
  { value: 'fill_blank', label: 'Latihan isian' },
  { value: 'drag_drop', label: 'Drag & drop' },
  { value: 'kuis', label: 'Mini kuis pilihan ganda' },
  { value: 'tugas_kelompok', label: 'Tugas kelompok' },
  { value: 'aktivitas', label: 'Aktivitas / proyek bersama' },
];
export const REVISI_CEPAT = [
  { value: 'ringkas', label: 'Lebih ringkas', instruction: 'Buat materi lebih ringkas dan padat tanpa menghilangkan isi inti. Pangkas kalimat berulang.' },
  { value: 'contoh', label: 'Perbanyak contoh', instruction: 'Tambahkan contoh soal baru yang relevan dengan pembahasan langkah demi langkah. Pertahankan contoh yang sudah ada.' },
  { value: 'latihan', label: 'Tambah latihan', instruction: 'Tambahkan variasi latihan baru tanpa menghapus latihan yang sudah ada.' },
  { value: 'analogi', label: 'Tambah analogi', instruction: 'Tambahkan analogi atau ilustrasi konkret pada bagian yang abstrak agar lebih mudah dipahami.' },
];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function pageStyles() {
  return `
    .maip { --mai-brand:#0a84ff; --mai-brand2:#5e5ce6; --mai-ink:#1d1d1f; --mai-muted:#6e6e73; --mai-line:rgba(0,0,0,.08); }
    .maip * { box-sizing:border-box; }
    .maip-block { background:#fff; border:1px solid var(--mai-line); border-radius:18px; padding:16px; box-shadow:0 8px 24px -20px rgba(0,0,0,.2); }
    .maip-block + .maip-block { margin-top:14px; }
    .maip-step { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
    .maip-step-n { flex:none; width:26px; height:26px; border-radius:9px; background:linear-gradient(135deg,var(--mai-brand),var(--mai-brand2)); color:#fff; font-size:.8rem; font-weight:700; display:inline-flex; align-items:center; justify-content:center; }
    .maip-step h3 { margin:0; font-size:.98rem; font-weight:700; color:var(--mai-ink); letter-spacing:-.01em; }
    .maip-step p { margin:1px 0 0; font-size:.72rem; color:var(--mai-muted); }
    .maip-grid { display:grid; gap:10px; }
    @media (min-width:640px){ .maip-grid-2 { grid-template-columns:1fr 1fr; } .maip-grid-3 { grid-template-columns:repeat(3,1fr); } }
    .maip > #maip-form { display:grid; gap:14px; }
    .maip > #maip-form .maip-block { margin-top:0; }
    @media (min-width:900px){
      .maip > #maip-form { grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; }
      .maip > #maip-form > .maip-block:first-child { grid-column:1/-1; }
    }
    .maip-field label { display:block; font-size:.72rem; font-weight:600; color:var(--mai-muted); margin-bottom:4px; }
    .maip-req::after { content:' *'; color:#ff453a; }
    .maip-in { width:100%; border:1px solid var(--mai-line); border-radius:11px; background:#fafafc; padding:9px 12px; font-size:.88rem; color:var(--mai-ink); transition:border-color .15s ease, box-shadow .15s ease, background .15s ease; }
    .maip-in:focus { outline:none; border-color:var(--mai-brand); background:#fff; box-shadow:0 0 0 3px rgba(10,132,255,.15); }
    .maip-radio-row { display:grid; grid-template-columns:1fr; gap:10px; }
    @media (min-width:520px){ .maip-radio-row { grid-template-columns:repeat(3,minmax(0,1fr)); } }
    .maip-radio { position:relative; display:block; cursor:pointer; }
    .maip-radio input { position:absolute; opacity:0; pointer-events:none; }
    .maip-radio-card { min-height:76px; height:100%; display:flex; flex-direction:column; justify-content:center; border:1.5px solid var(--mai-line); border-radius:12px; padding:12px 13px; background:#fafafc; transition:.15s ease; }
    .maip-radio-card strong { display:block; font-size:.84rem; color:var(--mai-ink); }
    .maip-radio-card span { display:block; font-size:.7rem; color:var(--mai-muted); margin-top:2px; }
    .maip-radio input:checked + .maip-radio-card { border-color:var(--mai-brand); background:rgba(10,132,255,.06); box-shadow:0 0 0 3px rgba(10,132,255,.12); }
    .maip-chip-row { display:flex; flex-wrap:wrap; gap:8px; }
    .maip-chip { position:relative; display:block; cursor:pointer; }
    .maip-chip input { position:absolute; opacity:0; pointer-events:none; }
    .maip-chip-card { display:inline-flex; align-items:center; border:1.5px solid var(--mai-line); background:#fafafc; border-radius:999px; padding:8px 13px; font-size:.8rem; font-weight:600; color:var(--mai-ink); transition:.15s ease; }
    .maip-chip input:checked + .maip-chip-card { border-color:var(--mai-brand); background:rgba(10,132,255,.08); color:var(--mai-brand); box-shadow:0 0 0 3px rgba(10,132,255,.1); }
    .maip-generate { width:100%; border:none; border-radius:14px; padding:14px; background:linear-gradient(135deg,var(--mai-brand),var(--mai-brand2)); color:#fff; font-size:.95rem; font-weight:700; cursor:pointer; box-shadow:0 12px 28px -14px rgba(10,132,255,.6); transition:transform .15s ease, opacity .15s ease; }
    .maip-generate:active { transform:scale(.98); }
    .maip-generate:disabled { opacity:.6; cursor:not-allowed; }
    .maip-status-pill { display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:5px 11px; font-size:.7rem; font-weight:600; }
    .maip-status-pill.ok { background:rgba(48,209,88,.12); color:#1f9d43; }
    .maip-status-pill.err { background:rgba(255,69,58,.12); color:#d92b20; }
    .maip-status-pill.idle { background:rgba(0,0,0,.06); color:var(--mai-muted); }
    .maip-dot { width:7px; height:7px; border-radius:999px; background:currentColor; }
    .maip-btn { border:1px solid var(--mai-line); background:#fff; border-radius:10px; padding:8px 12px; font-size:.78rem; font-weight:600; color:var(--mai-ink); cursor:pointer; transition:.15s ease; }
    .maip-btn:hover { border-color:var(--mai-brand); color:var(--mai-brand); }
    .maip-btn:disabled { opacity:.5; cursor:not-allowed; }
    .maip-btn.primary { background:var(--mai-brand); color:#fff; border-color:var(--mai-brand); }
    .maip-btn.green { background:#30d158; color:#fff; border-color:#30d158; }
    .maip-preview-frame { width:100%; border:0; display:block; min-height:520px; background:#f5f5f7; border-radius:16px; }
    .maip-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:56px 20px; color:var(--mai-muted); text-align:center; }
    .maip-empty-icon { font-size:34px; opacity:.5; }
    .maip-progress { border:1px solid var(--mai-line); border-radius:12px; background:#fff; padding:12px 14px; font-family:ui-monospace,Menlo,monospace; font-size:.72rem; color:var(--mai-muted); max-height:150px; overflow:auto; white-space:pre-wrap; word-break:break-word; }
    .maip-typing { display:inline-block; width:6px; height:6px; margin:0 1px; border-radius:999px; background:var(--mai-brand); animation:maipPulse 1s ease-in-out infinite; }
    .maip-modal { position:fixed; inset:0; z-index:120; display:none; align-items:center; justify-content:center; padding:16px; background:rgba(29,29,31,.42); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
    .maip-modal.open { display:flex; }
    .maip-modal-card { width:min(560px,100%); max-height:min(82vh,680px); overflow:auto; border:1px solid rgba(255,255,255,.6); border-radius:22px; background:rgba(255,255,255,.96); padding:18px; box-shadow:0 30px 80px -34px rgba(0,0,0,.45); }
    .maip-targets { display:grid; gap:8px; margin-top:12px; }
    .maip-target { display:flex; align-items:flex-start; gap:10px; border:1px solid var(--mai-line); border-radius:13px; padding:10px 12px; background:#fff; cursor:pointer; }
    .maip-target input { width:18px; height:18px; margin-top:1px; accent-color:var(--mai-brand); }
    .maip-target strong { display:block; font-size:.86rem; color:var(--mai-ink); }
    .maip-target span { display:block; margin-top:1px; font-size:.7rem; color:var(--mai-muted); }
    @keyframes maipPulse { 0%,100%{opacity:.3} 50%{opacity:1} }
    @media (max-width:639px){ .maip-block{padding:14px 12px; border-radius:16px;} }
  `;
}

export function statusBannerHtml() {
  return `
    <div class="maip-block" style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:20px">&#10022;</span>
        <div>
          <p style="margin:0; font-size:.9rem; font-weight:700; color:var(--mai-ink)">Generator Materi AI</p>
          <p style="margin:1px 0 0; font-size:.72rem; color:var(--mai-muted)">Model &amp; koneksi diatur oleh admin sekolah</p>
        </div>
      </div>
      <span id="maip-conn" class="maip-status-pill idle"><span class="maip-dot"></span>Memeriksa koneksi&hellip;</span>
    </div>`;
}

export function blok1Html() {
  const kelasOpts = KELAS_OPTIONS.map((k) => `<option value="${k}">${k}</option>`).join('');
  const faseOpts = FASE_OPTIONS.map((f) => `<option value="${f}">${f}</option>`).join('');
  const semesterOpts = SEMESTER_OPTIONS.map((s) => `<option value="${s}">${s}</option>`).join('');
  const alokasiOpts = ALOKASI_OPTIONS.map((a) => `<option value="${a}">${a}</option>`).join('');
  return `
    <div class="maip-block">
      <div class="maip-step"><span class="maip-step-n">1</span><div><h3>Tentang Materi</h3><p>Informasi dasar materi yang akan dibuat</p></div></div>
      <div class="maip-grid maip-grid-2">
        <div class="maip-field"><label class="maip-req">Mata Pelajaran</label><input name="mapel" class="maip-in" placeholder="Mis. Matematika"></div>
        <div class="maip-field"><label class="maip-req">Topik / Materi Pokok</label><input name="topik" class="maip-in" placeholder="Mis. SPLDV"></div>
        <div class="maip-field"><label>Bab / Unit</label><input name="bab" class="maip-in" placeholder="Mis. Persamaan Linear"></div>
        <div class="maip-field"><label>Alokasi Waktu</label><select name="alokasiWaktu" class="maip-in">${alokasiOpts}</select></div>
      </div>
      <div class="maip-grid maip-grid-3" style="margin-top:10px">
        <div class="maip-field"><label>Kelas</label><select name="kelas" class="maip-in">${kelasOpts}</select></div>
        <div class="maip-field"><label>Rombel</label><input name="rombel" class="maip-in" placeholder="Mis. 1"></div>
        <div class="maip-field"><label>Fase</label><select name="fase" class="maip-in">${faseOpts}</select></div>
      </div>
      <div class="maip-grid maip-grid-3" style="margin-top:10px">
        <div class="maip-field"><label>Semester</label><select name="semester" class="maip-in">${semesterOpts}</select></div>
      </div>
    </div>`;
}

export function blok2Html() {
  const kedalamanRadios = KEDALAMAN_OPTIONS.map((o, i) => `
      <label class="maip-radio"><input type="radio" name="kedalaman" value="${o.value}" ${i === 1 ? 'checked' : ''}>
        <span class="maip-radio-card"><strong>${o.label}</strong><span>${o.desc}</span></span></label>`).join('');
  const gayaChips = GAYA_OPTIONS.map((o, i) => `
      <label class="maip-chip"><input type="radio" name="gaya" value="${o.value}" ${i === 0 ? 'checked' : ''}>
        <span class="maip-chip-card">${o.label}</span></label>`).join('');
  return `
    <div class="maip-block">
      <div class="maip-step"><span class="maip-step-n">2</span><div><h3>Karakter Materi</h3><p>Seberapa dalam dan bagaimana gaya bahasanya</p></div></div>
      <div class="maip-field"><label>Tingkat Kedalaman</label><div class="maip-radio-row">${kedalamanRadios}</div></div>
      <div class="maip-field" style="margin-top:12px"><label>Gaya Bahasa</label><div class="maip-chip-row">${gayaChips}</div></div>
    </div>`;
}

export function blok3Html() {
  const defaults = ['contoh', 'highlight', 'fill_blank', 'tugas_kelompok'];
  const fiturChips = FITUR_OPTIONS.map((o) => `
      <label class="maip-chip"><input type="checkbox" name="fitur" value="${o.value}" ${defaults.includes(o.value) ? 'checked' : ''}>
        <span class="maip-chip-card">${o.label}</span></label>`).join('');
  return `
    <div class="maip-block">
      <div class="maip-step"><span class="maip-step-n">3</span><div><h3>Fitur &amp; Aktivitas</h3><p>Pilih komponen yang ingin ada di materi</p></div></div>
      <div class="maip-chip-row">${fiturChips}</div>
      <div class="maip-field" style="margin-top:12px"><label>Jumlah Contoh Soal</label><input name="jumlahContoh" type="number" min="0" max="10" value="3" class="maip-in" style="max-width:120px"></div>
      <div class="maip-field" style="margin-top:12px"><label>Catatan Tambahan (opsional)</label><textarea name="lainLain" rows="2" class="maip-in" placeholder="Mis. tekankan soal HOTS, sertakan konteks kehidupan sehari-hari"></textarea></div>
      <button type="submit" id="maip-generate" class="maip-generate" style="margin-top:14px">&#10022; Generate Materi</button>
    </div>`;
}

export function resultHtml() {
  const revisiBtns = REVISI_CEPAT.map((r) => `<button type="button" class="maip-btn" data-revisi="${r.value}" data-instruction="${escapeHtml(r.instruction)}">${r.label}</button>`).join('');
  return `
    <div class="maip-block">
      <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px;">
        <div class="maip-step" style="margin:0"><span class="maip-step-n">&#10003;</span><div><h3>Hasil Materi</h3><p id="maip-result-sub">Pratinjau akan tampil di sini</p></div></div>
        <div style="display:flex; gap:7px; flex-wrap:wrap;">
          <button type="button" id="maip-stop" class="maip-btn" disabled>Stop</button>
          <button type="button" id="maip-simpan" class="maip-btn green" disabled>Simpan</button>
          <button type="button" id="maip-publish" class="maip-btn primary" disabled>Publish</button>
        </div>
      </div>
      <div id="maip-progress-wrap" hidden>
        <p id="maip-progress-label" style="margin:0 0 6px; font-size:.72rem; color:var(--mai-muted)"><span class="maip-typing"></span><span class="maip-typing"></span><span class="maip-typing"></span> AI sedang berpikir dan menulis materi&hellip;</p>
        <div id="maip-progress" class="maip-progress"></div>
      </div>
      <div id="maip-preview-wrap">
        <div class="maip-empty" id="maip-empty">
          <div class="maip-empty-icon">&#128214;</div>
          <p style="margin:0; font-size:.84rem">Belum ada materi. Isi form lalu klik <strong>Generate Materi</strong>.</p>
        </div>
        <iframe id="maip-preview" class="maip-preview-frame" title="Pratinjau materi" hidden></iframe>
      </div>
      <div id="maip-revisi-wrap" hidden style="margin-top:14px; border-top:1px solid var(--mai-line); padding-top:12px;">
        <p style="margin:0 0 8px; font-size:.72rem; font-weight:600; color:var(--mai-muted)">Revisi cepat</p>
        <div style="display:flex; flex-wrap:wrap; gap:7px;">${revisiBtns}</div>
        <div style="display:flex; gap:7px; margin-top:10px; flex-wrap:wrap;">
          <input id="maip-revisi-input" class="maip-in" style="flex:1; min-width:180px" placeholder="Instruksi revisi manual, mis. perbanyak contoh numerik di SPLDV">
          <button type="button" id="maip-revisi-btn" class="maip-btn primary">Revisi</button>
        </div>
      </div>
      <div id="maip-error-wrap" hidden style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin:12px 0 0; padding:10px 12px; border:1px solid rgba(255,69,58,.22); border-radius:12px; background:rgba(255,69,58,.06);">
        <p id="maip-error" style="margin:0; font-size:.8rem; line-height:1.45; color:#d92b20"></p>
        <button type="button" id="maip-retry" class="maip-btn" style="flex:none; border-color:#ff453a; color:#d92b20;">Generate Ulang</button>
      </div>
      <p id="maip-status" style="margin:10px 0 0; font-size:.74rem; color:var(--mai-muted)"></p>
    </div>`;
}

export function publishModalHtml() {
  return `
    <div id="maip-publish-modal" class="maip-modal" aria-hidden="true">
      <div class="maip-modal-card" role="dialog" aria-modal="true" aria-labelledby="maip-publish-title">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
          <div><h3 id="maip-publish-title" style="margin:0; font-size:1rem;">Bagikan ke Kelas</h3><p style="margin:3px 0 0; font-size:.74rem; color:var(--mai-muted);">Pilih satu atau beberapa kelas dari relasi mengajar aktif.</p></div>
          <button type="button" id="maip-publish-close" class="maip-btn" aria-label="Tutup">Tutup</button>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:12px;">
          <button type="button" id="maip-select-all" class="maip-btn">Pilih Semua</button>
          <span id="maip-target-count" style="font-size:.72rem; color:var(--mai-muted);">0 kelas dipilih</span>
        </div>
        <div id="maip-target-list" class="maip-targets"></div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
          <button type="button" id="maip-publish-cancel" class="maip-btn">Batal</button>
          <button type="button" id="maip-publish-confirm" class="maip-btn primary" disabled>Publish</button>
        </div>
      </div>
    </div>`;
}
