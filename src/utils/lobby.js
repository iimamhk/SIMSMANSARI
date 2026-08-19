import { deleteDocument, getCollectionDocs, saveDocument } from '../firebase/data-service.js';

const LOBBY_SETTINGS_KEY = 'simguru_lobby_settings';
const LOBBY_SECTIONS_KEY = 'simguru_lobby_sections';
const LOBBY_LINKS_KEY = 'simguru_lobby_links';

const defaultLobbySettings = {
  id: 'public_home',
  // Identitas & konten lobi (dapat diganti admin tanpa mengubah source code).
  logo_url: '',
  school_name: 'SMA Negeri 1 Wanasari',
  slogan: 'Ekosistem pendidikan digital untuk sekolah modern.',
  hero_badge: 'Portal Publik',
  hero_title: 'SIM SMANSARI',
  hero_description: 'Halaman awal untuk informasi publik sekolah.',
  hero_heading: 'Satu platform untuk absensi, nilai, materi, dan kolaborasi sekolah.',
  hero_subheading: 'SIMSMANSARI menyatukan administrasi akademik, pembelajaran, dan AI dalam satu pengalaman yang cepat, rapi, dan mudah digunakan.',
  info_pills: ['Informasi Publik', 'Akses Terarah', 'Tampilan Ringkas'],
  access_badge: 'Akses Sistem',
  access_title: 'Login Pengguna',
  access_description: 'Gunakan tombol berikut untuk masuk ke sistem sesuai hak akses pengguna.',
  access_button_text: 'Buka Halaman Login',
  footer_label: 'Informasi Tambahan',
  footer_title: 'Tambahkan informasi sekolah di sini.',
  // Konten khusus halaman Login (kosong = memakai identitas lobi sebagai fallback).
  login_logo_url: '',
  login_title: 'Selamat datang kembali',
  login_subtitle: 'Masuk dengan akun admin, guru, atau siswa Anda.',
  updated_at: '',
};

const defaultLobbySections = [
  {
    id: 'section_link_penting',
    title: 'Kumpulan Link File Penting',
    slug: 'link-file-penting',
    description: 'Dokumen dan tautan kerja utama sekolah.',
    accent: 'from-emerald-400 via-cyan-400 to-sky-400',
    type: 'link_tree',
    display_theme: 'glass_cards',
    is_active: true,
    requires_token: false,
    access_token: '',
    sort_order: 1,
  },
  {
    id: 'section_rpp',
    title: 'Kumpulan RPP',
    slug: 'kumpulan-rpp',
    description: 'RPP dan perangkat ajar terpusat.',
    accent: 'from-cyan-400 via-sky-400 to-violet-400',
    type: 'link_tree',
    display_theme: 'outline_list',
    is_active: true,
    requires_token: true,
    access_token: 'RPP2026',
    sort_order: 2,
  },
  {
    id: 'section_materi',
    title: 'Kumpulan Materi',
    slug: 'kumpulan-materi',
    description: 'Materi pembelajaran dan bahan pendukung.',
    accent: 'from-sky-400 via-blue-400 to-violet-400',
    type: 'link_tree',
    display_theme: 'compact_strips',
    is_active: true,
    requires_token: false,
    access_token: '',
    sort_order: 3,
  },
  {
    id: 'section_pengumuman',
    title: 'Pengumuman',
    slug: 'pengumuman',
    description: 'Informasi dan agenda terbaru sekolah.',
    accent: 'from-emerald-400 via-teal-400 to-violet-400',
    type: 'card_list',
    display_theme: 'glass_cards',
    is_active: true,
    requires_token: false,
    access_token: '',
    sort_order: 4,
  },
];

const defaultLobbyLinks = [
  { id: 'link_drive_doc_1', section_id: 'section_link_penting', title: 'Drive Dokumen Sekolah', description: 'Akses folder utama dokumen sekolah.', url: '#lobi/link-file-penting', sort_order: 1, is_active: true },
  { id: 'link_form_1', section_id: 'section_link_penting', title: 'Form Administrasi', description: 'Kumpulan formulir administrasi.', url: '#', sort_order: 2, is_active: true },
  { id: 'link_arsip_1', section_id: 'section_link_penting', title: 'Arsip Rapat dan Surat', description: 'Dokumen arsip rapat dan surat.', url: '#', sort_order: 3, is_active: true },
  { id: 'link_rpp_1', section_id: 'section_rpp', title: 'RPP Matematika Kelas X', description: 'Perangkat ajar Matematika kelas X.', url: '#', sort_order: 1, is_active: true },
  { id: 'link_rpp_2', section_id: 'section_rpp', title: 'RPP Bahasa Indonesia Kelas XI', description: 'Perangkat ajar Bahasa Indonesia kelas XI.', url: '#', sort_order: 2, is_active: true },
  { id: 'link_materi_1', section_id: 'section_materi', title: 'Materi Semester Ganjil', description: 'Ringkasan materi semester ganjil.', url: '#', sort_order: 1, is_active: true },
  { id: 'link_materi_2', section_id: 'section_materi', title: 'Slide Presentasi', description: 'Kumpulan slide presentasi kelas.', url: '#', sort_order: 2, is_active: true },
  { id: 'link_pengumuman_1', section_id: 'section_pengumuman', title: 'Agenda Minggu Ini', description: 'Informasi kegiatan sekolah minggu ini.', url: '#', sort_order: 1, is_active: true },
  { id: 'link_pengumuman_2', section_id: 'section_pengumuman', title: 'Jadwal Evaluasi', description: 'Jadwal evaluasi dan asesmen terbaru.', url: '#', sort_order: 2, is_active: true },
  { id: 'link_pengumuman_3', section_id: 'section_pengumuman', title: 'Informasi Layanan Sekolah', description: 'Jam layanan dan kontak penting sekolah.', url: '#', sort_order: 3, is_active: true },
];

function readLocal(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed || fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '').trim();
}

export function slugifyLobbyText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sortByOrder(list) {
  return [...list].sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
}

export function getDefaultLobbyData() {
  return {
    settings: { ...defaultLobbySettings },
    sections: defaultLobbySections.map((item) => ({ ...item })),
    links: defaultLobbyLinks.map((item) => ({ ...item })),
  };
}

// Optimasi read (Fase 1): konten lobi (settings/sections/links) bersifat publik
// dan nyaris tidak berubah. Halaman #home dibuka pengunjung anonim, jadi tiap
// kunjungan dulu = 3 query koleksi. TTL panjang (30 menit) memangkas pembacaan
// berulang; setiap penyimpanan admin memanggil saveDocument yang otomatis
// meng-invalidasi cache koleksi terkait sehingga perubahan tetap cepat tampak.
const LOBBY_CACHE_MS = 1800000;

export async function getLobbySettings() {
  const defaults = getDefaultLobbyData().settings;
  const local = readLocal(LOBBY_SETTINGS_KEY, defaults);

  try {
    const docs = await getCollectionDocs('lobby_settings', { cacheMs: LOBBY_CACHE_MS });
    const record = docs.find((item) => item.id === 'public_home') || docs[0];
    const payload = record ? { ...defaults, ...record } : local;
    writeLocal(LOBBY_SETTINGS_KEY, payload);
    return payload;
  } catch {
    return local;
  }
}

export async function getLobbySections() {
  const defaults = getDefaultLobbyData().sections;
  const local = readLocal(LOBBY_SECTIONS_KEY, defaults);

  try {
    const docs = await getCollectionDocs('lobby_sections', { cacheMs: LOBBY_CACHE_MS });
    const source = docs.length ? docs : local;
    writeLocal(LOBBY_SECTIONS_KEY, source);
    return sortByOrder(source);
  } catch {
    return sortByOrder(local);
  }
}

export async function getLobbyLinks() {
  const defaults = getDefaultLobbyData().links;
  const local = readLocal(LOBBY_LINKS_KEY, defaults);

  try {
    const docs = await getCollectionDocs('lobby_links', { cacheMs: LOBBY_CACHE_MS });
    const source = docs.length ? docs : local;
    writeLocal(LOBBY_LINKS_KEY, source);
    return sortByOrder(source);
  } catch {
    return sortByOrder(local);
  }
}

export async function saveLobbySettings(payload) {
  const normalized = {
    ...defaultLobbySettings,
    ...payload,
    id: 'public_home',
    updated_at: new Date().toISOString(),
  };
  writeLocal(LOBBY_SETTINGS_KEY, normalized);
  try {
    await saveDocument('lobby_settings', normalized, 'public_home');
  } catch {
    // local fallback already written
  }
  return normalized;
}

export async function saveLobbySection(payload) {
  const local = await getLobbySections();
  const id = normalizeText(payload.id) || `section_${Date.now()}`;
  const normalized = {
    id,
    title: normalizeText(payload.title),
    slug: slugifyLobbyText(payload.slug || payload.title),
    description: normalizeText(payload.description),
    accent: normalizeText(payload.accent) || 'from-emerald-400 via-cyan-400 to-sky-400',
    type: normalizeText(payload.type) || 'link_tree',
    display_theme: normalizeText(payload.display_theme) || 'glass_cards',
    is_active: Boolean(payload.is_active),
    requires_token: Boolean(payload.requires_token),
    access_token: normalizeText(payload.access_token),
    sort_order: Number(payload.sort_order || local.length + 1),
    updated_at: new Date().toISOString(),
  };

  const next = local.some((item) => item.id === id)
    ? local.map((item) => (item.id === id ? { ...item, ...normalized } : item))
    : [...local, normalized];
  writeLocal(LOBBY_SECTIONS_KEY, next);
  try {
    await saveDocument('lobby_sections', normalized, id);
  } catch {
    // local fallback already written
  }
  return normalized;
}

export async function saveLobbyLink(payload) {
  const local = await getLobbyLinks();
  const id = normalizeText(payload.id) || `link_${Date.now()}`;
  const normalized = {
    id,
    section_id: normalizeText(payload.section_id),
    title: normalizeText(payload.title),
    description: normalizeText(payload.description),
    url: normalizeText(payload.url),
    sort_order: Number(payload.sort_order || local.filter((item) => item.section_id === payload.section_id).length + 1),
    is_active: Boolean(payload.is_active),
    updated_at: new Date().toISOString(),
  };

  const next = local.some((item) => item.id === id)
    ? local.map((item) => (item.id === id ? { ...item, ...normalized } : item))
    : [...local, normalized];
  writeLocal(LOBBY_LINKS_KEY, next);
  try {
    await saveDocument('lobby_links', normalized, id);
  } catch {
    // local fallback already written
  }
  return normalized;
}

export async function removeLobbySection(id) {
  const localSections = await getLobbySections();
  const localLinks = await getLobbyLinks();
  const nextSections = localSections.filter((item) => item.id !== id);
  const nextLinks = localLinks.filter((item) => item.section_id !== id);
  writeLocal(LOBBY_SECTIONS_KEY, nextSections);
  writeLocal(LOBBY_LINKS_KEY, nextLinks);
  try {
    await deleteDocument('lobby_sections', id);
  } catch {
    // local fallback already applied
  }
  const linksToDelete = localLinks.filter((item) => item.section_id === id);
  await Promise.all(linksToDelete.map(async (item) => {
    try {
      await deleteDocument('lobby_links', item.id);
    } catch {
      // local fallback already applied
    }
  }));
}

export async function removeLobbyLink(id) {
  const local = await getLobbyLinks();
  writeLocal(LOBBY_LINKS_KEY, local.filter((item) => item.id !== id));
  try {
    await deleteDocument('lobby_links', id);
  } catch {
    // local fallback already applied
  }
}

export async function getLobbyPayload() {
  const [settings, sections, links] = await Promise.all([
    getLobbySettings(),
    getLobbySections(),
    getLobbyLinks(),
  ]);
  return { settings, sections, links };
}

export function getLobbySectionLinks(links, sectionId) {
  return sortByOrder((links || []).filter((item) => item.section_id === sectionId && item.is_active !== false));
}

export function getLobbySectionBySlug(sections, slug) {
  return (sections || []).find((item) => item.slug === slug && item.is_active !== false) || null;
}

export function isLobbyTokenValid(section, providedToken) {
  if (!section?.requires_token) {
    return true;
  }
  return normalizeText(section.access_token) === normalizeText(providedToken);
}
