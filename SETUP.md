# Setup Notes — The Olympian Pitch

Copy everything in this folder into your `adrianshah/adrianshah` repo root
(same structure: `.github/`, `assets/`, `predictions/`, `scripts/`, `README.md`,
`package.json`). Then do the following:

## 1. Repo settings
- **Settings → Actions → General → Workflow permissions** → set to
  **"Read and write permissions"**. Without this, all three Actions will
  fail on the `git push` step — this is the #1 cause of a silently broken
  profile README.

## 2. Secrets
- `predictions-tracker.yml` needs a **`FOOTBALL_DATA_TOKEN`** secret.
  1. Register for a free key at https://www.football-data.org/client/register
  2. Repo → Settings → Secrets and variables → Actions → New repository secret
     → name it `FOOTBALL_DATA_TOKEN`.
  - Free tier covers the World Cup competition, but is rate-limited (10
    requests/minute). The script only queries dates with unresolved picks,
    so this should never be an issue at this scale — flagging it so you're
    not surprised if you ever expand scope.
- The other two workflows use the built-in `secrets.GITHUB_TOKEN` — nothing
  to add.

## 3. Fill in what automation can't reach
- **Trophy Cabinet → Elenchus block**: the three-lane breakdown is static
  text in `README.md` (I left `<!-- TODO -->` placeholders) — there's no API
  for past competition placements, so this part stays manual.
- **Predictions → Quarterfinal/Semifinal/Final rows**: `predictions/predictions.yml`
  has placeholder `"TBD"` teams for every round after Round of 16, because
  those matchups aren't determined yet. Swap in real team names once each
  bracket is set (usually the day after the previous round ends), then add
  your pick.

## 4. Things I approximated — verify before relying on them
- **`.github/sample-settings/olympian-pitch.json`**: this is my best-guess
  color/theme schema for `yoshi389111/github-profile-3d-contrib`. That
  project's schema has changed across versions — check the `sample-settings/`
  folder in [the project itself](https://github.com/yoshi389111/github-profile-3d-contrib)
  before your first real run, and adjust key names if they don't match.
- **Team-name matching** in `update_predictions.js` uses simple substring
  matching (e.g. "USA" vs "United States") — check the first couple of runs
  to make sure football-data.org's naming lines up with what you typed in
  `predictions.yml`. Round of 16 entries I filled in should match, but double
  check before kickoff.

## 5. Known platform limits (can't be worked around)
- **No custom snake sprite.** We dropped this per your call — just noting
  it stays a hard platform limit if you ever revisit it: `Platane/snk` only
  exposes color options, not custom images/sprites.
- **No texture-mapped grass** on the 3D pitch — `github-profile-3d-contrib`
  only supports flat color palettes per contribution tier, so "grass growing
  thicker" is simulated with a green→gold color ramp, not an actual texture.

## 6. After July 19, 2026
- `update_predictions.js` no-ops once the tournament ends, so it's safe to
  leave `predictions-tracker.yml` running — but you may want to disable it
  (Actions tab → workflow → "..." → Disable workflow) once you're done
  refreshing your final record, just to stop the daily commit noise.
