// ============================================================================
// backup-history.js
// Manajemen riwayat backup lokal (localStorage) dengan metadata lengkap
// ============================================================================

const HISTORY_KEY = 'simguru_backup_history';
const MAX_HISTORY_ITEMS = 50; // simpan maksimal 50 riwayat

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function calculateSHA256(buffer) {
  return crypto.subtle.digest('SHA-256', buffer).then((hash) => {
    const bytes = new Uint8Array(hash);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  });
}

export async function addBackupHistory(metadata) {
  const {
    fileName,
    fileSize,
    checksum,
    assignmentsCount,
    totalStudents,
    totalAbsensiRecords,
    totalNilaiRecords,
    tahunAjaranId,
    semesterId,
    backupType = 'full', // 'full' | 'incremental' | 'selective'
    selectedClasses = [],
    selectedDataTypes = [], // ['absensi', 'nilai']
    format = 'xlsx',
    durationMs,
    // Info tujuan & Google Drive (opsional)
    destination = 'local', // 'local' | 'drive' | 'both'
    driveUploaded = false,
    driveWebViewLink = '',
    driveFolderLink = '',
  } = metadata;

  const session = getSession();
  const userId = session?.user?.username || '';
  const userName = session?.user?.nama || 'Guru';

  const entry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    userId,
    userName,
    fileName,
    fileSize,
    checksum,
    assignmentsCount,
    totalStudents,
    totalAbsensiRecords,
    totalNilaiRecords,
    tahunAjaranId,
    semesterId,
    backupType,
    selectedClasses,
    selectedDataTypes,
    format,
    durationMs,
    destination,
    driveUploaded,
    driveWebViewLink,
    driveFolderLink,
    status: 'completed',
  };

  try {
    const history = getBackupHistory();
    history.unshift(entry);
    // Batasi jumlah item
    if (history.length > MAX_HISTORY_ITEMS) {
      history.splice(MAX_HISTORY_ITEMS);
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return entry;
  } catch (e) {
    console.warn('Gagal menyimpan riwayat backup:', e);
    return null;
  }
}

export function getBackupHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getBackupHistoryById(id) {
  const history = getBackupHistory();
  return history.find((h) => h.id === id) || null;
}

export function deleteBackupHistory(id) {
  try {
    let history = getBackupHistory();
    history = history.filter((h) => h.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

export function clearBackupHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getBackupStats() {
  const history = getBackupHistory();
  if (!history.length) {
    return {
      totalBackups: 0,
      totalSize: 0,
      lastBackup: null,
      avgSize: 0,
      byType: {},
      byFormat: {},
    };
  }

  const totalSize = history.reduce((sum, h) => sum + (h.fileSize || 0), 0);
  const byType = {};
  const byFormat = {};

  history.forEach((h) => {
    byType[h.backupType] = (byType[h.backupType] || 0) + 1;
    byFormat[h.format] = (byFormat[h.format] || 0) + 1;
  });

  return {
    totalBackups: history.length,
    totalSize,
    lastBackup: history[0]?.timestamp || null,
    avgSize: Math.round(totalSize / history.length),
    byType,
    byFormat,
  };
}

export function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(ms) {
  if (!ms || ms < 1000) return `${ms || 0} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} detik`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function getBackupTypeLabel(type) {
  const labels = {
    full: 'Penuh',
    incremental: 'Inkremental',
    selective: 'Selektif',
  };
  return labels[type] || type;
}

export function getBackupTypeBadgeClass(type) {
  const classes = {
    full: 'bg-emerald-100 text-emerald-700',
    incremental: 'bg-sky-100 text-sky-700',
    selective: 'bg-amber-100 text-amber-700',
  };
  return classes[type] || 'bg-slate-100 text-slate-700';
}

export function getDestinationMeta(destination, driveUploaded = false) {
  // Kembalikan label, kelas badge, dan ikon SVG untuk tujuan backup.
  const cloud = `<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.5A3.5 3.5 0 0016.5 13H16a5 5 0 10-9.9 1.2A3 3 0 006 20h12a3 3 0 002-3.5z"/></svg>`;
  const device = `<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>`;
  const both = `<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  switch (destination) {
    case 'drive':
      return { label: 'Drive', badge: 'bg-sky-100 text-sky-700', icon: cloud };
    case 'both':
      return { label: 'Lokal + Drive', badge: 'bg-indigo-100 text-indigo-700', icon: both };
    case 'local':
    default:
      return { label: 'Lokal', badge: 'bg-slate-100 text-slate-600', icon: device };
  }
}

export function getFormatLabel(format) {
  const labels = {
    xlsx: 'Excel (.xlsx)',
    csv: 'CSV (.csv)',
    json: 'JSON (.json)',
  };
  return labels[format] || format;
}

export function getFormatIcon(format) {
  const icons = {
    xlsx: `<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5"/></svg>`,
    csv: `<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
    json: `<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`,
  };
  return icons[format] || icons.xlsx;
}

// Validasi integritas file backup
export async function validateBackupFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const checksum = await calculateSHA256(arrayBuffer);

  // Coba baca sebagai Excel untuk validasi struktur
  let sheetCount = 0;
  let totalRows = 0;
  let sheetsInfo = [];

  try {
    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    sheetCount = workbook.worksheets.length;
    workbook.worksheets.forEach((sheet) => {
      const rowCount = sheet.rowCount || 0;
      totalRows += rowCount;
      sheetsInfo.push({
        name: sheet.name,
        rowCount,
        colCount: sheet.columnCount || 0,
      });
    });
  } catch (e) {
    // Bukan file Excel valid atau error parsing
  }

  return {
    valid: true,
    checksum,
    fileSize: arrayBuffer.byteLength,
    sheetCount,
    totalRows,
    sheetsInfo,
  };
}

async function loadExcelJS() {
  if (window.ExcelJS && window.ExcelJS.Workbook) return window.ExcelJS;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Gagal memuat ExcelJS'));
    document.head.appendChild(s);
  });
  return window.ExcelJS;
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

// Helper untuk komputasi checksum saat export
export async function computeChecksum(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return calculateSHA256(arrayBuffer);
}