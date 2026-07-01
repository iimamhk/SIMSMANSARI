import { saveDocument } from '../../firebase/data-service.js';

export async function seedInitialData() {
  const mataPelajaran = [
    { id: 'MTK', nama: 'MATEMATIKA UMUM' },
    { id: 'BIND', nama: 'BAHASA INDONESIA' },
    { id: 'BING', nama: 'BAHASA INGGRIS' },
  ];

  const kelas = [
    { id: 'X_1', nama: 'X.1' },
    { id: 'X_2', nama: 'X.2' },
    { id: 'X_3', nama: 'X.3' },
    { id: 'X_4', nama: 'X.4' },
    { id: 'X_5', nama: 'X.5' },
    { id: 'X_6', nama: 'X.6' },
    { id: 'X_7', nama: 'X.7' },
    { id: 'XI_1', nama: 'XI.1' },
    { id: 'XI_2', nama: 'XI.2' },
    { id: 'XI_3', nama: 'XI.3' },
    { id: 'XI_4', nama: 'XI.4' },
    { id: 'XI_5', nama: 'XI.5' },
    { id: 'XI_6', nama: 'XI.6' },
    { id: 'XI_7', nama: 'XI.7' },
    { id: 'XII_1', nama: 'XII.1' },
    { id: 'XII_2', nama: 'XII.2' },
    { id: 'XII_3', nama: 'XII.3' },
    { id: 'XII_4', nama: 'XII.4' },
    { id: 'XII_5', nama: 'XII.5' },
    { id: 'XII_6', nama: 'XII.6' },
    { id: 'XII_7', nama: 'XII.7' },
  ];

  const users = [
    { username: 'iimamhk', password: 'iimamhk', nama: 'Admin Utama SIMGURU', role: 'admin', status: 'active' },
    { username: 'imambudiharto', password: '123456', nama: 'Imam Budiharto, S.Pd.', role: 'guru', status: 'active' },
    { username: 'tatimmatulianah', password: '123456', nama: 'Tatimmatul Ianah, S.Pd.', role: 'guru', status: 'active' },
    { username: 'adityabayupremana', password: '123456', nama: 'Aditya Bayu Permana', role: 'siswa', status: 'active' },
  ];

  for (const item of mataPelajaran) {
    await saveDocument('mata_pelajaran', item, item.id);
  }

  for (const item of kelas) {
    await saveDocument('kelas', item, item.id);
  }

  for (const item of users) {
    await saveDocument('users', item, item.username);
  }
}
