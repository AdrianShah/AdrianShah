# Setup Notes: The Olympian Pitch

Copy everything in this folder into your `AdrianShah/AdrianShah` repo root
(same structure: `.github/`, `assets/`, `data/`, `config/`, `scripts/`, `README.md`,
`package.json`). **The `.github/` folder must be present on the remote repo**;
without it, none of the auto-updated sections will work.

## 1. Repo settings
- **Settings → Actions → General → Workflow permissions** → set to
  **"Read and write permissions"**. Without this, both Actions will
  fail on the `git push` step. This is the #1 cause of a silently broken
  profile README.

## 2. Secrets
- `fixtures.yml` and `results.yml` need a **`FOOTBALL_DATA_TOKEN`** secret.
  The token only lives in Actions; the phone app never holds it.
  1. Register for a free key at https://www.football-data.org/client/register
  2. Repo → Settings → Secrets and variables → Actions → New repository secret
     → name it `FOOTBALL_DATA_TOKEN`.
- The Pitchside Commits workflow uses the built-in `secrets.GITHUB_TOKEN`. Nothing
  to add.

## 3. First-time setup
1. Push the full repo including `.github/workflows/`.
2. Go to **Actions** and manually run each workflow once:
   - **Update Pitchside Commits**: fills the commits table
   - **Import Fixtures**, then **Render Picks README**
   - **Update Tech Stack Icons**: merges GitHub repo languages with `config/skill-icons.json`

> **Note:** The 3D contribution pitch workflow was removed. Pitchside Commits, picks (fixtures / results / render), and tech stack icons are the active automation workflows.

## 4. Manual maintenance
- **Picks** come from the iOS app, which writes `data/picks.json` through the
  GitHub Contents API with a fine-grained PAT (this repo only, Contents read/write).
  Each file has one writer: the app writes `picks.json`; Actions write
  `fixtures.json`, `results.json` and `README.md`.
  - `fixtures.yml` (daily): last 7 + next 14 days of fixtures for `config/competitions.json`
  - `results.yml` (every 3h): scores picked matches, re-renders the README
  - `readme.yml` (on push to `data/picks.json`): tests + re-renders the README
  - Draw is a valid soccer pick. Picks locked after kickoff don't count.
  - World Cup 2026 YAML and scripts are in `archive/` (migrated by `scripts/migrate_wc.js`).
- **Pitchside Commits** is fully automated. No manual edits needed.
- **Tech stack icons**: static SVG icons are generated from `config/skill-icons.json`
  using [skillicons.dev](https://skillicons.dev) and
  [techstack-generator](https://techstack-generator.vercel.app), styled like
  [rzashakeri's profile](https://github.com/rzashakeri). Edit the `baseline` list or
  add labels/slugs under `overrides`. The weekly workflow scans public repos and adds
  icons when you commit in a new language.
- **Profile views**: uses [komarev.com](https://komarev.com/ghpvc/?username=AdrianShah)
  inside a collapsible **Profile stats** section at the bottom of the README.

## 5. Configuration notes
- **Pitchside Commits** reads public `PushEvent` activity via the GitHub Events
  API and excludes commits to this profile repo.
