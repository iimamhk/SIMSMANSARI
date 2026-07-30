/**
 * Unggah berkas backup langsung dari browser ke Google Drive.
 *
 * Alur:
 * 1. Minta access token berumur pendek ke `/api/admin/backup-config` (action: 'token').
 *    Server menukar refresh token terenkripsi menjadi access token dan
 *    memastikan folder tujuan sudah ada.
 * 2. Unggah blob ke Google Drive memakai `uploadType=multipart` langsung dari
 *    browser, sehingga ukuran berkas tidak dibatasi limit body serverless.
 * 3. Laporkan metadata hasil unggahan agar tampil di panel admin.
 *
 * Kegagalan Drive tidak boleh menggagalkan backup: pemanggil tetap mendapat
 * berkas lokal, dan fungsi ini mengembalikan status alih-alih melempar error.
 */

import { getDriveUploadToken, recordDriveUpload } from '../firebase/auth-service.js';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink';
const DRIVE_PREFERENCE_KEY = 'backup_drive_enabled';

/** Preferensi pengguna: unggah ke Drive setiap kali backup. Default aktif. */
export function isDriveUploadEnabled() {
  try {
    return localStorage.getItem(DRIVE_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setDriveUploadEnabled(enabled) {
  try {
    localStorage.setItem(DRIVE_PREFERENCE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Penyimpanan diblokir; preferensi kembali ke default aktif.
  }
}

/**
 * Periksa kesiapan Drive tanpa mengunggah apa pun.
 * @returns {Promise<{available:boolean, reason?:string, folderName?:string, accountEmail?:string}>}
 */
export async function checkDriveStatus() {
  try {
    const token = await getDriveUploadToken();
    if (!token.available) return { available: false, reason: token.reason };
    return {
      available: true,
      folderName: token.folderName || '',
      accountEmail: token.accountEmail || '',
    };
  } catch (error) {
    return { available: false, reason: error?.message || 'Status Drive tidak dapat diperiksa.' };
  }
}

/**
 * Unggah satu blob ke folder backup Google Drive.
 *
 * @param {Blob} blob Isi berkas.
 * @param {string} fileName Nama berkas tujuan.
 * @param {object} [options]
 * @param {(text:string)=>void} [options.onProgress] Pelaporan status singkat.
 * @param {string} [options.mimeType] MIME type berkas.
 * @returns {Promise<{uploaded:boolean, reason?:string, fileId?:string, fileName?:string, webViewLink?:string, folderName?:string}>}
 */
export async function uploadBackupToDrive(blob, fileName, options = {}) {
  const { onProgress = () => {}, mimeType } = options;

  if (!(blob instanceof Blob)) {
    return { uploaded: false, reason: 'Berkas backup tidak valid.' };
  }
  if (!isDriveUploadEnabled()) {
    return { uploaded: false, reason: 'Unggah Drive dimatikan pada perangkat ini.' };
  }

  onProgress('Menyiapkan koneksi Google Drive...');
  let token;
  try {
    token = await getDriveUploadToken();
  } catch (error) {
    return { uploaded: false, reason: error?.message || 'Token Drive tidak dapat diambil.' };
  }
  if (!token.available) {
    return { uploaded: false, reason: token.reason };
  }

  const metadata = {
    name: fileName,
    mimeType: mimeType || blob.type || 'application/octet-stream',
  };
  if (token.folderId) metadata.parents = [token.folderId];

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob, fileName);

  onProgress('Mengunggah ke Google Drive...');
  let response;
  try {
    response = await fetch(DRIVE_UPLOAD_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.accessToken}` },
      body: form,
    });
  } catch (error) {
    return { uploaded: false, reason: 'Koneksi ke Google Drive gagal. Periksa jaringan.' };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      detail = errorBody?.error?.message || detail;
    } catch {
      // Biarkan detail default.
    }
    // storageQuotaExceeded biasanya berarti penyimpanan Drive akun penuh.
    const friendly = /quota/i.test(detail)
      ? 'Penyimpanan Google Drive akun tujuan penuh.'
      : `Google Drive menolak unggahan: ${detail}`;
    return { uploaded: false, reason: friendly };
  }

  const result = await response.json().catch(() => ({}));
  const fileId = String(result.id || '');

  await recordDriveUpload({
    fileName: result.name || fileName,
    fileId,
    size: Number(result.size || blob.size || 0),
  });

  onProgress('Unggahan Google Drive selesai.');
  return {
    uploaded: true,
    fileId,
    fileName: result.name || fileName,
    webViewLink: result.webViewLink || '',
    folderName: token.folderName || '',
  };
}
