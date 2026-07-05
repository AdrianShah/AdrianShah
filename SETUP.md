# Setup Notes: The Olympian Pitch

Copy everything in this folder into your `AdrianShah/AdrianShah` repo root
(same structure: `.github/`, `assets/`, `predictions/`, `scripts/`, `README.md`,
`package.json`). **The `.github/` folder must be present on the remote repo**;
without it, none of the auto-updated sections will work.

## 1. Repo settings
- **Settings → Actions → General → Workflow permissions** → set to
  **"Read and write permissions"**. Without this, both Actions will
  fail on the `git push` step. This is the #1 cause of a silently broken
  profile README.

## 2. Secrets
- `predictions-tracker.yml` needs a **`FOOTBALL_DATA_TOKEN`** secret for live
  scoring (the README table still renders without it).
  1. Register for a free key at https://www.football-data.org/client/register
  2. Repo → Settings → Secrets and variables → Actions → New repository secret
     → name it `FOOTBALL_DATA_TOKEN`.
- The Pitchside Commits workflow uses the built-in `secrets.GITHUB_TOKEN`. Nothing
  to add.

## 3. First-time setup
1. Push the full repo including `.github/workflows/`.
2. Go to **Actions** and manually run each workflow once:
   - **Update Pitchside Commits**: fills the commits table
   - **Update World Cup Predictions**: renders your picks table

> **Note:** The 3D contribution pitch workflow was removed. Pitchside Commits and the World Cup predictions tracker are the active automation workflows.

## 4. Manual maintenance
- **Predictions → Quarterfinal/Semifinal/Final rows**: `predictions/predictions.yml`
  has placeholder `"TBD"` teams for every round after Round of 16. Swap in real
  team names once each bracket is set, then add your pick (`home`, `away`, or team name).
- **Pitchside Commits** is fully automated. No manual edits needed.

## 5. Configuration notes
- **Team-name matching** in `update_predictions.js` uses substring matching and
  resolves `home`/`away` shorthand to team names before scoring.
- **Pitchside Commits** reads public `PushEvent` activity via the GitHub Events
  API and excludes commits to this profile repo.

## 6. After July 19, 2026
- `update_predictions.js` no-ops once the tournament ends. Disable
  `predictions-tracker.yml` from the Actions tab when you're done refreshing
  your final record.
