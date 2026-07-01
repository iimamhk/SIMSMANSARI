## Firebase Public Readiness Review

Status: not ready for public Firestore access.

### Why this is blocked

1. Authentication is local only.
   - Login reads from the `users` collection directly in the browser.
   - Session state is stored in `localStorage`.
   - There is no Firebase Authentication token that Firestore Rules can trust.

2. The browser reads and writes operational school data directly.
   - Collections used include `users`, `absensi`, `nilai_tugas`, `nilai_ujian`, `game_configs`, `game_sessions`, `pengajaran`, `pembelajaran`, and `anggota_kelas`.
   - If Firestore Rules are opened broadly, anyone can inspect or tamper with student and teacher data from browser devtools.

3. Passwords are handled in application data.
   - The current login flow compares username and password from Firestore documents.
   - That pattern must not be exposed with permissive client-side rules.

### Launch decision

For a public Vercel deployment, the safe default is:

- Keep Firestore locked down.
- Do not allow public reads or writes from unauthenticated browser clients.
- Treat the current Vercel deployment as UI hosting only until Firebase Auth and role-based Rules are implemented.

### Recommended immediate action

Deploy the UI to Vercel, but do one of these before broad public use:

1. Preferred:
   - Migrate login to Firebase Authentication.
   - Store roles in custom claims or a protected profile document.
   - Rewrite Firestore Rules around `request.auth` and role checks.

2. Temporary safe posture:
   - Use deny-all Firestore Rules.
   - Limit usage to local demo mode or to a private internal environment only.

### Minimum target model for production

- `admin` can manage master data and settings.
- `guru` can read only their assignments and write only records tied to those assignments.
- `siswa` can read only their own grades, attendance, and game sessions.
- No client should ever read all users including passwords.

### High-priority follow-up

1. Remove password verification against Firestore documents.
2. Introduce Firebase Authentication.
3. Remove plaintext password storage from `users` documents.
4. Replace broad collection reads with user-scoped queries.
5. Add Firestore Rules and test them with the Firebase Emulator.
