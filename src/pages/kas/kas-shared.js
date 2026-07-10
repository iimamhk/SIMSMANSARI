import { subscribeCollection, getDocumentsWhere, saveDocument, deleteDocument } from '../../firebase/data-service.js';

export const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const KATEGORI_PENGELUARAN = ['ATK', 'Fotokopi', 'Kebersihan', 'Hadiah', 'Kegiatan', 'Sosial', 'Lainnya'];
export const KATEGORI_PEMASUKAN = ['Iuran', 'Donasi', 'Lainnya'];

export function buildKasId(context, kelasId) {
  return `${context.tahun_ajaran_aktif}_${context.semester_aktif}_${kelasId}`;
}

export function getMonthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function currentMonthKey() {
  return getMonthKey(new Date());
}

export function monthLabel(key) {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return '-';
  const parts = key.split('-');
  const year = parts[0];
  const month = Number(parts[1]);
  return `${NAMA_BULAN[month - 1]} ${year}`;
}

export function getSemesterMonths(context) {
  const startYear = String(context.tahun_ajaran_aktif || '').split('_')[0];
  const isGanjil = String(context.semester_aktif || '').endsWith('_1');
  const baseYear = Number(startYear) || new Date().getFullYear();
  const startMonth = isGanjil ? 6 : 0;
  const yearOffset = isGanjil ? 0 : 1;
  const months = [];
  for (let i = 0; i < 6; i += 1) {
    const m = startMonth + i;
    const monthIndex = m % 12;
    const year = baseYear + yearOffset + Math.floor(m / 12);
    months.push(`${year}-${String(monthIndex + 1).padStart(2, '0')}`);
  }
  return months;
}

export function formatRupiah(value) {
  const num = Number(value || 0);
  return `Rp ${num.toLocaleString('id-ID')}`;
}

export function parseNumber(value) {
  const cleaned = String(value || '').replace(/[^0-9]/g, '');
  return Number(cleaned) || 0;
}

export function formatTanggal(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export function getDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getWeekKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const weekNo = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${tmp.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getPeriodKey(date, frekuensi) {
  if (frekuensi === 'harian') return getDateKey(date);
  if (frekuensi === 'mingguan') return getWeekKey(date);
  return getMonthKey(date);
}

export function getPeriodLabel(periode, frekuensi) {
  if (!periode) return '-';
  if (frekuensi === 'harian') {
    const parts = periode.split('-');
    if (parts.length === 3) return `${parts[2]} ${NAMA_BULAN[Number(parts[1]) - 1]} ${parts[0]}`;
    return periode;
  }
  if (frekuensi === 'mingguan') {
    const parts = periode.split('-W');
    if (parts.length === 2) return `Minggu ${Number(parts[1])} ${parts[0]}`;
    return periode;
  }
  return monthLabel(periode);
}

export function getSemesterWeeks(context) {
  const startYear = String(context.tahun_ajaran_aktif || '').split('_')[0];
  const isGanjil = String(context.semester_aktif || '').endsWith('_1');
  const baseYear = Number(startYear) || new Date().getFullYear();
  const startMonth = isGanjil ? 6 : 0;
  const yearOffset = isGanjil ? 0 : 1;
  const semesterStart = new Date(baseYear + yearOffset, startMonth, 1);
  const semesterEnd = new Date(baseYear + yearOffset, startMonth + 6, 0);
  const weeks = [];
  const d = new Date(semesterStart);
  const dayOfWeek = d.getDay();
  if (dayOfWeek !== 1) d.setDate(d.getDate() + ((7 - dayOfWeek + 1) % 7));
  if (d < semesterStart) d.setDate(d.getDate() + 7);
  while (d <= semesterEnd) {
    const key = getWeekKey(d);
    const weekEnd = new Date(d);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const fmt = (dd) => `${dd.getDate()} ${NAMA_BULAN[dd.getMonth()]} ${dd.getFullYear()}`;
    weeks.push({ key, label: `${fmt(d)} - ${fmt(weekEnd)}` });
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

export function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function subscribeKas(kasId, callback) {
  return subscribeCollection('kas_transaksi', [{ field: 'kas_id', value: kasId }], callback);
}

export async function getKasConfig(kasId) {
  const result = await getDocumentsWhere('kas_kelas', [{ field: 'id', value: kasId }]);
  return result[0] || null;
}

export async function saveKasConfig(payload, id) {
  return saveDocument('kas_kelas', payload, id);
}

export async function saveTransaksi(payload, id = null) {
  return saveDocument('kas_transaksi', payload, id);
}

export async function deleteTransaksi(id) {
  return deleteDocument('kas_transaksi', id);
}

export function hitungStatistik(transaksi, members, config, context) {
  const frekuensi = config?.frekuensi || 'bulanan';
  const pemasukan = transaksi.filter((t) => t.jenis === 'pemasukan');
  const pengeluaran = transaksi.filter((t) => t.jenis === 'pengeluaran');
  const totalPemasukan = pemasukan.reduce((sum, t) => sum + Number(t.nominal || 0), 0);
  const totalPengeluaran = pengeluaran.reduce((sum, t) => sum + Number(t.nominal || 0), 0);
  const saldo = totalPemasukan - totalPengeluaran;
  let currentPeriodKey;
  let labelPeriode;
  if (frekuensi === 'harian') {
    currentPeriodKey = getDateKey(new Date());
    labelPeriode = 'Hari Ini';
  } else if (frekuensi === 'mingguan') {
    currentPeriodKey = getWeekKey(new Date());
    labelPeriode = 'Minggu Ini';
  } else {
    currentPeriodKey = currentMonthKey();
    labelPeriode = monthLabel(currentPeriodKey);
  }
  const resolvePeriodKey = (item) => item.periode || getPeriodKey(new Date(item.tanggal), frekuensi);
  const pemasukanPeriodeIni = pemasukan.filter((t) => resolvePeriodKey(t) === currentPeriodKey).reduce((sum, t) => sum + Number(t.nominal || 0), 0);
  const pengeluaranPeriodeIni = pengeluaran.filter((t) => resolvePeriodKey(t) === currentPeriodKey).reduce((sum, t) => sum + Number(t.nominal || 0), 0);
  const paidSiswa = new Set(
    pemasukan
      .filter((t) => t.siswa_id && resolvePeriodKey(t) === currentPeriodKey)
      .map((t) => t.siswa_id)
  );
  const tunggakan = members.filter((m) => !paidSiswa.has(m.siswa_id || m.id));
  const kategoriMap = {};
  pengeluaran.forEach((t) => {
    const key = t.kategori || 'Lainnya';
    kategoriMap[key] = (kategoriMap[key] || 0) + Number(t.nominal || 0);
  });
  return {
    totalPemasukan,
    totalPengeluaran,
    saldo,
    pemasukanPeriodeIni,
    pengeluaranPeriodeIni,
    labelPeriode,
    tunggakan,
    kategoriMap,
  };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportKasExcel(rows, context, config) {
  if (!window.XLSX) {
    alert('Library Excel belum dimuat. Coba muat ulang halaman.');
    return;
  }
  const sorted = rows.slice().sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
  let running = 0;
  const mutasi = sorted.map((t) => {
    const masuk = t.jenis === 'pemasukan' ? Number(t.nominal || 0) : 0;
    const keluar = t.jenis === 'pengeluaran' ? Number(t.nominal || 0) : 0;
    running += masuk - keluar;
    return [formatTanggal(t.tanggal), t.siswa_nama || t.kategori || '-', masuk, keluar, running, t.keterangan || ''];
  });
  const totalPemasukan = rows.filter((t) => t.jenis === 'pemasukan').reduce((s, t) => s + Number(t.nominal || 0), 0);
  const totalPengeluaran = rows.filter((t) => t.jenis === 'pengeluaran').reduce((s, t) => s + Number(t.nominal || 0), 0);
  const saldoAkhir = rows.reduce((s, t) => s + (t.jenis === 'pemasukan' ? Number(t.nominal || 0) : -Number(t.nominal || 0)), 0);
  const worksheetData = [
    ['KAS KELAS', config && config.kelas_nama ? config.kelas_nama : '', '', '', '', '', ''],
    ['Tahun Ajaran', (config && config.tahun_ajaran_aktif_nama) || (context && context.tahun_ajaran_aktif) || '-', '', '', '', '', ''],
    ['Semester', (config && config.semester_aktif_nama) || (context && context.semester_aktif) || '-', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
    ['Mutasi Kas (Rekening)'],
    ['', '', '', '', '', '', ''],
    ['No', 'Tanggal', 'Keterangan', 'Dana Masuk', 'Dana Keluar', 'Saldo', 'Keterangan'],
    ...mutasi.map((row, index) => [index + 1, ...row]),
    ['', '', '', 'Total Pemasukan', totalPemasukan, '', ''],
    ['', '', '', 'Total Pengeluaran', totalPengeluaran, '', ''],
    ['', '', '', 'Saldo Akhir', saldoAkhir, '', ''],
  ];
  const workbook = window.XLSX.utils.book_new();
  const worksheet = window.XLSX.utils.aoa_to_sheet(worksheetData);
  worksheet['!cols'] = [{ wch: 4 }, { wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 30 }];
  window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Kas Kelas');
  const wbout = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), `kas-kelas-${(config && config.kelas_nama) || 'kelas'}.xlsx`);
}

export function exportKasPdf(rows, context, config, stat) {
  const jspdf = window.jspdf || {};
  const jsPDF = jspdf.jsPDF;
  if (!jsPDF) {
    alert('Library PDF belum dimuat. Coba muat ulang halaman.');
    return;
  }
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const maxWidth = doc.internal.pageSize.width - margin * 2;
  let y = margin;
  const writeWrapped = (text, x, currentY, indent, bold) => {
    doc.setFont(undefined, bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(String(text), maxWidth - indent);
    doc.text(lines, x + indent, currentY);
    return currentY + lines.length * 14;
  };

  doc.setFontSize(16);
  doc.text(`Laporan Kas Kelas ${(config && config.kelas_nama) || ''}`, margin, y);
  y += 22;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Tahun Ajaran: ${((config && config.tahun_ajaran_aktif_nama) || (context && context.tahun_ajaran_aktif) || '-')}  |  Semester: ${((config && config.semester_aktif_nama) || (context && context.semester_aktif) || '-')}`, margin, y);
  doc.setTextColor(0);
  y += 24;

  doc.setFontSize(11);
  y = writeWrapped(`Total Pemasukan : ${formatRupiah(stat.totalPemasukan)}`, margin, y, 0, true);
  y = writeWrapped(`Total Pengeluaran: ${formatRupiah(stat.totalPengeluaran)}`, margin, y, 0, true);
  y = writeWrapped(`Saldo Akhir     : ${formatRupiah(stat.saldo)}`, margin, y, 0, true);
  y = writeWrapped(`Siswa Menunggak : ${stat.tunggakan.length} siswa`, margin, y, 0, true);
  y += 16;

  doc.setFontSize(12);
  doc.text('Mutasi Kas (Rekening)', margin, y);
  y += 18;

  if (!rows.length) {
    doc.setFontSize(10);
    doc.text('Belum ada transaksi.', margin, y);
  }

  const sorted = rows.slice().sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
  let running = 0;
  sorted.forEach((t) => {
    if (y > doc.internal.pageSize.height - margin - 60) {
      doc.addPage();
      y = margin;
    }
    const masuk = t.jenis === 'pemasukan' ? Number(t.nominal || 0) : 0;
    const keluar = t.jenis === 'pengeluaran' ? Number(t.nominal || 0) : 0;
    running += masuk - keluar;
    y = writeWrapped(`${formatTanggal(t.tanggal)}  |  ${t.siswa_nama || t.kategori || '-'}  |  ${t.keterangan || '-'}`, margin, y, 0, true);
    y = writeWrapped(`Masuk: ${formatRupiah(masuk)}   Keluar: ${formatRupiah(keluar)}   Saldo: ${formatRupiah(running)}`, margin, y, 12, false);
    y += 10;
  });

  doc.save(`laporan-kas-kelas-${(config && config.kelas_nama) || 'kelas'}.pdf`);
}

export function exportKasWord(rows, context, config, stat) {
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const sorted = rows.slice().sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
  let running = 0;
  const rowsHtml = sorted
    .map((t, index) => {
      const masuk = t.jenis === 'pemasukan' ? Number(t.nominal || 0) : 0;
      const keluar = t.jenis === 'pengeluaran' ? Number(t.nominal || 0) : 0;
      running += masuk - keluar;
      return `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(formatTanggal(t.tanggal))}</td>
        <td>${escapeHtml(t.siswa_nama || t.kategori || '-')}</td>
        <td style="text-align:right;color:#059669">${masuk ? escapeHtml(formatRupiah(masuk)) : '-'}</td>
        <td style="text-align:right;color:#e11d48">${keluar ? escapeHtml(formatRupiah(keluar)) : '-'}</td>
        <td style="text-align:right;font-weight:bold">${escapeHtml(formatRupiah(running))}</td>
      </tr>`;
    })
    .join('');

  const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Laporan Kas Kelas</title></head><body>
    <h2>Laporan Kas Kelas ${escapeHtml((config && config.kelas_nama) || '')}</h2>
    <p>Tahun Ajaran: ${escapeHtml((config && config.tahun_ajaran_aktif_nama) || (context && context.tahun_ajaran_aktif) || '-')} | Semester: ${escapeHtml((config && config.semester_aktif_nama) || (context && context.semester_aktif) || '-')}</p>
    <p>Total Pemasukan: ${escapeHtml(formatRupiah(stat.totalPemasukan))}</p>
    <p>Total Pengeluaran: ${escapeHtml(formatRupiah(stat.totalPengeluaran))}</p>
    <p>Saldo Akhir: ${escapeHtml(formatRupiah(stat.saldo))}</p>
    <p>Siswa Menunggak: ${stat.tunggakan.length} siswa</p>
    <h3>Mutasi Kas (Rekening)</h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
      <thead><tr><th>No</th><th>Tanggal</th><th>Keterangan</th><th style="text-align:right">Dana Masuk</th><th style="text-align:right">Dana Keluar</th><th style="text-align:right">Saldo</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="6">Belum ada transaksi.</td></tr>'}</tbody>
    </table>
  </body></html>`;

  const blob = new Blob([htmlDoc], { type: 'application/msword' });
  downloadBlob(blob, `laporan-kas-kelas-${(config && config.kelas_nama) || 'kelas'}.doc`);
}
