Target Platform: Mobile-First Web App (Firebase Firestore + Vanilla JavaScript + TailwindCSS)
Desain Sistem: Premium Minimalist (iOS Design System Theme)
DAFTAR ISI
1.	OVERVIEW & TUJUAN UTAMA
2.	SPESIFIKASI TEKNOLOGI & STANDAR DESAIN (iOS THEME)
3.	STRUKTUR PROYEK & STRATEGI FILE
4.	ARSITEKTUR DATABASE FIRESTORE (ANTI-BERANTAKAN & HEMAT KUOTA)
5.	ALUR AUTENTIKASI STRING MATCHING & MANAJEMEN SESI LOKAL
6.	ROADMAP PENGEMBANGAN BERTAHAP (PROMPT AI COPILOT READY)
7.	DATA MASTER AWAL & AKUN DEFAULT
8.	ACCEPTANCE CRITERIA
1. OVERVIEW & TUJUAN UTAMA
1.1 Tujuan Aplikasi
SIMGURU adalah platform manajemen internal SMAN 1 Wanasari untuk mengelola kegiatan akademik secara berkelanjutan. Aplikasi dirancang agar dapat digunakan multi-tahun ajaran dan multi-semester menggunakan satu basis master data yang sama tanpa menumpuk atau mencampuradukkan data nilai dan absensi antar periode.
1.2 Masalah Utama yang Diselesaikan
•	Penyaringan Data Guru (Silo Access): Guru hanya dapat melihat, menginput, dan mengedit data pada kelas dan mata pelajaran yang ditugaskan kepada mereka di semester aktif.
•	Efisiensi Biaya (Anti-Limit Read): Meminimalkan konsumsi kuota pembacaan (read) Firestore paket gratis (maksimal 50.000 per hari) dengan memaksimalkan teknik denormalisasi NoSQL dan local caching.
•	Keberlanjutan Sistem: Ketika semester berganti (misal dari Semester 1 ke Semester 2), admin cukup mengubah satu parameter konfigurasi. Lembar input guru akan otomatis bersih kembali untuk periode baru, sementara data lama tetap tersimpan rapi untuk kebutuhan arsip.
2. SPESIFIKASI TEKNOLOGI & STANDAR DESAIN (iOS THEME)
2.1 Stack Teknologi & Kredensial Firebase
•	Frontend: HTML5 Semantik, TailwindCSS v3 (via CDN), Vanilla JavaScript (ES6 Modules murni tanpa framework).
•	Routing: Hash-based Client-Side Routing (#login, #admin/dashboard, #guru/absen).
•	Database & Storage: Firebase Firestore (SDK v10+) dan Firebase Storage.
•	Kredensial Produksi Proyek (Wajib Digunakan Langsung):
JavaScript
const firebaseConfig = {
  apiKey: "AIzaSyBe089utTbOwC6dH2ahXfJw4g_Y92jPNGU",
  authDomain: "simsmansari.firebaseapp.com",
  projectId: "simsmansari",
  storageBucket: "simsmansari.firebasestorage.app",
  messagingSenderId: "436294214547",
  appId: "1:436294214547:web:81d29c588e36359ac9be66",
  measurementId: "G-WRWWSLRP6R"
};
2.2 Panduan Antarmuka (iOS Premium Style Guide)
Untuk menciptakan kesan profesional ala ekosistem Apple iOS, Copilot wajib mengikuti aturan Tailwind berikut:
•	Warna Latar Belakang: Gunakan warna abu-abu ultra-terang khas iOS (bg-[#F2F2F7] atau bg-slate-50).
•	Warna Kartu/Komponen: Putih bersih (bg-white) dengan sudut membulat lebar (rounded-2xl atau rounded-xl).
•	Efek Bayangan (Shadow): Sangat tipis dan halus (shadow-sm atau shadow-[0_2px_8px_rgba(0,0,0,0.04)]).
•	Tipografi: Gunakan font-system iOS (font-sans dengan prioritas Inter atau SF Pro). Bobot tulisan tebal menggunakan font-semibold.
•	Komponen Input: Input teks harus memiliki border abu-abu tipis halus (border-slate-200), efek fokus melengkung biru iOS (focus:ring-2 focus:ring-blue-500 focus:border-transparent), dan berlatar belakang agak abu-abu saat kosong (bg-slate-50).
•	Tombol Kontrol: Warna utama menggunakan Biru iOS (bg-[#007AFF] hover:bg-[#0063CC] text-white rounded-xl transition-all duration-200).
3. STRUKTUR PROYEK
Aplikasi harus dibangun dengan hierarki file yang bersih agar Copilot tidak menumpuk semua logika dalam satu berkas besar:
SIMGURU/
├── src/
│   ├── firebase/
│   │   ├── firebase-config.js      <-- Inisialisasi DB + Fitur Offline Cache Aktif
│   │   ├── auth-service.js         <-- Logika login string matching & Session Writer
│   │   └── data-service.js         <-- Wrapper CRUD & Fungsi Sinkronisasi LocalStorage
│   ├── layouts/
│   │   └── dashboard-layout.js     <-- Layout iOS Sidebar/Bottom Nav & Header
│   ├── pages/
│   │   ├── login.js                <-- Halaman Login Minimalis iOS Style
│   │   ├── admin/
│   │   │   ├── dashboard.js
│   │   │   ├── pengatur-sistem.js  <-- Tempat ganti Tahun Ajaran & Semester aktif
│   │   │   ├── master-guru.js      <-- Manajemen Guru + Fitur Account Generator
│   │   │   ├── master-siswa.js     <-- Manajemen Siswa
│   │   │   ├── master-akademik.js  <-- Manajemen Kelas & Mapel
│   │   │   └── plotting-jadwal.js  <-- Mengunci relasi Guru-Mapel-Kelas (Koleksi Pengajaran)
│   │   ├── guru/
│   │   │   ├── dashboard.js        <-- Menampilkan ringkasan mengajar semester aktif
│   │   │   ├── input-absen.js      <-- Dropdown otomatis terkunci hanya pada kelas miliknya
│   │   │   └── input-nilai.js      <-- Lembar nilai tugas & ujian terfilter
│   │   └── siswa/
│   │       └── dashboard.js        <-- Info nilai & absensi milik siswa bersangkutan
│   ├── utils/
│   │   ├── router.js               <-- Router berbasis hash event listener
│   │   ├── auth-guard.js           <-- Interceptor pembatas hak rute halaman via LocalStorage
│   │   └── helpers.js              <-- String cleaner untuk auto-generate username
│   └── index.html                  <-- Titik masuk utama aplikasi (Single Page Container)
├── setup-database.html             <-- Skrip inisialisasi dokumen konfigurasi awal
└── firebase.json
4. ARSITEKTUR DATABASE FIRESTORE (ANTI-BERANTAKAN)
Setiap dokumen transaksional wajib mencatat tahun_ajaran_id dan semester_id. Data teks penting seperti nama guru atau kelas wajib disalin langsung (denormalisasi) ke dalam dokumen transaksi agar aplikasi tidak perlu membaca koleksi lain secara berulang-ulang.
4.1 Koleksi Sistem (Global Kontrol)
settings (ID Dokumen Tunggal: simguru_config)
JSON
{
  "tahun_ajaran_aktif_id": "2026_2027",
  "tahun_ajaran_aktif_nama": "2026/2027",
  "semester_aktif_id": "2026_2027_1",
  "semester_aktif_nama": "Semester 1 (Ganjil)",
  "updated_at": "Timestamp"
}
4.2 Koleksi Master (Statis)
users (ID Dokumen: username hasil generate)
JSON
{
  "username": "imambudiharto",
  "password": "12345",
  "nama": "Imam Budiharto, S.Pd.",
  "role": "guru",
  "status": "active"
}
mata_pelajaran (ID Dokumen: kode_mapel)
JSON
{ "id": "MTK", "nama": "MATEMATIKA UMUM" }
kelas (ID Dokumen: kode_kelas)
JSON
{ "id": "X_1", "nama": "X.1" }
4.3 Koleksi Plotting Relasi
pengajaran (ID Dokumen: Otomatis)
Berfungsi mengunci tugas mengajar guru per semester.
JSON
{
  "tahun_ajaran_id": "2026_2027",
  "semester_id": "2026_2027_1",
  "guru_id": "imambudiharto",
  "guru_nama": "Imam Budiharto, S.Pd.",
  "mapel_id": "MTK",
  "mapel_nama": "MATEMATIKA UMUM",
  "kelas_id": "X_1",
  "kelas_nama": "X.1",
  "hari": "Senin",
  "jam_ke": "1-3"
}
anggota_kelas (ID Dokumen: tahun_ajaran_id + _ + siswa_id)
Berfungsi mencatat daftar siswa di kelas tertentu pada tahun ajaran spesifik.
JSON
{
  "tahun_ajaran_id": "2026_2027",
  "kelas_id": "X_1",
  "kelas_nama": "X.1",
  "siswa_id": "adityabayupermana",
  "siswa_nama": "ADITYA BAYU PERMANA",
  "nomor_absen": 1
}
4.4 Koleksi Transaksional (Berkala)
absensi
JSON
{
  "tahun_ajaran_id": "2026_2027",
  "semester_id": "2026_2027_1",
  "pengajaran_id": "ID_DOKUMEN_PENGAJARAN",
  "kelas_id": "X_1",
  "siswa_id": "adityabayupermana",
  "siswa_nama": "ADITYA BAYU PERMANA",
  "tanggal": "2026-06-25",
  "status": "H" 
}
nilai_tugas
JSON
{
  "tahun_ajaran_id": "2026_2027",
  "semester_id": "2026_2027_1",
  "pengajaran_id": "ID_DOKUMEN_PENGAJARAN",
  "kelas_id": "X_1",
  "mapel_id": "MTK",
  "siswa_id": "adityabayupermana",
  "nama_tugas": "Tugas 1 Aljabar",
  "nilai": 90
}
5. ALUR AUTENTIKASI STRING MATCHING & MANAJEMEN SESI LOKAL
5.1 Mekanisme Login
Aplikasi mengabaikan modul Firebase Authentication bawaan dan beralih penuh pada validasi string teks:
1.	Form Login menerima input username dan password.
2.	Aplikasi mencari dokumen di koleksi users di mana properti username == input_username.
3.	Jika ditemukan, string password dari database dicocokkan dengan input pengguna.
4.	Jika valid, enkapsulasi data sesi disimpan ke localStorage dengan nama kunci simguru_session.
5.2 Pemeliharaan Konteks Aplikasi (App Context)
Ketika user berhasil masuk, sistem wajib memuat data konfigurasi aktif sekolah dari dokumen settings/simguru_config dan menyimpannya di memori lokal browser:
JavaScript
localStorage.setItem('simguru_context', JSON.stringify({
  tahun_ajaran_aktif: "2026_2027",
  semester_aktif: "2026_2027_1",
  user_logged_in: "imambudiharto",
  role: "guru",
  nama_lengkap: "Imam Budiharto, S.Pd."
}));
6. ROADMAP PENGEMBANGAN BERTAHAP (PROMPT AI READY)
FASE 1: Fondasi Proyek & Konfigurasi Cache Database
PROMPT AI: > "Buat struktur berkas dasar untuk aplikasi SIMGURU sesuai spesifikasi PRD. Tulis file src/firebase/firebase-config.js menggunakan Firebase SDK v10+. Gunakan konfigurasi proyek resmi berikut secara eksklusif:
JavaScript
const firebaseConfig = {
  apiKey: 'AIzaSyBe089utTbOwC6dH2ahXfJw4g_Y92jPNGU',
  authDomain: 'simsmansari.firebaseapp.com',
  projectId: 'simsmansari',
  storageBucket: 'simsmansari.firebasestorage.app',
  messagingSenderId: '436294214547',
  appId: '1:436294214547:web:81d29c588e36359ac9be66',
  measurementId: 'G-WRWWSLRP6R'
};
Konfigurasikan inisialisasi Firestore agar mengaktifkan fitur persistentLocalCache dan persistentMultipleTabManager untuk menghemat kuota pembacaan data. Jangan mengimpor atau menggunakan getAuth dari Firebase Auth karena sistem login kita menggunakan pencocokan string mandiri pada koleksi data."
FASE 2: Inisialisasi Kontrol Sistem Sistem & Router iOS Style
PROMPT AI: > "Buat berkas setup-database.html yang berfungsi membuat dokumen konfigurasi awal di Firestore pada koleksi settings dengan ID dokumen simguru_config. Dokumen tersebut harus berisi kolom: tahun_ajaran_aktif_id: '2026_2027', tahun_ajaran_aktif_nama: '2026/2027', semester_aktif_id: '2026_2027_1', dan semester_aktif_nama: 'Semester 1 (Ganjil)'. Selanjutnya, buat file src/utils/router.js berbasis hash listener beserta file src/pages/login.js dengan desain antarmuka bersih, elegan, minimalis bernuansa premium iOS (latar belakang lembut #F2F2F7, komponen melengkung rounded-2xl, tombol biru cerah #007AFF)."

FASE 3: Logika Autentikasi Teks & Pembatasan Akses Halaman
PROMPT AI: > "Tulis file src/firebase/auth-service.js untuk mengelola fungsi login. Buat fungsi loginUser(username, password) yang melakukan kueri ke koleksi users di Firestore berdasarkan parameter username. Jika dokumen ditemukan, cocokkan string password-nya secara langsung. Jika sesuai, simpan informasi sesi user beserta parameter kontrol dari settings/simguru_config ke dalam localStorage dengan nama kunci simguru_session dan simguru_context. Buat file src/utils/auth-guard.js untuk memeriksa ketersediaan sesi di localStorage setiap kali rute halaman berubah, dan tendang pengguna kembali ke rute #login jika sesi tidak ditemukan."
FASE 4: Modul Kontrol Aturan Global Sekolah (Admin Mode)
PROMPT AI: > "Buat halaman src/pages/admin/pengatur-sistem.js khusus untuk role Admin. Halaman ini berfungsi untuk memperbarui isi dokumen settings/simguru_config. Sediakan form iOS-style untuk mengubah Tahun Ajaran Aktif (pilihan dropdown) dan Semester Aktif. Perubahan pada form ini harus langsung memperbarui isi localStorage.getItem('simguru_context') di sisi klien agar seluruh modul input guru mendeteksi perubahan parameter waktu tersebut."
FASE 5: Pembuat Akun Otomatis & Manajemen Master Data
PROMPT AI: > "Buat halaman komponen manajemen untuk master-guru.js, master-siswa.js, dan master-akademik.js menggunakan tata letak tabel minimalis iOS dengan fitur pencarian teks. Pada form penambahan guru dan siswa baru, implementasikan fungsi utilitas generator username otomatis. Fungsi tersebut harus memproses nama inputan menjadi huruf kecil semua, membuang spasi, menghilangkan semua gelar akademik/tanda baca, dan menyimpannya sebagai ID dokumen unik di koleksi users dengan nilai password default string '12345'."
FASE 6: Modul Pengunci Relasi Jadwal (Plotting Pengajaran)
PROMPT AI: > "Buat modul admin src/pages/admin/plotting-jadwal.js. Halaman ini harus menyediakan form untuk mengaitkan Guru, Mata Pelajaran, dan Kelas untuk periode berjalan. Ketika relasi tersebut disimpan ke dalam koleksi pengajaran, pastikan aplikasi mengambil nilai parameter tahun_ajaran_id dan semester_id yang sedang aktif dari simguru_context, serta menduplikasi properti teks (guru_nama, mapel_nama, kelas_nama) secara eksplisit ke dalam dokumen tersebut sebelum diunggah demi mencegah kueri join di kemudian hari."
FASE 7: Antarmuka Khusus Guru & Penyaringan Otomatis Semester Aktif
PROMPT AI: > "Buat modul halaman input untuk src/pages/guru/input-absen.js and src/pages/guru/input-nilai.js. Saat halaman ini dimuat oleh pengguna ber-role guru, jalankan fungsi kueri yang mengambil data dari koleksi pengajaran di mana guru_id == user_logged_in dan semester_id == semester_aktif dari data sesi lokal. Hasil kueri tersebut harus digunakan untuk mengisi pilihan menu dropdown 'Pilih Kelas & Mapel Anda'. Guru sama sekali tidak boleh melihat kelas atau mata pelajaran yang tidak diajarkan oleh mereka pada semester aktif tersebut."
FASE 8: Modul Penginputan Lembar Kerja Transaksional Berkala
PROMPT AI: > "Selesaikan logika pemrosesan data pada modul input absensi dan nilai milik guru. Ketika sebuah kelas dipilih dari dropdown hasil Fase 7, aplikasi harus mencari daftar siswa yang terdaftar di kelas tersebut melalui koleksi anggota_kelas berdasarkan parameter tahun_ajaran_id aktif. Tampilkan daftar siswa dalam urutan nomor absen yang rapi dengan tombol pilihan status absensi (Hadir, Sakit, Izin, Alfa) bergaya segmen iOS atau form nilai tugas angka. Saat tombol simpan ditekan, seluruh data transaksional wajib tersimpan ke koleksi absensi atau nilai_tugas dengan menyertakan referensi lengkap id pengajaran, id semester, dan id tahun ajaran berjalan."
7. DATA MASTER AWAL & AKUN DEFAULT
Untuk keperluan inisialisasi awal pada skrip setup-seed.html, pasang data terstruktur berikut:
7.1 Referensi Mata Pelajaran
•	MTK -> MATEMATIKA UMUM
•	BIND -> BAHASA INDONESIA
•	BING -> BAHASA INGGRIS
7.2 Referensi Kelas awal
•	X_1 (X.1), sampai X_7 (X.), XI_1 (XI.1) sampai XI_7, XII_1 (XII.1) sampai XII_7
7.3 Data Akun Master Awal (Format String Kredensial)
Role	Nama Lengkap	Username (ID Dokumen)	Password Default
Admin	Admin Utama SIMGURU	iimamhk	iimamhk
Guru	Imam Budiharto, S.Pd.	imambudiharto	123456
Guru	Tatimmatul Ianah, S.Pd.	tatimmatulianah	123456
Siswa	Aditya Bayu Permana	adityabayupremana	123456
8. ACCEPTANCE CRITERIA (KRITERIA PENERIMAAN)
Aplikasi SIMGURU dinyatakan sukses dan selesai dikembangkan jika memenuhi kriteria mutlak berikut:
1.	Validasi Pergantian Periode: Ketika Admin mengubah status sistem dari Semester 1 ke Semester 2 pada menu pengaturan, halaman input nilai milik guru imambudiharto di kelas X.1 otomatis menjadi kosong (bersih), namun data nilai tugas Semester 1 milik siswa tetap aman tersimpan di database dan bisa diakses kembali saat admin mengembalikan setelan sistem ke Semester 1.
2.	Keterisolasian Akses Guru: Saat guru bernama tatimmatulianah masuk ke aplikasi, pilihan menu input absensi hanya menampilkan kelas dan mata pelajaran yang didefinisikan untuk dirinya pada koleksi pengajaran di semester berjalan.
3.	Efisiensi Limit Read: Tidak ada fungsi pemanggilan kueri Firestore (getDoc / getDocs) yang diletakkan di dalam perulangan array (forEach / map). Tampilan tabel daftar nama siswa atau jadwal mengajar wajib memanfaatkan properti teks terdenormalisasi yang sudah ditanam di dalam dokumen induk.
4.	Keselarasan Visual: Seluruh elemen halaman konsisten menggunakan skema warna latar belakang abu-abu terang iOS, sudut lengkungan kartu yang lebar, dan tidak ada distorsi visual saat diakses melalui peramban ponsel pintar (mobile browser responsive).

