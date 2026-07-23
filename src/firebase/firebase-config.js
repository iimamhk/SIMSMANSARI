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
    db = window.firebase.firestore(app);

// Persist query/doc snapshots across reloads. Failure is non-fatal in
    // private browsing or browsers that do not support IndexedDB.
    db.enablePersistence().catch((error) => {
      const code = String(error?.code || '');
      if (code !== 'failed-precondition' && code !== 'unimplemented') {
        console.warn('Firestore offline persistence failed:', error);
      }
    });

    window.firebaseApp = app;
    window.firebaseAuth = auth;
    window.firebaseDb = db;
    window.firebaseConfig = firebaseConfig;
  } catch (error) {
    console.warn('Firebase initialization failed, continuing in demo mode:', error);
  }
} else {
  console.warn('Firebase SDK is not available. The app will continue in demo mode.');
}

export { firebaseConfig, app, auth, db };
