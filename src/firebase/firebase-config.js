const firebaseConfig = {
  apiKey: 'AIzaSyBe089utTbOwC6dH2ahXfJw4g_Y92jPNGU',
  authDomain: 'simsmansari.firebaseapp.com',
  projectId: 'simsmansari',
  storageBucket: 'simsmansari.firebasestorage.app',
  messagingSenderId: '436294214547',
  appId: '1:436294214547:web:81d29c588e36359ac9be66',
  measurementId: 'G-WRWWSLRP6R',
};

let app = null;
let auth = null;
let db = null;

if (window.firebase) {
  try {
    if (!window.firebase.apps.length) {
      app = window.firebase.initializeApp(firebaseConfig);
    } else {
      app = window.firebase.apps[0];
    }

    auth = window.firebase.auth(app);

    // Fix #3: Pastikan sesi login bertahan antar buka-tutup aplikasi, termasuk
    // cold start setelah "clear recent" di Android. Persistence LOCAL menyimpan
    // sesi di IndexedDB (bukan hanya memori). Ini default untuk web, tapi kita
    // set eksplisit agar konsisten di WebView Capacitor.
    try {
      auth
        .setPersistence(window.firebase.auth.Auth.Persistence.LOCAL)
        .catch((error) => console.warn('Auth persistence LOCAL gagal diset:', error));
    } catch (error) {
      console.warn('Auth persistence LOCAL tidak didukung:', error);
    }

    db = window.firebase.firestore(app);

    // Persist query/doc snapshots across reloads. `synchronizeTabs` membuat beberapa
    // tab berbagi satu cache IndexedDB; tanpa ini tab kedua gagal mengambil lock dan
    // Firestore mencatat error "Failed to obtain exclusive access".
    // Kegagalan tetap non-fatal: Firestore otomatis memakai memory cache.
    db.enablePersistence({ synchronizeTabs: true }).catch((error) => {
      const code = String(error?.code || '');
      if (code !== 'failed-precondition' && code !== 'unimplemented') {
        console.warn('Firestore offline persistence failed:', error);
      }
    });

    window.firebaseApp = app;
    window.firebaseAuth = auth;
    window.firebaseDb = db;
    window.firebaseConfig = firebaseConfig;

    // Fix #3 (lanjutan): saat koneksi kembali (mis. WebView baru dibuka dari cold
    // start), segarkan ID token supaya sesi custom-token tetap valid tanpa
    // memaksa pengguna login ulang.
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('online', () => {
        try {
          auth?.currentUser?.getIdToken(true).catch(() => {});
        } catch {
          // Abaikan; token akan disegarkan otomatis pada permintaan berikutnya.
        }
      });
    }
  } catch (error) {
    console.warn('Firebase initialization failed, continuing in demo mode:', error);
  }
} else {
  console.warn('Firebase SDK is not available. The app will continue in demo mode.');
}

export { firebaseConfig, app, auth, db };
