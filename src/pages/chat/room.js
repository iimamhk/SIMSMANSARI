import { renderLayout } from '../../layouts/dashboard-layout.js';
import {
  subscribeChatMessages,
  loadOlderChatMessages,
  sendChatMessage,
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
    <div class="flex h-[80vh] flex-col overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-slate-100">
      <div class="flex items-center gap-2 border-b border-slate-100 bg-white/90 px-3 py-2.5 backdrop-blur">
        <a href="#chat" class="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100" aria-label="Kembali">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </a>
        ${avatarHtml(otherName, 'h-9 w-9')}
        <div class="min-w-0">
          <p class="truncate text-[15px] font-semibold text-slate-900">${escapeHtml(otherName)}</p>
          <p class="text-[11px] text-slate-400">Pesan</p>
        </div>
      </div>

      <div id="chat-scroll" class="flex-1 overflow-y-auto bg-[#EFEFF4] px-3 py-3" style="scroll-behavior:smooth;">
        <div id="chat-older" class="pb-1 text-center"></div>
        <div id="chat-messages" class="flex flex-col gap-1.5"></div>
      </div>

      <div id="emoji-panel" class="hidden border-t border-slate-100 bg-white p-2">
        <div class="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto">
          ${CHAT_EMOJIS.map((e) => `<button type="button" class="emoji-btn flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:bg-slate-100">${e}</button>`).join('')}
        </div>
      </div>

      <div class="flex items-end gap-2 border-t border-slate-100 bg-white px-3 py-2.5">
        <button id="btn-emoji" type="button" class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100" aria-label="Emoji">
          <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/></svg>
        </button>
        <textarea id="chat-input" rows="1" placeholder="Pesan" class="max-h-28 min-h-[40px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[14px] text-slate-800 outline-none transition focus:border-[#25D366] focus:ring-4 focus:ring-[#25D366]/15"></textarea>
        <button id="btn-send" type="button" class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-40" aria-label="Kirim">
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
          <p class="text-sm text-slate-400">Belum ada pesan. Mulai percakapan sekarang.</p>
        </div>`;
    } else {
      messagesEl.innerHTML = list
        .map((msg) => {
          const out = msg.sender_id === myUid;
          return `
            <div class="flex ${out ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[80%] rounded-2xl px-3 py-2 text-[14px] leading-snug shadow-sm ${out ? 'rounded-br-md bg-[#95EC69] text-[#0B141A]' : 'rounded-bl-md bg-white text-[#0B141A]'}">
                <p class="whitespace-pre-wrap break-words">${escapeHtml(msg.text)}</p>
                <p class="mt-1 text-right text-[10px] text-[#8A8A8E]">${formatChatTime(msg.created_at)}</p>
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

  updateSendState();
  scrollToBottom();

  container.routeCleanup = () => {
    try {
      unsubscribe();
    } catch {
      /* noop */
    }
  };
}
