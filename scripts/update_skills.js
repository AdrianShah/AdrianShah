/**
 * Rebuilds the tech stack table in README.md from GitHub repo languages
 * plus a static baseline. Uses static SVG icons (skillicons.dev / techstack-generator).
 *
 * Requires: GITHUB_TOKEN and GITHUB_REPOSITORY_OWNER env vars.
 */

const fs = require("fs");

const README_PATH = "README.md";
const CONFIG_PATH = "config/skill-icons.json";
const START_MARKER = "<!-- SKILLS:AUTO:START -->";
const END_MARKER = "<!-- SKILLS:AUTO:END -->";

/** GitHub API language name -> icon id */
const LANGUAGE_TO_ICON = {
  JavaScript: "js",
  TypeScript: "ts",
  HTML: "html",
  CSS: "css",
  Python: "python",
  Java: "java",
  Kotlin: "kotlin",
  Swift: "swift",
  Go: "go",
  Rust: "rust",
  Ruby: "ruby",
  PHP: "php",
  "C#": "cs",
  "C++": "cpp",
  C: "c",
  Shell: "bash",
  Dockerfile: "docker",
  Vue: "vue",
  Dart: "dart",
  Scala: "scala",
  R: "r",
  Lua: "lua",
  Haskell: "haskell",
  Elixir: "elixir",
  Clojure: "clojure",
  "Objective-C": "apple",
  Jupyter: "python",
};

const TECHSTACK_SLUGS = new Set([
  "cs",
  "cpp",
  "c",
  "bash",
  "kotlin",
  "swift",
  "ruby",
  "php",
  "scala",
  "r",
  "lua",
  "haskell",
  "elixir",
  "clojure",
  "apple",
  "dart",
]);

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

function titleCase(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function resolveIcon(id, overrides = {}) {
  const custom = overrides[id] || {};
  const slug = custom.slug || id;
  const label = custom.label || titleCase(id);
  const provider =
    custom.provider || (TECHSTACK_SLUGS.has(slug) ? "techstack" : "skillicons");
  const size = provider === "techstack" ? 65 : 48;
  const src =
    provider === "techstack"
      ? `https://techstack-generator.vercel.app/${slug}-icon.svg`
      : `https://skillicons.dev/icons?i=${slug}&theme=dark`;

  return { label, src, size, alt: label };
}

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function collectLanguageIcons(owner, token) {
  const icons = new Set();
  let page = 1;

  while (page <= 5) {
    const repos = await fetchJson(
      `https://api.github.com/users/${owner}/repos?per_page=100&page=${page}&sort=updated`,
      token
    );
    if (!repos.length) break;

    for (const repo of repos) {
      if (repo.fork || repo.name.toLowerCase() === owner.toLowerCase()) continue;
      try {
        const langs = await fetchJson(
          `https://api.github.com/repos/${owner}/${repo.name}/languages`,
          token
        );
        for (const lang of Object.keys(langs)) {
          const icon = LANGUAGE_TO_ICON[lang];
          if (icon) icons.add(icon);
        }
      } catch {
        // skip repos we cannot read
      }
    }

    if (repos.length < 100) break;
    page += 1;
  }

  return icons;
}

function buildCell(id, overrides) {
  const icon = resolveIcon(id, overrides);
  return [
    `    <td align="center" width="96">`,
    `      <img src="${icon.src}" width="${icon.size}" height="${icon.size}" alt="${icon.alt}" />`,
    `      <br>${icon.label}`,
    `    </td>`,
  ].join("\n");
}

function buildSkillsBlock(iconIds, config) {
  const overrides = config.overrides || {};
  const iconsPerRow = config.iconsPerRow || 9;
  const rows = [];

  for (let i = 0; i < iconIds.length; i += iconsPerRow) {
    const chunk = iconIds.slice(i, i + iconsPerRow);
    const cells = chunk.map((id) => buildCell(id, overrides)).join("\n");
    rows.push(`  <tr>\n${cells}\n  </tr>`);
  }

  return `<table>\n${rows.join("\n")}\n</table>`;
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !token) {
    console.error("Missing GITHUB_REPOSITORY_OWNER or GITHUB_TOKEN env vars.");
    process.exit(1);
  }

  const config = loadConfig();
  const baseline = config.baseline || [];
  const detected = await collectLanguageIcons(owner, token);
  const merged = [...new Set([...baseline, ...detected])];

  const block = buildSkillsBlock(merged, config);

  const readme = fs.readFileSync(README_PATH, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error("Skills markers not found in README.md");
    process.exit(1);
  }

  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);
  fs.writeFileSync(README_PATH, `${before}\n${block}\n${after}`);
  console.log(`Skills updated (${merged.length} icons): ${merged.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
