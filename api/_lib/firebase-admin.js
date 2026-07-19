const admin = require('firebase-admin');

function getCredential() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (rawServiceAccount) {
    const serviceAccount = JSON.parse(rawServiceAccount);
    return admin.credential.cert(serviceAccount);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Konfigurasi Firebase Admin belum lengkap.');
  }
  return admin.credential.cert({ projectId, clientEmail, privateKey });
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  return admin.initializeApp({ credential: getCredential() });
}

function getFirestore() {
  return getAdminApp().firestore();
}

function getAuth() {
  return getAdminApp().auth();
}

module.exports = { getAuth, getFirestore };
