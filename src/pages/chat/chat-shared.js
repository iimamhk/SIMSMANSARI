export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const AVATAR_COLORS = [
  '#0EA5E9', '#14B8A6', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#10B981', '#F97316', '#6366F1', '#06B6D4',
  '#A855F7', '#22C55E',
];

export function getAvatarColor(seed = '') {
  const str = String(seed || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function getInitials(name = '') {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
}

export function avatarHtml(name = '', size = 'h-11 w-11', ring = '') {
  const color = getAvatarColor(name);
  const initials = getInitials(name);
  return `
    <div class="${size} ${ring} shrink-0 rounded-full flex items-center justify-center text-white font-semibold" style="background:${color}">
      ${escapeHtml(initials)}
    </div>`;
}

export function formatChatTime(iso = '') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatListTime(iso = '') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Kemarin';
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

export function getOtherParticipant(room, myUid) {
  if (!room || !Array.isArray(room.participants)) return null;
  const otherId = room.participants.find((p) => p !== myUid);
  const nama = otherId && room.participant_nama ? room.participant_nama[otherId] : '';
  return { id: otherId, nama: nama || otherId || '' };
}

export const CHAT_EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😍',
  '😘', '😜', '🤔', '🤨', '😐', '😴', '😎', '🥳', '😢', '😭',
  '😡', '👍', '👎', '👏', '🙏', '💪', '🤝', '✌️', '🤞', '👌',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '🔥', '✨',
  '🎉', '🎊', '🌟', '⭐', '💡', '✅', '❌', '⚠️', '❓', '❗',
  '📚', '📝', '📌', '📎', '💯', '🏆', '🎯', '⏰', '📅', '☕',
  '🍕', '🍔', '🍰', '🍎', '🌹', '🌈', '☀️', '🌧️', '🌙', '⚽',
];
