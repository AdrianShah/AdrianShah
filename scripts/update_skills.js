/**
 * Rebuilds the skill-icons block in README.md from GitHub repo languages
 * plus a static baseline (frameworks/tools not always detected by GitHub).
 *
 * Uses https://skillicons.dev (tandpfun/skill-icons style animated icons).
 *
 * Requires: GITHUB_TOKEN and GITHUB_REPOSITORY_OWNER env vars.
 */

const fs = require("fs");

const README_PATH = "README.md";
const BASELINE_PATH = "config/skills-baseline.json";
const START_MARKER = "<!-- SKILLS:AUTO:START -->";
const END_MARKER = "<!-- SKILLS:AUTO:END -->";
const PER_LINE = 8;

/** GitHub API language name -> skillicons.dev icon id */
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
  Objective-C: "apple",
  Jupyter: "python",
};

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
      if (repo.fork || repo.name === owner) continue;
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

function loadBaselineIcons() {
  const raw = fs.readFileSync(BASELINE_PATH, "utf8");
  const doc = JSON.parse(raw);
  return doc.icons || [];
}

function buildSkillsBlock(iconList) {
  const icons = iconList.join(",");
  const url = `https://skillicons.dev/icons?i=${icons}&perline=${PER_LINE}`;
  return [
    `<a href="https://skillicons.dev">`,
    `<img src="${url}" alt="Tech stack" />`,
    `</a>`,
  ].join("\n");
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !token) {
    console.error("Missing GITHUB_REPOSITORY_OWNER or GITHUB_TOKEN env vars.");
    process.exit(1);
  }

  const baseline = loadBaselineIcons();
  const detected = await collectLanguageIcons(owner, token);
  const merged = [...new Set([...baseline, ...detected])];

  const block = buildSkillsBlock(merged);

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
