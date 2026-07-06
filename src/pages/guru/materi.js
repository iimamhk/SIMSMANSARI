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
    ? 'bg-slate-900 text-white shadow-[0_12px_24px_-16px_rgba(15,23,42,0.65)]'
    : 'bg-white text-slate-600 hover:bg-slate-50';
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
  const userAssignments = userId ? await getTeachingAssignmentsForUser(context, userId) : [];
  const assignments = userAssignments.length ? userAssignments : await getActiveTeachingAssignments(context);
  const selectedAssignment = assignments[0] || null;
  const materialReadStats = userId ? await getMaterialReadStatsForTeacher(userId) : [];
  const assignmentOptions = assignments
    .map((item) => `<option value="${item.id}">${item.kelas_nama || '-'} • ${item.mapel_nama || '-'}</option>`)
    .join('');
  const templatePresetCatalog = buildTemplatePresetCatalog(assignments);
  const templatePresetOptions = buildTemplatePresetOptions(templatePresetCatalog);
  const builderSymbolButtons = MATERIAL_BUILDER_SYMBOLS
    .map((symbol) => `<button type="button" data-builder-symbol="${escapeHtml(symbol)}" class="flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700">${escapeHtml(symbol)}</button>`)
    .join('');

  const html = renderLayout('Materi', `
    <div class="space-y-5">
      <section class="relative overflow-hidden rounded-[30px] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 p-5 shadow-[0_24px_70px_-42px_rgba(37,99,235,0.28)]">
        <div class="absolute -right-10 top-0 h-28 w-28 rounded-full bg-sky-200/40 blur-3xl"></div>
        <div class="absolute bottom-0 left-8 h-24 w-24 rounded-full bg-cyan-200/40 blur-3xl"></div>
        <div class="relative space-y-3">
          <div class="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
            <span class="inline-block h-2 w-2 rounded-full bg-sky-500"></span>
            Workflow Materi Guru
          </div>
          <h1 class="text-2xl font-semibold text-slate-900">Manajemen Materi Guru</h1>
          <p class="max-w-4xl text-sm leading-6 text-slate-600">Pisahkan pekerjaan Anda per tab: siapkan materi di editor, kelola materi tersimpan di daftar, dan pantau aktivitas baca siswa di laporan.</p>
        </div>
      </section>

      <section class="rounded-[28px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-4">
        <div class="flex flex-wrap gap-2">
          <button type="button" data-material-tab="buat" class="material-tab-btn rounded-full px-4 py-2.5 text-sm font-semibold transition ${getTabButtonClass(false)}">Buat Materi</button>
          <button type="button" data-material-tab="editor" class="material-tab-btn rounded-full px-4 py-2.5 text-sm font-semibold transition ${getTabButtonClass(true)}">Editor Materi HTML</button>
          <button type="button" data-material-tab="template" class="material-tab-btn rounded-full px-4 py-2.5 text-sm font-semibold transition ${getTabButtonClass(false)}">Template HTML</button>
          <button type="button" data-material-tab="daftar" class="material-tab-btn rounded-full px-4 py-2.5 text-sm font-semibold transition ${getTabButtonClass(false)}">Daftar Materi</button>
          <button type="button" data-material-tab="laporan" class="material-tab-btn rounded-full px-4 py-2.5 text-sm font-semibold transition ${getTabButtonClass(false)}">Laporan</button>
        </div>
      </section>

      <section data-material-panel="buat" class="material-tab-panel hidden space-y-4">
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
            max-width: 100vw;
            border-radius: 0;
            z-index: 9999;
            padding: 0;
            box-shadow: none;
          }
          #material-builder-shell .editor-header {
            background: linear-gradient(135deg, #0b1a33 0%, #1a2f4f 100%);
            padding: 14px 28px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #2a4a6a;
            flex-wrap: wrap;
            gap: 10px;
          }
          #material-builder-shell .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            color: #fff;
            font-weight: 700;
            font-size: 18px;
            letter-spacing: 0.3px;
          }
          #material-builder-shell .brand i {
            font-size: 26px;
            color: #6ab0ff;
            background: rgba(106, 176, 255, 0.15);
            padding: 8px;
            border-radius: 12px;
          }
          #material-builder-shell .brand span {
            color: #aacbff;
            font-weight: 400;
            font-size: 14px;
            margin-left: 4px;
          }
          #material-builder-shell .header-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          #material-builder-shell .header-actions button {
            background: rgba(255, 255, 255, 0.08);
            border: none;
            color: #c8dfff;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 7px;
            transition: all 0.2s;
            font-family: inherit;
          }
          #material-builder-shell .header-actions button:hover {
            background: rgba(255, 255, 255, 0.18);
            color: #fff;
            transform: translateY(-1px);
          }
          #material-builder-shell .header-actions button.primary {
            background: #2d7cff;
            color: #fff;
          }
          #material-builder-shell .header-actions button.primary:hover {
            background: #3d8cff;
          }
          #material-builder-shell .toolbar {
            background: #f8fafc;
            padding: 8px 16px;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px 2px;
            position: sticky;
            top: 0;
            z-index: 100;
            min-height: 52px;
          }
          #material-builder-shell .toolbar .group {
            display: flex;
            align-items: center;
            gap: 2px;
            padding: 0 6px;
            border-right: 1px solid #e2e8f0;
            flex-wrap: wrap;
          }
          #material-builder-shell .toolbar .group:last-child {
            border-right: none;
          }
          #material-builder-shell .toolbar button {
            background: transparent;
            border: none;
            width: 34px;
            height: 34px;
            border-radius: 8px;
            color: #334155;
            font-size: 15px;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: inherit;
            position: relative;
          }
          #material-builder-shell .toolbar button:hover {
            background: #e2e8f0;
            color: #0f172a;
          }
          #material-builder-shell .toolbar button.active {
            background: #dbeafe;
            color: #1d4ed8;
          }
          #material-builder-shell .toolbar button.danger {
            color: #dc2626;
          }
          #material-builder-shell .toolbar select {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 4px 8px;
            font-size: 12px;
            font-family: inherit;
            color: #0f172a;
            outline: none;
            cursor: pointer;
            height: 30px;
            min-width: 70px;
          }
          #material-builder-shell .toolbar .color-picker-wrapper {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 0 4px;
          }
          #material-builder-shell .toolbar .color-picker-wrapper input[type="color"] {
            width: 28px;
            height: 28px;
            border: 2px solid #e2e8f0;
            border-radius: 6px;
            padding: 2px;
            cursor: pointer;
            background: #fff;
          }
          #material-builder-shell .editor-body {
            position: relative;
            background: #ffffff;
          }
          #material-builder-shell .editor-content {
            padding: 40px 56px;
            min-height: 520px;
            max-height: 680px;
            overflow-y: auto;
            outline: none;
            font-size: 16px;
            line-height: 1.8;
            color: #0f172a;
            font-family: 'Inter', system-ui, sans-serif;
            transition: all 0.2s;
            background: #fff;
          }
          #material-builder-shell .editor-content:empty::before {
            content: 'Mulai menulis materi SMA di sini... Gunakan toolbar di atas untuk memformat.';
            color: #94a3b8;
            font-style: italic;
            pointer-events: none;
          }
          #material-builder-shell .editor-content:focus {
            box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.08);
          }
          #material-builder-shell .editor-content img {
            max-width: 100%;
            border-radius: 10px;
            margin: 12px 0;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
          }
          #material-builder-shell .editor-content table {
            border-collapse: collapse;
            width: 100%;
            margin: 14px 0;
            font-size: 14px;
          }
          #material-builder-shell .editor-content table td,
          #material-builder-shell .editor-content table th {
            border: 1px solid #cbd5e1;
            padding: 8px 12px;
            text-align: left;
          }
          #material-builder-shell .editor-content table th {
            background: #f1f5f9;
            font-weight: 600;
          }
          #material-builder-shell .editor-content blockquote {
            border-left: 4px solid #3b82f6;
            padding: 12px 20px;
            margin: 14px 0;
            background: #f8fafc;
            border-radius: 0 8px 8px 0;
            color: #1e293b;
          }
          #material-builder-shell .editor-content pre,
          #material-builder-shell .code-view {
            font-family: 'JetBrains Mono', monospace;
          }
          #material-builder-shell .editor-content pre {
            background: #0f172a;
            color: #e2e8f0;
            padding: 16px 20px;
            border-radius: 10px;
            overflow-x: auto;
            font-size: 14px;
            line-height: 1.7;
          }
          #material-builder-shell .editor-content a {
            color: #1d4ed8;
            text-decoration: underline;
          }
          #material-builder-shell .editor-content .math {
            font-family: 'Times New Roman', serif;
            font-size: 1.15em;
            padding: 0 2px;
          }
          #material-builder-shell .editor-content.hidden {
            display: none;
          }
          #material-builder-shell .editor-content.preview {
            background: #fafcfd;
            cursor: default;
          }
          #material-builder-shell .code-view {
            display: none;
            padding: 40px 56px;
            min-height: 420px;
            background: #0f172a;
            color: #e2e8f0;
            font-size: 14px;
            line-height: 1.7;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-y: auto;
            max-height: 680px;
            outline: none;
            border: none;
            resize: none;
            width: 100%;
          }
          #material-builder-shell .code-view.active {
            display: block;
          }
          #material-builder-shell .status-bar {
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            padding: 8px 28px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: #64748b;
            flex-wrap: wrap;
            gap: 6px;
          }
          #material-builder-shell .stats {
            display: flex;
            gap: 20px;
            align-items: center;
            flex-wrap: wrap;
          }
          #material-builder-shell .mode-indicator {
            background: #e2e8f0;
            padding: 2px 12px;
            border-radius: 20px;
            font-weight: 500;
            font-size: 11px;
            color: #475569;
          }
          #material-builder-shell .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(4px);
            z-index: 99999;
            display: none;
            justify-content: center;
            align-items: center;
            padding: 20px;
          }
          #material-builder-shell .modal-overlay.open {
            display: flex;
          }
          #material-builder-shell .modal-box {
            background: #fff;
            border-radius: 20px;
            max-width: 560px;
            width: 100%;
            padding: 32px 36px;
            box-shadow: 0 30px 80px rgba(0, 0, 0, 0.3);
            max-height: 90vh;
            overflow-y: auto;
          }
          #material-builder-shell .modal-box h3 {
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          #material-builder-shell .modal-box .sub {
            color: #64748b;
            font-size: 14px;
            margin-bottom: 20px;
          }
          #material-builder-shell .modal-box label {
            display: block;
            font-weight: 600;
            font-size: 13px;
            color: #334155;
            margin-top: 14px;
            margin-bottom: 4px;
          }
          #material-builder-shell .modal-box input,
          #material-builder-shell .modal-box textarea,
          #material-builder-shell .modal-box select {
            width: 100%;
            padding: 10px 14px;
            border: 1.5px solid #e2e8f0;
            border-radius: 10px;
            font-size: 14px;
            font-family: inherit;
            transition: 0.2s;
            background: #fafbfc;
          }
          #material-builder-shell .modal-box textarea {
            resize: vertical;
            min-height: 70px;
          }
          #material-builder-shell .row-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
          }
          #material-builder-shell .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid #eef2f6;
          }
          #material-builder-shell .modal-actions button {
            padding: 10px 26px;
            border-radius: 10px;
            font-weight: 600;
            font-size: 14px;
            border: none;
            cursor: pointer;
            transition: 0.2s;
            font-family: inherit;
          }
          #material-builder-shell .btn-cancel {
            background: #f1f5f9;
            color: #475569;
          }
          #material-builder-shell .btn-confirm {
            background: #1d4ed8;
            color: #fff;
          }
          #material-builder-shell .char-grid {
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 8px;
            margin: 12px 0 8px;
          }
          #material-builder-shell .char-grid button {
            padding: 10px 0;
            font-size: 22px;
            font-family: 'Times New Roman', serif;
            border: 1.5px solid #eef2f6;
            border-radius: 10px;
            background: #fafbfc;
            cursor: pointer;
            transition: 0.15s;
            color: #0f172a;
            width: auto;
            height: auto;
          }
          #material-builder-shell .toast {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: #0f172a;
            color: #fff;
            padding: 14px 28px;
            border-radius: 14px;
            font-weight: 500;
            font-size: 14px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
            z-index: 999999;
            opacity: 0;
            transform: translateY(20px) scale(0.95);
            transition: all 0.3s ease;
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          #material-builder-shell .toast.show {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
          }
          @media (max-width: 820px) {
            #material-builder-shell .editor-content,
            #material-builder-shell .code-view {
              padding: 24px 28px;
              max-height: 480px;
              min-height: 360px;
            }
            #material-builder-shell .editor-header {
              padding: 12px 18px;
            }
            #material-builder-shell .header-actions button {
              font-size: 12px;
              padding: 6px 12px;
            }
          }
          @media (max-width: 480px) {
            #material-builder-shell .editor-content,
            #material-builder-shell .code-view {
              padding: 16px 18px;
              max-height: 380px;
              min-height: 260px;
            }
            #material-builder-shell .row-2 {
              grid-template-columns: 1fr;
            }
            #material-builder-shell .char-grid {
              grid-template-columns: repeat(5, 1fr);
            }
            #material-builder-shell .brand span,
            #material-builder-shell .header-actions button span {
              display: none;
            }
          }
        </style>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:22px;padding:14px 18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;align-items:end;margin-bottom:14px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Relasi Mengajar</label>
            <select id="builder-assignment" style="width:100%;height:42px;border:1px solid #dbe2ea;border-radius:12px;padding:0 12px;background:#fff;color:#0f172a;font-size:13px;outline:none;">
              ${assignmentOptions || '<option value="">Tidak ada relasi aktif</option>'}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Judul Materi</label>
            <input id="builder-title" style="width:100%;height:42px;border:1px solid #dbe2ea;border-radius:12px;padding:0 12px;background:#fff;color:#0f172a;font-size:13px;outline:none;" placeholder="Contoh: Polinomial" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Label Kelas</label>
            <input id="builder-level" style="width:100%;height:42px;border:1px solid #dbe2ea;border-radius:12px;padding:0 12px;background:#fff;color:#0f172a;font-size:13px;outline:none;" placeholder="Contoh: Kelas 11" />
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Bab / Unit</label>
            <input id="builder-chapter" style="width:100%;height:42px;border:1px solid #dbe2ea;border-radius:12px;padding:0 12px;background:#fff;color:#0f172a;font-size:13px;outline:none;" placeholder="Contoh: Bab 4" />
          </div>
        </div>

        <div id="material-builder-shell">
          <div id="builder-wrapper" class="editor-wrapper">
            <div class="editor-header">
              <div class="brand">
                <i class="fas fa-graduation-cap"></i>
                Editor Materi SMA
                <span>· Profesional</span>
              </div>
              <div class="header-actions">
                <button type="button" data-builder-action="undo"><i class="fas fa-undo"></i> <span>Undo</span></button>
                <button type="button" data-builder-action="redo"><i class="fas fa-redo"></i> <span>Redo</span></button>
                <button type="button" data-builder-action="toggle-code"><i class="fas fa-code"></i> <span>Code</span></button>
                <button type="button" data-builder-action="toggle-preview"><i class="fas fa-eye"></i> <span>Preview</span></button>
                <button type="button" data-builder-action="toggle-fullscreen"><i class="fas fa-expand"></i> <span>Full</span></button>
                <button id="builder-import-html-btn" type="button"><i class="fas fa-file-import"></i> <span>Ambil HTML</span></button>
                <button id="builder-apply-to-html-btn" type="button" class="primary"><i class="fas fa-share-square"></i> <span>Ke Editor HTML</span></button>
                <button id="builder-save-draft-btn" type="button"><i class="fas fa-floppy-disk"></i> <span>Simpan Draft</span></button>
                <button id="builder-publish-btn" type="button" class="primary"><i class="fas fa-paper-plane"></i> <span>Publish</span></button>
                <button id="builder-export-html-btn" type="button" class="primary"><i class="fas fa-download"></i> <span>Export</span></button>
                <button id="builder-print-btn" type="button" class="primary"><i class="fas fa-print"></i> <span>Print</span></button>
              </div>
            </div>

            <div class="toolbar" id="builder-toolbar">
              <div class="group">
                <button type="button" data-builder-action="undo" title="Undo (Ctrl+Z)"><i class="fas fa-undo"></i></button>
                <button type="button" data-builder-action="redo" title="Redo (Ctrl+Y)"><i class="fas fa-redo"></i></button>
              </div>
              <div class="group">
                <button type="button" data-builder-command="bold" title="Tebal (Ctrl+B)"><i class="fas fa-bold"></i></button>
                <button type="button" data-builder-command="italic" title="Miring (Ctrl+I)"><i class="fas fa-italic"></i></button>
                <button type="button" data-builder-command="underline" title="Garis Bawah (Ctrl+U)"><i class="fas fa-underline"></i></button>
                <button type="button" data-builder-command="strikeThrough" title="Coret"><i class="fas fa-strikethrough"></i></button>
                <button type="button" data-builder-command="superscript" title="Superskrip"><i class="fas fa-superscript"></i></button>
                <button type="button" data-builder-command="subscript" title="Subskrip"><i class="fas fa-subscript"></i></button>
              </div>
              <div class="group">
                <button type="button" data-builder-command="justifyLeft" title="Rata Kiri"><i class="fas fa-align-left"></i></button>
                <button type="button" data-builder-command="justifyCenter" title="Rata Tengah"><i class="fas fa-align-center"></i></button>
                <button type="button" data-builder-command="justifyRight" title="Rata Kanan"><i class="fas fa-align-right"></i></button>
                <button type="button" data-builder-command="justifyFull" title="Rata Kiri-Kanan"><i class="fas fa-align-justify"></i></button>
              </div>
              <div class="group">
                <button type="button" data-builder-command="insertUnorderedList" title="Daftar Bullet"><i class="fas fa-list-ul"></i></button>
                <button type="button" data-builder-command="insertOrderedList" title="Daftar Nomor"><i class="fas fa-list-ol"></i></button>
                <button type="button" data-builder-command="outdent" title="Kurangi Indent"><i class="fas fa-outdent"></i></button>
                <button type="button" data-builder-command="indent" title="Tambah Indent"><i class="fas fa-indent"></i></button>
              </div>
              <div class="group">
                <select id="builder-font-family">
                  <option value="Inter">Inter</option>
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Tahoma">Tahoma</option>
                </select>
                <select id="builder-font-size">
                  <option value="1">10</option>
                  <option value="2">12</option>
                  <option value="3" selected>14</option>
                  <option value="4">18</option>
                  <option value="5">24</option>
                  <option value="6">32</option>
                  <option value="7">48</option>
                </select>
                <div class="color-picker-wrapper">
                  <input id="builder-text-color" type="color" value="#0f172a" title="Warna Teks" />
                  <input id="builder-bg-color" type="color" value="#ffffff" title="Warna Latar" />
                </div>
              </div>
              <div class="group">
                <button type="button" data-builder-insert="image" title="Sisipkan Gambar"><i class="fas fa-image"></i></button>
                <button type="button" data-builder-insert="link" title="Sisipkan Link"><i class="fas fa-link"></i></button>
                <button type="button" data-builder-insert="table" title="Sisipkan Tabel"><i class="fas fa-table"></i></button>
                <button type="button" data-builder-action="toggle-symbols" title="Karakter Khusus"><i class="fas fa-omega"></i></button>
                <button type="button" data-builder-insert="video" title="Sisipkan Video"><i class="fas fa-video"></i></button>
                <button type="button" data-builder-command="removeFormat" title="Hapus Format"><i class="fas fa-eraser"></i></button>
              </div>
              <div class="group">
                <button type="button" data-builder-template="h1" title="Template H1"><i class="fas fa-heading"></i></button>
                <button type="button" data-builder-template="note" title="Template Catatan"><i class="fas fa-note-sticky"></i></button>
                <button type="button" data-builder-template="example" title="Template Contoh"><i class="fas fa-lightbulb"></i></button>
                <button type="button" data-builder-template="exercise" title="Template Latihan"><i class="fas fa-list-check"></i></button>
                <button type="button" data-builder-template="task" title="Template Tugas"><i class="fas fa-clipboard-list"></i></button>
                <button type="button" data-builder-template="tabs" title="Template Tab"><i class="fas fa-table-columns"></i></button>
              </div>
              <div class="group" style="border-right:none;">
                <button type="button" data-builder-action="clear" class="danger" title="Kosongkan Konten"><i class="fas fa-trash-alt"></i></button>
                <button type="button" data-builder-action="help" title="Bantuan"><i class="fas fa-question-circle"></i></button>
              </div>
            </div>

            <div id="builder-symbol-panel" class="modal-box" style="display:none;max-width:none;border-radius:0;box-shadow:none;padding:16px 20px;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
              <h3><i class="fas fa-omega" style="color:#3b82f6;"></i> Karakter Khusus</h3>
              <div class="sub">Klik simbol untuk menyisipkan ke posisi kursor.</div>
              <div class="char-grid">
                ${builderSymbolButtons}
              </div>
            </div>

            <div class="editor-body">
              <div id="builder-editor-content" class="editor-content" contenteditable="true" spellcheck="true"></div>
              <textarea id="builder-code-view" class="code-view" spellcheck="false"></textarea>
            </div>

            <div class="status-bar">
              <div class="stats">
                <span><i class="fas fa-paragraph"></i> <span id="builder-word-count">0</span> kata</span>
                <span><i class="fas fa-font"></i> <span id="builder-char-count">0</span> karakter</span>
                <span><i class="fas fa-clock"></i> <span id="builder-last-saved">—</span></span>
              </div>
              <div><span id="builder-mode-indicator" class="mode-indicator">Edit</span></div>
            </div>

            <div id="builder-modal-overlay" class="modal-overlay">
              <div class="modal-box">
                <h3 id="builder-modal-title"><i class="fas fa-puzzle-piece"></i> Insert</h3>
                <div id="builder-modal-subtitle" class="sub">Masukkan data</div>
                <div id="builder-modal-body"></div>
                <div class="modal-actions">
                  <button id="builder-modal-cancel-btn" class="btn-cancel" type="button">Batal</button>
                  <button id="builder-modal-confirm-btn" class="btn-confirm" type="button">Simpan</button>
                </div>
              </div>
            </div>

            <div id="builder-toast" class="toast"><i class="fas fa-check-circle"></i><span id="builder-toast-message">Disimpan</span></div>
          </div>
        </div>

        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)]">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 class="text-base font-semibold text-slate-900">Preview Buat Materi</h3>
              <p class="mt-1 text-sm text-slate-500">Tampilan mandiri hasil editor ini tanpa perlu pindah ke tab Editor Materi HTML.</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button id="builder-preview-refresh-btn" type="button" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-700">
                <i class="fas fa-rotate-right mr-2"></i>Refresh Preview
              </button>
            </div>
          </div>
          <div class="bg-slate-100 p-3 sm:p-4">
            <iframe id="builder-preview-frame" title="Preview Buat Materi" sandbox="allow-scripts allow-modals" class="h-[720px] w-full rounded-[24px] border border-slate-200 bg-white"></iframe>
          </div>
        </div>
      </section>

      <section data-material-panel="editor" class="material-tab-panel grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div class="space-y-4">
          <div class="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-5">
            <div class="mb-4">
              <h2 class="text-lg font-semibold text-slate-900">Informasi Materi</h2>
              <p class="mt-1 text-sm text-slate-500">Metadata ini memudahkan Anda merapikan hasil AI tanpa membongkar semua kode.</p>
            </div>

            <div class="space-y-4">
              <div>
                <label class="text-sm font-medium text-slate-700">Relasi Mengajar</label>
                <select id="material-assignment" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100">
                  ${assignmentOptions || '<option value="">Tidak ada relasi aktif</option>'}
                </select>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Judul Materi</label>
                <input id="material-title" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: Polinomial" />
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="text-sm font-medium text-slate-700">Label Kelas</label>
                  <input id="material-level" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: Kelas 11" />
                </div>
                <div>
                  <label class="text-sm font-medium text-slate-700">Bab / Unit</label>
                  <input id="material-chapter" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: Bab 4" />
                </div>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Pertemuan</label>
                <input id="material-meetings" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: 6 pertemuan" />
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Catatan Guru</label>
                <textarea id="material-note" rows="3" class="mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: cek kembali pembahasan contoh 2 dan tambahkan soal HOTS."></textarea>
              </div>
              <div class="flex flex-wrap gap-3">
                <button id="apply-material-metadata-btn" type="button" class="rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(14,165,233,0.9)] transition hover:-translate-y-0.5 hover:from-sky-600 hover:to-cyan-600">Terapkan ke HTML</button>
                <button id="save-material-draft-btn" type="button" class="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Simpan Draft</button>
                <button id="publish-material-btn" type="button" class="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">Publish Materi</button>
                <button id="reset-material-editor-btn" type="button" class="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Draft Baru</button>
              </div>
              <p id="material-status" class="text-sm text-slate-500">Paste HTML dari AI, lalu pilih "Muat Preview" untuk memeriksa hasilnya.</p>
            </div>
          </div>

          <div class="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-5">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-semibold text-slate-900">Sumber HTML AI</h2>
                <p class="mt-1 text-sm text-slate-500">Paste hasil HTML lengkap dari AI di sini. Anda tetap bisa mengedit langsung sebelum preview.</p>
              </div>
              <button id="load-material-preview-btn" type="button" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Muat Preview</button>
            </div>
            <textarea id="material-html-source" rows="24" class="w-full rounded-[24px] border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs leading-6 text-sky-100 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Tempel HTML hasil AI di sini..."></textarea>
          </div>
        </div>

        <div class="space-y-4">
          <div class="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-5">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-semibold text-slate-900">Preview Materi</h2>
                <p class="mt-1 text-sm text-slate-500">Preview berjalan dalam iframe terisolasi agar kode HTML dari AI tetap bisa diuji sebelum disimpan.</p>
              </div>
              <span class="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Review sebelum publish</span>
            </div>
            <iframe id="material-preview-frame" title="Preview materi" sandbox="allow-scripts allow-modals" class="h-[820px] w-full rounded-[24px] border border-slate-200 bg-white"></iframe>
          </div>
        </div>
      </section>

      <section data-material-panel="template" class="material-tab-panel hidden space-y-4">
        <div class="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-5">
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-slate-900">Template Prompt HTML</h2>
              <p class="mt-1 text-sm text-slate-500">Isi form ini untuk menghasilkan prompt yang konsisten sebelum Anda meminta AI membuat HTML materi.</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button id="fill-template-from-editor-btn" type="button" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Ambil dari Editor</button>
            </div>
          </div>

          <div class="rounded-[24px] border border-sky-100 bg-sky-50/70 p-4">
            <div class="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <label class="text-sm font-medium text-slate-700">Preset Template Mapel</label>
                <select id="template-material-preset" class="mt-1.5 w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100">
                  <option value="">Pilih preset mapel...</option>
                  ${templatePresetOptions}
                </select>
              </div>
              <button id="apply-template-preset-btn" type="button" class="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">Terapkan Preset</button>
            </div>
            <p class="mt-3 text-sm text-slate-600">Preset akan mengisi pola tujuan, materi pokok, contoh, latihan, evaluasi, dan gaya visual agar konsisten untuk jenjang SMA Kurikulum Merdeka dengan pendekatan deep learning.</p>
          </div>

          <div class="grid gap-4 lg:grid-cols-2">
            <div class="space-y-4">
              <div>
                <label class="text-sm font-medium text-slate-700">Judul Materi</label>
                <input id="template-material-title" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: Polinomial" />
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="text-sm font-medium text-slate-700">Mata Pelajaran</label>
                  <input id="template-material-mapel" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: Matematika" />
                </div>
                <div>
                  <label class="text-sm font-medium text-slate-700">Kelas/Level</label>
                  <input id="template-material-kelas" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: Kelas 11" />
                </div>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="text-sm font-medium text-slate-700">Bab / Unit</label>
                  <input id="template-material-bab" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: Bab 4" />
                </div>
                <div>
                  <label class="text-sm font-medium text-slate-700">Pertemuan</label>
                  <input id="template-material-pertemuan" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: 6 pertemuan" />
                </div>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Tujuan Pembelajaran</label>
                <textarea id="template-material-tujuan" rows="3" class="mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Tuliskan tujuan pembelajaran utama."></textarea>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Materi Pokok</label>
                <textarea id="template-material-pokok" rows="4" class="mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Tuliskan poin-poin materi inti yang wajib muncul."></textarea>
              </div>
            </div>

            <div class="space-y-4">
              <div>
                <label class="text-sm font-medium text-slate-700">Contoh</label>
                <textarea id="template-material-contoh" rows="3" class="mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh soal, contoh kasus, atau ilustrasi."></textarea>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Latihan</label>
                <textarea id="template-material-latihan" rows="3" class="mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Tuliskan bentuk latihan bertahap yang diinginkan."></textarea>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Evaluasi / Tugas</label>
                <textarea id="template-material-evaluasi" rows="3" class="mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Tuliskan tugas atau evaluasi akhir."></textarea>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Gaya Visual</label>
                <textarea id="template-material-gaya" rows="3" class="mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: modern, kartu membulat, dominan biru, rapi dan ringan.">rapi, modern, mudah dibaca siswa, dominan biru-sky/cyan, kartu membulat</textarea>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Catatan Guru Tambahan</label>
                <textarea id="template-material-catatan" rows="4" class="mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Tuliskan preferensi tambahan untuk AI."></textarea>
              </div>
            </div>
          </div>

          <div class="mt-5 flex flex-wrap gap-3">
            <button id="generate-template-prompt-btn" type="button" class="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">Buat Prompt</button>
            <button id="copy-template-prompt-btn" type="button" class="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Salin Prompt</button>
            <button id="open-chatgpt-btn" type="button" class="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">Menuju ChatGPT</button>
            <button id="open-deepseek-btn" type="button" class="rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100">Menuju DeepSeek</button>
          </div>
          <p id="template-prompt-status" class="mt-3 text-sm text-slate-500">Isi form lalu klik Buat Prompt untuk menghasilkan template prompt HTML.</p>
        </div>

        <div class="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-5">
          <div class="mb-4">
            <h2 class="text-lg font-semibold text-slate-900">Hasil Prompt</h2>
            <p class="mt-1 text-sm text-slate-500">Gunakan prompt ini pada AI Anda agar struktur HTML materi tetap konsisten.</p>
          </div>
          <textarea id="template-prompt-output" rows="20" class="w-full rounded-[24px] border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs leading-6 text-sky-100 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Prompt template akan muncul di sini..."></textarea>
        </div>
      </section>

      <section data-material-panel="daftar" class="material-tab-panel hidden space-y-5">
        <div class="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-slate-900">Draft Materi Tersimpan</h2>
              <p class="mt-1 text-sm text-slate-500">Draft disimpan per guru di browser ini. Klik untuk memuat kembali dan lanjutkan edit.</p>
            </div>
          </div>
          <div id="material-draft-list" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"></div>
        </div>

        <div class="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-slate-900">Materi Dipublikasikan</h2>
              <p class="mt-1 text-sm text-slate-500">Daftar materi yang sudah Anda finalkan. Materi ini siap dipakai ulang atau ditinjau ulang dari browser ini.</p>
            </div>
          </div>
          <div id="material-published-list" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"></div>
        </div>
      </section>

      <section data-material-panel="laporan" class="material-tab-panel hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-5">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-slate-900">Progress Baca Siswa per Materi</h2>
            <p class="mt-1 text-sm text-slate-500">Pantau siapa yang belum buka, sudah buka, berapa durasi baca, dan siapa yang menandai selesai baca.</p>
          </div>
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <div>
            <label class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Filter Kelas</label>
            <select id="material-report-class-filter" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100">
              <option value="">Semua kelas</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Filter Mapel</label>
            <select id="material-report-mapel-filter" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100">
              <option value="">Semua mapel</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Filter Status</label>
            <select id="material-report-status-filter" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100">
              <option value="">Semua status</option>
              <option value="unopened">Belum buka</option>
              <option value="opened">Sudah buka</option>
              <option value="completed">Selesai baca</option>
            </select>
          </div>
        </div>
        <div id="material-report-summary" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"></div>
        <div id="material-report-table" class="mt-4"></div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const assignmentSelect = container.querySelector('#material-assignment');
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

  let activeDraftId = '';
  let drafts = getUserDrafts(session, context);
  let publishedMaterials = await getUserPublishedMaterials(session, context);
  let activeTab = 'editor';
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
      button.className = `material-tab-btn rounded-full px-4 py-2.5 text-sm font-semibold transition ${getTabButtonClass(isActive)}`;
    });
    materialTabPanels.forEach((panel) => {
      const isActive = panel.getAttribute('data-material-panel') === nextTab;
      panel.classList.toggle('hidden', !isActive);
    });
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
    return assignments.find((item) => item.id === assignmentSelect?.value) || selectedAssignment || null;
  }

  function syncMainMetadataFromBuilder() {
    if (builderAssignmentSelect?.value) {
      assignmentSelect.value = builderAssignmentSelect.value;
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
    if (builderAssignmentSelect && assignmentSelect?.value) {
      builderAssignmentSelect.value = assignmentSelect.value;
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
    if (builderAssignmentSelect && assignmentSelect?.value) {
      builderAssignmentSelect.value = assignmentSelect.value;
    }
    previewFrame.srcdoc = '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><style>body{font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#334155;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;}div{max-width:480px;border:1px dashed #cbd5e1;border-radius:24px;background:white;padding:24px;}h2{margin:0 0 12px;font-size:22px;color:#0f172a;}p{margin:0;line-height:1.7;}</style></head><body><div><h2>Preview materi akan muncul di sini</h2><p>Paste HTML hasil AI lalu klik Muat Preview untuk meninjau modul seperti siswa akan melihatnya.</p></div></body></html>';
    setStatus('Editor direset. Tempel HTML baru untuk mulai materi berikutnya.');
  }

  function loadDraft(draft) {
    activeDraftId = draft.id;
    assignmentSelect.value = draft.pengajaran_id || assignmentSelect.value;
    titleInput.value = draft.title || '';
    levelInput.value = draft.level || '';
    chapterInput.value = draft.chapter || '';
    meetingsInput.value = draft.meetings || '';
    noteInput.value = draft.note || '';
    sourceInput.value = draft.html_source || '';
    syncBuilderMetadataFromMain();
    renderPreview(draft.html_source || '');
    setStatus(`Draft dimuat: ${draft.title || 'Tanpa judul'}`);
  }

  function renderDraftList() {
    if (!drafts.length) {
      draftListEl.innerHTML = '<div class="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Belum ada draft materi yang tersimpan untuk guru ini.</div>';
      return;
    }

    draftListEl.innerHTML = drafts
      .slice(0, 12)
      .map((draft) => `
        <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white">
          <div class="flex items-start justify-between gap-3">
            <button type="button" data-draft-id="${draft.id}" class="material-draft-item min-w-0 flex-1 text-left">
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">${draft.kelas_nama || '-'} • ${draft.mapel_nama || '-'}</p>
              <p class="mt-2 text-base font-semibold text-slate-900">${draft.title || 'Tanpa judul'}</p>
            </button>
            <button type="button" data-delete-draft-id="${draft.id}" class="delete-draft-btn rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">Hapus Draft</button>
          </div>
          <button type="button" data-draft-id="${draft.id}" class="material-draft-item mt-2 block w-full text-left">
            <p class="text-sm leading-6 text-slate-500">${draft.note || 'Draft HTML materi siap ditinjau ulang.'}</p>
            <p class="mt-3 text-xs text-slate-400">Diperbarui ${new Date(draft.updated_at).toLocaleString('id-ID')}</p>
          </button>
        </div>
      `)
      .join('');

    draftListEl.querySelectorAll('.material-draft-item').forEach((button) => {
      button.addEventListener('click', () => {
        const draft = drafts.find((item) => item.id === button.getAttribute('data-draft-id'));
        if (draft) {
          loadDraft(draft);
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
  }

  function renderPublishedList() {
    if (!publishedMaterials.length) {
      publishedListEl.innerHTML = '<div class="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Belum ada materi yang dipublikasikan dari browser ini.</div>';
      return;
    }

    publishedListEl.innerHTML = publishedMaterials
      .slice(0, 12)
      .map((material) => `
        <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white">
          <div class="flex items-center justify-between gap-3">
            <button type="button" data-material-id="${material.id}" class="material-published-item min-w-0 flex-1 text-left">
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">${material.kelas_nama || '-'} • ${material.mapel_nama || '-'}</p>
            </button>
            <div class="flex items-center gap-2">
              <span class="rounded-full ${material.visible_to_students === false ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'} px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">${material.visible_to_students === false ? 'Unpublished' : 'Published'}</span>
            </div>
          </div>
          <button type="button" data-material-id="${material.id}" class="material-published-item mt-2 block w-full text-left">
            <p class="text-base font-semibold text-slate-900">${material.title || 'Tanpa judul'}</p>
            <p class="mt-2 text-sm leading-6 text-slate-500">${material.note || 'Materi HTML siap digunakan kembali atau disempurnakan.'}</p>
            <p class="mt-3 text-xs text-slate-400">Dipublikasikan ${new Date(material.published_at || material.updated_at).toLocaleString('id-ID')}</p>
          </button>
          <div class="mt-4 flex flex-wrap gap-2">
            <button type="button" data-toggle-published-id="${material.id}" class="toggle-published-btn rounded-full border ${material.visible_to_students === false ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'} bg-white px-3 py-1.5 text-xs font-semibold transition">${material.visible_to_students === false ? 'Publish Lagi' : 'Unpublish'}</button>
            <button type="button" data-delete-published-id="${material.id}" class="delete-published-btn rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">Hapus Permanen</button>
          </div>
        </div>
      `)
      .join('');

    publishedListEl.querySelectorAll('.material-published-item').forEach((button) => {
      button.addEventListener('click', () => {
        const material = publishedMaterials.find((item) => item.id === button.getAttribute('data-material-id'));
        if (material) {
          loadDraft(material);
          setStatus(`Materi terpublikasi dimuat ulang: ${material.title || 'Tanpa judul'}`);
        }
      });
    });

    publishedListEl.querySelectorAll('.toggle-published-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const materialId = button.getAttribute('data-toggle-published-id');
        const material = publishedMaterials.find((item) => item.id === materialId);
        if (!material) {
          return;
        }

        const confirmed = window.confirm(
          material.visible_to_students === false
            ? `Publish lagi materi "${material.title || 'Tanpa judul'}" untuk siswa?`
            : `Unpublish materi "${material.title || 'Tanpa judul'}" dari tampilan siswa?`
        );
        if (!confirmed) {
          return;
        }

        const nextVisibility = material.visible_to_students === false;
        await savePublishedMaterial({
          ...material,
          visible_to_students: nextVisibility,
          status: nextVisibility ? 'published' : 'unpublished',
        });

        publishedMaterials = await getUserPublishedMaterials(session, context);
        renderPublishedList();
        await renderMaterialReadReport();
        setStatus(nextVisibility ? 'Materi dipublikasikan kembali untuk siswa.' : 'Materi berhasil di-unpublish tanpa dihapus permanen.');
      });
    });

    publishedListEl.querySelectorAll('.delete-published-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const materialId = button.getAttribute('data-delete-published-id');
        if (!materialId) {
          return;
        }

        const material = publishedMaterials.find((item) => item.id === materialId);
        const confirmed = window.confirm(`Hapus permanen materi "${material?.title || 'Tanpa judul'}" dari penyimpanan? Tindakan ini tidak dapat dibatalkan.`);
        if (!confirmed) {
          return;
        }

        await deletePublishedMaterial(materialId);
        publishedMaterials = await getUserPublishedMaterials(session, context);
        renderPublishedList();
        await renderMaterialReadReport();
        setStatus('Materi publish dihapus permanen dari penyimpanan.');
      });
    });
  }

  function buildMaterialPayload() {
    syncMainMetadataFromBuilder();
    const source = sourceInput.value.trim();
    const assignment = getCurrentAssignment();

    if (!source) {
      setStatus('HTML sumber masih kosong.', true);
      return null;
    }

    if (!assignment) {
      setStatus('Relasi mengajar belum tersedia.', true);
      return null;
    }

    return {
      id: activeDraftId || `${assignment.id}_${Date.now()}`,
      pengajaran_id: assignment.id,
      kelas_id: assignment.kelas_id,
      kelas_nama: assignment.kelas_nama,
      kelas_token: normalizeClassToken(assignment.kelas_id || assignment.kelas_nama),
      mapel_id: assignment.mapel_id,
      mapel_nama: assignment.mapel_nama,
      guru_id: String(session?.user?.username || context?.user_logged_in || '').trim().toLowerCase(),
      guru_nama: session?.user?.nama || 'Guru',
      title: titleInput.value.trim() || 'Materi Tanpa Judul',
      level: levelInput.value.trim(),
      chapter: chapterInput.value.trim(),
      meetings: meetingsInput.value.trim(),
      note: noteInput.value.trim(),
      html_source: source,
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
    const draft = buildMaterialPayload();
    if (!draft) {
      return;
    }

    const allDrafts = readDrafts();
    const existingIndex = allDrafts.findIndex((item) => item.id === draft.id);
    if (existingIndex >= 0) {
      allDrafts[existingIndex] = draft;
    } else {
      allDrafts.push(draft);
    }
    writeDrafts(allDrafts);
    activeDraftId = draft.id;
    drafts = getUserDrafts(session, context);
    renderDraftList();
    setStatus('Draft materi HTML berhasil disimpan di browser ini.');
  });

  publishMaterialBtn?.addEventListener('click', async () => {
    const material = buildMaterialPayload();
    if (!material) {
      return;
    }

    const publishedMaterial = {
      ...material,
      status: 'published',
      visible_to_students: true,
      published_at: new Date().toISOString(),
    };

    await savePublishedMaterial(publishedMaterial);

    const allDrafts = readDrafts();
    const draftIndex = allDrafts.findIndex((item) => item.id === material.id);
    if (draftIndex >= 0) {
      allDrafts[draftIndex] = {
        ...allDrafts[draftIndex],
        ...material,
        status: 'published',
        published_at: publishedMaterial.published_at,
      };
      writeDrafts(allDrafts);
    }

    activeDraftId = publishedMaterial.id;
    drafts = getUserDrafts(session, context);
  publishedMaterials = await getUserPublishedMaterials(session, context);
    renderDraftList();
    renderPublishedList();
    await renderMaterialReadReport();
    setStatus('Materi berhasil dipublikasikan dan masuk ke daftar materi tersimpan.');
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
    assignmentSelect.value = builderAssignmentSelect.value;
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
    setActiveTab('editor');
  });
  builderSaveDraftBtn?.addEventListener('click', () => {
    syncBuilderToHtmlEditor();
    const draft = buildMaterialPayload();
    if (!draft) {
      showBuilderToast('Lengkapi relasi mengajar dan judul materi sebelum menyimpan draft.', true);
      return;
    }

    const allDrafts = readDrafts();
    const existingIndex = allDrafts.findIndex((item) => item.id === draft.id);
    if (existingIndex >= 0) {
      allDrafts[existingIndex] = draft;
    } else {
      allDrafts.push(draft);
    }

    writeDrafts(allDrafts);
    activeDraftId = draft.id;
    drafts = getUserDrafts(session, context);
    renderDraftList();
    setStatus('Draft materi HTML berhasil disimpan dari tab Buat Materi.');
    showBuilderToast('Draft berhasil disimpan.');
  });
  builderPublishBtn?.addEventListener('click', async () => {
    syncBuilderToHtmlEditor();
    const material = buildMaterialPayload();
    if (!material) {
      showBuilderToast('Lengkapi relasi mengajar dan judul materi sebelum publish.', true);
      return;
    }

    const publishedMaterial = {
      ...material,
      status: 'published',
      visible_to_students: true,
      published_at: new Date().toISOString(),
    };

    await savePublishedMaterial(publishedMaterial);

    const allDrafts = readDrafts();
    const draftIndex = allDrafts.findIndex((item) => item.id === material.id);
    if (draftIndex >= 0) {
      allDrafts[draftIndex] = {
        ...allDrafts[draftIndex],
        ...material,
        status: 'published',
        published_at: publishedMaterial.published_at,
      };
    } else {
      allDrafts.push({
        ...material,
        status: 'published',
        published_at: publishedMaterial.published_at,
      });
    }

    writeDrafts(allDrafts);
    activeDraftId = publishedMaterial.id;
    drafts = getUserDrafts(session, context);
    publishedMaterials = await getUserPublishedMaterials(session, context);
    renderDraftList();
    renderPublishedList();
    await renderMaterialReadReport();
    setStatus('Materi berhasil dipublikasikan langsung dari tab Buat Materi.');
    showBuilderToast('Materi berhasil dipublish.');
    setActiveTab('daftar');
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
  assignmentSelect?.addEventListener('change', syncBuilderMetadataFromMain);
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

  materialTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.getAttribute('data-material-tab') || 'editor');
    });
  });

  resetEditor();
  loadBuilderContent(localStorage.getItem(builderStorageKey) || getMaterialBuilderStarterContent());
  syncBuilderMetadataFromMain();
  renderBuilderStandalonePreview();
  renderDraftList();
  renderPublishedList();
  await renderMaterialReadReport();
  renderTemplatePrompt();
  setBuilderModeLabel();
  updateBuilderStats();
  setActiveTab(activeTab);
}