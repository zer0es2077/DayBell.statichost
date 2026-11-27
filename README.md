# DayBell

Smart school day feed, timetable & Librus import, packing/unpacking checklists, anchored personal time blocks (transit, dinner, sleep, free time), study-start scheduling, and Google Drive personal + shared class sync.

## Features

- **Moment Feed & Daily Timeline**: Live school-day schedule, packing/unpacking reminders, homework, exam countdowns, and auto-scheduled free time between study tasks.
- **Anchored Personal Routine**: Create private blocks (transit, dinner, sleep, hobbies) anchored relative to school start/end, study time, or other personal blocks — managed by day of week or across the whole week.
- **Google Drive Sync (Personal + Shared Class)**:
  - **Personal Sync** (`drive.appdata`): Private encrypted-in-transit backup of your full timetable, rules, packing kits, personal time blocks, free time, and checkmarks across devices.
  - **Shared Class Plan** (`drive.file`): Share a single class timetable, homework, exams, and shared exam notes via a 1-click invite link or Class Code — while keeping personal blocks, rules, packing kits, and checkmarks 100% private.
- **Polish & English UI**: Switch anytime via the `PL | EN` toggle.

## Publish Free on GitHub Pages

This repository includes an automated GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) and uses relative asset paths (`base: './'`), so it deploys cleanly to `https://<your-username>.github.io/<repo-name>/`.

1. **Create a GitHub repository** (public for free GitHub Pages) and push this project to the `main` branch.
2. **Enable GitHub Pages**:
   - Open your repository on GitHub → **Settings** → **Pages**.
   - Under **Build and deployment → Source**, select **GitHub Actions**.
3. **Wait ~1–2 minutes** for the **Deploy DayBell to GitHub Pages** workflow under the **Actions** tab to finish. Your live URL will appear in the workflow summary and under **Settings → Pages**.
4. **Authorize your GitHub Pages domain for Google Sign-In**:
   - Open [Firebase Console](https://console.firebase.google.com/) → select project `gen-lang-client-0742296412` → **Authentication** → **Settings** → **Authorized domains**.
   - Click **Add domain** and add `<your-username>.github.io` (just the hostname, without `https://` or the repo path).
5. **Allow classmates to sign in with Google**:
   - Open [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **OAuth consent screen** (or **Google Auth Platform → Audience**).
   - Either add your classmates' Gmail addresses under **Test users**, or publish the OAuth consent screen to **In production** if sharing publicly.

## Local Development

```bash
npm install
npm run dev
```

For production static builds:

```bash
npm run build
npm run preview
```

Optional backend AI parsing (when running the Express server locally or on a Node host) reads `GEMINI_API_KEY` and `OWNER_AI_PIN` from `.env` (see `.env.example`). On static hosts like GitHub Pages, the app runs 100% client-side with Google Drive sync, Librus HTML import, and manual/quick-add flows without needing a backend server.
