import { renderLayout } from '../../layouts/dashboard-layout.js';
import {
  subscribeChatRooms,
  getChatContacts,
  findOrCreateChatRoom,
} from '../../firebase/data-service.js';
import {
  avatarHtml,
  escapeHtml,
  formatListTime,
  getOtherParticipant,
} from './chat-shared.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

const ROLE_LABEL = { guru: 'Guru', siswa: 'Siswa', admin: 'Admin', wali: 'Wali' };

export async function renderChatListPage(container) {
  const session = getSession();
  if (!session?.user) {
    window.location.hash = '#login';
    return;
  }
  const myUid = session.user.username || session.user.id || '';
  const myNama = session.user.nama || '';

  let unsubscribe = () => {};

  const html = renderLayout('Pesan', `
    <div class="rounded-3xl bg-white shadow-md ring-1 ring-slate-100 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 class="text-lg font-semibold text-slate-900">Pesan</h2>
        <button id="btn-new-chat" type="button" class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:opacity-90 active:scale-95" aria-label="Pesan baru">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </button>
      </div>
      <div id="chat-list" class="divide-y divide-slate-100"></div>
    </div>

    <div id="contact-modal" class="fixed inset-0 z-[60] hidden items-end justify-center bg-black/40 sm:items-center">
      <div class="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl overflow-hidden">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 class="text-base font-semibold text-slate-900">Pesan Baru</h3>
          <button id="btn-close-contact" type="button" class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Tutup">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="p-3">
          <input id="contact-search" type="text" placeholder="Cari nama atau pengguna..." class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/15" />
        </div>
        <div id="contact-list" class="max-h-[60vh] overflow-y-auto px-2 pb-3"></div>
      </div>
    </div>
  `);

  container.innerHTML = html;

  const listEl = container.querySelector('#chat-list');

  function renderList(rooms) {
    if (!rooms.length) {
      listEl.innerHTML = `
        <div class="px-4 py-12 text-center">
          <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.5-.6L3 21l1.3-4A8.4 8.4 0 1 1 21 11.5z"/></svg>
          </div>
          <p class="text-sm font-medium text-slate-600">Belum ada percakapan</p>
          <p class="mt-1 text-xs text-slate-400">Ketuk tombol pesan baru untuk memulai obrolan.</p>
        </div>`;
      return;
    }

    const sorted = [...rooms].sort((a, b) =>
      String(b.last_at || '').localeCompare(String(a.last_at || ''))
    );

    listEl.innerHTML = sorted
      .map((room) => {
        const other = getOtherParticipant(room, myUid);
        const name = other?.nama || 'Pengguna';
        const unread = (room.unread && room.unread[myUid]) || 0;
        const preview = room.last_message
          ? `${room.last_sender_id === myUid ? 'Anda: ' : ''}${escapeHtml(room.last_message)}`
          : 'Mulai percakapan';
        const badge = unread > 0
          ? `<span class="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[11px] font-semibold text-white">${unread > 99 ? '99+' : unread}</span>`
          : '';
        return `
          <a href="#chat/room/${escapeHtml(room.id)}" class="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
            ${avatarHtml(name)}
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-[15px] font-semibold ${unread > 0 ? 'text-slate-900' : 'text-slate-800'}">${escapeHtml(name)}</p>
                <span class="shrink-0 text-[11px] text-slate-400">${formatListTime(room.last_at)}</span>
              </div>
              <div class="mt-0.5 flex items-center justify-between gap-2">
                <p class="truncate text-[13px] ${unread > 0 ? 'font-medium text-slate-700' : 'text-slate-500'}">${preview}</p>
                ${badge}
              </div>
            </div>
          </a>`;
      })
      .join('');
  }

  unsubscribe = subscribeChatRooms(myUid, renderList);

  // Modal kontak
  const modal = container.querySelector('#contact-modal');
  const contactListEl = container.querySelector('#contact-list');
  const searchEl = container.querySelector('#contact-search');

  async function openContacts() {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    contactListEl.innerHTML = '<div class="px-4 py-8 text-center text-sm text-slate-400">Memuat kontak...</div>';
    const contacts = await getChatContacts(myUid);
    renderContacts(contacts, '');
    setTimeout(() => searchEl.focus(), 50);
  }

  function closeContacts() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function renderContacts(contacts, query) {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? contacts.filter((c) =>
          [c.nama, c.username, c.kelas_nama, ROLE_LABEL[c.role]]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        )
      : contacts;

    if (!filtered.length) {
      contactListEl.innerHTML = '<div class="px-4 py-8 text-center text-sm text-slate-400">Tidak ada kontak ditemukan.</div>';
      return;
    }

    contactListEl.innerHTML = filtered
      .map((c) => {
        const role = ROLE_LABEL[c.role] || c.role || '';
        const sub = [role, c.kelas_nama].filter(Boolean).join(' • ');
        return `
          <button type="button" data-username="${escapeHtml(c.username)}" data-nama="${escapeHtml(c.nama || c.username)}" class="contact-item flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-slate-50">
            ${avatarHtml(c.nama || c.username)}
            <div class="min-w-0">
              <p class="truncate text-[15px] font-semibold text-slate-900">${escapeHtml(c.nama || c.username)}</p>
              <p class="truncate text-[12px] text-slate-400">${escapeHtml(sub)}</p>
            </div>
          </button>`;
      })
      .join('');

    contactListEl.querySelectorAll('.contact-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const other = { username: btn.getAttribute('data-username'), nama: btn.getAttribute('data-nama') };
        const room = await findOrCreateChatRoom(myUid, myNama, other);
        closeContacts();
        if (room) {
          window.location.hash = `#chat/room/${room.id}`;
        }
      });
    });
  }

  container.querySelector('#btn-new-chat').addEventListener('click', openContacts);
  container.querySelector('#btn-close-contact').addEventListener('click', closeContacts);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeContacts();
  });
  searchEl.addEventListener('input', async () => {
    const contacts = await getChatContacts(myUid);
    renderContacts(contacts, searchEl.value);
  });

  container.routeCleanup = () => {
    try {
      unsubscribe();
    } catch {
      /* noop */
    }
  };
}
