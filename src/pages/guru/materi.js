import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import {
  getTeachingAssignmentsForUser,
  getActiveTeachingAssignments,
  getPublishedMaterialsForTeacher,
  savePublishedMaterial,
  deletePublishedMaterial,
  getMaterialReadStatsForTeacher,
  getClassMembers,
} from '../../firebase/data-service.js';

const MATERIAL_DRAFTS_KEY = 'simguru_material_html_drafts';
const MATERIAL_CARD_DENSITY_KEY = 'simguru_material_card_density';

function normalizeClassToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatReadDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0));
  if (!safeSeconds) {
    return '0 dtk';
  }

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const parts = [];

  if (hours) parts.push(`${hours} jam`);
  if (minutes) parts.push(`${minutes} mnt`);
  if (seconds || !parts.length) parts.push(`${seconds} dtk`);
  return parts.join(' ');
}

function getReadStatusMeta(item) {
  if (item?.completed_at || item?.completion_status === 'completed') {
    return {
      key: 'completed',
      label: 'Selesai Baca',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    };
  }

  if (Number(item?.read_count || 0) > 0 || item?.last_read_at) {
    return {
      key: 'opened',
      label: 'Sudah Buka',
      className: 'bg-sky-50 text-sky-700 border border-sky-200',
    };
  }

  return {
    key: 'unopened',
    label: 'Belum Buka',
    className: 'bg-slate-100 text-slate-600 border border-slate-200',
  };
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

function readDrafts() {
  try {
    return JSON.parse(localStorage.getItem(MATERIAL_DRAFTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeDrafts(drafts) {
  localStorage.setItem(MATERIAL_DRAFTS_KEY, JSON.stringify(drafts));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createHtmlDocument(rawHtml) {
  const parser = new DOMParser();
  const source = String(rawHtml || '').trim();
  const normalized = /<html[\s>]/i.test(source)
    ? source
    : `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Materi Guru</title></head><body>${source}</body></html>`;
  return parser.parseFromString(normalized, 'text/html');
}

function sanitizeDocument(doc) {
  doc.querySelectorAll('iframe, object, embed').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = String(attribute.value || '').trim().toLowerCase();
      if ((name === 'src' || name === 'href') && value.startsWith('javascript:')) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return doc;
}

function extractMetadata(doc) {
  const title = doc.querySelector('h1')?.childNodes?.[0]?.textContent?.trim()
    || doc.querySelector('h1')?.textContent?.trim()
    || doc.querySelector('title')?.textContent?.trim()
    || 'Materi Baru';
  const level = doc.querySelector('.sub')?.textContent?.trim() || '';
  const meetingBadge = doc.querySelector('.fa-book-open')?.closest('span')?.textContent?.trim() || '';
  const chapterBadge = doc.querySelector('.fa-flag')?.closest('span')?.textContent?.trim() || '';
  return {
    title,
    level,
    chapter: chapterBadge,
    meetings: meetingBadge,
  };
}

function applyMetadataToHtml(rawHtml, metadata) {
  const doc = sanitizeDocument(createHtmlDocument(rawHtml));
  const title = String(metadata.title || '').trim();
  const level = String(metadata.level || '').trim();
  const chapter = String(metadata.chapter || '').trim();
  const meetings = String(metadata.meetings || '').trim();

  if (title) {
    const docTitle = doc.querySelector('title');
    if (docTitle) {
      docTitle.textContent = title;
    }

    const h1 = doc.querySelector('h1');
    if (h1) {
      const sub = h1.querySelector('.sub');
      h1.textContent = '';
      h1.append(document.createTextNode(title));
      if (sub) {
        h1.append(document.createTextNode(' '));
        h1.appendChild(sub);
      }
    }
  }

  if (level) {
    const sub = doc.querySelector('.sub');
    if (sub) {
      sub.textContent = level;
    }
  }

  if (chapter) {
    const chapterNode = doc.querySelector('.fa-flag')?.closest('span');
    if (chapterNode) {
      chapterNode.innerHTML = `<i class="fas fa-flag"></i> ${escapeHtml(chapter)}`;
    }
  }

  if (meetings) {
    const meetingNode = doc.querySelector('.fa-book-open')?.closest('span');
    if (meetingNode) {
      meetingNode.innerHTML = `<i class="fas fa-book-open"></i> ${escapeHtml(meetings)}`;
    }
  }

  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function buildPreviewSource(rawHtml) {
  const doc = sanitizeDocument(createHtmlDocument(rawHtml));
  if (!doc.head.querySelector('base')) {
    const base = doc.createElement('base');
    base.target = '_blank';
    doc.head.prepend(base);
  }
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function getUserDrafts(session, context) {
  const userKey = String(session?.user?.username || context?.user_logged_in || '').trim().toLowerCase();
  return readDrafts()
    .filter((item) => String(item.guru_id || '').trim().toLowerCase() === userKey)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

function getUserPublishedMaterials(session, context) {
  const userKey = String(session?.user?.username || context?.user_logged_in || '').trim().toLowerCase();
  return getPublishedMaterialsForTeacher(userKey);
}

function getTabButtonClass(isActive) {
  return isActive
    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_8px_24px_-6px_rgba(99,102,241,0.4)] scale-[1.02]'
    : 'border border-slate-200/70 bg-white/70 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/80 hover:text-indigo-700 hover:shadow-[0_4px_12px_-6px_rgba(99,102,241,0.15)]';
}

function buildMaterialPromptTemplate(values = {}) {
  const title = values.title || '[Judul Materi]';
  const mapel = values.mapel || '[Mata Pelajaran]';
  const kelas = values.kelas || '[Kelas]';
  const bab = values.bab || '[Bab/Unit]';
  const pertemuan = values.pertemuan || '[Jumlah pertemuan]';
  const tujuan = values.tujuan || '[Tujuan pembelajaran]';
  const materiPokok = values.materiPokok || '[Poin-poin materi inti]';
  const contoh = values.contoh || '[Contoh soal atau studi kasus]';
  const latihan = values.latihan || '[Latihan bertahap]';
  const evaluasi = values.evaluasi || '[Tugas/evaluasi akhir]';
  const gaya = values.gaya || 'rapi, modern, mudah dibaca siswa, dominan biru-sky/cyan, kartu membulat';
  const catatan = values.catatan || '[Catatan tambahan guru]';
  const isMathSubject = /matematika/i.test(mapel);
  const subjectSpecificInstruction = isMathSubject
    ? '- Untuk contoh soal dan pembahasan matematika, jelaskan langkah demi langkah secara detail, urut, mudah diikuti, dan beri alasan singkat pada tiap langkah penting agar siswa bisa menyalin pembahasan ke buku catatan tanpa bingung.'
    : `- Untuk contoh dan pembahasan ${mapel}, jelaskan alurnya runtut, jelas, dan mudah dipahami siswa agar bisa diikuti saat belajar maupun mencatat.`;

  return `Buatkan HTML materi pembelajaran lengkap dan langsung siap tempel ke editor materi sekolah.

Aturan output:
- Kembalikan HTML penuh, mulai dari <!DOCTYPE html> sampai </html>.
- Jangan beri penjelasan di luar HTML.
- Desain harus responsif desktop dan mobile.
- Gunakan tampilan yang sangat menarik, modern, dan membangkitkan semangat belajar siswa: hero header kuat, badge informasi, kartu materi, tipografi jelas, layout profesional, dan komposisi visual yang hidup namun tetap rapi.
- Sediakan fitur mode fokus untuk membaca materi, misalnya tombol fokus, pembesaran area baca, atau mode tampilan minim distraksi.
- Gunakan warna tag/judul section yang berbeda-beda secara harmonis agar setiap bagian terasa jelas, hidup, dan mudah dibedakan siswa.
- Hindari dependensi framework build. Boleh gunakan CSS internal di dalam <style>.
- Materi harus nyaman dibaca siswa SMA.
- Sertakan area atau blok khusus "catatan siswa" pada tiap bagian penting agar siswa dapat langsung menyalin poin inti ke buku catatan dengan runtut dan tidak bingung.

Identitas materi:
- Judul: ${title}
- Mata pelajaran: ${mapel}
- Kelas/level: ${kelas}
- Bab/Unit: ${bab}
- Pertemuan: ${pertemuan}

Struktur HTML yang wajib ada:
1. Header utama dengan judul materi dan subjudul kelas.
2. Ringkasan tujuan pembelajaran.
3. Navigasi tab atau tombol pindah tab yang jelas dan menarik.
4. Tab terpisah minimal untuk: Materi, Contoh Soal, Latihan Soal, Tugas Siswa, dan Ringkasan/Catatan.
5. Bagian materi inti dalam beberapa subbagian yang terstruktur.
6. Contoh penjelasan atau contoh soal.
7. Latihan mandiri.
8. Tugas atau evaluasi akhir.
9. Ringkasan penutup.

Isi materi:
- Tujuan pembelajaran: ${tujuan}
- Materi pokok: ${materiPokok}
- Contoh: ${contoh}
- Latihan: ${latihan}
- Evaluasi/tugas: ${evaluasi}

Gaya visual yang diinginkan:
- ${gaya}

Catatan guru tambahan:
- ${catatan}

Ketentuan teknis tampilan:
- Sertakan <title> sesuai judul materi.
- Gunakan class .sub pada label kelas agar kompatibel dengan editor metadata.
- Sertakan badge bab dengan ikon/teks yang mudah dikenali.
- Sertakan badge pertemuan dengan ikon/teks yang mudah dikenali.
- Gunakan section yang jelas dan kartu dengan border radius lembut.
- Tab harus benar-benar interaktif dengan JavaScript ringan internal sehingga siswa bisa berpindah antara Materi, Contoh Soal, Latihan Soal, dan Tugas dengan mudah.
- Tab aktif harus menonjol secara visual dan setiap tab boleh memakai aksen warna berbeda yang tetap harmonis.
- Pada tab Materi, pecah isi menjadi subbagian pendek, jelas, dan mudah dicatat.
- Setelah penjelasan konsep utama, tampilkan poin "Catatan Buku" atau "Yang Perlu Dicatat" berisi inti materi dalam format ringkas agar siswa mudah menulis ke buku catatan.
- Pada tab Contoh Soal, tampilkan contoh dan pembahasan yang runtut, tidak lompat langkah, dan mudah dipelajari ulang siswa.
- Pada tab Latihan Soal, tampilkan latihan bertahap dari mudah ke menengah dan beri instruksi singkat yang jelas.
- Pada tab Tugas Siswa, tampilkan tugas yang harus dikerjakan siswa secara jelas, rapi, dan memotivasi.
- Jika relevan, tambahkan tab ekstra seperti Refleksi, Glosarium, atau Tips Belajar, selama tab utama tetap ada.
- Pastikan tampilan akhir terasa ceria, fokus, dan tidak monoton sehingga siswa lebih semangat belajar.
- Jika ada rumus, tampilkan tetap rapi dalam HTML biasa tanpa library eksternal.
${subjectSpecificInstruction}

Sekali lagi: keluarkan HTML penuh saja, tanpa markdown, tanpa blok kode, tanpa penjelasan tambahan.`;
}

function createSubjectPreset({
  label,
  mapel = label,
  focus,
  learningFlow,
  exampleType,
  exerciseType,
  evaluationType,
  visualStyle,
  notes,
}) {
  return {
    label,
    mapel,
    gaya: visualStyle || 'rapi, modern, mudah dibaca siswa, dominan biru-sky/cyan, kartu membulat, alur materi jelas dan fokus',
    tujuan: `Susun tujuan pembelajaran yang menekankan ${focus} sesuai Kurikulum Merdeka.`,
    materiPokok: `${learningFlow} Gunakan pendekatan deep learning agar siswa memahami alasan, makna, dan penerapan materi secara mendalam.`,
    contoh: exampleType,
    latihan: exerciseType,
    evaluasi: evaluationType,
    catatan: notes || `Jenjang SMA Kurikulum Merdeka dengan pendekatan deep learning untuk ${mapel}. Fokus pada pemahaman mendalam, refleksi, dan penerapan kontekstual.`
  };
}

function buildGenericTemplatePreset(mapel) {
  return createSubjectPreset({
    label: mapel,
    mapel,
    focus: `pemahaman mendalam materi ${mapel}, berpikir kritis, refleksi belajar, dan aplikasi kontekstual siswa`,
    learningFlow: `Bangun materi ${mapel} secara bertahap dari apersepsi, konsep inti, contoh, latihan, dan penguatan reflektif.`,
    exampleType: `Sertakan contoh ${mapel} yang relevan, disertai pembahasan langkah demi langkah dan alasan tiap bagian penting.`,
    exerciseType: `Berikan latihan bertingkat: pemahaman konsep, aplikasi, dan analisis/HOTS sesuai karakter materi ${mapel}.`,
    evaluationType: `Tambahkan evaluasi akhir atau tugas kontekstual yang mengukur pemahaman mendalam siswa pada materi ${mapel}.`,
  });
}

const MATERIAL_TEMPLATE_LIBRARY = {
  bahasa_indonesia: createSubjectPreset({
    label: 'Bahasa Indonesia',
    focus: 'pemahaman isi, struktur, konteks, berpikir kritis, dan kemampuan reflektif siswa',
    learningFlow: 'Bangun materi secara bertahap dari konteks, konsep kebahasaan atau kesastraan, analisis contoh, latihan interpretasi, dan refleksi makna.',
    exampleType: 'Sertakan contoh teks, kutipan, atau kasus bahasa yang diikuti pembahasan struktur, unsur penting, dan alasan analisisnya.',
    exerciseType: 'Berikan latihan bertingkat: identifikasi unsur, analisis isi/struktur, dan produksi respons atau tanggapan kritis.',
    evaluationType: 'Tambahkan tugas akhir yang mendorong siswa menulis, menyusun, atau mempresentasikan pemahaman secara reflektif dan kontekstual.',
    visualStyle: 'hangat, elegan, modern, mudah dibaca, dominan biru-sky dengan aksen lembut, kartu membulat, penekanan struktur teks dan refleksi',
  }),
  bahasa_inggris: createSubjectPreset({
    label: 'Bahasa Inggris',
    focus: 'pemahaman makna, penggunaan bahasa, komunikasi, dan refleksi lintas konteks',
    learningFlow: 'Bangun materi dari konteks komunikasi, vocabulary dan grammar secukupnya, analisis contoh, practice, lalu refleksi penggunaan bahasa.',
    exampleType: 'Sertakan contoh dialog, teks pendek, atau expression yang dibahas makna, struktur, dan konteks penggunaannya.',
    exerciseType: 'Berikan latihan bertingkat: understanding, guided practice, lalu productive task seperti speaking atau writing response.',
    evaluationType: 'Tambahkan evaluasi akhir yang mendorong siswa menunjukkan pemahaman dan penggunaan bahasa dalam konteks nyata.',
    visualStyle: 'fresh, modern, komunikatif, dominan sky-blue, kartu membulat, penekanan contoh penggunaan bahasa yang jelas',
  }),
  matematika: createSubjectPreset({
    label: 'Matematika',
    focus: 'pemahaman konsep, penalaran matematis, koneksi antar konsep, dan refleksi belajar siswa',
    learningFlow: 'Bangun materi secara bertahap dari apersepsi, konsep inti, penalaran, contoh penyelesaian, dan penerapan kontekstual.',
    exampleType: 'Sertakan minimal 2 contoh soal lengkap dengan langkah penyelesaian terstruktur, alasan tiap langkah, dan catatan kesalahan umum siswa.',
    exerciseType: 'Berikan latihan bertingkat: pemahaman konsep, aplikasi prosedural, dan soal penalaran/HOTS.',
    evaluationType: 'Tambahkan evaluasi akhir berbentuk tugas reflektif atau pemecahan masalah kontekstual yang menguji pemahaman mendalam.',
    visualStyle: 'rapi, modern, sangat jelas untuk konsep eksak, dominan biru-sky/cyan, kartu membulat, penekanan langkah berpikir bertahap',
  }),
  matematika_aljabar: createSubjectPreset({
    label: 'Matematika - Aljabar',
    mapel: 'Matematika',
    focus: 'pemahaman pola, bentuk aljabar, manipulasi simbolik, penalaran bertahap, dan koneksi konsep',
    learningFlow: 'Bangun materi aljabar dari pengenalan pola atau masalah kontekstual, konsep inti, transformasi bentuk, langkah penyelesaian, lalu refleksi hubungan antar simbol dan makna.',
    exampleType: 'Sertakan minimal 2 contoh soal aljabar dengan pembahasan sangat rinci per langkah, penjelasan alasan operasi, dan penegasan kesalahan umum seperti salah tanda, salah substitusi, atau salah pemfaktoran.',
    exerciseType: 'Berikan latihan bertingkat mulai dari menyederhanakan bentuk aljabar, substitusi, persamaan/pertidaksamaan, hingga soal penalaran aljabar kontekstual.',
    evaluationType: 'Tambahkan tugas akhir yang meminta siswa menyelesaikan masalah aljabar bertahap dan menuliskan alasan tiap langkah penting.',
    visualStyle: 'tegas, rapi, modern, dominan biru-sky dengan aksen emerald, kartu membulat, sorotan langkah manipulasi simbolik dan pola operasi',
    notes: 'Preset khusus Matematika Aljabar untuk SMA Kurikulum Merdeka dengan pendekatan deep learning. Tekankan makna simbol, hubungan antar bentuk, dan pembahasan langkah demi langkah yang sangat jelas.',
  }),
  matematika_geometri: createSubjectPreset({
    label: 'Matematika - Geometri',
    mapel: 'Matematika',
    focus: 'pemahaman bentuk, sifat bangun, hubungan ruang, visualisasi, dan penalaran geometris',
    learningFlow: 'Bangun materi geometri dari pengamatan bentuk atau ilustrasi, sifat-sifat bangun, hubungan antar unsur, contoh perhitungan, lalu refleksi visual dan konsep.',
    exampleType: 'Sertakan minimal 2 contoh soal geometri dengan pembahasan detail, urutan identifikasi unsur bangun, rumus yang dipakai, alasan pemilihan rumus, dan interpretasi gambar secara runtut.',
    exerciseType: 'Berikan latihan bertingkat mulai dari mengenali unsur dan sifat bangun, menghitung ukuran, sampai analisis hubungan sudut, luas, volume, atau transformasi.',
    evaluationType: 'Tambahkan tugas akhir yang mendorong siswa menjelaskan proses penyelesaian geometri berdasarkan gambar, sifat bangun, dan alasan matematisnya.',
    visualStyle: 'visual, modern, bersih, dominan cyan-sky dengan aksen violet lembut, kartu membulat, penekanan ilustrasi bangun, label warna, dan alur visual yang kuat',
    notes: 'Preset khusus Matematika Geometri. Materi harus sangat visual, mudah dicatat, dan pembahasan soal wajib mengaitkan gambar, sifat bangun, serta langkah hitung secara runtut.',
  }),
  matematika_kalkulus: createSubjectPreset({
    label: 'Matematika - Kalkulus',
    mapel: 'Matematika',
    focus: 'pemahaman perubahan, limit, turunan, integral, interpretasi grafik, dan penalaran analitis',
    learningFlow: 'Bangun materi kalkulus dari intuisi perubahan atau grafik, konsep inti, hubungan representasi aljabar dan visual, contoh hitung, lalu makna hasil dalam konteks.',
    exampleType: 'Sertakan minimal 2 contoh soal kalkulus dengan pembahasan sangat rinci: tulis langkah transformasi, alasan aturan turunan/integral yang dipakai, interpretasi hasil, dan kesalahan umum yang harus dihindari.',
    exerciseType: 'Berikan latihan bertingkat mulai dari pemahaman konsep limit atau gradien, penggunaan aturan turunan/integral, hingga soal aplikasi dan interpretasi grafik.',
    evaluationType: 'Tambahkan tugas akhir yang meminta siswa tidak hanya menghitung, tetapi juga menjelaskan makna hasil kalkulus dalam konteks fungsi atau masalah nyata.',
    visualStyle: 'modern, analitis, elegan, dominan navy-sky dengan aksen cyan terang, kartu membulat, sorotan grafik, perubahan, dan langkah hitung yang sistematis',
    notes: 'Preset khusus Matematika Kalkulus. Tekankan intuisi konsep, hubungan grafik dan rumus, serta pembahasan langkah demi langkah yang sangat detail agar siswa paham proses, bukan hanya hasil.',
  }),
  matematika_statistika: createSubjectPreset({
    label: 'Matematika - Statistika',
    mapel: 'Matematika',
    focus: 'pemahaman data, representasi, analisis, interpretasi hasil, dan pengambilan kesimpulan logis',
    learningFlow: 'Bangun materi statistika dari konteks data nyata, jenis data, penyajian tabel atau diagram, perhitungan ukuran statistik, lalu interpretasi makna hasil.',
    exampleType: 'Sertakan minimal 2 contoh soal statistika dengan data sederhana, pembahasan detail langkah pengolahan data, perhitungan ukuran statistik, dan interpretasi hasil secara jelas.',
    exerciseType: 'Berikan latihan bertingkat mulai dari membaca data, menyusun tabel/diagram, menghitung mean-median-modus atau ukuran lain, hingga menarik kesimpulan dari data.',
    evaluationType: 'Tambahkan tugas akhir yang meminta siswa menganalisis data, menyajikan hasil secara rapi, dan menuliskan kesimpulan berdasarkan perhitungan.',
    visualStyle: 'informatif, modern, dominan biru-sky dengan aksen amber lembut, kartu membulat, penekanan tabel, diagram, highlight angka penting, dan kesimpulan data',
    notes: 'Preset khusus Matematika Statistika. Materi harus dekat dengan data nyata, pembahasan rinci, dan membantu siswa mencatat langkah pengolahan data sampai interpretasinya.',
  }),
  fisika: createSubjectPreset({
    label: 'Fisika',
    focus: 'pemahaman konsep fisika, observasi fenomena, berpikir kausal, dan refleksi ilmiah',
    learningFlow: 'Bangun materi dari fenomena sehari-hari, konsep inti, hubungan sebab-akibat, representasi sederhana, lalu aplikasi kontekstual.',
    exampleType: 'Sertakan minimal 2 contoh kasus atau soal fisika dengan analisis konsep, identifikasi besaran, langkah penyelesaian, dan interpretasi hasil.',
    exerciseType: 'Berikan latihan bertingkat dari identifikasi konsep, aplikasi rumus, sampai analisis fenomena atau eksperimen sederhana.',
    evaluationType: 'Tambahkan tugas atau evaluasi akhir yang mengaitkan konsep fisika dengan situasi nyata dan meminta siswa menjelaskan alasan ilmiahnya.',
    visualStyle: 'ilmiah, modern, rapi, dominan biru-cyan, visual bersih, kartu membulat, menonjolkan hubungan konsep dan fenomena nyata',
  }),
  kimia: createSubjectPreset({
    label: 'Kimia',
    focus: 'pemahaman konsep zat, perubahan, representasi simbolik, dan hubungan mikroskopik-makroskopik',
    learningFlow: 'Bangun materi dari fenomena kimia sehari-hari, konsep inti, representasi partikel atau reaksi, contoh soal, lalu penerapan.',
    exampleType: 'Sertakan contoh reaksi, perhitungan, atau analisis sifat zat lengkap dengan pembahasan konsep dan interpretasi hasil.',
    exerciseType: 'Berikan latihan bertingkat dari identifikasi konsep, penggunaan simbol/rumus, hingga analisis reaksi atau data sederhana.',
    evaluationType: 'Tambahkan evaluasi akhir yang meminta siswa menjelaskan proses kimia atau menyelesaikan masalah kontekstual.',
    visualStyle: 'ilmiah, bersih, modern, dominan biru-cyan dengan aksen emerald, kartu membulat, penekanan relasi konsep dan representasi',
  }),
  biologi: createSubjectPreset({
    label: 'Biologi',
    focus: 'pemahaman sistem kehidupan, keterkaitan antarkonsep, observasi, dan refleksi ilmiah',
    learningFlow: 'Bangun materi dari fenomena kehidupan, konsep inti, hubungan struktur dan fungsi, contoh kasus, lalu refleksi penerapan.',
    exampleType: 'Sertakan contoh kasus biologi, gambar/ilustrasi yang bisa dijelaskan dalam HTML, atau studi sederhana yang dikaitkan dengan konsep.',
    exerciseType: 'Berikan latihan bertingkat: identifikasi, analisis hubungan, dan penerapan konsep biologi dalam kehidupan sehari-hari.',
    evaluationType: 'Tambahkan evaluasi akhir yang menuntut siswa menjelaskan proses biologis atau menyelesaikan masalah kontekstual.',
    visualStyle: 'alami, modern, segar, dominan sky-blue dengan aksen hijau lembut, kartu membulat, nyaman untuk membaca konsep sistem kehidupan',
  }),
  sejarah: createSubjectPreset({
    label: 'Sejarah',
    focus: 'pemahaman kronologi, sebab-akibat, interpretasi peristiwa, dan refleksi kebangsaan',
    learningFlow: 'Bangun materi dari konteks zaman, alur peristiwa, tokoh, sebab-akibat, makna sejarah, lalu refleksi kontekstual.',
    exampleType: 'Sertakan contoh peristiwa, sumber singkat, atau kutipan yang dibahas dengan penekanan kronologi dan interpretasi.',
    exerciseType: 'Berikan latihan bertingkat: memahami fakta, menganalisis hubungan sebab-akibat, dan menyusun refleksi historis.',
    evaluationType: 'Tambahkan evaluasi akhir berupa analisis peristiwa atau refleksi nilai dari materi sejarah yang dipelajari.',
    visualStyle: 'elegan, modern, dominan biru-slate dengan aksen hangat, kartu membulat, penekanan kronologi dan refleksi',
  }),
  geografi: createSubjectPreset({
    label: 'Geografi',
    focus: 'pemahaman ruang, interaksi wilayah, analisis lingkungan, dan literasi spasial',
    learningFlow: 'Bangun materi dari fenomena geosfer, konsep spasial, contoh wilayah, analisis keterkaitan, lalu refleksi lingkungan.',
    exampleType: 'Sertakan contoh peta konseptual, fenomena wilayah, atau studi kasus sederhana yang dapat dijelaskan runtut dalam HTML.',
    exerciseType: 'Berikan latihan bertingkat: identifikasi konsep, analisis keruangan, dan pemecahan masalah lingkungan atau wilayah.',
    evaluationType: 'Tambahkan evaluasi akhir yang meminta siswa menelaah fenomena geografi dalam konteks lokal atau global.',
    visualStyle: 'modern, informatif, dominan sky-blue dengan aksen bumi/emerald, kartu membulat, penekanan konsep spasial yang rapi',
  }),
  ekonomi: createSubjectPreset({
    label: 'Ekonomi',
    focus: 'pemahaman konsep ekonomi, pengambilan keputusan, analisis data sederhana, dan refleksi kontekstual',
    learningFlow: 'Bangun materi dari masalah ekonomi sehari-hari, konsep inti, contoh kasus, analisis pilihan, lalu refleksi penerapan.',
    exampleType: 'Sertakan contoh kasus ekonomi, tabel sederhana, atau ilustrasi keputusan yang dibahas sebab-akibatnya.',
    exerciseType: 'Berikan latihan bertingkat: memahami istilah, menganalisis kasus, dan membuat keputusan ekonomi sederhana.',
    evaluationType: 'Tambahkan evaluasi akhir berupa analisis kasus nyata atau tugas refleksi ekonomi dalam kehidupan siswa.',
    visualStyle: 'profesional, modern, dominan biru-cyan dengan aksen emerald, kartu membulat, penekanan analisis kasus',
  }),
  sosiologi: createSubjectPreset({
    label: 'Sosiologi',
    focus: 'pemahaman gejala sosial, analisis hubungan sosial, berpikir kritis, dan refleksi masyarakat',
    learningFlow: 'Bangun materi dari fenomena sosial, konsep inti, contoh kasus, analisis hubungan, lalu refleksi peran siswa di masyarakat.',
    exampleType: 'Sertakan contoh kasus sosial yang relevan dengan kehidupan remaja dan bahas menggunakan konsep sosiologi.',
    exerciseType: 'Berikan latihan bertingkat: identifikasi gejala sosial, analisis faktor, dan penyusunan tanggapan kritis.',
    evaluationType: 'Tambahkan evaluasi akhir berupa analisis kasus sosial atau proyek reflektif sederhana.',
    visualStyle: 'modern, komunikatif, dominan sky-blue dengan aksen hangat, kartu membulat, penekanan keterkaitan teori dan realitas sosial',
  }),
  ppkn: createSubjectPreset({
    label: 'PPKn',
    mapel: 'Pendidikan Pancasila',
    focus: 'pemahaman nilai Pancasila, konstitusi, kewargaan aktif, dan refleksi karakter',
    learningFlow: 'Bangun materi dari konteks kehidupan berbangsa, konsep inti, contoh perilaku, analisis kasus, lalu refleksi nilai.',
    exampleType: 'Sertakan contoh kasus kewargaan, aturan, atau situasi nyata yang dibahas berdasarkan nilai dan norma.',
    exerciseType: 'Berikan latihan bertingkat: memahami konsep, menganalisis kasus, dan merancang tindakan warga yang bertanggung jawab.',
    evaluationType: 'Tambahkan evaluasi akhir berupa analisis kasus kewargaan atau refleksi penerapan nilai Pancasila.',
    visualStyle: 'tegas, modern, dominan biru-merah lembut, kartu membulat, penekanan nilai, norma, dan tanggung jawab',
  }),
  informatika: createSubjectPreset({
    label: 'Informatika',
    focus: 'computational thinking, literasi digital, pemecahan masalah, dan refleksi penggunaan teknologi',
    learningFlow: 'Bangun materi dari masalah nyata, konsep inti informatika, contoh alur/logika, latihan penerapan, lalu refleksi digital.',
    exampleType: 'Sertakan contoh algoritma sederhana, studi kasus digital, atau langkah problem solving yang jelas.',
    exerciseType: 'Berikan latihan bertingkat: memahami konsep, menerapkan logika, dan menyelesaikan masalah berbasis informatika.',
    evaluationType: 'Tambahkan evaluasi akhir berupa tugas problem solving, analisis sistem sederhana, atau refleksi etika digital.',
    visualStyle: 'modern, tech-forward, dominan navy-sky-cyan, kartu membulat, penekanan alur logika dan ilustrasi sistematis',
  }),
  pjok: createSubjectPreset({
    label: 'PJOK',
    focus: 'pemahaman aktivitas fisik, kesehatan, keterampilan gerak, dan refleksi gaya hidup sehat',
    learningFlow: 'Bangun materi dari manfaat aktivitas, konsep kesehatan atau gerak, contoh praktik aman, lalu refleksi kebiasaan sehat.',
    exampleType: 'Sertakan contoh aktivitas, teknik dasar, atau studi kebugaran sederhana yang dapat dijelaskan langkahnya.',
    exerciseType: 'Berikan latihan bertingkat: pemahaman konsep, observasi aktivitas, dan perencanaan praktik atau kebiasaan sehat.',
    evaluationType: 'Tambahkan evaluasi akhir berupa jurnal reflektif, rencana latihan, atau analisis manfaat aktivitas fisik.',
    visualStyle: 'segar, enerjik, modern, dominan sky-blue dengan aksen hijau, kartu membulat, penekanan praktik aman dan sehat',
  }),
  seni_budaya: createSubjectPreset({
    label: 'Seni Budaya',
    focus: 'apresiasi, ekspresi, kreativitas, dan refleksi makna karya',
    learningFlow: 'Bangun materi dari konteks karya, konsep seni, contoh apresiasi atau proses kreatif, lalu refleksi ekspresi.',
    exampleType: 'Sertakan contoh karya, unsur seni, atau proses kreatif yang dibahas makna dan elemennya.',
    exerciseType: 'Berikan latihan bertingkat: mengamati, menganalisis, lalu menghasilkan respons atau rancangan karya.',
    evaluationType: 'Tambahkan evaluasi akhir berupa proyek kreatif sederhana atau refleksi apresiasi karya.',
    visualStyle: 'artistik, elegan, modern, dominan sky-blue dengan aksen coral lembut, kartu membulat, penekanan visual yang ekspresif namun rapi',
  }),
  prakarya_kewirausahaan: createSubjectPreset({
    label: 'Prakarya dan Kewirausahaan',
    focus: 'kreativitas, problem solving, proses berkarya, dan semangat kewirausahaan',
    learningFlow: 'Bangun materi dari kebutuhan nyata, ide produk/jasa, proses pembuatan, analisis nilai, lalu refleksi usaha.',
    exampleType: 'Sertakan contoh produk, proses kerja, atau studi peluang usaha yang dijelaskan runtut.',
    exerciseType: 'Berikan latihan bertingkat: memahami ide, merancang langkah, dan mengevaluasi hasil atau peluang.',
    evaluationType: 'Tambahkan evaluasi akhir berupa rancangan produk, proposal sederhana, atau refleksi kewirausahaan.',
    visualStyle: 'praktis, modern, dominan sky-blue dengan aksen amber, kartu membulat, penekanan proses dan kreativitas',
  }),
  pendidikan_agama: createSubjectPreset({
    label: 'Pendidikan Agama',
    focus: 'pemahaman nilai, refleksi spiritual, penerapan akhlak, dan pembiasaan positif',
    learningFlow: 'Bangun materi dari konteks nilai, konsep inti, contoh perilaku, refleksi makna, dan penerapan dalam kehidupan.',
    exampleType: 'Sertakan contoh ayat, pesan moral, atau kasus keseharian yang dibahas dengan pendekatan reflektif.',
    exerciseType: 'Berikan latihan bertingkat: memahami nilai, menganalisis situasi, dan merancang tindakan positif.',
    evaluationType: 'Tambahkan evaluasi akhir berupa refleksi, jurnal karakter, atau analisis penerapan nilai dalam keseharian.',
    visualStyle: 'tenang, bersih, modern, dominan sky-blue dengan aksen emerald lembut, kartu membulat, penekanan refleksi dan nilai',
  })
};

function buildTemplatePresetCatalog(assignments = []) {
  const catalog = new Map();

  Object.entries(MATERIAL_TEMPLATE_LIBRARY).forEach(([libraryKey, preset]) => {
    const key = normalizeClassToken(libraryKey || preset.label);
    catalog.set(key, { ...preset, key });
  });

  assignments.forEach((assignment) => {
    const mapelName = String(assignment?.mapel_nama || '').trim();
    if (!mapelName) {
      return;
    }

    const key = normalizeClassToken(mapelName);
    if (!catalog.has(key)) {
      catalog.set(key, { ...buildGenericTemplatePreset(mapelName), key });
    }
  });

  return Array.from(catalog.values()).sort((left, right) => left.label.localeCompare(right.label, 'id'));
}

function buildTemplatePresetOptions(catalog = []) {
  const mathPresets = catalog.filter((preset) => /matematika/i.test(preset.label) || /matematika/i.test(preset.mapel));
  const otherPresets = catalog.filter((preset) => !/matematika/i.test(preset.label) && !/matematika/i.test(preset.mapel));

  const renderOptions = (presets) => presets
    .map((preset) => `<option value="${preset.key}">${escapeHtml(preset.label)} - SMA Kurikulum Merdeka Deep Learning</option>`)
    .join('');

  const optionGroups = [];
  if (mathPresets.length) {
    optionGroups.push(`<optgroup label="Preset Matematika">${renderOptions(mathPresets)}</optgroup>`);
  }
  if (otherPresets.length) {
    optionGroups.push(`<optgroup label="Preset Mata Pelajaran Lain">${renderOptions(otherPresets)}</optgroup>`);
  }

  return optionGroups.join('');
}

function getMaterialCardTone(kind, visibleToStudents = true) {
  if (kind === 'draft') {
    return {
      accentClass: 'from-indigo-500 via-violet-500 to-fuchsia-500',
      glowClass: 'bg-violet-300/70',
      badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      chipClass: 'border-indigo-100 bg-indigo-50 text-indigo-700',
      badgeLabel: 'Draft Lokal',
      hint: 'Klik untuk lanjut edit',
      motif: 'Workspace pribadi',
    };
  }

  if (visibleToStudents === false) {
    return {
      accentClass: 'from-amber-400 via-orange-400 to-rose-400',
      glowClass: 'bg-amber-200/70',
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
      chipClass: 'border-amber-100 bg-amber-50 text-amber-700',
      badgeLabel: 'Unpublished',
      hint: 'Siap dipublikasikan kembali',
      motif: 'Butuh publikasi ulang',
    };
  }

  return {
    accentClass: 'from-emerald-500 via-teal-500 to-cyan-500',
    glowClass: 'bg-emerald-200/70',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    chipClass: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    badgeLabel: 'Published',
    hint: 'Klik untuk tinjau atau pakai ulang',
    motif: 'Siap untuk siswa',
  };
}

function getMaterialMonogram(item) {
  const source = String(item?.mapel_nama || item?.title || 'MT').trim();
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'MT';
}

function getThematicBookCover(material) {
  const mapel = String(material?.mapel_nama || '').toLowerCase();

  if (mapel.includes('matematika')) {
    return {
      gradient: 'from-sky-600 via-cyan-600 to-blue-700',
      chipClass: 'border-sky-200 bg-sky-50 text-sky-700',
      icon: '∑',
      motif: 'Rumus dan Logika',
    };
  }
  if (mapel.includes('bahasa indonesia')) {
    return {
      gradient: 'from-rose-500 via-orange-500 to-amber-500',
      chipClass: 'border-orange-200 bg-orange-50 text-orange-700',
      icon: 'Aa',
      motif: 'Literasi dan Teks',
    };
  }
  if (mapel.includes('bahasa inggris')) {
    return {
      gradient: 'from-indigo-600 via-violet-600 to-fuchsia-600',
      chipClass: 'border-violet-200 bg-violet-50 text-violet-700',
      icon: 'EN',
      motif: 'Words and Talk',
    };
  }
  if (mapel.includes('fisika')) {
    return {
      gradient: 'from-slate-700 via-slate-800 to-slate-900',
      chipClass: 'border-slate-300 bg-slate-100 text-slate-700',
      icon: 'Fx',
      motif: 'Gerak dan Energi',
    };
  }
  if (mapel.includes('kimia')) {
    return {
      gradient: 'from-emerald-600 via-teal-600 to-cyan-600',
      chipClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      icon: 'H2O',
      motif: 'Zat dan Reaksi',
    };
  }
  if (mapel.includes('biologi')) {
    return {
      gradient: 'from-lime-500 via-emerald-500 to-teal-600',
      chipClass: 'border-lime-200 bg-lime-50 text-lime-700',
      icon: 'DNA',
      motif: 'Makhluk Hidup',
    };
  }
  if (mapel.includes('sejarah')) {
    return {
      gradient: 'from-amber-600 via-orange-600 to-rose-700',
      chipClass: 'border-amber-200 bg-amber-50 text-amber-700',
      icon: '⌛',
      motif: 'Peristiwa dan Waktu',
    };
  }

  return {
    gradient: 'from-blue-600 via-indigo-600 to-violet-700',
    chipClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    icon: getMaterialMonogram(material),
    motif: 'Materi Tematik',
  };
}

const MATERIAL_BUILDER_STORAGE_KEY = 'simguru_material_builder_content';
const MATERIAL_BUILDER_SYMBOLS = [
  '∑', '∫', '√', 'π', 'θ', 'α', 'β', 'γ', 'δ', 'λ', 'μ', 'σ', 'φ', 'ω',
  '∞', '≠', '≤', '≥', '±', '×', '÷', '∈', '∉', '∪', '∩', '∅', '→', '⇒',
  '↔', '∀', '∃', '∠', '⊥', '≡', '≈', 'Δ', 'Φ', '∇', '∴', '∵'
];

function getMaterialBuilderStorageBucket(session, context) {
  const userKey = String(session?.user?.username || context?.user_logged_in || 'guest').trim().toLowerCase();
  return `${MATERIAL_BUILDER_STORAGE_KEY}_${normalizeClassToken(userKey || 'guest')}`;
}

function getMaterialBuilderStarterContent() {
  return `
    <section class="builder-hero">
      <span class="builder-badge">Buat Materi</span>
      <h1>Judul Materi Pembelajaran</h1>
      <p class="sub">Kelas/Fase • Mata Pelajaran • Bab/Unit</p>
      <p>Gunakan editor ini untuk menyusun materi yang rapi, interaktif, dan siap dikirim ke Editor Materi HTML.</p>
    </section>
    <section class="builder-card">
      <h2>Tujuan Pembelajaran</h2>
      <ul>
        <li>Tuliskan tujuan pembelajaran utama secara ringkas dan terarah.</li>
        <li>Gunakan bahasa yang mudah dipahami siswa SMA.</li>
      </ul>
    </section>
    <section class="builder-card note-box">
      <h3>Catatan Buku</h3>
      <p>Tulis poin-poin inti materi di sini agar siswa mudah menyalin ke buku catatan.</p>
    </section>
    <section class="builder-card">
      <h2>Materi Inti</h2>
      <p>Mulai menulis isi materi di sini. Anda bisa memakai toolbar untuk judul, daftar, tabel, gambar, soal, dan blok catatan.</p>
    </section>
  `;
}

function getMaterialBuilderShellStyles() {
  return `
    :root {
      --builder-bg: #f8fbff;
      --builder-card: #ffffff;
      --builder-text: #0f172a;
      --builder-muted: #475569;
      --builder-border: #dbe7f5;
      --builder-primary: #2563eb;
      --builder-primary-soft: #dbeafe;
      --builder-accent: #06b6d4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, Arial, sans-serif;
      background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%);
      color: var(--builder-text);
    }
    .builder-export-shell {
      max-width: 1100px;
      margin: 0 auto;
      padding: 28px 18px 56px;
    }
    .builder-export-toolbar {
      position: sticky;
      top: 14px;
      z-index: 20;
      display: flex;
      justify-content: flex-end;
      margin-bottom: 18px;
    }
    .focus-reading-btn {
      border: none;
      border-radius: 999px;
      background: linear-gradient(135deg, #0f172a, #1d4ed8);
      color: #fff;
      padding: 12px 18px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 18px 40px -24px rgba(37, 99, 235, 0.7);
    }
    .builder-export-page {
      background: rgba(255,255,255,0.92);
      border: 1px solid rgba(191,219,254,0.7);
      border-radius: 28px;
      box-shadow: 0 32px 80px -48px rgba(15, 23, 42, 0.35);
      padding: 30px;
      backdrop-filter: blur(6px);
    }
    .builder-export-page h1,
    .builder-export-page h2,
    .builder-export-page h3,
    .builder-export-page h4 { color: #0f172a; }
    .builder-export-page p,
    .builder-export-page li { line-height: 1.8; color: #1e293b; }
    .builder-export-page img { max-width: 100%; border-radius: 18px; display: block; margin: 14px 0; }
    .builder-export-page table { width: 100%; border-collapse: collapse; margin: 18px 0; }
    .builder-export-page th,
    .builder-export-page td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; }
    .builder-export-page th { background: #eff6ff; }
    .builder-export-page blockquote {
      margin: 18px 0;
      padding: 16px 20px;
      border-left: 4px solid var(--builder-primary);
      background: #f8fafc;
      border-radius: 0 18px 18px 0;
    }
    .builder-export-page pre {
      margin: 18px 0;
      background: #0f172a;
      color: #e2e8f0;
      padding: 18px 20px;
      border-radius: 20px;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    .builder-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: linear-gradient(135deg, #dbeafe, #cffafe);
      color: #075985;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
    .builder-hero,
    .builder-card,
    .note-box,
    .example-box,
    .exercise-box,
    .task-box {
      margin-bottom: 20px;
      border-radius: 24px;
      border: 1px solid var(--builder-border);
      background: var(--builder-card);
      padding: 22px;
    }
    .builder-hero {
      background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 58%, #06b6d4 100%);
      color: #fff;
      box-shadow: 0 28px 70px -40px rgba(37, 99, 235, 0.65);
    }
    .builder-hero h1,
    .builder-hero p,
    .builder-hero .sub { color: #fff; }
    .builder-hero .sub { opacity: 0.88; }
    .note-box {
      background: linear-gradient(135deg, #fef9c3, #fff7ed);
      border-color: #fde68a;
    }
    .example-box {
      background: linear-gradient(135deg, #dbeafe, #eff6ff);
      border-color: #93c5fd;
    }
    .exercise-box {
      background: linear-gradient(135deg, #dcfce7, #ecfccb);
      border-color: #86efac;
    }
    .task-box {
      background: linear-gradient(135deg, #fee2e2, #ffedd5);
      border-color: #fca5a5;
    }
    .material-tabs-box {
      margin: 22px 0;
      border: 1px solid #cbd5e1;
      border-radius: 24px;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 20px 40px -32px rgba(15,23,42,0.35);
    }
    .materi-reader-tab-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 16px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .materi-reader-tab-btn {
      border: none;
      border-radius: 999px;
      padding: 10px 16px;
      font-weight: 700;
      cursor: pointer;
      background: #e2e8f0;
      color: #334155;
    }
    .materi-reader-tab-btn.is-active {
      background: linear-gradient(135deg, #2563eb, #06b6d4);
      color: #fff;
      box-shadow: 0 18px 36px -22px rgba(37, 99, 235, 0.85);
    }
    .materi-reader-tab-panel { padding: 22px; }
    .materi-reader-tab-panel[hidden] { display: none !important; }
    body.focus-mode {
      background: #e2e8f0;
    }
    body.focus-mode .builder-export-page {
      max-width: 920px;
      margin: 0 auto;
      border-radius: 30px;
      box-shadow: 0 40px 120px -60px rgba(15,23,42,0.55);
    }
    @media (max-width: 720px) {
      .builder-export-page { padding: 18px; border-radius: 22px; }
      .builder-export-toolbar { top: 10px; }
      .materi-reader-tab-nav { gap: 8px; }
      .materi-reader-tab-btn { width: 100%; }
    }
  `;
}

function getMaterialBuilderEnhancementScript() {
  return `
    (function () {
      document.querySelectorAll('[data-focus-toggle]').forEach(function (button) {
        button.addEventListener('click', function () {
          document.body.classList.toggle('focus-mode');
          button.textContent = document.body.classList.contains('focus-mode') ? 'Keluar Mode Fokus' : 'Mode Fokus';
        });
      });

      document.querySelectorAll('[data-tab-group]').forEach(function (group) {
        const buttons = Array.from(group.querySelectorAll('[data-tab-target]'));
        const panels = Array.from(group.querySelectorAll('[data-tab-panel]'));
        const activate = function (target) {
          buttons.forEach(function (button) {
            button.classList.toggle('is-active', button.getAttribute('data-tab-target') === target);
          });
          panels.forEach(function (panel) {
            panel.hidden = panel.getAttribute('data-tab-panel') !== target;
          });
        };
        buttons.forEach(function (button) {
          button.addEventListener('click', function () {
            activate(button.getAttribute('data-tab-target'));
          });
        });
        if (buttons.length) {
          activate(buttons[0].getAttribute('data-tab-target'));
        }
      });
    }());
  `;
}

function buildMaterialBuilderDocument({ title, content }) {
  const safeTitle = escapeHtml(title || 'Materi Guru');
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>${getMaterialBuilderShellStyles()}</style>
</head>
<body>
  <div class="builder-export-shell">
    <div class="builder-export-toolbar">
      <button type="button" class="focus-reading-btn" data-focus-toggle>Mode Fokus</button>
    </div>
    <main class="builder-export-page">${content}</main>
  </div>
  <script>${getMaterialBuilderEnhancementScript()}</script>
</body>
</html>`;
}

function extractMaterialBuilderBody(rawHtml) {
  const doc = createHtmlDocument(rawHtml);
  doc.querySelectorAll('script, style, base').forEach((node) => node.remove());
  doc.querySelectorAll('[data-focus-toggle]').forEach((node) => node.remove());
  return doc.body?.innerHTML?.trim() || String(rawHtml || '').trim();
}

export async function renderGuruMateriPage(container) {
  const context = getStoredContext();
  const session = getSession();
  const userId = session?.user?.username || context?.user_logged_in || '';
  const userName = session?.user?.nama || 'Guru';
  const assignments = userId
    ? await getTeachingAssignmentsForUser(context, userId)
    : await getActiveTeachingAssignments(context);
  const selectedAssignment = assignments[0] || null;
  const materialReadStats = userId ? await getMaterialReadStatsForTeacher(userId) : [];
  const shortName = userName.split(' ')[0] || 'Guru';
  const hour = new Date().getHours();
  const materialHeroTheme = hour < 12
    ? {
        panel: 'from-sky-500 via-cyan-500 to-emerald-400',
        eyebrow: 'text-cyan-100/90',
        chip: 'border-white/18 bg-white/12 text-white/90',
        glowA: 'bg-white/18',
        glowB: 'bg-cyan-200/20',
        badge: 'Pagi Produktif',
        icon: '☀',
        art: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"/>'
      }
    : hour < 15
      ? {
          panel: 'from-amber-400 via-orange-400 to-rose-400',
          eyebrow: 'text-amber-100/90',
          chip: 'border-white/18 bg-white/12 text-white/90',
          glowA: 'bg-white/16',
          glowB: 'bg-amber-200/20',
          badge: 'Siang Aktif',
          icon: '✦',
          art: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>'
        }
      : hour < 18
        ? {
            panel: 'from-violet-500 via-fuchsia-500 to-orange-400',
            eyebrow: 'text-orange-100/90',
            chip: 'border-white/18 bg-white/12 text-white/90',
            glowA: 'bg-white/14',
            glowB: 'bg-orange-200/20',
            badge: 'Sore Terkelola',
            icon: '◔',
            art: '<path d="M4 15c2.5-4.8 5.8-7.2 10-7.2 2.4 0 4.3.6 6 1.8-1.4 5-5.2 8.4-10 8.4-2.1 0-4.1-1-6-3z"/><path d="M13 5.5c1.3.5 2.3 1.6 2.7 3"/>'
          }
        : {
            panel: 'from-slate-900 via-indigo-900 to-blue-950',
            eyebrow: 'text-indigo-100/90',
            chip: 'border-white/14 bg-white/10 text-white/88',
            glowA: 'bg-white/10',
            glowB: 'bg-indigo-300/16',
            badge: 'Malam Fokus',
            icon: '☾',
            art: '<path d="M18.5 14.5A6.5 6.5 0 0 1 9.5 5.5 7.5 7.5 0 1 0 18.5 14.5Z"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="4.5" r="0.8" fill="currentColor" stroke="none"/>'
          };
  const assignmentOptions = assignments
    .map((item) => `<option value="${item.id}">${item.kelas_nama || '-'} • ${item.mapel_nama || '-'}</option>`)
    .join('');
  const assignmentCheckboxes = assignments.length
    ? assignments.map((item, idx) => `
        <label class="assignment-checkbox-label flex items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 cursor-pointer transition-all hover:border-indigo-300 hover:bg-indigo-50/40 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/60 has-[:checked]:shadow-[0_4px_16px_-6px_rgba(99,102,241,0.2)]" data-assignment-id="${item.id}">
          <input type="checkbox" class="assignment-checkbox peer h-5 w-5 rounded-lg border-2 border-slate-300 text-indigo-600 focus:ring-4 focus:ring-indigo-100 cursor-pointer" value="${item.id}" ${idx === 0 ? 'checked' : ''} />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-slate-800">${item.kelas_nama || '-'}</p>
            <p class="text-xs text-slate-500">${item.mapel_nama || '-'}</p>
          </div>
          <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 peer-checked:bg-indigo-600 peer-checked:text-white transition-all shrink-0">
            <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
          </span>
        </label>
      `).join('')
    : '<div class="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 text-center">Tidak ada relasi mengajar aktif. Hubungi admin untuk penugasan kelas.</div>';
  const templatePresetCatalog = buildTemplatePresetCatalog(assignments);
  const templatePresetOptions = buildTemplatePresetOptions(templatePresetCatalog);
  const builderSymbolButtons = MATERIAL_BUILDER_SYMBOLS
    .map((symbol) => `<button type="button" data-builder-symbol="${escapeHtml(symbol)}" class="flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700">${escapeHtml(symbol)}</button>`)
    .join('');

  let activeDraftId = '';

  const html = renderLayout('Materi', `
    <div class="space-y-6">
      <style>
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes floatSoft { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.02); } }
        @keyframes pulseGlow { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @keyframes slideUp { 0% { opacity:0; transform:translateY(16px); } 100% { opacity:1; transform:translateY(0); } }
        @keyframes slideInRight { 0% { opacity:0; transform:translateX(12px); } 100% { opacity:1; transform:translateX(0); } }
        @keyframes scaleIn { 0% { opacity:0; transform:scale(0.92); } 100% { opacity:1; transform:scale(1); } }
        @keyframes fadeIn { 0% { opacity:0; } 100% { opacity:1; } }
        @keyframes stepPulse { 0%,100% { box-shadow:0 0 0 0 rgba(99,102,241,0.4); } 50% { box-shadow:0 0 0 12px rgba(99,102,241,0); } }
        @keyframes progressFill { 0% { width:0%; } 100% { width:var(--progress-width); } }
        .premium-glass {
          background: rgba(255,255,255,0.72);
          backdrop-filter: blur(20px) saturate(1.4);
          -webkit-backdrop-filter: blur(20px) saturate(1.4);
          border: 1px solid rgba(255,255,255,0.5);
        }
        .premium-glass-strong {
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(24px) saturate(1.6);
          -webkit-backdrop-filter: blur(24px) saturate(1.6);
          border: 1px solid rgba(255,255,255,0.6);
        }
        .animate-shimmer { background-size: 200% 100%; animation: shimmer 3s linear infinite; }
        .animate-float { animation: floatSoft 5s ease-in-out infinite; }
        .animate-pulse-glow { animation: pulseGlow 3s ease-in-out infinite; }
        .animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        .animate-slide-in-right { animation: slideInRight 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .animate-scale-in { animation: scaleIn 0.35s cubic-bezier(0.16,1,0.3,1) both; }
        .animate-fade-in { animation: fadeIn 0.4s ease both; }
        .step-active { animation: stepPulse 2s ease-in-out infinite; }
        .scrollbar-premium::-webkit-scrollbar { width: 6px; height: 6px; }
        .scrollbar-premium::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-premium::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
        .scrollbar-premium::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .card-hover-premium { transition: all 0.35s cubic-bezier(0.16,1,0.3,1); }
        .card-hover-premium:hover { transform: translateY(-4px); box-shadow: 0 24px 48px -12px rgba(15,23,42,0.2); }
        .btn-premium { transition: all 0.3s cubic-bezier(0.16,1,0.3,1); position: relative; overflow: hidden; }
        .btn-premium::after { content:''; position:absolute; inset:0; background:linear-gradient(135deg, rgba(255,255,255,0.15), transparent); opacity:0; transition:opacity 0.3s; }
        .btn-premium:hover::after { opacity:1; }
        .btn-premium:active { transform: scale(0.96); }
        .premium-input { transition: all 0.25s cubic-bezier(0.16,1,0.3,1); }
        .premium-input:focus { border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99,102,241,0.12); }
        .gradient-border { position:relative; }
        .gradient-border::before { content:''; position:absolute; inset:-1px; border-radius:inherit; background:linear-gradient(135deg, #6366f1, #06b6d4, #6366f1); opacity:0; transition:opacity 0.4s; z-index:-1; }
        .gradient-border:hover::before { opacity:1; }
        .method-card { transition: all 0.35s cubic-bezier(0.16,1,0.3,1); cursor:pointer; }
        .method-card:hover { transform: translateY(-6px); }
        .method-card.selected { border-color: #6366f1 !important; box-shadow: 0 0 0 4px rgba(99,102,241,0.15), 0 20px 40px -16px rgba(99,102,241,0.35); }
        .method-card.selected .method-radio { background: #6366f1; border-color: #6366f1; }
        .method-card.selected .method-radio::after { opacity:1; transform:scale(1); }
        .method-radio { width:22px; height:22px; border-radius:50%; border:2px solid #cbd5e1; display:flex; align-items:center; justify-content:center; transition:all 0.25s; flex-shrink:0; }
        .method-radio::after { content:''; width:10px; height:10px; border-radius:50%; background:#fff; opacity:0; transform:scale(0); transition:all 0.25s; }
        .step-indicator { display:flex; align-items:center; gap:0; }
        .step-dot { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; transition:all 0.4s; border:2px solid #e2e8f0; background:#fff; color:#94a3b8; flex-shrink:0; }
        .step-dot.done { background:#6366f1; border-color:#6366f1; color:#fff; }
        .step-dot.active { background:#fff; border-color:#6366f1; color:#6366f1; }
        .step-line { width:40px; height:2px; background:#e2e8f0; transition:background 0.4s; flex-shrink:0; }
        .step-line.done { background:#6366f1; }
        .step-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; margin-top:4px; transition:color 0.4s; }
        .step-label.done { color:#6366f1; }
        .step-label.active { color:#6366f1; }
        .step-label.pending { color:#94a3b8; }
        .step-nav-btn { cursor:pointer; transition:transform 0.2s; }
        .step-nav-btn:hover .step-dot { border-color:#6366f1; color:#6366f1; transform:scale(1.08); }
        .step-nav-btn:hover .step-label { color:#6366f1; }
        .step-line { cursor:pointer; }
        .stat-card { transition:all 0.3s; }
        .stat-card:hover { transform:translateY(-2px); }
        @media (max-width: 640px) {
          .premium-glass { background: rgba(255,255,255,0.82); backdrop-filter: blur(16px); }
          .premium-glass-strong { background: rgba(255,255,255,0.9); backdrop-filter: blur(18px); }
          .step-line { width:24px; }
          .step-dot { width:30px; height:30px; font-size:11px; }
        }
      </style>

      <section class="animate-slide-up relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-800 via-indigo-900 to-slate-900 p-5 text-white shadow-[0_32px_80px_-40px_rgba(30,41,59,0.5)] sm:p-7" style="animation-delay:0.05s">
        <div class="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-indigo-500/20 blur-3xl animate-float"></div>
        <div class="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-cyan-400/15 blur-3xl animate-pulse-glow"></div>
        <div class="absolute right-16 top-16 h-12 w-12 rounded-full bg-white/5 blur-xl"></div>

        <div class="absolute right-5 top-5 hidden h-20 w-20 items-center justify-center rounded-[20px] border border-white/15 bg-white/8 backdrop-blur-md shadow-lg sm:flex">
          <svg viewBox="0 0 24 24" class="h-10 w-10 stroke-current text-white/80" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </div>

        <div class="relative min-w-0 sm:pr-28">
          <div class="flex items-center gap-2">
            <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-400/25 text-xs font-bold">M</span>
            <p class="text-[10px] font-bold uppercase tracking-[0.28em] text-indigo-200/80">Studio Materi Digital</p>
          </div>
          <h1 class="mt-2 text-2xl font-bold leading-tight text-white sm:text-3xl">Materi <span class="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-indigo-300">${shortName}</span></h1>
          <p class="mt-2 text-sm text-slate-300/80 sm:text-base max-w-xl">Buat, kelola, dan publikasikan materi pembelajaran premium dengan alur kerja yang jelas dan terstruktur</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <span class="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/85 backdrop-blur-sm">
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>
              ${assignments.length} kelas
            </span>
            <span class="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/85 backdrop-blur-sm">
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 12h4l3-9 4 18 3-9h4"/></svg>
              ${materialReadStats.length} log baca
            </span>
            <span class="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/85 backdrop-blur-sm">
              ${materialHeroTheme.icon} ${materialHeroTheme.badge}
            </span>
          </div>
        </div>
      </section>

      <section class="animate-slide-up premium-glass-strong rounded-[24px] p-3 shadow-[0_16px_48px_-24px_rgba(15,23,42,0.15)] sm:p-4" style="animation-delay:0.1s">
        <div class="flex gap-1.5 overflow-x-auto pb-1 scrollbar-premium sm:flex-wrap sm:gap-2 sm:overflow-visible" id="material-tab-bar">
          <button type="button" data-material-tab="koleksi" class="material-tab-btn relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${getTabButtonClass(true)}">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Koleksi
          </button>
          <button type="button" data-material-tab="buat" class="material-tab-btn relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${getTabButtonClass(false)}">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
            Buat Baru
          </button>
          <button type="button" data-material-tab="laporan" class="material-tab-btn relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${getTabButtonClass(false)}">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            Laporan
          </button>
        </div>
      </section>

      <section data-material-panel="koleksi" class="material-tab-panel hidden space-y-5 animate-scale-in">
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="stat-card premium-glass rounded-2xl border border-slate-200/70 p-3.5 shadow-sm">
            <div class="flex items-center gap-2.5">
              <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </span>
              <div>
                <p class="text-xl font-bold text-slate-900" id="stat-published-count">0</p>
                <p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Dipublikasi</p>
              </div>
            </div>
          </div>
          <div class="stat-card premium-glass rounded-2xl border border-slate-200/70 p-3.5 shadow-sm">
            <div class="flex items-center gap-2.5">
              <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </span>
              <div>
                <p class="text-xl font-bold text-slate-900" id="stat-draft-count">0</p>
                <p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Draft Tersimpan</p>
              </div>
            </div>
          </div>
          <div class="stat-card premium-glass rounded-2xl border border-slate-200/70 p-3.5 shadow-sm">
            <div class="flex items-center gap-2.5">
              <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              </span>
              <div>
                <p class="text-xl font-bold text-slate-900" id="stat-reads-count">${materialReadStats.length}</p>
                <p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Total Log Baca</p>
              </div>
            </div>
          </div>
        </div>

        <div class="premium-glass-strong rounded-2xl p-4 shadow-[0_16px_48px_-24px_rgba(15,23,42,0.12)] sm:p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500">Publikasi</p>
              <h2 class="mt-0.5 text-base font-semibold text-slate-900 sm:text-lg">Materi Dipublikasikan</h2>
              <p class="mt-0.5 text-xs text-slate-500">Tersedia untuk siswa</p>
            </div>
            <div class="flex items-center gap-2">
              <div class="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 text-[10px] font-bold">
                <button id="material-card-density-compact" type="button" class="rounded-full px-2.5 py-1 text-slate-500 transition hover:text-slate-700">Compact</button>
                <button id="material-card-density-comfortable" type="button" class="rounded-full px-2.5 py-1 text-slate-500 transition hover:text-slate-700">Comfort</button>
              </div>
              <span id="published-count-badge" class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">0 materi</span>
            </div>
          </div>
          <style>
            @keyframes materialShelfItemIn {
              from { opacity: 0; transform: translateY(10px) scale(0.98); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          </style>
          <div class="relative mx-auto w-full max-w-[1280px] overflow-hidden rounded-[22px] border border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-slate-100 px-2 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-3 sm:py-4">
            <div class="pointer-events-none absolute inset-x-0 top-0 h-full opacity-60">
              <div class="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(120,53,15,0.04)_0px,rgba(120,53,15,0.04)_1px,transparent_1px,transparent_12px)]"></div>
              <div class="absolute inset-0 bg-[radial-gradient(circle_at_12%_22%,rgba(146,64,14,0.08),transparent_28%),radial-gradient(circle_at_84%_68%,rgba(120,53,15,0.08),transparent_28%)]"></div>
              <div class="absolute left-0 right-0 top-[28%] h-[10px] bg-gradient-to-r from-amber-800/15 via-amber-700/25 to-amber-800/15"></div>
              <div class="absolute left-0 right-0 top-[58%] h-[10px] bg-gradient-to-r from-amber-800/15 via-amber-700/25 to-amber-800/15"></div>
              <div class="absolute left-0 right-0 bottom-[10%] h-[10px] bg-gradient-to-r from-amber-800/15 via-amber-700/25 to-amber-800/15"></div>
            </div>
            <div id="material-published-list" class="relative z-[1] mx-auto grid w-full grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 xl:grid-cols-6"></div>
          </div>
          <div id="material-published-empty" class="hidden rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">Belum ada materi yang dipublikasikan.</div>
        </div>

        <div class="premium-glass-strong rounded-2xl p-4 shadow-[0_16px_48px_-24px_rgba(15,23,42,0.12)] sm:p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Draft Lokal</p>
              <h2 class="mt-0.5 text-base font-semibold text-slate-900 sm:text-lg">Draft Materi</h2>
              <p class="mt-0.5 text-xs text-slate-500">Klik untuk melanjutkan penyuntingan</p>
            </div>
            <span id="draft-count-badge" class="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">0 draft</span>
          </div>
          <div id="material-draft-list" class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"></div>
          <div id="material-draft-empty" class="hidden rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">Belum ada draft materi yang tersimpan.</div>
        </div>
      </section>

      <section data-material-panel="buat" class="material-tab-panel hidden space-y-5 animate-scale-in">
        <div class="premium-glass-strong rounded-[24px] p-4 shadow-[0_16px_48px_-24px_rgba(15,23,42,0.12)] sm:p-5">
          <div class="mb-5 flex items-center justify-between">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-500">Alur Pembuatan</p>
              <h2 class="mt-1 text-base font-semibold text-slate-900 sm:text-lg">Buat Materi Baru</h2>
            </div>
            <span class="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-50 to-violet-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">
              <span class="inline-flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse-glow"></span>
              ${activeDraftId ? 'Edit Draft' : 'Materi Baru'}
            </span>
          </div>

          <div class="mb-6 flex items-center justify-center gap-0" id="wizard-step-nav">
            <button type="button" data-step="1" class="step-nav-btn group flex flex-col items-center gap-1.5 outline-none">
              <div class="step-dot active" id="step-dot-1">1</div>
              <span class="step-label active mt-1.5">Pilih Metode</span>
            </button>
            <div class="step-line mx-1" id="step-line-1" data-step="2"></div>
            <button type="button" data-step="2" class="step-nav-btn group flex flex-col items-center gap-1.5 outline-none">
              <div class="step-dot" id="step-dot-2">2</div>
              <span class="step-label pending mt-1.5">Metadata</span>
            </button>
            <div class="step-line mx-1" id="step-line-2" data-step="3"></div>
            <button type="button" data-step="3" class="step-nav-btn group flex flex-col items-center gap-1.5 outline-none">
              <div class="step-dot" id="step-dot-3">3</div>
              <span class="step-label pending mt-1.5">Buat Konten</span>
            </button>
            <div class="step-line mx-1" id="step-line-3" data-step="4"></div>
            <button type="button" data-step="4" class="step-nav-btn group flex flex-col items-center gap-1.5 outline-none">
              <div class="step-dot" id="step-dot-4">4</div>
              <span class="step-label pending mt-1.5">Review</span>
            </button>
          </div>

          <div id="buat-step-1" class="animate-fade-in">
            <p class="mb-4 text-sm text-slate-600">Pilih metode pembuatan materi yang paling sesuai dengan kebutuhan Anda:</p>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="method-card selected rounded-[20px] border-2 border-indigo-500 bg-white p-5 shadow-sm" data-method="editor" id="method-card-editor">
                <div class="flex items-start justify-between">
                  <span class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </span>
                  <span class="method-radio"></span>
                </div>
                <h3 class="mt-3 text-sm font-bold text-slate-900">Buat Materi Manual</h3>
                <p class="mt-1 text-xs leading-relaxed text-slate-500">Tulis materi langsung dengan editor visual lengkap: toolbar format, sisip gambar, tabel, video, dan template struktur materi.</p>
                <span class="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-600">Tanpa AI</span>
              </div>
              <div class="method-card rounded-[20px] border-2 border-slate-200 bg-white p-5 shadow-sm" data-method="html" id="method-card-html">
                <div class="flex items-start justify-between">
                  <span class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 text-white">
                    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3l1.9 4.8L19 9l-4.5 2.5L12 16l-2.5-4.5L5 9l5.1-1.2L12 3z"/><path d="M19 14l.9 2.3L22 17l-2.1 1.2L19 20l-.9-1.8L16 17l2.1-1.7L19 14z"/></svg>
                  </span>
                  <span class="method-radio"></span>
                </div>
                <h3 class="mt-3 text-sm font-bold text-slate-900">Buat Materi dengan AI</h3>
                <p class="mt-1 text-xs leading-relaxed text-slate-500">Susun prompt, generate di ChatGPT/DeepSeek, lalu tempel HTML hasilnya. Tersedia template prompt siap pakai agar hasil konsisten.</p>
                <span class="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-600">Terpandu & Cepat</span>
              </div>
            </div>
            <div class="mt-5 flex justify-end">
              <button id="btn-next-to-metadata" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_-16px_rgba(99,102,241,0.9)] transition hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700">
                Lanjut ke Metadata
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>

          <div id="buat-step-2" class="hidden animate-fade-in">
            <div class="mb-4 flex items-center gap-3">
              <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-600">2</span>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Informasi Metadata</h3>
                <p class="text-xs text-slate-500">Data ini akan otomatis terintegrasi dengan materi yang dibuat</p>
              </div>
            </div>

            <div class="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/70 to-violet-50/50 p-4 mb-5">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <p class="text-sm font-bold text-indigo-800">Pilih Kelas Tujuan</p>
                  <p class="text-xs text-indigo-600/70">Centang satu atau lebih kelas untuk mendistribusikan materi</p>
                </div>
                <span class="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-bold text-indigo-700" id="selected-classes-count">1 dipilih</span>
              </div>
              <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" id="material-assignment-list">
                ${assignmentCheckboxes}
              </div>
            </div>

            <div class="space-y-3">
              <div>
                <label class="text-sm font-medium text-slate-700">Judul Materi</label>
                <input id="material-title" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: Polinomial" />
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="text-sm font-medium text-slate-700">Label Kelas</label>
                  <input id="material-level" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: Kelas 11" />
                </div>
                <div>
                  <label class="text-sm font-medium text-slate-700">Bab / Unit</label>
                  <input id="material-chapter" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: Bab 4" />
                </div>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Pertemuan</label>
                <input id="material-meetings" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: 6 pertemuan" />
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Catatan Guru</label>
                <textarea id="material-note" rows="3" class="premium-input mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: cek kembali pembahasan contoh 2 dan tambahkan soal HOTS."></textarea>
              </div>
              <div class="flex flex-wrap gap-3">
                <button id="btn-back-to-method" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  Kembali
                </button>
                <button id="btn-next-to-content" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-16px_rgba(99,102,241,0.9)] transition hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700">
                  Lanjut ke Konten
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>
          </div>

          <div id="buat-step-3" class="hidden animate-fade-in">
            <div class="mb-4 flex items-center gap-3">
              <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-600">3</span>
              <div>
                <h3 class="text-sm font-bold text-slate-900" id="step-3-title">Buat Konten Materi</h3>
                <p class="text-xs text-slate-500" id="step-3-subtitle">Gunakan editor yang sesuai dengan metode pilihan Anda</p>
              </div>
            </div>

            <div id="buat-content-editor" class="hidden">
              <style>
                #material-builder-shell {
                  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                  background: #f0f4f8;
                }
                #material-builder-shell *,
                #material-builder-shell *::before,
                #material-builder-shell *::after {
                  box-sizing: border-box;
                }
                #material-builder-shell .editor-wrapper {
                  width: 100%;
                  max-width: 1400px;
                  margin: 0 auto;
                  background: #ffffff;
                  border-radius: 20px;
                  box-shadow: 0 25px 60px rgba(0, 20, 50, 0.15);
                  overflow: hidden;
                  transition: all 0.3s ease;
                }
                #material-builder-shell .editor-wrapper.fullscreen {
                  position: fixed;
                  top: 0;
                  left: 0;
                  width: 100vw;
                  height: 100vh;
                  z-index: 9999;
                  border-radius: 0;
                  max-width: none;
                }
                #material-builder-shell .editor-header {
                  display: flex;
                  flex-wrap: wrap;
                  align-items: center;
                  gap: 8px;
                  padding: 12px 16px;
                  border-bottom: 1px solid #e2e8f0;
                  background: #fafbfc;
                }
                #material-builder-shell .toolbar {
                  display: flex;
                  flex-wrap: wrap;
                  align-items: center;
                  gap: 4px;
                  padding: 8px 12px;
                  border-bottom: 1px solid #e2e8f0;
                  background: #f8fafc;
                }
                #material-builder-shell .toolbar button {
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  height: 34px;
                  min-width: 34px;
                  padding: 0 8px;
                  border: 1px solid #e2e8f0;
                  border-radius: 10px;
                  background: #fff;
                  color: #475569;
                  font-size: 13px;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.2s;
                  white-space: nowrap;
                }
                #material-builder-shell .toolbar button:hover {
                  background: #f1f5f9;
                  border-color: #cbd5e1;
                }
                #material-builder-shell .toolbar button.bg-sky-100 {
                  background: #e0f2fe;
                  border-color: #7dd3fc;
                  color: #0369a1;
                }
                #material-builder-shell .toolbar .sep {
                  width: 1px;
                  height: 24px;
                  background: #e2e8f0;
                  margin: 0 4px;
                }
                #material-builder-shell .editor-body {
                  display: flex;
                  min-height: 500px;
                }
                #material-builder-shell .editor-content {
                  flex: 1;
                  padding: 24px;
                  outline: none;
                  min-height: 500px;
                  font-size: 15px;
                  line-height: 1.8;
                  color: #1e293b;
                }
                #material-builder-shell .editor-content.preview {
                  pointer-events: none;
                  user-select: none;
                }
                #material-builder-shell .editor-content h1 { font-size: 2em; font-weight: 800; margin: 0.5em 0 0.3em; color: #0f172a; }
                #material-builder-shell .editor-content h2 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0 0.3em; color: #1e293b; }
                #material-builder-shell .editor-content h3 { font-size: 1.2em; font-weight: 600; margin: 0.4em 0 0.2em; }
                #material-builder-shell .editor-content p { margin: 0.5em 0; }
                #material-builder-shell .editor-content ul, #material-builder-shell .editor-content ol { padding-left: 1.5em; margin: 0.5em 0; }
                #material-builder-shell .editor-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
                #material-builder-shell .editor-content table td, #material-builder-shell .editor-content table th { border: 1px solid #e2e8f0; padding: 8px 12px; }
                #material-builder-shell .code-view {
                  display: none;
                  width: 100%;
                  min-height: 500px;
                  padding: 20px;
                  font-family: 'Fira Code', 'Consolas', monospace;
                  font-size: 13px;
                  line-height: 1.7;
                  background: #0f172a;
                  color: #e2e8f0;
                  border: none;
                  outline: none;
                  resize: vertical;
                }
                #material-builder-shell .code-view.active { display: block; }
                #material-builder-shell .status-bar {
                  display: flex;
                  flex-wrap: wrap;
                  align-items: center;
                  justify-content: space-between;
                  gap: 8px;
                  padding: 8px 16px;
                  border-top: 1px solid #e2e8f0;
                  background: #fafbfc;
                  font-size: 11px;
                  color: #94a3b8;
                }
                #material-builder-shell .modal-overlay {
                  position: fixed;
                  inset: 0;
                  z-index: 10000;
                  background: rgba(15, 23, 42, 0.6);
                  backdrop-filter: blur(4px);
                  display: none;
                  align-items: center;
                  justify-content: center;
                }
                #material-builder-shell .modal-overlay.open { display: flex; }
                #material-builder-shell .modal-box {
                  background: #fff;
                  border-radius: 24px;
                  padding: 24px;
                  max-width: 480px;
                  width: 90%;
                  box-shadow: 0 40px 80px rgba(0,0,0,0.25);
                }
                #material-builder-shell .char-grid {
                  display: grid;
                  grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
                  gap: 6px;
                  padding: 8px;
                }
                #material-builder-shell .toast {
                  position: fixed;
                  bottom: 24px;
                  left: 50%;
                  transform: translateX(-50%) translateY(20px);
                  background: #0f172a;
                  color: #fff;
                  padding: 10px 24px;
                  border-radius: 999px;
                  font-size: 13px;
                  font-weight: 600;
                  opacity: 0;
                  transition: all 0.3s;
                  z-index: 10001;
                  pointer-events: none;
                }
                #material-builder-shell .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
              </style>
              <div id="material-builder-shell">
                <div class="editor-wrapper" id="builder-wrapper">
                  <div class="editor-header">
                    <input id="builder-title" class="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="Judul materi..." />
                    <select id="builder-assignment" class="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 outline-none focus:border-indigo-300">${assignmentOptions || '<option value="">Pilih relasi</option>'}</select>
                    <input id="builder-level" class="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 outline-none focus:border-indigo-300" placeholder="Kelas" />
                    <input id="builder-chapter" class="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 outline-none focus:border-indigo-300" placeholder="Bab" />
                    <button id="builder-preview-refresh-btn" type="button" class="rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700">Preview</button>
                  </div>
                  <div class="toolbar">
                    <button type="button" data-builder-action="undo" title="Undo"><i class="fa-solid fa-rotate-left"></i></button>
                    <button type="button" data-builder-action="redo" title="Redo"><i class="fa-solid fa-rotate-right"></i></button>
                    <span class="sep"></span>
                    <button type="button" data-builder-command="bold" title="Bold (Ctrl+B)"><b>B</b></button>
                    <button type="button" data-builder-command="italic" title="Italic (Ctrl+I)"><i>I</i></button>
                    <button type="button" data-builder-command="underline" title="Underline (Ctrl+U)"><u>U</u></button>
                    <button type="button" data-builder-command="strikeThrough" title="Strikethrough"><s>S</s></button>
                    <button type="button" data-builder-command="superscript" title="Superscript">x<sup>2</sup></button>
                    <button type="button" data-builder-command="subscript" title="Subscript">x<sub>2</sub></button>
                    <span class="sep"></span>
                    <button type="button" data-builder-command="justifyLeft" title="Align Left"><i class="fa-solid fa-align-left"></i></button>
                    <button type="button" data-builder-command="justifyCenter" title="Align Center"><i class="fa-solid fa-align-center"></i></button>
                    <button type="button" data-builder-command="justifyRight" title="Align Right"><i class="fa-solid fa-align-right"></i></button>
                    <button type="button" data-builder-command="justifyFull" title="Justify"><i class="fa-solid fa-align-justify"></i></button>
                    <span class="sep"></span>
                    <button type="button" data-builder-command="insertUnorderedList" title="Bullet List"><i class="fa-solid fa-list-ul"></i></button>
                    <button type="button" data-builder-command="insertOrderedList" title="Numbered List"><i class="fa-solid fa-list-ol"></i></button>
                    <button type="button" data-builder-command="indent" title="Indent"><i class="fa-solid fa-indent"></i></button>
                    <button type="button" data-builder-command="outdent" title="Outdent"><i class="fa-solid fa-outdent"></i></button>
                    <span class="sep"></span>
                    <select id="builder-font-family" class="h-[34px] rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600">
                      <option value="">Font</option><option value="Inter, sans-serif">Inter</option><option value="Georgia, serif">Georgia</option><option value="'Courier New', monospace">Mono</option>
                    </select>
                    <select id="builder-font-size" class="h-[34px] rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600">
                      <option value="">Size</option><option value="1">XS</option><option value="2">S</option><option value="3">M</option><option value="4">L</option><option value="5">XL</option><option value="6">XXL</option><option value="7">XXXL</option>
                    </select>
                    <input type="color" id="builder-text-color" class="h-[34px] w-[34px] rounded-lg border border-slate-200 cursor-pointer" title="Text Color" />
                    <input type="color" id="builder-bg-color" class="h-[34px] w-[34px] rounded-lg border border-slate-200 cursor-pointer" title="Background Color" />
                    <span class="sep"></span>
                    <button type="button" data-builder-insert="image" title="Insert Image"><i class="fa-solid fa-image"></i></button>
                    <button type="button" data-builder-insert="link" title="Insert Link"><i class="fa-solid fa-link"></i></button>
                    <button type="button" data-builder-insert="table" title="Insert Table"><i class="fa-solid fa-table"></i></button>
                    <button type="button" data-builder-insert="video" title="Insert Video"><i class="fa-solid fa-video"></i></button>
                    <button type="button" data-builder-action="toggle-symbols" title="Symbols">Ω</button>
                    <span class="sep"></span>
                    <button type="button" data-builder-command="removeFormat" title="Clear Format"><i class="fa-solid fa-eraser"></i></button>
                    <span class="sep"></span>
                    <button type="button" data-builder-template="h1" class="text-indigo-600">H1</button>
                    <button type="button" data-builder-template="h2" class="text-indigo-600">H2</button>
                    <button type="button" data-builder-template="note" class="text-amber-600">Note</button>
                    <button type="button" data-builder-template="example" class="text-emerald-600">Contoh</button>
                    <button type="button" data-builder-template="exercise" class="text-sky-600">Latihan</button>
                    <button type="button" data-builder-template="task" class="text-rose-600">Tugas</button>
                    <button type="button" data-builder-template="tabs" class="text-violet-600">Tabs</button>
                    <span class="sep"></span>
                    <button type="button" data-builder-action="toggle-code" title="Code View"><i class="fa-solid fa-code"></i> Code</button>
                    <button type="button" data-builder-action="toggle-preview" title="Preview"><i class="fa-solid fa-eye"></i></button>
                    <button type="button" data-builder-action="toggle-fullscreen" title="Fullscreen"><i class="fa-solid fa-expand"></i></button>
                    <button type="button" data-builder-action="help" title="Help"><i class="fa-solid fa-circle-question"></i></button>
                    <button type="button" data-builder-action="clear" title="Clear All" class="text-rose-600"><i class="fa-solid fa-trash-can"></i></button>
                  </div>
                  <div id="builder-symbol-panel" style="display:none; padding:8px 12px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
                    <div class="char-grid">${builderSymbolButtons}</div>
                  </div>
                  <div class="editor-body">
                    <div id="builder-editor-content" class="editor-content scrollbar-premium" contenteditable="true"></div>
                    <textarea id="builder-code-view" class="code-view scrollbar-premium" placeholder="HTML source..."></textarea>
                  </div>
                  <div class="status-bar">
                    <span id="builder-mode-indicator" class="font-semibold text-indigo-600">Edit</span>
                    <span>Kata: <b id="builder-word-count">0</b></span>
                    <span>Karakter: <b id="builder-char-count">0</b></span>
                    <span>Tersimpan: <b id="builder-last-saved">-</b></span>
                  </div>
                </div>
                <div id="builder-modal-overlay" class="modal-overlay">
                  <div class="modal-box">
                    <h3 id="builder-modal-title" class="text-lg font-bold text-slate-900"></h3>
                    <p id="builder-modal-subtitle" class="mt-1 text-sm text-slate-500"></p>
                    <div id="builder-modal-body" class="mt-4"></div>
                    <div class="mt-5 flex justify-end gap-3">
                      <button id="builder-modal-cancel-btn" type="button" class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
                      <button id="builder-modal-confirm-btn" type="button" class="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Simpan</button>
                    </div>
                  </div>
                </div>
                <div id="builder-toast" class="toast"><span id="builder-toast-message"></span></div>
              </div>
              <div class="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div class="mb-3 flex items-center justify-between">
                  <h4 class="text-sm font-semibold text-slate-800">Preview Materi</h4>
                  <button id="builder-preview-refresh-btn-2" type="button" class="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100">Refresh</button>
                </div>
                <iframe id="builder-preview-frame" title="Preview Buat Materi" sandbox="allow-scripts allow-modals" class="h-[600px] w-full rounded-[16px] border border-slate-200 bg-white"></iframe>
              </div>
            </div>

            <div id="buat-content-html" class="hidden space-y-4">
              <div class="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50/70 to-sky-50/50 p-4">
                <p class="text-sm font-bold text-cyan-900">Alur Membuat Materi dengan AI</p>
                <ol class="mt-2 space-y-1.5 text-sm text-slate-600">
                  <li class="flex gap-2"><span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-[11px] font-bold text-white">1</span> Susun prompt dengan Template Prompt (disarankan agar hasil konsisten).</li>
                  <li class="flex gap-2"><span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-[11px] font-bold text-white">2</span> Salin prompt, lalu buka ChatGPT / DeepSeek untuk generate.</li>
                  <li class="flex gap-2"><span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-[11px] font-bold text-white">3</span> Tempel HTML hasil AI ke kotak "Sumber HTML AI", lalu Muat Preview.</li>
                  <li class="flex gap-2"><span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-[11px] font-bold text-white">4</span> Tinjau preview, lalu klik Lanjut ke Review untuk publish.</li>
                </ol>
              </div>

              <div class="premium-glass rounded-[20px] border border-slate-200/70 p-4 shadow-sm sm:p-5">
                <div class="mb-3 flex items-center gap-2">
                  <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-[11px] font-bold text-white">1</span>
                  <div>
                    <h2 class="text-base font-semibold text-slate-900">Template Prompt (Opsional)</h2>
                    <p class="text-xs text-slate-500">Isi form untuk menghasilkan prompt yang konsisten sebelum meminta AI membuat HTML materi.</p>
                  </div>
                  <button id="fill-template-from-editor-btn" type="button" class="btn-premium ml-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700">Ambil dari Metadata</button>
                </div>

                <div class="rounded-[20px] border border-sky-100 bg-sky-50/70 p-4 mb-4">
                  <div class="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                    <div>
                      <label class="text-sm font-medium text-slate-700">Preset Template Mapel</label>
                      <select id="template-material-preset" class="premium-input mt-1.5 w-full rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
                        <option value="">Pilih preset mapel...</option>
                        ${templatePresetOptions}
                      </select>
                    </div>
                    <button id="apply-template-preset-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-16px_rgba(99,102,241,0.9)] transition hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700">Terapkan Preset</button>
                  </div>
                  <p class="mt-3 text-sm text-slate-600">Preset akan mengisi pola tujuan, materi pokok, contoh, latihan, evaluasi, dan gaya visual agar konsisten untuk jenjang SMA Kurikulum Merdeka dengan pendekatan deep learning.</p>
                </div>

                <div class="grid gap-4 lg:grid-cols-2">
                  <div class="space-y-4">
                    <div>
                      <label class="text-sm font-medium text-slate-700">Judul Materi</label>
                      <input id="template-material-title" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: Polinomial" />
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label class="text-sm font-medium text-slate-700">Mata Pelajaran</label>
                        <input id="template-material-mapel" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: Matematika" />
                      </div>
                      <div>
                        <label class="text-sm font-medium text-slate-700">Kelas/Level</label>
                        <input id="template-material-kelas" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: Kelas 11" />
                      </div>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label class="text-sm font-medium text-slate-700">Bab / Unit</label>
                        <input id="template-material-bab" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: Bab 4" />
                      </div>
                      <div>
                        <label class="text-sm font-medium text-slate-700">Pertemuan</label>
                        <input id="template-material-pertemuan" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: 6 pertemuan" />
                      </div>
                    </div>
                    <div>
                      <label class="text-sm font-medium text-slate-700">Tujuan Pembelajaran</label>
                      <textarea id="template-material-tujuan" rows="3" class="premium-input mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Tuliskan tujuan pembelajaran utama."></textarea>
                    </div>
                    <div>
                      <label class="text-sm font-medium text-slate-700">Materi Pokok</label>
                      <textarea id="template-material-pokok" rows="4" class="premium-input mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Tuliskan poin-poin materi inti yang wajib muncul."></textarea>
                    </div>
                  </div>

                  <div class="space-y-4">
                    <div>
                      <label class="text-sm font-medium text-slate-700">Contoh</label>
                      <textarea id="template-material-contoh" rows="3" class="premium-input mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh soal, contoh kasus, atau ilustrasi."></textarea>
                    </div>
                    <div>
                      <label class="text-sm font-medium text-slate-700">Latihan</label>
                      <textarea id="template-material-latihan" rows="3" class="premium-input mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Tuliskan bentuk latihan bertahap yang diinginkan."></textarea>
                    </div>
                    <div>
                      <label class="text-sm font-medium text-slate-700">Evaluasi / Tugas</label>
                      <textarea id="template-material-evaluasi" rows="3" class="premium-input mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Tuliskan tugas atau evaluasi akhir."></textarea>
                    </div>
                    <div>
                      <label class="text-sm font-medium text-slate-700">Gaya Visual</label>
                      <textarea id="template-material-gaya" rows="3" class="premium-input mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Contoh: modern, kartu membulat, dominan biru, rapi dan ringan.">rapi, modern, mudah dibaca siswa, dominan biru-sky/cyan, kartu membulat</textarea>
                    </div>
                    <div>
                      <label class="text-sm font-medium text-slate-700">Catatan Guru Tambahan</label>
                      <textarea id="template-material-catatan" rows="4" class="premium-input mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Tuliskan preferensi tambahan untuk AI."></textarea>
                    </div>
                  </div>
                </div>

                <div class="mt-5 flex flex-wrap gap-3">
                  <button id="generate-template-prompt-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-16px_rgba(99,102,241,0.9)] transition hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700">Buat Prompt</button>
                  <button id="copy-template-prompt-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">Salin Prompt</button>
                  <button id="open-chatgpt-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 hover:border-emerald-300">ChatGPT</button>
                  <button id="open-deepseek-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-5 py-2.5 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50 hover:border-cyan-300">DeepSeek</button>
                </div>
                <p id="template-prompt-status" class="mt-3 text-sm text-slate-500">Isi form lalu klik Buat Prompt untuk menghasilkan template prompt HTML.</p>

                <div class="mt-4 premium-glass rounded-[20px] border border-slate-200/70 p-4 shadow-sm sm:p-5">
                  <div class="mb-4">
                    <h2 class="text-lg font-semibold text-slate-900">Hasil Prompt</h2>
                    <p class="mt-1 text-sm text-slate-500">Gunakan prompt ini pada AI Anda agar struktur HTML materi tetap konsisten.</p>
                  </div>
                  <textarea id="template-prompt-output" rows="12" class="w-full rounded-[24px] border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs leading-6 text-indigo-100 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Prompt template akan muncul di sini..."></textarea>
                </div>
              </div>

              <div class="premium-glass rounded-[20px] border border-slate-200/70 p-4 shadow-sm sm:p-5">
                <div class="mb-3 flex items-center gap-2">
                  <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-[11px] font-bold text-white">2</span>
                  <div>
                    <h2 class="text-base font-semibold text-slate-900">Sumber HTML AI</h2>
                    <p class="text-xs text-slate-500">Tempel hasil HTML lengkap dari AI ke kotak di bawah, lalu Muat Preview.</p>
                  </div>
                  <button id="load-material-preview-btn" type="button" class="btn-premium ml-auto inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">Muat Preview</button>
                </div>
                <textarea id="material-html-source" rows="18" class="w-full rounded-[24px] border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs leading-6 text-indigo-100 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Tempel HTML hasil AI di sini..."></textarea>
              </div>

              <div class="premium-glass rounded-[20px] border border-slate-200/70 p-4 shadow-sm sm:p-5">
                <div class="mb-3 flex items-center gap-2">
                  <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-[11px] font-bold text-white">3</span>
                  <div>
                    <h2 class="text-base font-semibold text-slate-900">Preview Materi</h2>
                    <p class="text-xs text-slate-500">Preview berjalan dalam iframe terisolasi untuk meninjau hasil akhir.</p>
                  </div>
                  <span class="ml-auto rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Review</span>
                </div>
                <iframe id="material-preview-frame" title="Preview materi" sandbox="allow-scripts allow-modals" class="h-[640px] w-full rounded-[24px] border border-slate-200 bg-white"></iframe>
                <div class="mt-4 flex flex-wrap gap-3">
                  <button id="apply-material-metadata-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-16px_rgba(99,102,241,0.9)] transition hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700">Terapkan Metadata ke HTML</button>
                </div>
              </div>
            </div>

            <div class="mt-5 flex flex-wrap gap-3">
              <button id="btn-back-to-metadata" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Kembali
              </button>
              <button id="btn-next-to-review" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-16px_rgba(99,102,241,0.9)] transition hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700">
                Lanjut ke Review
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>

          <div id="buat-step-4" class="hidden animate-fade-in">
            <div class="mb-4 flex items-center gap-3">
              <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-600">4</span>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Review & Publikasi</h3>
                <p class="text-xs text-slate-500">Periksa kembali materi sebelum menyimpan atau mempublikasikan</p>
              </div>
            </div>

            <div class="premium-glass rounded-[20px] border border-slate-200/70 p-4 shadow-sm sm:p-5">
              <div class="mb-4">
                <h2 class="text-lg font-semibold text-slate-900">Preview Final</h2>
                <p class="mt-1 text-sm text-slate-500">Tampilan akhir materi yang akan dilihat siswa</p>
              </div>
              <iframe id="material-preview-frame-final" title="Preview final materi" sandbox="allow-scripts allow-modals" class="h-[720px] w-full rounded-[24px] border border-slate-200 bg-white"></iframe>
            </div>

            <div class="mt-5 flex flex-wrap gap-3">
              <button id="btn-back-to-content" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Kembali
              </button>
              <button id="save-material-draft-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 hover:border-indigo-300">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Simpan Draft
              </button>
              <button id="publish-material-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-16px_rgba(13,148,136,0.9)] transition hover:-translate-y-0.5 hover:from-emerald-700 hover:to-teal-700">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                Publish Materi
              </button>
              <button id="reset-material-editor-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">Materi Baru</button>
            </div>
            <p id="material-status" class="mt-3 text-sm text-slate-500">Siap disimpan atau dipublikasikan. Klik Preview untuk melihat hasil akhir.</p>
          </div>
        </div>
      </section>

      <section data-material-panel="laporan" class="material-tab-panel hidden animate-scale-in premium-glass-strong rounded-[24px] p-4 shadow-[0_16px_48px_-24px_rgba(15,23,42,0.12)] sm:p-5">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-500">Analitik</p>
            <h2 class="text-base font-semibold text-slate-900 sm:text-lg">Progress Baca Siswa</h2>
            <p class="mt-0.5 text-sm text-slate-500">Pantau siapa yang sudah membaca materi Anda</p>
          </div>
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <div>
            <label class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Filter Kelas</label>
            <select id="material-report-class-filter" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
              <option value="">Semua kelas</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Filter Mapel</label>
            <select id="material-report-mapel-filter" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
              <option value="">Semua mapel</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Filter Status</label>
            <select id="material-report-status-filter" class="premium-input mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
              <option value="">Semua status</option>
              <option value="unopened">Belum buka</option>
              <option value="opened">Sudah buka</option>
              <option value="completed">Selesai baca</option>
            </select>
          </div>
        </div>
        <div id="material-report-summary" class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"></div>
        <div id="material-report-table" class="mt-4 scrollbar-premium"></div>
      </section>
    </div>

    <section id="guru-material-reader-overlay" class="fixed inset-0 z-[120] hidden animate-scale-in">
      <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-md"></div>
      <div class="relative flex h-[100dvh] w-full flex-col bg-white/95 backdrop-blur-xl shadow-2xl sm:m-4 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:rounded-[28px] sm:overflow-hidden">
        <div class="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 sm:px-6" style="padding-top: calc(0.75rem + env(safe-area-inset-top));">
          <div class="min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-500">Preview Materi</p>
            <p id="guru-material-reader-title" class="mt-0.5 truncate text-base font-semibold text-slate-900">Materi</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="guru-material-edit-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgba(99,102,241,0.35)] hover:shadow-[0_12px_32px_-8px_rgba(99,102,241,0.45)]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>Edit</span>
            </button>
            <button id="guru-material-back-btn" type="button" class="btn-premium inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span>Tutup</span>
            </button>
          </div>
        </div>
        <iframe id="guru-material-reader-frame" title="Preview materi guru layar penuh" sandbox="allow-scripts allow-modals" class="min-h-0 flex-1 w-full bg-white" style="padding-bottom: env(safe-area-inset-bottom);"></iframe>
      </div>
    </section>
  `);

  container.innerHTML = html;

  const assignmentListEl = container.querySelector('#material-assignment-list');
  const selectedClassesCountEl = container.querySelector('#selected-classes-count');
  const titleInput = container.querySelector('#material-title');
  const levelInput = container.querySelector('#material-level');
  const chapterInput = container.querySelector('#material-chapter');
  const meetingsInput = container.querySelector('#material-meetings');
  const noteInput = container.querySelector('#material-note');
  const sourceInput = container.querySelector('#material-html-source');
  const previewFrame = container.querySelector('#material-preview-frame');
  const statusEl = container.querySelector('#material-status');
  const draftListEl = container.querySelector('#material-draft-list');
  const publishedListEl = container.querySelector('#material-published-list');
  const readerOverlayEl = document.getElementById('guru-material-reader-overlay');
  const readerFrameEl = document.getElementById('guru-material-reader-frame');
  const readerTitleEl = document.getElementById('guru-material-reader-title');
  const readerBackBtn = document.getElementById('guru-material-back-btn');
  const readerEditBtn = document.getElementById('guru-material-edit-btn');
  const materialTabButtons = Array.from(container.querySelectorAll('[data-material-tab]'));
  const materialTabPanels = Array.from(container.querySelectorAll('[data-material-panel]'));
  const templateTitleInput = container.querySelector('#template-material-title');
  const templatePresetSelect = container.querySelector('#template-material-preset');
  const templateMapelInput = container.querySelector('#template-material-mapel');
  const templateKelasInput = container.querySelector('#template-material-kelas');
  const templateBabInput = container.querySelector('#template-material-bab');
  const templatePertemuanInput = container.querySelector('#template-material-pertemuan');
  const templateTujuanInput = container.querySelector('#template-material-tujuan');
  const templatePokokInput = container.querySelector('#template-material-pokok');
  const templateContohInput = container.querySelector('#template-material-contoh');
  const templateLatihanInput = container.querySelector('#template-material-latihan');
  const templateEvaluasiInput = container.querySelector('#template-material-evaluasi');
  const templateGayaInput = container.querySelector('#template-material-gaya');
  const templateCatatanInput = container.querySelector('#template-material-catatan');
  const templatePromptOutput = container.querySelector('#template-prompt-output');
  const templatePromptStatus = container.querySelector('#template-prompt-status');
  const applyTemplatePresetBtn = container.querySelector('#apply-template-preset-btn');
  const fillTemplateFromEditorBtn = container.querySelector('#fill-template-from-editor-btn');
  const generateTemplatePromptBtn = container.querySelector('#generate-template-prompt-btn');
  const copyTemplatePromptBtn = container.querySelector('#copy-template-prompt-btn');
  const openChatGptBtn = container.querySelector('#open-chatgpt-btn');
  const openDeepSeekBtn = container.querySelector('#open-deepseek-btn');
  const loadPreviewBtn = container.querySelector('#load-material-preview-btn');
  const applyMetadataBtn = container.querySelector('#apply-material-metadata-btn');
  const saveDraftBtn = container.querySelector('#save-material-draft-btn');
  const publishMaterialBtn = container.querySelector('#publish-material-btn');
  const resetEditorBtn = container.querySelector('#reset-material-editor-btn');
  const builderImportHtmlBtn = container.querySelector('#builder-import-html-btn');
  const builderApplyToHtmlBtn = container.querySelector('#builder-apply-to-html-btn');
  const builderSaveDraftBtn = container.querySelector('#builder-save-draft-btn');
  const builderPublishBtn = container.querySelector('#builder-publish-btn');
  const builderExportHtmlBtn = container.querySelector('#builder-export-html-btn');
  const builderPrintBtn = container.querySelector('#builder-print-btn');
  const builderAssignmentSelect = container.querySelector('#builder-assignment');
  const builderTitleInput = container.querySelector('#builder-title');
  const builderLevelInput = container.querySelector('#builder-level');
  const builderChapterInput = container.querySelector('#builder-chapter');
  const builderPreviewRefreshBtn = container.querySelector('#builder-preview-refresh-btn');
  const builderPreviewFrame = container.querySelector('#builder-preview-frame');
  const reportClassFilterEl = container.querySelector('#material-report-class-filter');
  const reportMapelFilterEl = container.querySelector('#material-report-mapel-filter');
  const reportStatusFilterEl = container.querySelector('#material-report-status-filter');
  const reportSummaryEl = container.querySelector('#material-report-summary');
  const reportTableEl = container.querySelector('#material-report-table');
  const builderShell = container.querySelector('#material-builder-shell');
  const builderWrapper = container.querySelector('#builder-wrapper');
  const builderEditor = container.querySelector('#builder-editor-content');
  const builderCodeView = container.querySelector('#builder-code-view');
  const builderWordCount = container.querySelector('#builder-word-count');
  const builderCharCount = container.querySelector('#builder-char-count');
  const builderLastSaved = container.querySelector('#builder-last-saved');
  const builderModeIndicator = container.querySelector('#builder-mode-indicator');
  const builderSymbolPanel = container.querySelector('#builder-symbol-panel');
  const builderToast = container.querySelector('#builder-toast');
  const builderToastMessage = container.querySelector('#builder-toast-message');
  const builderModalOverlay = container.querySelector('#builder-modal-overlay');
  const builderModalTitle = container.querySelector('#builder-modal-title');
  const builderModalSubtitle = container.querySelector('#builder-modal-subtitle');
  const builderModalBody = container.querySelector('#builder-modal-body');
  const builderModalCancelBtn = container.querySelector('#builder-modal-cancel-btn');
  const builderModalConfirmBtn = container.querySelector('#builder-modal-confirm-btn');
  const builderFontFamily = container.querySelector('#builder-font-family');
  const builderFontSize = container.querySelector('#builder-font-size');
  const builderTextColor = container.querySelector('#builder-text-color');
  const builderBgColor = container.querySelector('#builder-bg-color');
  const builderCommandButtons = Array.from(container.querySelectorAll('[data-builder-command]'));
  const builderActionButtons = Array.from(container.querySelectorAll('[data-builder-action]'));
  const builderTemplateButtons = Array.from(container.querySelectorAll('[data-builder-template]'));
  const builderInsertButtons = Array.from(container.querySelectorAll('[data-builder-insert]'));
  const builderSymbolButtonsEls = Array.from(container.querySelectorAll('[data-builder-symbol]'));

  const statPublishedCount = container.querySelector('#stat-published-count');
  const statDraftCount = container.querySelector('#stat-draft-count');
  const statReadsCount = container.querySelector('#stat-reads-count');
  const cardDensityCompactBtn = container.querySelector('#material-card-density-compact');
  const cardDensityComfortableBtn = container.querySelector('#material-card-density-comfortable');
  const previewFrameFinal = container.querySelector('#material-preview-frame-final');
  const buatStep1 = container.querySelector('#buat-step-1');
  const buatStep2 = container.querySelector('#buat-step-2');
  const buatStep3 = container.querySelector('#buat-step-3');
  const buatStep4 = container.querySelector('#buat-step-4');
  const buatContentEditor = container.querySelector('#buat-content-editor');
  const buatContentHtml = container.querySelector('#buat-content-html');
  const stepDot1 = container.querySelector('#step-dot-1');
  const stepDot2 = container.querySelector('#step-dot-2');
  const stepDot3 = container.querySelector('#step-dot-3');
  const stepDot4 = container.querySelector('#step-dot-4');
  const stepLine1 = container.querySelector('#step-line-1');
  const stepLine2 = container.querySelector('#step-line-2');
  const stepLine3 = container.querySelector('#step-line-3');
  const stepLabels = Array.from(container.querySelectorAll('.step-label'));
  const methodCardEditor = container.querySelector('#method-card-editor');
  const methodCardHtml = container.querySelector('#method-card-html');
  const btnNextToMetadata = container.querySelector('#btn-next-to-metadata');
  const btnBackToMethod = container.querySelector('#btn-back-to-method');
  const btnNextToContent = container.querySelector('#btn-next-to-content');
  const btnBackToMetadata = container.querySelector('#btn-back-to-metadata');
  const btnNextToReview = container.querySelector('#btn-next-to-review');
  const btnBackToContent = container.querySelector('#btn-back-to-content');
  const builderPreviewRefreshBtn2 = container.querySelector('#builder-preview-refresh-btn-2');
  const step3Title = container.querySelector('#step-3-title');
  const step3Subtitle = container.querySelector('#step-3-subtitle');

  if (assignmentListEl) {
    assignmentListEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('assignment-checkbox')) {
        updateSelectedClassesCount();
      }
    });
  }

  let drafts = getUserDrafts(session, context);
  let publishedMaterials = await getUserPublishedMaterials(session, context);
  let activeTab = 'koleksi';
  let materialCardDensity = localStorage.getItem(MATERIAL_CARD_DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
  let selectedMethod = 'editor';
  let currentStep = 1;
  const builderStorageKey = getMaterialBuilderStorageBucket(session, context);
  let builderHistory = [];
  let builderHistoryIndex = -1;
  let builderIgnoreHistory = false;
  let builderIsCodeView = false;
  let builderIsPreview = false;
  let builderSelectionRange = null;
  let builderSaveTimer = null;
  let builderToastTimer = null;
  let builderModalSubmit = null;
  const reportFilters = {
    kelas: '',
    mapel: '',
    status: '',
  };

  async function buildMaterialReadProgressRows() {
    const memberCache = new Map();
    const rows = [];
    const visibleMaterials = [...publishedMaterials].sort((a, b) => String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')));

    for (const material of visibleMaterials) {
      const materialId = String(material.id || '').trim();
      if (!materialId) {
        continue;
      }

      const materialReads = materialReadStats.filter((item) => String(item.material_id || '').trim() === materialId);
      const materialReadMap = new Map(
        materialReads.map((item) => [normalizeClassToken(item.siswa_id || item.id), item])
      );

      const classKey = material.kelas_id || material.kelas_nama || material.kelas_token || '';
      let classMembers = [];

      if (classKey) {
        if (!memberCache.has(classKey)) {
          memberCache.set(classKey, await getClassMembers(context, classKey));
        }
        classMembers = memberCache.get(classKey) || [];
      }

      if (classMembers.length) {
        classMembers.forEach((member) => {
          const memberKey = normalizeClassToken(member.siswa_id || member.id || member.username);
          rows.push({
            material,
            member,
            read: materialReadMap.get(memberKey) || null,
          });
        });

        materialReads.forEach((read) => {
          const readKey = normalizeClassToken(read.siswa_id || read.id);
          const alreadyListed = classMembers.some((member) => normalizeClassToken(member.siswa_id || member.id || member.username) === readKey);
          if (!alreadyListed) {
            rows.push({
              material,
              member: {
                siswa_id: read.siswa_id || '',
                siswa_nama: read.siswa_nama || '-',
                kelas_id: read.kelas_id || material.kelas_id || '',
                kelas_nama: read.kelas_nama || material.kelas_nama || '',
                nomor_absen: 9999,
              },
              read,
            });
          }
        });
      } else if (materialReads.length) {
        materialReads.forEach((read) => {
          rows.push({
            material,
            member: {
              siswa_id: read.siswa_id || '',
              siswa_nama: read.siswa_nama || '-',
              kelas_id: read.kelas_id || material.kelas_id || '',
              kelas_nama: read.kelas_nama || material.kelas_nama || '',
              nomor_absen: 9999,
            },
            read,
          });
        });
      }
    }

    return rows;
  }

  async function renderMaterialReadReport() {
    if (!reportSummaryEl || !reportTableEl || !reportClassFilterEl || !reportMapelFilterEl || !reportStatusFilterEl) {
      return;
    }

    if (!publishedMaterials.length) {
      reportClassFilterEl.innerHTML = '<option value="">Semua kelas</option>';
      reportMapelFilterEl.innerHTML = '<option value="">Semua mapel</option>';
      reportSummaryEl.innerHTML = '';
      reportTableEl.innerHTML = '<div class="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Belum ada materi yang dipublish, jadi progress siswa belum bisa dipantau.</div>';
      return;
    }

    const rows = await buildMaterialReadProgressRows();

    const classOptions = Array.from(new Set(rows.map(({ material, member }) => String(member.kelas_nama || member.kelas_id || material.kelas_nama || material.kelas_id || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id'));
    const mapelOptions = Array.from(new Set(rows.map(({ material }) => String(material.mapel_nama || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id'));

    reportClassFilterEl.innerHTML = `<option value="">Semua kelas</option>${classOptions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
    reportMapelFilterEl.innerHTML = `<option value="">Semua mapel</option>${mapelOptions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
    reportClassFilterEl.value = reportFilters.kelas;
    reportMapelFilterEl.value = reportFilters.mapel;
    reportStatusFilterEl.value = reportFilters.status;

    const filteredRows = rows.filter(({ material, member, read }) => {
      const kelasValue = String(member.kelas_nama || member.kelas_id || material.kelas_nama || material.kelas_id || '').trim();
      const mapelValue = String(material.mapel_nama || '').trim();
      const statusValue = getReadStatusMeta(read).key;
      const matchesClass = !reportFilters.kelas || kelasValue === reportFilters.kelas;
      const matchesMapel = !reportFilters.mapel || mapelValue === reportFilters.mapel;
      const matchesStatus = !reportFilters.status || statusValue === reportFilters.status;
      return matchesClass && matchesMapel && matchesStatus;
    });

    if (!rows.length) {
      reportSummaryEl.innerHTML = '';
      reportTableEl.innerHTML = '<div class="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Belum ada daftar siswa atau data baca yang bisa diringkas untuk materi yang dipilih.</div>';
      return;
    }

    if (!filteredRows.length) {
      reportSummaryEl.innerHTML = `
        <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:col-span-2 xl:col-span-4">
          <p class="text-sm font-medium text-slate-700">Tidak ada data yang cocok dengan kombinasi filter kelas, mapel, dan status saat ini.</p>
        </div>
      `;
      reportTableEl.innerHTML = '<div class="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Ubah filter laporan untuk melihat progress siswa yang tersedia.</div>';
      return;
    }

    const summary = filteredRows.reduce((accumulator, row) => {
      const status = getReadStatusMeta(row.read);
      accumulator.total += 1;
      accumulator[status.key] += 1;
      return accumulator;
    }, { total: 0, unopened: 0, opened: 0, completed: 0 });

    reportSummaryEl.innerHTML = `
      <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Target Progress</p>
        <p class="mt-2 text-2xl font-semibold text-slate-900">${summary.total}</p>
        <p class="mt-1 text-sm text-slate-500">kombinasi siswa × materi</p>
      </div>
      <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Belum Buka</p>
        <p class="mt-2 text-2xl font-semibold text-slate-900">${summary.unopened}</p>
        <p class="mt-1 text-sm text-slate-500">siswa belum membuka materi</p>
      </div>
      <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Sudah Buka</p>
        <p class="mt-2 text-2xl font-semibold text-sky-700">${summary.opened}</p>
        <p class="mt-1 text-sm text-slate-500">siswa sudah mulai membaca</p>
      </div>
      <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Selesai Baca</p>
        <p class="mt-2 text-2xl font-semibold text-emerald-700">${summary.completed}</p>
        <p class="mt-1 text-sm text-slate-500">siswa menandai materi selesai</p>
      </div>
    `;

    reportTableEl.innerHTML = `
      <div class="overflow-x-auto rounded-[22px] border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th class="px-4 py-3">Materi</th>
              <th class="px-4 py-3">Siswa</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Durasi Baca</th>
              <th class="px-4 py-3 text-center">Dibuka</th>
              <th class="px-4 py-3">Terakhir Buka</th>
              <th class="px-4 py-3">Selesai</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white text-slate-700">
            ${filteredRows.map(({ material, member, read }) => {
              const status = getReadStatusMeta(read);
              return `
                <tr>
                  <td class="px-4 py-3 align-top">
                    <p class="font-semibold text-slate-900">${escapeHtml(material.title || '-')}</p>
                    <p class="mt-1 text-xs text-slate-500">${escapeHtml(material.mapel_nama || '-')} • ${escapeHtml(material.kelas_nama || material.kelas_id || '-')}</p>
                  </td>
                  <td class="px-4 py-3 align-top">
                    <p class="font-medium text-slate-900">${escapeHtml(member.siswa_nama || '-')}</p>
                    <p class="mt-1 text-xs text-slate-500">${escapeHtml(member.kelas_nama || member.kelas_id || material.kelas_nama || '-')}</p>
                  </td>
                  <td class="px-4 py-3 align-top"><span class="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${status.className}">${status.label}</span></td>
                  <td class="px-4 py-3 align-top font-medium text-slate-900">${formatReadDuration(read?.total_duration_seconds || 0)}</td>
                  <td class="px-4 py-3 align-top text-center font-semibold text-sky-700">${Number(read?.read_count || 0)}</td>
                  <td class="px-4 py-3 align-top">${read?.last_read_at ? new Date(read.last_read_at).toLocaleString('id-ID') : '-'}</td>
                  <td class="px-4 py-3 align-top">${read?.completed_at ? new Date(read.completed_at).toLocaleString('id-ID') : '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function setActiveTab(nextTab) {
    activeTab = nextTab;
    materialTabButtons.forEach((button) => {
      const isActive = button.getAttribute('data-material-tab') === nextTab;
      button.className = `material-tab-btn relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${getTabButtonClass(isActive)}`;
    });
    materialTabPanels.forEach((panel) => {
      const isActive = panel.getAttribute('data-material-panel') === nextTab;
      panel.classList.toggle('hidden', !isActive);
      if (isActive) {
        panel.classList.remove('animate-scale-in');
        void panel.offsetWidth;
        panel.classList.add('animate-scale-in');
      }
    });
    if (nextTab === 'buat') {
      renderWizardSteps();
    }
  }

  function updateStepIndicators(step) {
    [stepDot1, stepDot2, stepDot3, stepDot4].forEach((dot, i) => {
      if (!dot) return;
      dot.classList.remove('done', 'active', 'step-active');
      if (i + 1 < step) dot.classList.add('done');
      if (i + 1 === step) { dot.classList.add('active', 'step-active'); }
    });
    [stepLine1, stepLine2, stepLine3].forEach((line, i) => {
      if (!line) return;
      line.classList.toggle('done', i + 1 < step);
    });
    stepLabels.forEach((label, i) => {
      label.classList.remove('done', 'active', 'pending');
      if (i + 1 < step) label.classList.add('done');
      else if (i + 1 === step) label.classList.add('active');
      else label.classList.add('pending');
    });
  }

  function showWizardStep(step) {
    currentStep = step;
    updateStepIndicators(step);
    [buatStep1, buatStep2, buatStep3, buatStep4].forEach((panel, i) => {
      if (!panel) return;
      if (i + 1 === step) {
        panel.classList.remove('hidden');
        panel.classList.add('animate-fade-in');
      } else {
        panel.classList.add('hidden');
        panel.classList.remove('animate-fade-in');
      }
    });
  }

  function goToStep(step) {
    const target = Math.min(4, Math.max(1, step));
    showWizardStep(target);
    if (target === 3) {
      syncMainMetadataFromBuilder();
      updateContentPanel();
    } else if (target === 4) {
      updateReviewPreview();
    }
  }

  function renderWizardSteps() {
    showWizardStep(currentStep);
    updateContentPanel();
  }

  function updateContentPanel() {
    if (!buatContentEditor || !buatContentHtml) return;
    buatContentEditor.classList.add('hidden');
    buatContentHtml.classList.add('hidden');

    if (selectedMethod === 'editor') {
      buatContentEditor.classList.remove('hidden');
      if (step3Title) step3Title.textContent = 'Buat Konten - Manual';
      if (step3Subtitle) step3Subtitle.textContent = 'Tulis materi langsung dengan editor visual lengkap';
    } else if (selectedMethod === 'html') {
      buatContentHtml.classList.remove('hidden');
      if (step3Title) step3Title.textContent = 'Buat Konten dengan AI';
      if (step3Subtitle) step3Subtitle.textContent = 'Susun prompt, generate di AI, lalu tempel HTML hasilnya';
    }
  }

  function selectMethod(method) {
    selectedMethod = method;
    [methodCardEditor, methodCardHtml].forEach((card) => {
      if (!card) return;
      card.classList.remove('selected');
    });
    if (method === 'editor' && methodCardEditor) methodCardEditor.classList.add('selected');
    if (method === 'html' && methodCardHtml) methodCardHtml.classList.add('selected');
  }

  function updateStatCounters() {
    const publishedGroupCount = getPublishedMaterialGroups().length;
    if (statPublishedCount) statPublishedCount.textContent = String(publishedGroupCount);
    if (statDraftCount) statDraftCount.textContent = String(drafts.length);
    if (statReadsCount) statReadsCount.textContent = String(materialReadStats.length);
    const publishedBadge = document.getElementById('published-count-badge');
    const draftBadge = document.getElementById('draft-count-badge');
    if (publishedBadge) publishedBadge.textContent = `${publishedGroupCount} materi`;
    if (draftBadge) draftBadge.textContent = `${drafts.length} draft`;
  }

  function updateMaterialCardDensityToggleState() {
    const activeClass = 'bg-indigo-600 text-white shadow-[0_8px_18px_-10px_rgba(79,70,229,0.8)]';
    const idleClass = 'text-slate-500';
    cardDensityCompactBtn?.classList.remove('bg-indigo-600', 'text-white', 'shadow-[0_8px_18px_-10px_rgba(79,70,229,0.8)]', 'text-slate-500');
    cardDensityComfortableBtn?.classList.remove('bg-indigo-600', 'text-white', 'shadow-[0_8px_18px_-10px_rgba(79,70,229,0.8)]', 'text-slate-500');

    if (materialCardDensity === 'compact') {
      cardDensityCompactBtn?.classList.add(...activeClass.split(' '));
      cardDensityComfortableBtn?.classList.add(...idleClass.split(' '));
    } else {
      cardDensityComfortableBtn?.classList.add(...activeClass.split(' '));
      cardDensityCompactBtn?.classList.add(...idleClass.split(' '));
    }
  }

  function updateReviewPreview() {
    if (!previewFrameFinal) return;
    if (selectedMethod === 'editor') {
      previewFrameFinal.srcdoc = buildBuilderHtmlOutput();
    } else {
      const source = sourceInput.value.trim();
      if (source) {
        previewFrameFinal.srcdoc = buildPreviewSource(source);
      } else {
        previewFrameFinal.srcdoc = '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#94a3b8;"><p>Belum ada HTML yang dimuat. Kembali ke langkah Konten.</p></body></html>';
      }
    }
  }

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.className = isError ? 'text-sm text-rose-600' : 'text-sm text-slate-500';
  }

  function setTemplatePromptStatus(text, isError = false) {
    templatePromptStatus.textContent = text;
    templatePromptStatus.className = isError ? 'mt-3 text-sm text-rose-600' : 'mt-3 text-sm text-slate-500';
  }

  function buildTemplatePromptValue() {
    return buildMaterialPromptTemplate(getTemplatePromptValues());
  }

  function getCurrentAssignment() {
    const selected = getSelectedAssignments();
    return selected[0] || selectedAssignment || null;
  }

  function getSelectedAssignments() {
    if (!assignmentListEl) return [selectedAssignment].filter(Boolean);
    const checkboxes = assignmentListEl.querySelectorAll('.assignment-checkbox:checked');
    const ids = Array.from(checkboxes).map((cb) => cb.value);
    return assignments.filter((item) => ids.includes(item.id));
  }

  function updateSelectedClassesCount() {
    if (!selectedClassesCountEl) return;
    const count = getSelectedAssignments().length;
    selectedClassesCountEl.textContent = `${count} dipilih`;
  }

  function syncMainMetadataFromBuilder() {
    if (builderAssignmentSelect?.value && assignmentListEl) {
      const checkboxes = assignmentListEl.querySelectorAll('.assignment-checkbox');
      checkboxes.forEach((cb) => { cb.checked = cb.value === builderAssignmentSelect.value; });
      updateSelectedClassesCount();
    }

    if (builderTitleInput) {
      titleInput.value = builderTitleInput.value.trim();
    }

    if (builderLevelInput) {
      levelInput.value = builderLevelInput.value.trim();
    }

    if (builderChapterInput) {
      chapterInput.value = builderChapterInput.value.trim();
    }

    const assignment = getCurrentAssignment();
    if (!levelInput.value.trim() && assignment?.kelas_nama) {
      levelInput.value = assignment.kelas_nama;
      if (builderLevelInput) {
        builderLevelInput.value = assignment.kelas_nama;
      }
    }
  }

  function syncBuilderMetadataFromMain() {
    const selected = getSelectedAssignments();
    if (builderAssignmentSelect && selected.length) {
      builderAssignmentSelect.value = selected[0].id;
    }
    if (builderTitleInput) {
      builderTitleInput.value = titleInput.value.trim();
    }
    if (builderLevelInput) {
      builderLevelInput.value = levelInput.value.trim();
    }
    if (builderChapterInput) {
      builderChapterInput.value = chapterInput.value.trim();
    }
  }

  function renderPreview(source) {
    const htmlSource = buildPreviewSource(source);
    previewFrame.srcdoc = htmlSource;
  }

  function getTemplatePromptValues() {
    const assignment = getCurrentAssignment();
    return {
      title: templateTitleInput?.value.trim() || titleInput?.value.trim(),
      mapel: templateMapelInput?.value.trim() || assignment?.mapel_nama || '',
      kelas: templateKelasInput?.value.trim() || levelInput?.value.trim() || assignment?.kelas_nama || '',
      bab: templateBabInput?.value.trim() || chapterInput?.value.trim(),
      pertemuan: templatePertemuanInput?.value.trim() || meetingsInput?.value.trim(),
      tujuan: templateTujuanInput?.value.trim(),
      materiPokok: templatePokokInput?.value.trim(),
      contoh: templateContohInput?.value.trim(),
      latihan: templateLatihanInput?.value.trim(),
      evaluasi: templateEvaluasiInput?.value.trim(),
      gaya: templateGayaInput?.value.trim(),
      catatan: templateCatatanInput?.value.trim() || noteInput?.value.trim(),
    };
  }

  function fillTemplateFromEditor() {
    syncMainMetadataFromBuilder();
    const assignment = getCurrentAssignment();
    templateTitleInput.value = titleInput.value.trim();
    templateMapelInput.value = assignment?.mapel_nama || templateMapelInput.value;
    templateKelasInput.value = levelInput.value.trim() || assignment?.kelas_nama || templateKelasInput.value;
    templateBabInput.value = chapterInput.value.trim();
    templatePertemuanInput.value = meetingsInput.value.trim();
    templateCatatanInput.value = noteInput.value.trim();
    setTemplatePromptStatus('Form template diisi dari data editor aktif.');
  }

  function applyTemplatePreset() {
    const presetKey = templatePresetSelect?.value || '';
    const preset = templatePresetCatalog.find((item) => item.key === presetKey);
    if (!preset) {
      setTemplatePromptStatus('Pilih preset mapel terlebih dahulu.', true);
      return;
    }

    templateMapelInput.value = preset.mapel;
    if (!templateKelasInput.value.trim()) templateKelasInput.value = 'SMA / Fase E-F';
    templateTujuanInput.value = preset.tujuan;
    templatePokokInput.value = preset.materiPokok;
    templateContohInput.value = preset.contoh;
    templateLatihanInput.value = preset.latihan;
    templateEvaluasiInput.value = preset.evaluasi;
    templateGayaInput.value = preset.gaya;
    templateCatatanInput.value = preset.catatan;

    if (!templateTitleInput.value.trim()) {
      templateTitleInput.value = `[Materi ${preset.label}]`;
    }

    renderTemplatePrompt();
    setTemplatePromptStatus(`Preset ${preset.label} berhasil diterapkan.`);
  }

  function renderTemplatePrompt() {
    templatePromptOutput.value = buildTemplatePromptValue();
    setTemplatePromptStatus('Prompt template berhasil dibuat.');
  }

  async function copyPromptValue(promptValue) {
    try {
      await navigator.clipboard.writeText(promptValue);
      return true;
    } catch {
      return false;
    }
  }

  async function openPromptAssistant(url, label) {
    const promptValue = buildTemplatePromptValue();
    templatePromptOutput.value = promptValue;

    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    const copied = await copyPromptValue(promptValue);

    if (popup && copied) {
      setTemplatePromptStatus(`Prompt disalin ke clipboard dan ${label} dibuka di tab baru.`);
      return;
    }

    if (popup) {
      setTemplatePromptStatus(`${label} dibuka, tetapi prompt belum berhasil disalin otomatis. Salin manual dari kotak output.`, true);
      return;
    }

    if (copied) {
      setTemplatePromptStatus(`Prompt disalin. Browser memblokir tab baru untuk ${label}, jadi buka manual jika perlu.`, true);
      return;
    }

    setTemplatePromptStatus(`Gagal membuka ${label} dan menyalin prompt otomatis. Gunakan Salin Prompt lalu buka layanan secara manual.`, true);
  }

  function showBuilderToast(text, isError = false) {
    if (!builderToast) {
      return;
    }
    if (builderToastMessage) {
      builderToastMessage.textContent = text;
    } else {
      builderToast.textContent = text;
    }
    builderToast.style.background = isError ? '#dc2626' : '#0f172a';
    builderToast.classList.add('show');
    clearTimeout(builderToastTimer);
    builderToastTimer = setTimeout(() => {
      builderToast.classList.remove('show');
    }, 2200);
  }

  function getBuilderWorkingHtml() {
    return builderIsCodeView ? builderCodeView.value : builderEditor.innerHTML;
  }

  function getBuilderWorkingText() {
    if (!builderIsCodeView) {
      return builderEditor.innerText || '';
    }
    const temp = document.createElement('div');
    temp.innerHTML = builderCodeView.value;
    return temp.innerText || temp.textContent || '';
  }

  function updateBuilderStats() {
    const text = getBuilderWorkingText().trim();
    const words = text ? text.split(/\s+/).length : 0;
    builderWordCount.textContent = String(words);
    builderCharCount.textContent = String(text.length);
  }

  function queueBuilderAutosave() {
    clearTimeout(builderSaveTimer);
    builderSaveTimer = setTimeout(() => {
      localStorage.setItem(builderStorageKey, builderEditor.innerHTML);
      builderLastSaved.textContent = new Date().toLocaleTimeString('id-ID');
    }, 500);
  }

  function saveBuilderHistory() {
    const snapshot = builderEditor.innerHTML;
    if (builderHistoryIndex < builderHistory.length - 1) {
      builderHistory = builderHistory.slice(0, builderHistoryIndex + 1);
    }
    if (builderHistory[builderHistory.length - 1] === snapshot) {
      return;
    }
    builderHistory.push(snapshot);
    builderHistoryIndex = builderHistory.length - 1;
    if (builderHistory.length > 120) {
      builderHistory.shift();
      builderHistoryIndex -= 1;
    }
  }

  function applyBuilderSnapshot(snapshot) {
    builderIgnoreHistory = true;
    builderEditor.innerHTML = snapshot;
    if (builderIsCodeView) {
      builderCodeView.value = snapshot;
    }
    builderIgnoreHistory = false;
    updateBuilderStats();
    queueBuilderAutosave();
    renderBuilderStandalonePreview();
  }

  function syncBuilderCodeView() {
    builderCodeView.value = builderEditor.innerHTML;
  }

  function saveBuilderSelection() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (builderEditor.contains(range.commonAncestorContainer)) {
      builderSelectionRange = range.cloneRange();
    }
  }

  function restoreBuilderSelection() {
    builderEditor.focus();
    const selection = window.getSelection();
    if (selection && builderSelectionRange) {
      selection.removeAllRanges();
      selection.addRange(builderSelectionRange);
    }
  }

  function updateBuilderCommandState() {
    const selection = window.getSelection();
    const isInsideEditor = !builderIsCodeView && !builderIsPreview && selection && selection.rangeCount && builderEditor.contains(selection.anchorNode);
    builderCommandButtons.forEach((button) => {
      const command = button.getAttribute('data-builder-command') || '';
      const isActive = isInsideEditor && ['bold', 'italic', 'underline'].includes(command) ? document.queryCommandState(command) : false;
      button.classList.toggle('bg-sky-100', isActive);
      button.classList.toggle('text-sky-700', isActive);
    });
  }

  function setBuilderModeLabel() {
    if (builderIsCodeView) {
      builderModeIndicator.textContent = 'Code';
      return;
    }
    if (builderIsPreview) {
      builderModeIndicator.textContent = 'Preview';
      return;
    }
    builderModeIndicator.textContent = 'Edit';
  }

  function execBuilderCommand(command, value = null) {
    if (builderIsCodeView || builderIsPreview) {
      showBuilderToast('Kembali ke mode Edit untuk memformat konten.', true);
      return;
    }
    restoreBuilderSelection();
    document.execCommand(command, false, value);
    builderEditor.focus();
    saveBuilderSelection();
    syncBuilderCodeView();
    saveBuilderHistory();
    updateBuilderStats();
    queueBuilderAutosave();
    updateBuilderCommandState();
  }

  function insertBuilderHtml(html) {
    execBuilderCommand('insertHTML', html);
  }

  function closeBuilderModal() {
    builderModalOverlay.classList.remove('open');
    builderModalSubmit = null;
  }

  function openBuilderModal({ title, subtitle, bodyHtml, onConfirm, confirmLabel = 'Simpan' }) {
    builderModalTitle.textContent = title;
    builderModalSubtitle.textContent = subtitle;
    builderModalBody.innerHTML = bodyHtml;
    builderModalConfirmBtn.textContent = confirmLabel;
    builderModalOverlay.classList.add('open');
    builderModalSubmit = onConfirm;
    const firstInput = builderModalBody.querySelector('input, textarea, select');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 50);
    }
  }

  function buildBuilderTabsTemplate() {
    const groupId = `materi_tabs_${Date.now()}`;
    return `
      <section class="material-tabs-box" data-tab-group="${groupId}">
        <div class="materi-reader-tab-nav">
          <button type="button" class="materi-reader-tab-btn" data-tab-target="${groupId}_materi">Materi</button>
          <button type="button" class="materi-reader-tab-btn" data-tab-target="${groupId}_contoh">Contoh Soal</button>
          <button type="button" class="materi-reader-tab-btn" data-tab-target="${groupId}_latihan">Latihan Soal</button>
          <button type="button" class="materi-reader-tab-btn" data-tab-target="${groupId}_tugas">Tugas Siswa</button>
          <button type="button" class="materi-reader-tab-btn" data-tab-target="${groupId}_catatan">Ringkasan/Catatan</button>
        </div>
        <div class="materi-reader-tab-panel" data-tab-panel="${groupId}_materi">
          <h2>Materi Inti</h2>
          <p>Jelaskan konsep utama materi di sini dengan subbagian yang ringkas, jelas, dan mudah diikuti siswa.</p>
        </div>
        <div class="materi-reader-tab-panel" data-tab-panel="${groupId}_contoh" hidden>
          <div class="example-box">
            <h3>Contoh Soal dan Pembahasan</h3>
            <p>Tulis contoh soal lalu jelaskan pembahasannya langkah demi langkah.</p>
          </div>
        </div>
        <div class="materi-reader-tab-panel" data-tab-panel="${groupId}_latihan" hidden>
          <div class="exercise-box">
            <h3>Latihan Soal</h3>
            <ol>
              <li>Latihan 1</li>
              <li>Latihan 2</li>
              <li>Latihan 3</li>
            </ol>
          </div>
        </div>
        <div class="materi-reader-tab-panel" data-tab-panel="${groupId}_tugas" hidden>
          <div class="task-box">
            <h3>Tugas Siswa</h3>
            <p>Tuliskan tugas yang harus dikerjakan siswa secara mandiri atau kelompok.</p>
          </div>
        </div>
        <div class="materi-reader-tab-panel" data-tab-panel="${groupId}_catatan" hidden>
          <div class="note-box">
            <h3>Yang Perlu Dicatat</h3>
            <ul>
              <li>Poin penting 1</li>
              <li>Poin penting 2</li>
              <li>Poin penting 3</li>
            </ul>
          </div>
        </div>
      </section>
    `;
  }

  function handleBuilderTemplateInsert(type) {
    const templates = {
      h1: '<h1>Judul Bagian Utama</h1><p class="sub">Subjudul atau konteks singkat.</p>',
      h2: '<h2>Subjudul Materi</h2><p>Tambahkan penjelasan singkat di bawah subjudul ini.</p>',
      note: '<div class="note-box"><h3>Catatan Buku</h3><p>Isi poin penting yang perlu dicatat siswa.</p></div>',
      example: '<div class="example-box"><h3>Contoh Soal</h3><p>Tulis contoh soal dan pembahasannya secara runtut di sini.</p></div>',
      exercise: '<div class="exercise-box"><h3>Latihan Soal</h3><ol><li>Soal latihan 1</li><li>Soal latihan 2</li><li>Soal latihan 3</li></ol></div>',
      task: '<div class="task-box"><h3>Tugas Siswa</h3><p>Tuliskan arahan tugas, tenggat, dan output yang diharapkan.</p></div>',
      tabs: buildBuilderTabsTemplate(),
    };
    insertBuilderHtml(templates[type] || '<p>Template baru</p>');
  }

  function handleBuilderInsert(type) {
    if (builderIsCodeView || builderIsPreview) {
      showBuilderToast('Kembali ke mode Edit untuk menyisipkan elemen.', true);
      return;
    }

    if (type === 'image') {
      openBuilderModal({
        title: 'Sisipkan Gambar',
        subtitle: 'Masukkan URL gambar dan teks alternatif.',
        bodyHtml: `
          <div class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">URL Gambar</label>
              <input id="builder-image-url" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="https://example.com/gambar.jpg" />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Alt Text</label>
              <input id="builder-image-alt" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Deskripsi gambar" />
            </div>
          </div>
        `,
        onConfirm: () => {
          const url = builderModalBody.querySelector('#builder-image-url')?.value.trim();
          const alt = builderModalBody.querySelector('#builder-image-alt')?.value.trim() || 'Gambar materi';
          if (!url) {
            showBuilderToast('URL gambar masih kosong.', true);
            return;
          }
          insertBuilderHtml(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`);
          closeBuilderModal();
          showBuilderToast('Gambar disisipkan.');
        },
      });
      return;
    }

    if (type === 'link') {
      openBuilderModal({
        title: 'Sisipkan Link',
        subtitle: 'Tambahkan tautan referensi atau sumber belajar.',
        bodyHtml: `
          <div class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">URL</label>
              <input id="builder-link-url" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" value="https://" />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Teks Tautan</label>
              <input id="builder-link-text" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Baca sumber lengkap" />
            </div>
          </div>
        `,
        onConfirm: () => {
          const url = builderModalBody.querySelector('#builder-link-url')?.value.trim();
          const text = builderModalBody.querySelector('#builder-link-text')?.value.trim() || url;
          if (!url) {
            showBuilderToast('URL link masih kosong.', true);
            return;
          }
          insertBuilderHtml(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`);
          closeBuilderModal();
          showBuilderToast('Link disisipkan.');
        },
      });
      return;
    }

    if (type === 'table') {
      openBuilderModal({
        title: 'Sisipkan Tabel',
        subtitle: 'Tentukan ukuran tabel yang ingin dibuat.',
        bodyHtml: `
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Baris</label>
              <input id="builder-table-rows" type="number" min="1" max="12" value="3" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Kolom</label>
              <input id="builder-table-cols" type="number" min="1" max="8" value="4" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
            </div>
          </div>
        `,
        onConfirm: () => {
          const rows = Number(builderModalBody.querySelector('#builder-table-rows')?.value || 3);
          const cols = Number(builderModalBody.querySelector('#builder-table-cols')?.value || 4);
          let tableHtml = '<table><thead><tr>';
          for (let col = 0; col < cols; col += 1) {
            tableHtml += `<th>Header ${col + 1}</th>`;
          }
          tableHtml += '</tr></thead><tbody>';
          for (let row = 0; row < rows; row += 1) {
            tableHtml += '<tr>';
            for (let col = 0; col < cols; col += 1) {
              tableHtml += '<td>&nbsp;</td>';
            }
            tableHtml += '</tr>';
          }
          tableHtml += '</tbody></table>';
          insertBuilderHtml(tableHtml);
          closeBuilderModal();
          showBuilderToast('Tabel disisipkan.');
        },
      });
      return;
    }

    if (type === 'video') {
      openBuilderModal({
        title: 'Sisipkan Video',
        subtitle: 'Masukkan URL embed YouTube atau video lain.',
        bodyHtml: `
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">URL Embed Video</label>
            <input id="builder-video-url" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="https://www.youtube.com/embed/..." value="https://www.youtube.com/embed/" />
          </div>
        `,
        onConfirm: () => {
          const url = builderModalBody.querySelector('#builder-video-url')?.value.trim();
          if (!url) {
            showBuilderToast('URL video masih kosong.', true);
            return;
          }
          insertBuilderHtml(`<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:18px;margin:18px 0;"><iframe src="${escapeHtml(url)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>`);
          closeBuilderModal();
          showBuilderToast('Video disisipkan.');
        },
      });
    }
  }

  function toggleBuilderCodeView() {
    builderIsCodeView = !builderIsCodeView;
    if (builderIsCodeView) {
      syncBuilderCodeView();
      builderCodeView.classList.add('active');
      builderEditor.classList.add('hidden');
      showBuilderToast('Mode code aktif.');
    } else {
      builderEditor.innerHTML = builderCodeView.value.trim() || '<p></p>';
      builderCodeView.classList.remove('active');
      builderEditor.classList.remove('hidden');
      saveBuilderHistory();
      queueBuilderAutosave();
      showBuilderToast('Kembali ke mode edit.');
    }
    setBuilderModeLabel();
    updateBuilderStats();
    renderBuilderStandalonePreview();
  }

  function toggleBuilderPreview() {
    builderIsPreview = !builderIsPreview;
    builderEditor.contentEditable = builderIsPreview ? 'false' : 'true';
    builderEditor.classList.toggle('preview', builderIsPreview);
    setBuilderModeLabel();
    showBuilderToast(builderIsPreview ? 'Mode preview aktif.' : 'Kembali ke mode edit.');
  }

  function toggleBuilderFullscreen() {
    const willEnterFullscreen = !builderWrapper.classList.contains('fullscreen');
    builderWrapper.classList.toggle('fullscreen', willEnterFullscreen);
    document.body.classList.toggle('overflow-hidden', willEnterFullscreen);
    showBuilderToast(willEnterFullscreen ? 'Fullscreen aktif.' : 'Keluar fullscreen.');
  }

  function getBuilderMaterialTitle() {
    return builderTitleInput?.value.trim() || titleInput.value.trim() || templateTitleInput.value.trim() || 'Materi Guru';
  }

  function getBuilderWorkingHtml() {
    if (builderIsCodeView) {
      return builderCodeView.value.trim() || getMaterialBuilderStarterContent();
    }
    return builderEditor.innerHTML.trim() || getMaterialBuilderStarterContent();
  }

  function buildBuilderHtmlOutput() {
    return buildMaterialBuilderDocument({
      title: getBuilderMaterialTitle(),
      content: getBuilderWorkingHtml(),
    });
  }

  function renderBuilderStandalonePreview() {
    if (!builderPreviewFrame) {
      return;
    }
    builderPreviewFrame.srcdoc = buildBuilderHtmlOutput();
  }

  function syncBuilderToHtmlEditor() {
    syncMainMetadataFromBuilder();
    const nextSource = buildBuilderHtmlOutput();
    sourceInput.value = nextSource;

    const assignment = getCurrentAssignment();
    if (!levelInput.value.trim() && assignment?.kelas_nama) {
      levelInput.value = assignment.kelas_nama;
      if (builderLevelInput && !builderLevelInput.value.trim()) {
        builderLevelInput.value = assignment.kelas_nama;
      }
    }

    renderPreview(nextSource);
    renderBuilderStandalonePreview();
    return nextSource;
  }

  function exportBuilderHtml() {
    const html = buildBuilderHtmlOutput();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${normalizeClassToken(getBuilderMaterialTitle()) || 'materi'}-${new Date().toISOString().slice(0, 10)}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
    showBuilderToast('HTML berhasil diekspor.');
  }

  function printBuilderHtml() {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      showBuilderToast('Popup print diblokir browser.', true);
      return;
    }
    printWindow.document.write(buildBuilderHtmlOutput());
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    showBuilderToast('Membuka tampilan print.');
  }

  function loadBuilderContent(html) {
    builderEditor.innerHTML = html && html.trim() ? html : getMaterialBuilderStarterContent();
    syncBuilderCodeView();
    saveBuilderHistory();
    updateBuilderStats();
    queueBuilderAutosave();
    renderBuilderStandalonePreview();
  }

  function resetEditor() {
    activeDraftId = '';
    titleInput.value = '';
    levelInput.value = '';
    chapterInput.value = '';
    meetingsInput.value = '';
    noteInput.value = '';
    sourceInput.value = '';
    if (builderTitleInput) builderTitleInput.value = '';
    if (builderLevelInput) builderLevelInput.value = '';
    if (builderChapterInput) builderChapterInput.value = '';
    if (builderAssignmentSelect && assignmentListEl) {
      const checkboxes = assignmentListEl.querySelectorAll('.assignment-checkbox');
      if (checkboxes.length) {
        checkboxes.forEach((cb, i) => { cb.checked = i === 0; });
        builderAssignmentSelect.value = checkboxes[0].value;
      }
    }
    updateSelectedClassesCount();
    previewFrame.srcdoc = '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><style>body{font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#334155;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;}div{max-width:480px;border:1px dashed #cbd5e1;border-radius:24px;background:white;padding:24px;}h2{margin:0 0 12px;font-size:22px;color:#0f172a;}p{margin:0;line-height:1.7;}</style></head><body><div><h2>Preview materi akan muncul di sini</h2><p>Paste HTML hasil AI lalu klik Muat Preview untuk meninjau modul seperti siswa akan melihatnya.</p></div></body></html>';
    currentStep = 1;
    selectedMethod = 'editor';
    selectMethod('editor');
    showWizardStep(1);
    setStatus('Editor direset. Tempel HTML baru untuk mulai materi berikutnya.');
  }

  function loadDraft(draft) {
    activeDraftId = draft.id;
    if (assignmentListEl && draft.published_targets?.length) {
      const checkboxes = assignmentListEl.querySelectorAll('.assignment-checkbox');
      checkboxes.forEach((cb) => {
        cb.checked = draft.published_targets.some((t) => t.pengajaran_id === cb.value);
      });
    } else if (assignmentListEl && draft.pengajaran_id) {
      const checkboxes = assignmentListEl.querySelectorAll('.assignment-checkbox');
      checkboxes.forEach((cb) => { cb.checked = cb.value === draft.pengajaran_id; });
    }
    updateSelectedClassesCount();
    titleInput.value = draft.title || '';
    levelInput.value = draft.level || '';
    chapterInput.value = draft.chapter || '';
    meetingsInput.value = draft.meetings || '';
    noteInput.value = draft.note || '';
    sourceInput.value = draft.html_source || '';
    syncBuilderMetadataFromMain();
    renderPreview(draft.html_source || '');
    setActiveTab('buat');
    selectMethod('html');
    showWizardStep(2);
    setStatus(`Draft dimuat: ${draft.title || 'Tanpa judul'}`);
  }

  let activePreviewMaterial = null;

  function openMaterialPreview(material) {
    if (!material || !readerOverlayEl) {
      return;
    }

    activePreviewMaterial = material;
    const source = String(material.html_source || '').trim();
    readerFrameEl.srcdoc = buildPreviewSource(source);
    readerTitleEl.textContent = material.title || 'Tanpa judul';
    readerOverlayEl.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    if (readerEditBtn) {
      const isPublished = material.status === 'published' || material.published_at;
      readerEditBtn.classList.toggle('hidden', !isPublished && !material.html_source);
    }
  }

  function closeMaterialPreview() {
    if (!readerOverlayEl) {
      return;
    }
    readerFrameEl.srcdoc = '';
    readerOverlayEl.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    activePreviewMaterial = null;
  }

  function openMaterialInEditor(material) {
    if (!material) {
      return;
    }
    closeMaterialPreview();
    loadDraft(material);
    setStatus(`Materi dimuat ke editor: ${material.title || 'Tanpa judul'}`);
  }

  function getMaterialBaseId(material) {
    const sourceId = String(material?.source_id || '').trim();
    const id = String(material?.id || '').trim();
    if (sourceId) {
      return sourceId;
    }
    return id.includes('__') ? id.split('__')[0] : id;
  }

  function getPublishedMaterialGroups() {
    const grouped = new Map();

    publishedMaterials.forEach((item) => {
      const key = getMaterialBaseId(item) || String(item.id || '').trim();
      if (!key) {
        return;
      }

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(item);
    });

    return Array.from(grouped.entries())
      .map(([groupId, items]) => {
        const sortedItems = [...items].sort((a, b) => String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')));
        const representative = sortedItems[0] || items[0];
        const classNames = Array.from(new Set(sortedItems.map((item) => String(item.kelas_nama || item.kelas_id || '').trim()).filter(Boolean)));
        const anyVisible = sortedItems.some((item) => item.visible_to_students !== false);
        const allUnpublished = sortedItems.every((item) => item.visible_to_students === false);
        return {
          groupId,
          representative,
          items: sortedItems,
          classNames,
          classCount: classNames.length,
          anyVisible,
          allUnpublished,
          lastPublishedAt: representative?.published_at || representative?.updated_at || '',
        };
      })
      .sort((a, b) => String(b.lastPublishedAt).localeCompare(String(a.lastPublishedAt)));
  }

  function renderDraftList() {
    if (!drafts.length) {
      draftListEl.innerHTML = '';
      document.getElementById('material-draft-empty').classList.remove('hidden');
      return;
    }
    document.getElementById('material-draft-empty').classList.add('hidden');

    draftListEl.innerHTML = drafts
      .slice(0, 12)
      .map((draft) => {
        const tone = getMaterialCardTone('draft');
        const savedDate = new Date(draft.updated_at || draft.created_at || Date.now()).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        return `
          <article class="card-hover-premium group flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
            <button type="button" data-draft-id="${draft.id}" class="material-draft-item flex flex-1 flex-col text-left p-3.5">
              <div class="flex items-start gap-3">
                <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tone.accentClass} text-sm font-bold text-white shadow-sm">${getMaterialMonogram(draft)}</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="inline-flex items-center rounded-full border ${tone.badgeClass} px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">${tone.badgeLabel}</span>
                  </div>
                  <p class="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">${draft.title || 'Tanpa judul'}</p>
                  <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                    <span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-600">
                      <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                      ${draft.mapel_nama || '-'}
                    </span>
                    <span class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-600">
                      <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      ${draft.kelas_nama || '-'}
                    </span>
                    <span class="inline-flex items-center gap-1 text-slate-400">
                      <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                      ${savedDate}
                    </span>
                  </div>
                </div>
              </div>
              <div class="mt-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                Buka
                <svg class="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </button>
            <div class="grid grid-cols-2 gap-1.5 border-t border-slate-100 bg-slate-50/60 p-2.5">
              <button type="button" data-preview-draft-id="${draft.id}" class="preview-draft-btn inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 transition hover:bg-indigo-50">Preview</button>
              <button type="button" data-delete-draft-id="${draft.id}" class="delete-draft-btn inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-600 transition hover:bg-rose-50">Hapus</button>
            </div>
          </article>
        `;
      })
      .join('');

    draftListEl.querySelectorAll('.material-draft-item').forEach((button) => {
      button.addEventListener('click', () => {
        const draft = drafts.find((item) => item.id === button.getAttribute('data-draft-id'));
        if (draft) {
          loadDraft(draft);
        }
      });
    });

    draftListEl.querySelectorAll('.preview-draft-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const draft = drafts.find((item) => item.id === button.getAttribute('data-preview-draft-id'));
        if (draft) {
          openMaterialPreview(draft);
        }
      });
    });

    draftListEl.querySelectorAll('.delete-draft-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const draftId = button.getAttribute('data-delete-draft-id');
        if (!draftId) {
          return;
        }

        const nextDrafts = readDrafts().filter((item) => item.id !== draftId);
        writeDrafts(nextDrafts);
        if (activeDraftId === draftId) {
          resetEditor();
        }
        drafts = getUserDrafts(session, context);
        renderDraftList();
        setStatus('Draft materi berhasil dihapus.');
      });
    });
    updateStatCounters();
  }

  function openPublishedMaterialEditModal(material) {
    if (!material) {
      return;
    }

    const assignmentOptions = assignments
      .map((item) => ({
        id: String(item.id || '').trim(),
        label: `${item.mapel_nama || 'Mapel'} • ${item.kelas_nama || item.kelas_id || 'Kelas'}`,
      }))
      .filter((item) => item.id);

    if (!assignmentOptions.length) {
      setStatus('Tidak ada kelas pengajaran aktif untuk publish ulang.', true);
      return;
    }

    const deriveBaseId = (item) => {
      const sourceId = String(item?.source_id || '').trim();
      const docId = String(item?.id || '').trim();
      if (sourceId) {
        return sourceId;
      }
      return docId.includes('__') ? docId.split('__')[0] : docId;
    };

    const baseId = deriveBaseId(material);
    const relatedMaterials = publishedMaterials.filter((item) => deriveBaseId(item) === baseId);
    const initiallySelectedIds = new Set(
      (relatedMaterials.length ? relatedMaterials : [material])
        .map((item) => String(item.pengajaran_id || '').trim())
        .filter(Boolean)
    );

    const existingPopup = document.getElementById('material-republish-popup-overlay');
    if (existingPopup) {
      existingPopup.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'material-republish-popup-overlay';
    overlay.className = 'fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/55 p-4';
    overlay.innerHTML = `
      <div class="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_22px_70px_-30px_rgba(15,23,42,0.45)]">
        <h3 class="text-lg font-bold text-slate-900">Edit Materi Publish</h3>
        <p class="mt-1 text-sm text-slate-500">Ubah nama materi dan kelas tujuan, lalu publish ulang.</p>
        <div class="mt-4 space-y-4">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Nama Materi</label>
            <input id="republish-material-title" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" value="${escapeHtml(material.title || '')}" placeholder="Nama materi" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Kelas Publish (boleh pilih lebih dari satu)</label>
            <div class="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
              ${assignmentOptions.map((item) => `
                <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" class="republish-material-assignment-checkbox h-4 w-4 rounded border-slate-300 text-emerald-600" value="${escapeHtml(item.id)}" ${initiallySelectedIds.has(item.id) ? 'checked' : ''} />
                  <span>${escapeHtml(item.label)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-3">
          <button type="button" id="republish-popup-cancel" class="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
          <button type="button" id="republish-popup-submit" class="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Publish Ulang</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('overflow-hidden');

    const closePopup = () => {
      overlay.remove();
      document.body.classList.remove('overflow-hidden');
    };

    overlay.querySelector('#republish-popup-cancel')?.addEventListener('click', closePopup);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closePopup();
      }
    });

    overlay.querySelector('#republish-popup-submit')?.addEventListener('click', async () => {
      try {
        const titleValue = String(overlay.querySelector('#republish-material-title')?.value || '').trim();
        const selectedAssignmentIds = Array.from(overlay.querySelectorAll('.republish-material-assignment-checkbox:checked'))
          .map((input) => String(input.value || '').trim())
          .filter(Boolean);

        if (!titleValue) {
          setStatus('Nama materi wajib diisi.', true);
          return;
        }

        if (!selectedAssignmentIds.length) {
          setStatus('Pilih minimal satu kelas tujuan publish.', true);
          return;
        }

        const oldMaterialId = String(material.id || '').trim();
        const oldSourceId = String(material.source_id || '').trim();
        const fallbackBaseId = oldMaterialId.includes('__') ? oldMaterialId.split('__')[0] : oldMaterialId;
        const sourceBaseId = oldSourceId || fallbackBaseId;
        const nextPublishedAt = new Date().toISOString();

        const targetAssignments = assignments.filter((item) => selectedAssignmentIds.includes(String(item.id || '').trim()));
        if (!targetAssignments.length) {
          setStatus('Kelas tujuan tidak valid.', true);
          return;
        }

        const relatedByAssignment = new Map(
          relatedMaterials
            .map((item) => [String(item.pengajaran_id || '').trim(), item])
            .filter(([assignmentId]) => assignmentId)
        );

        await Promise.all(targetAssignments.map((targetAssignment) => {
          const nextMaterialId = `${sourceBaseId}__${targetAssignment.id}`;
          return savePublishedMaterial({
            ...material,
            ...(relatedByAssignment.get(String(targetAssignment.id || '').trim()) || {}),
            id: nextMaterialId,
            source_id: sourceBaseId,
            title: titleValue,
            pengajaran_id: targetAssignment.id,
            kelas_id: targetAssignment.kelas_id,
            kelas_nama: targetAssignment.kelas_nama,
            kelas_token: normalizeClassToken(targetAssignment.kelas_id || targetAssignment.kelas_nama),
            mapel_id: targetAssignment.mapel_id,
            mapel_nama: targetAssignment.mapel_nama,
            created_at: material.created_at || material.published_at || material.updated_at || nextPublishedAt,
            published_at: nextPublishedAt,
            visible_to_students: true,
            status: 'published',
          });
        }));

        const removedIds = relatedMaterials
          .filter((item) => !selectedAssignmentIds.includes(String(item.pengajaran_id || '').trim()))
          .map((item) => String(item.id || '').trim())
          .filter(Boolean);

        if (!relatedMaterials.length && !selectedAssignmentIds.includes(String(material.pengajaran_id || '').trim()) && oldMaterialId) {
          removedIds.push(oldMaterialId);
        }

        if (removedIds.length) {
          await Promise.all(Array.from(new Set(removedIds)).map((id) => deletePublishedMaterial(id)));
        }

        closePopup();
        publishedMaterials = await getUserPublishedMaterials(session, context);
        renderPublishedList();
        await renderMaterialReadReport();
        setStatus(`Materi berhasil dipublish ulang ke ${targetAssignments.length} kelas.`);
      } catch (error) {
        console.error('Gagal publish ulang materi hasil edit:', error);
        setStatus(`Gagal publish ulang: ${error?.message || 'cek data kelas dan izin Firestore.'}`, true);
      }
    });
  }

  function renderPublishedList() {
    updateMaterialCardDensityToggleState();
    const groupedMaterials = getPublishedMaterialGroups();

    if (!groupedMaterials.length) {
      publishedListEl.innerHTML = '';
      document.getElementById('material-published-empty').classList.remove('hidden');
      return;
    }
    document.getElementById('material-published-empty').classList.add('hidden');

    publishedListEl.innerHTML = groupedMaterials
      .slice(0, 12)
      .map((group, index) => {
        const material = group.representative;
        const tone = getMaterialCardTone('published', group.anyVisible);
        const cover = getThematicBookCover(material);
        const isCompact = materialCardDensity === 'compact';
        const cardMinHeightClass = isCompact ? 'min-h-[236px]' : 'min-h-[266px]';
        const cardAspectRatio = isCompact ? '3/4.9' : '3/5.2';
        const coverPaddingClass = isCompact ? 'p-2' : 'p-2.5';
        const bodyPaddingClass = isCompact ? 'p-2.5' : 'p-3';
        const titleClass = isCompact ? 'text-[13px]' : 'text-sm';
        const staggerDelay = Math.min(index, 11) * 42;
        const publishedDate = new Date(group.lastPublishedAt || Date.now()).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const classSummary = group.classNames.length
          ? group.classNames.join(', ')
          : (material.kelas_nama || material.kelas_id || '-');
        return `
          <article class="card-hover-premium group relative flex ${cardMinHeightClass} flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_36px_-20px_rgba(15,23,42,0.45)]" style="aspect-ratio: ${cardAspectRatio}; animation: materialShelfItemIn 420ms cubic-bezier(.2,.7,.2,1) both; animation-delay: ${staggerDelay}ms;">
            <div class="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_14%_10%,rgba(255,255,255,0.7),transparent_36%)]"></div>
            <button type="button" data-material-group-id="${group.groupId}" class="material-published-item flex flex-1 flex-col text-left ${bodyPaddingClass}">
              <div class="relative mb-2 overflow-hidden rounded-xl bg-gradient-to-br ${cover.gradient} ${coverPaddingClass} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_14px_28px_-20px_rgba(15,23,42,0.55)]">
                <div class="absolute left-0 top-0 h-full w-2 bg-black/22"></div>
                <div class="absolute left-1.5 top-0 h-full w-[1px] bg-white/18"></div>
                <div class="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-white/15 blur-xl"></div>
                <div class="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,transparent_38%,transparent_62%,rgba(255,255,255,0.08)_100%)]"></div>
                <div class="relative flex items-start justify-between gap-2">
                  <span class="inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg bg-white/20 px-1.5 text-[11px] font-bold text-white backdrop-blur-sm">${cover.icon}</span>
                  <span class="inline-flex items-center rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-white/95">${cover.motif}</span>
                </div>
                <div class="mt-2.5">
                  <p class="line-clamp-2 ${titleClass} font-semibold leading-snug text-white drop-shadow-[0_1px_1px_rgba(15,23,42,0.25)]">${material.title || 'Tanpa judul'}</p>
                  <p class="mt-1 text-[10px] text-white/88">${material.mapel_nama || 'Mapel'}</p>
                  <p class="mt-1.5 rounded-md border border-white/25 bg-white/15 px-2 py-1 text-center text-[10px] font-semibold leading-snug text-white break-words">${classSummary}</p>
                </div>
              </div>
              <div class="flex items-start gap-2.5">
                <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${tone.accentClass} text-[10px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(15,23,42,0.5)]">${getMaterialMonogram(material)}</span>
                <div class="min-w-0 flex-1">
                  <div class="mb-1 flex flex-wrap items-center gap-1.5">
                    <span class="inline-flex items-center rounded-full border ${tone.badgeClass} px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider">${tone.badgeLabel}</span>
                    ${group.allUnpublished ? '<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-700">Unpublished</span>' : ''}
                  </div>
                  <span class="inline-flex items-center gap-1 text-[10px] text-slate-400">
                    <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    ${publishedDate}
                  </span>
                </div>
              </div>
              <div class="mt-auto flex items-center justify-between pt-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                <span class="inline-flex items-center gap-1">Buka <svg class="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
                <span class="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[8px] text-indigo-700">Book</span>
              </div>
            </button>
            <div class="grid grid-cols-4 gap-1.5 border-t border-slate-100 bg-slate-50/60 p-2.5">
              <button type="button" data-preview-group-id="${group.groupId}" class="preview-published-btn inline-flex items-center justify-center gap-1 rounded-xl border border-indigo-200 bg-white px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-indigo-700 transition hover:bg-indigo-50">Preview</button>
              <button type="button" data-edit-group-id="${group.groupId}" class="edit-published-btn inline-flex items-center justify-center gap-1 rounded-xl border border-sky-200 bg-white px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-sky-700 transition hover:bg-sky-50">Edit</button>
              <button type="button" data-toggle-group-id="${group.groupId}" class="toggle-published-btn inline-flex items-center justify-center gap-1 rounded-xl border ${group.allUnpublished ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'} bg-white px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider transition">${group.allUnpublished ? 'Publish' : 'Unpub'}</button>
              <button type="button" data-delete-group-id="${group.groupId}" class="delete-published-btn inline-flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-white px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-rose-600 transition hover:bg-rose-50">Hapus</button>
            </div>
          </article>
        `;
      })
      .join('');

    publishedListEl.querySelectorAll('.material-published-item').forEach((button) => {
      button.addEventListener('click', () => {
        const groupId = button.getAttribute('data-material-group-id');
        const group = groupedMaterials.find((item) => item.groupId === groupId);
        if (group?.representative) {
          openMaterialPreview(group.representative);
        }
      });
    });

    publishedListEl.querySelectorAll('.preview-published-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const groupId = button.getAttribute('data-preview-group-id');
        const group = groupedMaterials.find((item) => item.groupId === groupId);
        if (group?.representative) {
          openMaterialPreview(group.representative);
        }
      });
    });

    publishedListEl.querySelectorAll('.edit-published-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const groupId = button.getAttribute('data-edit-group-id');
        const group = groupedMaterials.find((item) => item.groupId === groupId);
        if (group?.representative) {
          openPublishedMaterialEditModal(group.representative);
        }
      });
    });

    publishedListEl.querySelectorAll('.toggle-published-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          const groupId = button.getAttribute('data-toggle-group-id');
          const group = groupedMaterials.find((item) => item.groupId === groupId);
          if (!group?.items?.length) {
            return;
          }

          const material = group.representative;

          const confirmed = window.confirm(
            group.allUnpublished
              ? `Publish lagi materi "${material.title || 'Tanpa judul'}" untuk siswa?`
              : `Unpublish materi "${material.title || 'Tanpa judul'}" dari tampilan siswa?`
          );
          if (!confirmed) {
            return;
          }

          const nextVisibility = group.allUnpublished;
          await Promise.all(group.items.map((item) => savePublishedMaterial({
            ...item,
            created_at: item.created_at || item.published_at || item.updated_at || new Date().toISOString(),
            visible_to_students: nextVisibility,
            status: nextVisibility ? 'published' : 'unpublished',
          })));

          publishedMaterials = await getUserPublishedMaterials(session, context);
          renderPublishedList();
          await renderMaterialReadReport();
          setStatus(nextVisibility ? `Materi dipublikasikan kembali untuk ${group.items.length} kelas.` : `Materi berhasil di-unpublish untuk ${group.items.length} kelas.`);
        } catch (error) {
          console.error('Gagal mengubah status publish materi:', error);
          setStatus(`Gagal mengubah status publish: ${error?.message || 'cek izin Firestore.'}`, true);
        }
      });
    });

    publishedListEl.querySelectorAll('.delete-published-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          const groupId = button.getAttribute('data-delete-group-id');
          const group = groupedMaterials.find((item) => item.groupId === groupId);
          if (!group?.items?.length) {
            return;
          }

          const material = group.representative;
          const confirmed = window.confirm(`Hapus permanen materi "${material?.title || 'Tanpa judul'}" dari penyimpanan? Tindakan ini tidak dapat dibatalkan.`);
          if (!confirmed) {
            return;
          }

          await Promise.all(group.items.map((item) => deletePublishedMaterial(item.id)));
          publishedMaterials = await getUserPublishedMaterials(session, context);
          renderPublishedList();
          await renderMaterialReadReport();
          setStatus(`Materi publish dihapus permanen dari ${group.items.length} kelas.`);
        } catch (error) {
          console.error('Gagal menghapus materi publish:', error);
          setStatus(`Gagal menghapus materi: ${error?.message || 'cek izin Firestore.'}`, true);
        }
      });
    });
    updateStatCounters();
  }

  function buildMaterialPayload() {
    syncMainMetadataFromBuilder();
    let source;
    if (selectedMethod === 'editor') {
      source = buildBuilderHtmlOutput();
    } else {
      source = sourceInput.value.trim();
    }

    const selectedAssignments = getSelectedAssignments();

    if (!source) {
      setStatus('Konten materi masih kosong.', true);
      return null;
    }

    if (!selectedAssignments.length) {
      setStatus('Pilih minimal satu kelas tujuan.', true);
      return null;
    }

    const baseId = activeDraftId || `${selectedAssignments[0].id}_${Date.now()}`;

    return {
      baseId,
      selectedAssignments,
      source,
      title: titleInput.value.trim() || 'Materi Tanpa Judul',
      level: levelInput.value.trim(),
      chapter: chapterInput.value.trim(),
      meetings: meetingsInput.value.trim(),
      note: noteInput.value.trim(),
      updated_at: new Date().toISOString(),
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
    };
  }

  loadPreviewBtn?.addEventListener('click', () => {
    const source = sourceInput.value.trim();
    if (!source) {
      setStatus('HTML sumber masih kosong.', true);
      return;
    }

    try {
      const metadata = extractMetadata(sanitizeDocument(createHtmlDocument(source)));
      if (!titleInput.value.trim()) titleInput.value = metadata.title;
      if (!levelInput.value.trim()) levelInput.value = metadata.level;
      if (!chapterInput.value.trim()) chapterInput.value = metadata.chapter;
      if (!meetingsInput.value.trim()) meetingsInput.value = metadata.meetings;
      renderPreview(source);
      setStatus('Preview berhasil dimuat. Tinjau struktur, rumus, dan tab materi sebelum menyimpan.');
    } catch (error) {
      setStatus(`Gagal memuat preview: ${error.message || 'HTML tidak valid.'}`, true);
    }
  });

  applyMetadataBtn?.addEventListener('click', () => {
    const source = sourceInput.value.trim();
    if (!source) {
      setStatus('Tidak ada HTML untuk diperbarui.', true);
      return;
    }

    try {
      const nextSource = applyMetadataToHtml(source, {
        title: titleInput.value,
        level: levelInput.value,
        chapter: chapterInput.value,
        meetings: meetingsInput.value,
      });
      sourceInput.value = nextSource;
      renderPreview(nextSource);
      setStatus('Metadata diterapkan ke HTML dan preview diperbarui.');
    } catch (error) {
      setStatus(`Gagal menerapkan metadata: ${error.message || 'HTML tidak valid.'}`, true);
    }
  });

  saveDraftBtn?.addEventListener('click', () => {
    const payload = buildMaterialPayload();
    if (!payload) {
      return;
    }

    const guruId = String(session?.user?.username || context?.user_logged_in || '').trim().toLowerCase();
    const guruNama = session?.user?.nama || 'Guru';
    const allDrafts = readDrafts();
    const existingIndex = allDrafts.findIndex((item) => item.id === payload.baseId);

    const draft = {
      id: payload.baseId,
      guru_id: guruId,
      guru_nama: guruNama,
      title: payload.title,
      level: payload.level,
      chapter: payload.chapter,
      meetings: payload.meetings,
      note: payload.note,
      html_source: payload.source,
      updated_at: payload.updated_at,
      tahun_ajaran_id: payload.tahun_ajaran_id,
      semester_id: payload.semester_id,
      published_targets: payload.selectedAssignments.map((a) => ({
        pengajaran_id: a.id,
        kelas_id: a.kelas_id,
        kelas_nama: a.kelas_nama,
        mapel_id: a.mapel_id,
        mapel_nama: a.mapel_nama,
      })),
      pengajaran_id: payload.selectedAssignments[0].id,
      kelas_id: payload.selectedAssignments[0].kelas_id,
      kelas_nama: payload.selectedAssignments[0].kelas_nama,
      kelas_token: normalizeClassToken(payload.selectedAssignments[0].kelas_id || payload.selectedAssignments[0].kelas_nama),
      mapel_id: payload.selectedAssignments[0].mapel_id,
      mapel_nama: payload.selectedAssignments[0].mapel_nama,
    };

    if (existingIndex >= 0) {
      allDrafts[existingIndex] = draft;
    } else {
      allDrafts.push(draft);
    }
    writeDrafts(allDrafts);
    activeDraftId = payload.baseId;
    drafts = getUserDrafts(session, context);
    renderDraftList();
    updateStatCounters();
    setActiveTab('koleksi');
    setStatus(`Draft materi disimpan untuk ${payload.selectedAssignments.length} kelas.`);
  });

  publishMaterialBtn?.addEventListener('click', async () => {
    try {
      const payload = buildMaterialPayload();
      if (!payload) {
        return;
      }

      const guruId = String(session?.user?.username || context?.user_logged_in || '').trim().toLowerCase();
      const guruNama = session?.user?.nama || 'Guru';
      const publishedAt = new Date().toISOString();

      const baseMaterial = {
        source_id: payload.baseId,
        guru_id: guruId,
        guru_nama: guruNama,
        title: payload.title,
        level: payload.level,
        chapter: payload.chapter,
        meetings: payload.meetings,
        note: payload.note,
        html_source: payload.source,
        visible_to_students: true,
        status: 'published',
        created_at: publishedAt,
        published_at: publishedAt,
        updated_at: payload.updated_at,
        tahun_ajaran_id: payload.tahun_ajaran_id,
        semester_id: payload.semester_id,
      };

      const publishedTargets = payload.selectedAssignments.map((a) => ({
        pengajaran_id: a.id,
        kelas_id: a.kelas_id,
        kelas_nama: a.kelas_nama,
        mapel_id: a.mapel_id,
        mapel_nama: a.mapel_nama,
      }));

      await Promise.all(payload.selectedAssignments.map((assignment) => savePublishedMaterial({
        ...baseMaterial,
        id: `${payload.baseId}__${assignment.id}`,
        pengajaran_id: assignment.id,
        kelas_id: assignment.kelas_id,
        kelas_nama: assignment.kelas_nama,
        kelas_token: normalizeClassToken(assignment.kelas_id || assignment.kelas_nama),
        mapel_id: assignment.mapel_id,
        mapel_nama: assignment.mapel_nama,
      })));

      const allDrafts = readDrafts();
      const draftIndex = allDrafts.findIndex((item) => item.id === payload.baseId);
      if (draftIndex >= 0) {
        allDrafts[draftIndex] = {
          ...allDrafts[draftIndex],
          ...baseMaterial,
          pengajaran_id: payload.selectedAssignments[0].id,
          kelas_id: payload.selectedAssignments[0].kelas_id,
          kelas_nama: payload.selectedAssignments[0].kelas_nama,
          kelas_token: normalizeClassToken(payload.selectedAssignments[0].kelas_id || payload.selectedAssignments[0].kelas_nama),
          mapel_id: payload.selectedAssignments[0].mapel_id,
          mapel_nama: payload.selectedAssignments[0].mapel_nama,
          status: 'published',
          published_at: publishedAt,
          published_targets: publishedTargets,
        };
        writeDrafts(allDrafts);
      }

      activeDraftId = payload.baseId;
      drafts = getUserDrafts(session, context);
      publishedMaterials = await getUserPublishedMaterials(session, context);
      renderDraftList();
      renderPublishedList();
      await renderMaterialReadReport();
      updateStatCounters();
      setActiveTab('koleksi');
      setStatus(`Materi berhasil dipublikasikan ke ${payload.selectedAssignments.length} kelas.`);
    } catch (error) {
      console.error('Gagal publish materi:', error);
      setStatus(`Publish gagal: ${error?.message || 'cek izin Firestore dan data pengajaran.'}`, true);
    }
  });

  resetEditorBtn?.addEventListener('click', resetEditor);

  builderEditor?.addEventListener('input', () => {
    if (!builderIgnoreHistory && !builderIsPreview) {
      saveBuilderHistory();
    }
    syncBuilderCodeView();
    updateBuilderStats();
    queueBuilderAutosave();
    renderBuilderStandalonePreview();
  });
  builderEditor?.addEventListener('keyup', saveBuilderSelection);
  builderEditor?.addEventListener('mouseup', saveBuilderSelection);
  builderEditor?.addEventListener('focus', saveBuilderSelection);
  builderEditor?.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      execBuilderCommand('bold');
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      execBuilderCommand('italic');
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'u') {
      event.preventDefault();
      execBuilderCommand('underline');
    }
  });
  builderCodeView?.addEventListener('input', () => {
    updateBuilderStats();
    renderBuilderStandalonePreview();
  });
  builderCommandButtons.forEach((button) => {
    button.addEventListener('click', () => {
      execBuilderCommand(button.getAttribute('data-builder-command') || '');
    });
  });
  builderActionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-builder-action');
      if (action === 'undo') {
        if (builderHistoryIndex > 0) {
          builderHistoryIndex -= 1;
          applyBuilderSnapshot(builderHistory[builderHistoryIndex]);
          showBuilderToast('Undo.');
        } else {
          showBuilderToast('Tidak ada lagi undo.', true);
        }
      }
      if (action === 'redo') {
        if (builderHistoryIndex < builderHistory.length - 1) {
          builderHistoryIndex += 1;
          applyBuilderSnapshot(builderHistory[builderHistoryIndex]);
          showBuilderToast('Redo.');
        } else {
          showBuilderToast('Tidak ada lagi redo.', true);
        }
      }
      if (action === 'toggle-code') {
        toggleBuilderCodeView();
      }
      if (action === 'toggle-preview') {
        toggleBuilderPreview();
      }
      if (action === 'toggle-fullscreen') {
        toggleBuilderFullscreen();
      }
      if (action === 'toggle-symbols') {
        builderSymbolPanel.style.display = builderSymbolPanel.style.display === 'none' || !builderSymbolPanel.style.display ? 'block' : 'none';
      }
      if (action === 'clear') {
        const confirmed = window.confirm('Kosongkan seluruh isi editor Buat Materi?');
        if (!confirmed) {
          return;
        }
        loadBuilderContent('');
        showBuilderToast('Editor materi dikosongkan.');
      }
      if (action === 'help') {
        openBuilderModal({
          title: 'Bantuan Editor',
          subtitle: 'Ringkasan fitur utama pada tab Buat Materi.',
          bodyHtml: `
            <div class="space-y-3 text-sm leading-7 text-slate-600">
              <p><strong class="text-slate-900">Pintasan:</strong> Ctrl+B tebal, Ctrl+I miring, Ctrl+U garis bawah.</p>
              <p><strong class="text-slate-900">Mode kerja:</strong> gunakan Code untuk mengedit HTML langsung, Preview untuk membaca hasil, dan Full untuk fokus.</p>
              <p><strong class="text-slate-900">Struktur cepat:</strong> tombol Template Tab akan menyisipkan struktur materi, contoh soal, latihan, tugas, dan catatan.</p>
              <p><strong class="text-slate-900">Alur publish:</strong> setelah selesai, klik Gunakan di Editor HTML agar konten masuk ke workflow preview, draft, dan publish yang sudah ada.</p>
            </div>
          `,
          onConfirm: closeBuilderModal,
          confirmLabel: 'Tutup',
        });
      }
    });
  });
  builderTemplateButtons.forEach((button) => {
    button.addEventListener('click', () => {
      handleBuilderTemplateInsert(button.getAttribute('data-builder-template') || '');
    });
  });
  builderInsertButtons.forEach((button) => {
    button.addEventListener('click', () => {
      handleBuilderInsert(button.getAttribute('data-builder-insert') || '');
    });
  });
  builderSymbolButtonsEls.forEach((button) => {
    button.addEventListener('click', () => {
      const symbol = button.getAttribute('data-builder-symbol') || '';
      insertBuilderHtml(`<span class="math">${escapeHtml(symbol)}</span>`);
    });
  });
  builderAssignmentSelect?.addEventListener('change', () => {
    if (assignmentListEl) {
      const checkboxes = assignmentListEl.querySelectorAll('.assignment-checkbox');
      checkboxes.forEach((cb) => { cb.checked = cb.value === builderAssignmentSelect.value; });
      updateSelectedClassesCount();
    }
    const assignment = getCurrentAssignment();
    if (assignment && builderLevelInput && !builderLevelInput.value.trim()) {
      builderLevelInput.value = assignment.kelas_nama || '';
    }
    syncMainMetadataFromBuilder();
  });
  builderTitleInput?.addEventListener('input', syncMainMetadataFromBuilder);
  builderLevelInput?.addEventListener('input', syncMainMetadataFromBuilder);
  builderChapterInput?.addEventListener('input', syncMainMetadataFromBuilder);
  builderFontFamily?.addEventListener('change', () => {
    execBuilderCommand('fontName', builderFontFamily.value);
  });
  builderFontSize?.addEventListener('change', () => {
    execBuilderCommand('fontSize', builderFontSize.value);
  });
  builderTextColor?.addEventListener('change', () => {
    execBuilderCommand('foreColor', builderTextColor.value);
  });
  builderBgColor?.addEventListener('change', () => {
    execBuilderCommand('hiliteColor', builderBgColor.value);
  });
  builderModalCancelBtn?.addEventListener('click', closeBuilderModal);
  builderModalConfirmBtn?.addEventListener('click', () => {
    if (builderModalSubmit) {
      builderModalSubmit();
    }
  });
  builderModalOverlay?.addEventListener('click', (event) => {
    if (event.target === builderModalOverlay) {
      closeBuilderModal();
    }
  });
  document.addEventListener('selectionchange', updateBuilderCommandState);
  builderImportHtmlBtn?.addEventListener('click', () => {
    const htmlSource = sourceInput.value.trim();
    if (!htmlSource) {
      showBuilderToast('Editor Materi HTML masih kosong.', true);
      return;
    }
    loadBuilderContent(extractMaterialBuilderBody(htmlSource));
    showBuilderToast('Konten dari Editor HTML berhasil dimuat.');
  });
  builderApplyToHtmlBtn?.addEventListener('click', () => {
    syncBuilderToHtmlEditor();
    setStatus('Konten dari Buat Materi dikirim ke Editor Materi HTML dan preview diperbarui.');
    setActiveTab('buat');
  });
  builderSaveDraftBtn?.addEventListener('click', () => {
    syncBuilderToHtmlEditor();
    const payload = buildMaterialPayload();
    if (!payload) {
      showBuilderToast('Lengkapi relasi mengajar dan judul materi sebelum menyimpan draft.', true);
      return;
    }

    const guruId = String(session?.user?.username || context?.user_logged_in || '').trim().toLowerCase();
    const guruNama = session?.user?.nama || 'Guru';
    const allDrafts = readDrafts();
    const existingIndex = allDrafts.findIndex((item) => item.id === payload.baseId);

    const draft = {
      id: payload.baseId,
      guru_id: guruId,
      guru_nama: guruNama,
      title: payload.title,
      level: payload.level,
      chapter: payload.chapter,
      meetings: payload.meetings,
      note: payload.note,
      html_source: payload.source,
      updated_at: payload.updated_at,
      tahun_ajaran_id: payload.tahun_ajaran_aktif,
      semester_id: payload.semester_aktif,
      published_targets: payload.selectedAssignments.map((a) => ({
        pengajaran_id: a.id, kelas_id: a.kelas_id, kelas_nama: a.kelas_nama, mapel_id: a.mapel_id, mapel_nama: a.mapel_nama,
      })),
      pengajaran_id: payload.selectedAssignments[0].id,
      kelas_id: payload.selectedAssignments[0].kelas_id,
      kelas_nama: payload.selectedAssignments[0].kelas_nama,
      kelas_token: normalizeClassToken(payload.selectedAssignments[0].kelas_id || payload.selectedAssignments[0].kelas_nama),
      mapel_id: payload.selectedAssignments[0].mapel_id,
      mapel_nama: payload.selectedAssignments[0].mapel_nama,
    };

    if (existingIndex >= 0) {
      allDrafts[existingIndex] = draft;
    } else {
      allDrafts.push(draft);
    }

    writeDrafts(allDrafts);
    activeDraftId = payload.baseId;
    drafts = getUserDrafts(session, context);
    renderDraftList();
    setStatus('Draft materi HTML berhasil disimpan dari tab Buat Materi.');
    showBuilderToast('Draft berhasil disimpan.');
  });
  builderPublishBtn?.addEventListener('click', async () => {
    syncBuilderToHtmlEditor();
    const payload = buildMaterialPayload();
    if (!payload) {
      showBuilderToast('Lengkapi relasi mengajar dan judul materi sebelum publish.', true);
      return;
    }

    const guruId = String(session?.user?.username || context?.user_logged_in || '').trim().toLowerCase();
    const guruNama = session?.user?.nama || 'Guru';
    const publishedAt = new Date().toISOString();

    const baseMaterial = {
      source_id: payload.baseId,
      guru_id: guruId,
      guru_nama: guruNama,
      title: payload.title,
      level: payload.level,
      chapter: payload.chapter,
      meetings: payload.meetings,
      note: payload.note,
      html_source: payload.source,
      visible_to_students: true,
      status: 'published',
      published_at: publishedAt,
      updated_at: payload.updated_at,
      tahun_ajaran_id: payload.tahun_ajaran_aktif,
      semester_id: payload.semester_aktif,
    };

    const publishedTargets = payload.selectedAssignments.map((a) => ({
      pengajaran_id: a.id, kelas_id: a.kelas_id, kelas_nama: a.kelas_nama, mapel_id: a.mapel_id, mapel_nama: a.mapel_nama,
    }));

    await Promise.all(payload.selectedAssignments.map((assignment) => savePublishedMaterial({
      ...baseMaterial,
      id: `${payload.baseId}__${assignment.id}`,
      pengajaran_id: assignment.id,
      kelas_id: assignment.kelas_id,
      kelas_nama: assignment.kelas_nama,
      kelas_token: normalizeClassToken(assignment.kelas_id || assignment.kelas_nama),
      mapel_id: assignment.mapel_id,
      mapel_nama: assignment.mapel_nama,
    })));

    const allDrafts = readDrafts();
    const draftIndex = allDrafts.findIndex((item) => item.id === payload.baseId);
    const draftEntry = {
      ...baseMaterial,
      id: payload.baseId,
      pengajaran_id: payload.selectedAssignments[0].id,
      kelas_id: payload.selectedAssignments[0].kelas_id,
      kelas_nama: payload.selectedAssignments[0].kelas_nama,
      kelas_token: normalizeClassToken(payload.selectedAssignments[0].kelas_id || payload.selectedAssignments[0].kelas_nama),
      mapel_id: payload.selectedAssignments[0].mapel_id,
      mapel_nama: payload.selectedAssignments[0].mapel_nama,
      status: 'published',
      published_at: publishedAt,
      published_targets: publishedTargets,
    };
    if (draftIndex >= 0) {
      allDrafts[draftIndex] = draftEntry;
    } else {
      allDrafts.push(draftEntry);
    }

    writeDrafts(allDrafts);
    activeDraftId = payload.baseId;
    drafts = getUserDrafts(session, context);
    publishedMaterials = await getUserPublishedMaterials(session, context);
    renderDraftList();
    renderPublishedList();
    await renderMaterialReadReport();
    setStatus('Materi berhasil dipublikasikan langsung dari tab Buat Materi.');
    showBuilderToast('Materi berhasil dipublish.');
    setActiveTab('koleksi');
  });
  builderExportHtmlBtn?.addEventListener('click', exportBuilderHtml);
  builderPrintBtn?.addEventListener('click', printBuilderHtml);
  builderPreviewRefreshBtn?.addEventListener('click', () => {
    renderBuilderStandalonePreview();
    showBuilderToast('Preview Buat Materi diperbarui.');
  });
  reportClassFilterEl?.addEventListener('change', async () => {
    reportFilters.kelas = reportClassFilterEl.value;
    await renderMaterialReadReport();
  });
  reportMapelFilterEl?.addEventListener('change', async () => {
    reportFilters.mapel = reportMapelFilterEl.value;
    await renderMaterialReadReport();
  });
  reportStatusFilterEl?.addEventListener('change', async () => {
    reportFilters.status = reportStatusFilterEl.value;
    await renderMaterialReadReport();
  });
  titleInput?.addEventListener('input', syncBuilderMetadataFromMain);
  levelInput?.addEventListener('input', syncBuilderMetadataFromMain);
  chapterInput?.addEventListener('input', syncBuilderMetadataFromMain);

  applyTemplatePresetBtn?.addEventListener('click', applyTemplatePreset);
  fillTemplateFromEditorBtn?.addEventListener('click', fillTemplateFromEditor);
  generateTemplatePromptBtn?.addEventListener('click', renderTemplatePrompt);
  copyTemplatePromptBtn?.addEventListener('click', async () => {
    const promptValue = templatePromptOutput?.value.trim() || buildTemplatePromptValue();
    templatePromptOutput.value = promptValue;
    if (!promptValue) {
      setTemplatePromptStatus('Belum ada prompt untuk disalin.', true);
      return;
    }

    try {
      await navigator.clipboard.writeText(promptValue);
      setTemplatePromptStatus('Prompt berhasil disalin ke clipboard.');
    } catch (error) {
      setTemplatePromptStatus('Gagal menyalin prompt. Salin manual dari kotak output.', true);
    }
  });
  openChatGptBtn?.addEventListener('click', () => {
    openPromptAssistant('https://chatgpt.com/', 'ChatGPT');
  });
  openDeepSeekBtn?.addEventListener('click', () => {
    openPromptAssistant('https://chat.deepseek.com/', 'DeepSeek');
  });

  cardDensityCompactBtn?.addEventListener('click', () => {
    if (materialCardDensity === 'compact') {
      return;
    }
    materialCardDensity = 'compact';
    localStorage.setItem(MATERIAL_CARD_DENSITY_KEY, materialCardDensity);
    renderPublishedList();
  });

  cardDensityComfortableBtn?.addEventListener('click', () => {
    if (materialCardDensity === 'comfortable') {
      return;
    }
    materialCardDensity = 'comfortable';
    localStorage.setItem(MATERIAL_CARD_DENSITY_KEY, materialCardDensity);
    renderPublishedList();
  });

  readerBackBtn?.addEventListener('click', closeMaterialPreview);
  readerEditBtn?.addEventListener('click', () => {
    if (activePreviewMaterial) {
      openMaterialInEditor(activePreviewMaterial);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && readerOverlayEl && !readerOverlayEl.classList.contains('hidden')) {
      closeMaterialPreview();
    }
  });

  resetEditor();
  loadBuilderContent(localStorage.getItem(builderStorageKey) || getMaterialBuilderStarterContent());
  syncBuilderMetadataFromMain();
  renderBuilderStandalonePreview();
  updateMaterialCardDensityToggleState();
  renderDraftList();
  renderPublishedList();
  await renderMaterialReadReport();
  renderTemplatePrompt();
  setBuilderModeLabel();
  updateBuilderStats();
  updateStatCounters();
  setActiveTab(activeTab);

  if (methodCardEditor) methodCardEditor.addEventListener('click', () => selectMethod('editor'));
  if (methodCardHtml) methodCardHtml.addEventListener('click', () => selectMethod('html'));

  if (btnNextToMetadata) btnNextToMetadata.addEventListener('click', () => goToStep(2));
  if (btnBackToMethod) btnBackToMethod.addEventListener('click', () => goToStep(1));
  if (btnNextToContent) btnNextToContent.addEventListener('click', () => goToStep(3));
  if (btnBackToMetadata) btnBackToMetadata.addEventListener('click', () => goToStep(2));
  if (btnNextToReview) btnNextToReview.addEventListener('click', () => goToStep(4));
  if (btnBackToContent) btnBackToContent.addEventListener('click', () => goToStep(3));

  const wizardStepNav = container.querySelector('#wizard-step-nav');
  if (wizardStepNav) {
    wizardStepNav.querySelectorAll('[data-step]').forEach((navEl) => {
      navEl.addEventListener('click', () => {
        const target = Number(navEl.getAttribute('data-step')) || 1;
        goToStep(target);
      });
    });
  }

  if (builderPreviewRefreshBtn2) builderPreviewRefreshBtn2.addEventListener('click', () => renderBuilderStandalonePreview());

  if (materialTabButtons.length) {
    materialTabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-material-tab');
        setActiveTab(tab);
      });
    });
  }
}