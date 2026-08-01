// ============================================================================
// backup-schedule.js
// Perhitungan jadwal backup — MURNI kalkulasi tanggal, tidak menyentuh Firestore.
//
// Sebelumnya berkas ini bernama admin-backup-scheduler.js dan berisi "cron
// tiruan" di sisi peramban: setiap kali admin membuka aplikasi, ia memeriksa
// jadwal lalu membangun backup seluruh sekolah langsung di tab admin. Itu dibuang
// karena dua alasan:
//
//   1. Kuota baca. Satu kali jalan membaca puluhan ribu dokumen (setiap kelas
//      setiap guru), cukup untuk menghabiskan kuota harian Firestore paket
//      gratis dan membuat seluruh aplikasi berhenti bisa membaca data.
//   2. Tidak dapat diandalkan. Jadwal yang bergantung pada kehadiran admin
//      bukan jadwal; bila tidak ada admin membuka aplikasi, backup tidak jalan.
//
// Backup otomatis kini dijalankan GitHub Actions setiap Minggu dini hari
// (.github/workflows/backup-snapshot.yml), memakai Admin SDK dari server.
// Yang tersisa di sini hanyalah fungsi untuk MENAMPILKAN jadwal di panel admin.
// ============================================================================

function parseTime(value) {
  const [h, m] = String(value || '02:00').split(':').map((n) => Number(n));
  return { h: Number.isFinite(h) ? h : 2, m: Number.isFinite(m) ? m : 0 };
}

function atTime(baseDate, h, m) {
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Kesempatan jadwal terakhir yang sudah lewat (<= sekarang).
 * Dipakai panel admin untuk menampilkan "jadwal terakhir yang seharusnya jalan".
 */
export function computeLastScheduledOccurrence(schedule, now = new Date()) {
  if (!schedule) return null;
  const { h, m } = parseTime(schedule.time);

  if (schedule.frequency === 'daily') {
    const d = atTime(now, h, m);
    if (d > now) d.setDate(d.getDate() - 1);
    return d;
  }

  if (schedule.frequency === 'weekly') {
    const target = Number.isInteger(schedule.dayOfWeek) ? schedule.dayOfWeek : 5;
    for (let i = 0; i <= 7; i++) {
      const d = atTime(now, h, m);
      d.setDate(d.getDate() - i);
      if (d.getDay() === target && d <= now) return d;
    }
    return null;
  }

  if (schedule.frequency === 'monthly') {
    const dom = Math.min(Math.max(Number(schedule.dayOfMonth) || 1, 1), 28);
    let d = atTime(now, h, m);
    d.setDate(dom);
    if (d > now) {
      d = atTime(now, h, m);
      d.setMonth(d.getMonth() - 1);
      d.setDate(dom);
    }
    return d;
  }

  return null;
}
