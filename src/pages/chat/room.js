import { renderLayout } from '../../layouts/dashboard-layout.js';
import {
  subscribeChatMessages,
  loadOlderChatMessages,
  sendChatMessage,
  deleteChatMessage,
  markChatRoomRead,
  getChatRoom,
} from '../../firebase/data-service.js';
import {
  avatarHtml,
  escapeHtml,
  formatChatTime,
  getOtherParticipant,
  CHAT_EMOJIS,
} from './chat-shared.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

const PAGE_SIZE = 30;

export async function renderChatRoomPage(container, roomId) {
  const session = getSession();
  if (!session?.user) {
    window.location.hash = '#login';
    return;
  }
  const myUid = session.user.username || session.user.id || '';
  const myNama = session.user.nama || '';

  if (!roomId) {
    window.location.hash = '#chat';
    return;
  }

  const room = await getChatRoom(roomId);
  const other = room ? getOtherParticipant(room, myUid) : null;
  const otherName = other?.nama || 'Percakapan';

  const messagesMap = new Map();
  let hasMore = true;
  let loadingOlder = false;
  let unsubscribe = () => {};

   const html = renderLayout(otherName, `
    <div class="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#0B141A] pb-[5.5rem] md:pb-0">
      <style>
        .msg-del { display: none; }
        .msg-row:hover .msg-del,
        .msg-row.menu-open .msg-del { display: flex; }
        .msg-row.menu-open .bubble-active { box-shadow: 0 0 0 2px rgba(0,128,105,0.45); }
      </style>
      <div class="flex items-center gap-2 border-b border-black/10 bg-[#008069] px-3 py-2 text-white shadow-sm">
        <a href="#chat" class="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10" aria-label="Kembali">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </a>
        ${avatarHtml(otherName, 'h-9 w-9 ring-2 ring-white/30')}
        <div class="min-w-0">
          <p class="truncate text-[15px] font-semibold leading-tight">${escapeHtml(otherName)}</p>
          <p class="text-[11px] leading-tight text-white/70">Pesan</p>
        </div>
      </div>

      <div id="chat-scroll" class="flex-1 overflow-y-auto px-3 py-3" style="scroll-behavior:smooth;background-image:linear-gradient(135deg,#d9dbd4 0%,#c9d6c2 100%);">
        <div id="chat-older" class="pb-1 text-center"></div>
        <div id="chat-messages" class="flex flex-col gap-1"></div>
      </div>

      <div id="emoji-panel" class="hidden border-t border-black/5 bg-[#f0f2f5] p-2">
        <div class="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto">
          ${CHAT_EMOJIS.map((e) => `<button type="button" class="emoji-btn flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:bg-slate-200">${e}</button>`).join('')}
        </div>
      </div>

      <div class="flex items-end gap-2 bg-[#f0f2f5] px-2.5 py-2">
        <button id="btn-emoji" type="button" class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200" aria-label="Emoji">
          <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/></svg>
        </button>
        <textarea id="chat-input" rows="1" placeholder="Ketik pesan" class="max-h-32 min-h-[40px] flex-1 resize-none rounded-3xl border border-transparent bg-white px-4 py-2.5 text-[15px] leading-snug text-slate-800 outline-none transition focus:border-[#25D366]"></textarea>
        <button id="btn-send" type="button" class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-40" aria-label="Kirim">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>
        </button>
      </div>
    </div>
  `);

  container.innerHTML = html;

  const scrollEl = container.querySelector('#chat-scroll');
  const messagesEl = container.querySelector('#chat-messages');
  const olderEl = container.querySelector('#chat-older');
  const inputEl = container.querySelector('#chat-input');
  const sendBtn = container.querySelector('#btn-send');
  const emojiBtn = container.querySelector('#btn-emoji');
  const emojiPanel = container.querySelector('#emoji-panel');

  function sortedMessages() {
    return [...messagesMap.values()].sort((a, b) => {
      const t = String(a.created_at).localeCompare(String(b.created_at));
      if (t !== 0) return t;
      return String(a.id).localeCompare(String(b.id));
    });
  }

   function renderMessages() {
    const list = sortedMessages();
    if (!list.length) {
      messagesEl.innerHTML = `
        <div class="py-10 text-center">
          <p class="text-[13px] text-slate-500">Belum ada pesan. Mulai percakapan sekarang.</p>
        </div>`;
    } else {
      messagesEl.innerHTML = list
        .map((msg) => {
          const out = msg.sender_id === myUid;
          return `
            <div class="msg-row group flex ${out ? 'justify-end' : 'justify-start'}" data-id="${msg.id}">
              <div class="relative flex ${out ? 'flex-row-reverse' : 'flex-row'} items-center gap-1 max-w-[82%]">
                <div class="bubble-active max-w-full rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-[0_1px_1.5px_rgba(11,20,26,0.18)] ${out ? 'rounded-br-md bg-[#D9FDD3] text-[#0B141A]' : 'rounded-bl-md bg-white text-[#0B141A]'}">
                  <p class="whitespace-pre-wrap break-words">${escapeHtml(msg.text)}</p>
                  <p class="mt-0.5 text-right text-[10px] text-[#667781]">${formatChatTime(msg.created_at)}</p>
                </div>
                <button type="button" data-action="delete" aria-label="Hapus pesan" class="msg-del hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-rose-600 shadow ring-1 ring-black/5 transition hover:bg-rose-50">
                  <svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </div>`;
        })
        .join('');
    }

    olderEl.innerHTML = hasMore
      ? `<button id="btn-older" type="button" class="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-slate-100 transition hover:text-[#25D366]">Muat pesan lama</button>`
      : (messagesMap.size > PAGE_SIZE ? '<span class="text-[10px] text-slate-400">Awal percakapan</span>' : '');

    const olderBtn = olderEl.querySelector('#btn-older');
    if (olderBtn) {
      olderBtn.addEventListener('click', loadOlder);
    }
  }

  function scrollToBottom() {
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  function renderAndMaybeScroll() {
    const nearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 90;
    renderMessages();
    if (!loadingOlder && nearBottom) {
      scrollToBottom();
    }
  }

  async function loadOlder() {
    if (loadingOlder || !hasMore) return;
    const list = sortedMessages();
    if (!list.length) return;
    const oldest = list[0];
    loadingOlder = true;
    const prevHeight = scrollEl.scrollHeight;
    const prevTop = scrollEl.scrollTop;
    const batch = await loadOlderChatMessages(roomId, oldest, PAGE_SIZE);
    batch.forEach((m) => messagesMap.set(m.id, m));
    if (batch.length < PAGE_SIZE) hasMore = false;
    loadingOlder = false;
    renderMessages();
    scrollEl.scrollTop = prevTop + (scrollEl.scrollHeight - prevHeight);
  }

  function onSnapshot(docs) {
    docs.forEach((m) => messagesMap.set(m.id, m));
    renderAndMaybeScroll();
    const list = sortedMessages();
    if (list.length && list[list.length - 1].sender_id !== myUid) {
      markChatRoomRead(roomId, myUid);
    }
  }

  unsubscribe = subscribeChatMessages(roomId, onSnapshot);
  markChatRoomRead(roomId, myUid);

  function send() {
    const text = inputEl.value;
    if (!text.trim()) return;
    sendChatMessage(roomId, myUid, myNama, text);
    inputEl.value = '';
    autoGrow();
    updateSendState();
    scrollToBottom();
  }

  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 112)}px`;
  }

  function updateSendState() {
    sendBtn.disabled = !inputEl.value.trim();
  }

  inputEl.addEventListener('input', () => {
    autoGrow();
    updateSendState();
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  sendBtn.addEventListener('click', send);

  emojiBtn.addEventListener('click', () => {
    emojiPanel.classList.toggle('hidden');
  });
  emojiPanel.querySelectorAll('.emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const start = inputEl.selectionStart || inputEl.value.length;
      const end = inputEl.selectionEnd || inputEl.value.length;
      inputEl.value = inputEl.value.slice(0, start) + btn.textContent + inputEl.value.slice(end);
      inputEl.focus();
      autoGrow();
      updateSendState();
    });
  });

  function closeMenus() {
    messagesEl.querySelectorAll('.msg-row.menu-open').forEach((r) => r.classList.remove('menu-open'));
  }

  messagesEl.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-action="delete"]');
    if (delBtn) {
      e.stopPropagation();
      const row = delBtn.closest('.msg-row');
      const id = row?.dataset.id;
      if (id && window.confirm('Hapus pesan ini? Pesan tidak dapat dikembalikan.')) {
        const ok = await deleteChatMessage(roomId, id);
        if (ok) {
          messagesMap.delete(id);
          renderMessages();
        }
      }
      return;
    }
    const row = e.target.closest('.msg-row');
    if (row) {
      const wasOpen = row.classList.contains('menu-open');
      closeMenus();
      if (!wasOpen) row.classList.add('menu-open');
    }
  });

  let pressTimer = null;
  messagesEl.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.msg-row');
    if (!row) return;
    pressTimer = setTimeout(() => {
      closeMenus();
      row.classList.add('menu-open');
    }, 500);
  }, { passive: true });
  messagesEl.addEventListener('touchend', () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  });

  scrollEl.addEventListener('scroll', closeMenus);

  function onDocClick(e) {
    if (!e.target.closest('.msg-row')) closeMenus();
  }
  document.addEventListener('click', onDocClick);

  updateSendState();
  scrollToBottom();

  container.routeCleanup = () => {
    try {
      unsubscribe();
    } catch {
      /* noop */
    }
    document.removeEventListener('click', onDocClick);
  };
}
