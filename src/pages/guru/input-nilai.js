import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getTeachingAssignmentsForUser, getActiveTeachingAssignments, getClassMembers, saveDocument } from '../../firebase/data-service.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

export async function renderGuruInputNilaiPage(container) {
  const context = getStoredContext();
  const session = getSession();
  const userId = session?.user?.username || context?.user_logged_in || '';
  const assignments = userId
    ? await getTeachingAssignmentsForUser(context, userId)
    : await getActiveTeachingAssignments(context);
  const selectedAssignment = assignments[0] || null;
  const members = selectedAssignment ? await getClassMembers(context, selectedAssignment.kelas_id) : [];

  const assignmentOptions = assignments
    .map((item) => `<option value="${item.id}" ${item.id === selectedAssignment?.id ? 'selected' : ''}>${item.kelas_nama} • ${item.mapel_nama}</option>`)
    .join('');

  const memberRows = members.length
    ? members
        .map((member, index) => {
          const studentId = member.siswa_id || member.id;
          return `
            <li class="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
              <span class="text-sm text-slate-700">${index + 1}. ${member.siswa_nama || member.nama || '-'}</span>
              <input type="number" min="0" max="100" class="score-input h-11 w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-700" data-student-id="${studentId}" placeholder="0" />
            </li>
          `;
        })
        .join('')
    : '<li class="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Belum ada siswa yang terdaftar pada kelas ini.</li>';

  const html = renderLayout('Input Nilai', `
    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-sm font-medium text-slate-700">Pilih Kelas & Mapel Anda</p>
        <p class="mt-1 text-sm text-slate-500">Lembar nilai akan memuat siswa dari relasi mengajar aktif pada semester berjalan.</p>
        <select id="assignment-select" class="mt-3 w-full rounded-xl border border-slate-200 bg-gradient-to-r from-indigo-600 via-blue-500 to-orange-500 px-4 py-3 text-sm font-bold text-white outline-none transition hover:from-indigo-700 hover:via-blue-600 hover:to-orange-600">
          ${assignmentOptions || '<option value="">Tidak ada relasi aktif</option>'}
        </select>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm font-medium text-slate-700">Daftar Nilai</p>
          <input id="assignment-name" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:w-56" placeholder="Nama tugas / ujian" />
        </div>
        <ul id="member-list" class="space-y-2 text-sm text-slate-600">${memberRows}</ul>
        <button id="save-nilai-btn" class="mt-4 rounded-xl bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white">Simpan Nilai</button>
      </div>
    </div>
  `);

  container.innerHTML = html;

  container.querySelector('#assignment-select')?.addEventListener('change', async () => {
    const assignmentId = container.querySelector('#assignment-select').value;
    const nextAssignment = assignments.find((item) => item.id === assignmentId) || assignments[0] || null;
    const nextMembers = nextAssignment ? await getClassMembers(context, nextAssignment.kelas_id) : [];
    const nextRows = nextMembers.length
      ? nextMembers
          .map((member, index) => {
            const studentId = member.siswa_id || member.id;
            return `
              <li class="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <span class="text-sm text-slate-700">${index + 1}. ${member.siswa_nama || member.nama || '-'}</span>
                <input type="number" min="0" max="100" class="score-input h-11 w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-700" data-student-id="${studentId}" placeholder="0" />
              </li>
            `;
          })
          .join('')
      : '<li class="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Belum ada siswa yang terdaftar pada kelas ini.</li>';

    container.querySelector('#member-list').innerHTML = nextRows;
  });

  container.querySelector('#save-nilai-btn')?.addEventListener('click', async () => {
    const assignmentId = container.querySelector('#assignment-select').value;
    const assignment = assignments.find((item) => item.id === assignmentId) || assignments[0] || null;
    if (!assignment) {
      alert('Tidak ada relasi mengajar yang dipilih.');
      return;
    }

    const taskName = container.querySelector('#assignment-name').value.trim() || 'Nilai Harian';
    const inputs = container.querySelectorAll('.score-input');
    const payloads = Array.from(inputs).map((input) => ({
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      pengajaran_id: assignment.id,
      kelas_id: assignment.kelas_id,
      mapel_id: assignment.mapel_id,
      siswa_id: input.getAttribute('data-student-id'),
      nama_tugas: taskName,
      nilai: Number(input.value) || 0,
    }));

    await Promise.all(payloads.map((item) => saveDocument('nilai_tugas', item)));
    alert('Nilai berhasil disimpan.');
  });

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
