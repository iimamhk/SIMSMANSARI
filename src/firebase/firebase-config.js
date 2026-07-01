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
let db = null;

if (window.firebase) {
  try {
    if (!window.firebase.apps.length) {
      app = window.firebase.initializeApp(firebaseConfig);
    } else {
      app = window.firebase.apps[0];
    }

    db = window.firebase.firestore(app);

    window.firebaseApp = app;
    window.firebaseDb = db;
    window.firebaseConfig = firebaseConfig;
  } catch (error) {
    console.warn('Firebase initialization failed, continuing in demo mode:', error);
  }
} else {
  console.warn('Firebase SDK is not available. The app will continue in demo mode.');
}

export { firebaseConfig, app, db };
