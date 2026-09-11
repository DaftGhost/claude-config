#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");
const PATH_KEYS = new Set([
  "file",
  "file_path",
  "filePath",
  "filepath",
  "filename",
  "path",
  "uri"
]);
const SHELL_PUNCTUATION = new Set([";", "&&", "||", "|", "<", ">", "(", ")"]);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readEvent() {
  try {
    const event = JSON.parse(fs.readFileSync(0, "utf8"));
    if (isRecord(event)) {
      return event;
    }
  } catch {
    return {};
  }
  return {};
}
function toPosix(value) {
  return value.split(path.sep).join("/");
}
function findProjectRoot(event) {
  const scriptRoot = path.resolve(__dirname, "..", "..");
  const cwdValue = event.cwd;
  if (typeof cwdValue === "string" && cwdValue) {
    const cwd = path.resolve(cwdValue);
    let candidate = cwd;
    while (true) {
      if (fs.existsSync(path.join(candidate, ".git"))) {
        return fs.realpathSync(candidate);
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        break;
      }
      candidate = parent;
    }
  }
  return scriptRoot;
}
function parseRulePatterns(content) {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return [];
  }
  let inPaths = false;
  const patterns = [];
  for (const line of lines.slice(1)) {
    const stripped = line.trim();
    if (stripped === "---") {
      break;
    }
    if (stripped === "paths:") {
      inPaths = true;
      continue;
    }
    if (!inPaths) {
      continue;
    }
    if (!stripped) {
      continue;
    }
    if (!stripped.startsWith("-")) {
      break;
    }
    let pattern = stripped.slice(1).trim();
    if (pattern.includes(" #")) {
      pattern = pattern.split(" #", 1)[0].trimEnd();
    }
    if (pattern.length >= 2 && pattern[0] === pattern[pattern.length - 1] && (pattern[0] === "'" || pattern[0] === '"')) {
      pattern = pattern.slice(1, -1);
    }
    if (pattern) {
      patterns.push(pattern.replace(/\\/g, "/"));
    }
  }
  return patterns;
}
function loadRules(projectRoot) {
  const directory = path.join(projectRoot, ".claude", "rules");
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    return [];
  }
  const rules = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const rulePath = path.join(directory, entry.name);
    let content;
    try {
      content = fs.readFileSync(rulePath, "utf8");
    } catch {
      continue;
    }
    const patterns = parseRulePatterns(content);
    if (patterns.length === 0) {
      continue;
    }
    rules.push({
      displayPath: toPosix(path.relative(projectRoot, rulePath)),
      patterns,
      content
    });
  }
  return rules;
}
function shellTokens(command) {
  const tokens = [];
  let token = "";
  let quote = null;
  let escaped = false;
  const pushToken = () => {
    if (token) {
      tokens.push(token);
      token = "";
    }
  };
  for (let index = 0;index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        token += character;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      pushToken();
      continue;
    }
    if (";&|<>()".includes(character)) {
      pushToken();
      const nextCharacter = command[index + 1];
      if ((character === "&" || character === "|" || character === ">") && nextCharacter === character) {
        tokens.push(character + nextCharacter);
        index += 1;
      } else {
        tokens.push(character);
      }
      continue;
    }
    token += character;
  }
  if (escaped) {
    token += "\\";
  }
  pushToken();
  return tokens;
}
function commandPaths(command) {
  const candidates = [];
  for (let token of shellTokens(command)) {
    if (SHELL_PUNCTUATION.has(token) || token === "-") {
      continue;
    }
    if (token.startsWith(">")) {
      continue;
    }
    if (token.startsWith("<")) {
      token = token.slice(1);
    }
    if (!token || token.startsWith("$") || token.startsWith("-")) {
      continue;
    }
    candidates.push(token);
  }
  return candidates;
}
function directPaths(value) {
  if (Array.isArray(value)) {
    return value.flatMap((childValue) => directPaths(childValue));
  }
  if (!isRecord(value)) {
    return [];
  }
  const paths = [];
  for (const [key, childValue] of Object.entries(value)) {
    if (PATH_KEYS.has(key) && typeof childValue === "string") {
      paths.push(childValue);
    } else {
      paths.push(...directPaths(childValue));
    }
  }
  return paths;
}
function workingDirectory(event, projectRoot) {
  const cwd = typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
  return path.isAbsolute(cwd) ? path.resolve(cwd) : path.resolve(projectRoot, cwd);
}
function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function expandPath(candidate, rawPath, cwd) {
  if (typeof fs.globSync === "function") {
    return fs.globSync(candidate);
  }

  const normalizedPattern = rawPath.replace(/\\/g, "/");
  const firstGlobIndex = normalizedPattern.search(/[*?[]/);
  const staticPrefix =
    firstGlobIndex >= 0 ? normalizedPattern.slice(0, firstGlobIndex) : normalizedPattern;
  const basePath = staticPrefix.slice(0, staticPrefix.lastIndexOf("/"));
  const baseDirectory = path.resolve(cwd, basePath || ".");
  const absolutePattern = path.isAbsolute(rawPath);
  const matches = [];

  function visit(directory) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isFile()) {
        const matchPath = absolutePattern
          ? toPosix(entryPath)
          : toPosix(path.relative(cwd, entryPath));
        if (matchesPattern(matchPath, normalizedPattern)) {
          matches.push(entryPath);
        }
        continue;
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        visit(entryPath);
      }
    }
  }

  visit(baseDirectory);
  return matches;
}

function existingFiles(rawPaths, cwd, projectRoot) {
  const files = [];
  const seen = new Set();
  const resolvedRoot = fs.realpathSync(projectRoot);
  for (const rawPath of rawPaths) {
    let pathValue = rawPath.trim();
    if (pathValue.startsWith("file://")) {
      try {
        pathValue = fileURLToPath(pathValue);
      } catch {
        continue;
      }
    }
    if (!pathValue || pathValue === "." || pathValue === ".." || pathValue === "/dev/null") {
      continue;
    }
    if (pathValue.startsWith("@")) {
      pathValue = pathValue.slice(1);
    }
    const candidate = path.resolve(cwd, pathValue);
    const expandedCandidates = /[*?[]/.test(pathValue)
      ? expandPath(candidate, pathValue, cwd)
      : [candidate];
    for (const expanded of expandedCandidates) {
      let stat;
      try {
        stat = fs.statSync(expanded);
      } catch {
        continue;
      }
      if (!stat.isFile()) {
        continue;
      }
      let resolved;
      try {
        resolved = fs.realpathSync(expanded);
      } catch {
        continue;
      }
      if (!isWithin(resolved, resolvedRoot) || seen.has(resolved)) {
        continue;
      }
      seen.add(resolved);
      files.push(expanded);
    }
  }
  return files;
}
function relativeVariants(filePath, projectRoot) {
  const variants = [];
  const root = fs.realpathSync(projectRoot);
  let resolvedFilePath;
  try {
    resolvedFilePath = fs.realpathSync(filePath);
  } catch {
    resolvedFilePath = path.resolve(filePath);
  }
  for (const candidate of [path.resolve(filePath), resolvedFilePath]) {
    const relative = path.relative(root, candidate);
    if (!isWithin(candidate, root)) {
      continue;
    }
    const normalized = toPosix(relative);
    if (!variants.includes(normalized)) {
      variants.push(normalized);
    }
  }
  return variants;
}
function globRegExp(pattern) {
  let expression = "^";
  for (let index = 0;index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
      } else {
        expression += ".*";
        index += 1;
      }
      continue;
    }
    if (character === "*") {
      expression += "[^/]*";
      continue;
    }
    if (character === "?") {
      expression += "[^/]";
      continue;
    }
    expression += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${expression}$`);
}
function matchesPattern(relativePath, pattern) {
  const normalizedPattern = pattern.replace(/^\.\//, "");
  const matcher = globRegExp(normalizedPattern);
  const candidates = [relativePath, path.posix.basename(relativePath)];
  return candidates.some((candidate) => matcher.test(candidate));
}
function matchingRules(rules, files, projectRoot) {
  const matched = [];
  for (const rule of rules) {
    const applies = files.some((filePath) => relativeVariants(filePath, projectRoot).some((relativePath) => rule.patterns.some((pattern) => matchesPattern(relativePath, pattern))));
    if (applies) {
      matched.push(rule);
    }
  }
  return matched;
}
function buildContext(rules, files, projectRoot) {
  const targetPaths = files.flatMap((filePath) => relativeVariants(filePath, projectRoot));
  const sections = [
    "Repository rules matched for the files referenced by the pending tool call:",
    ...targetPaths.map((targetPath) => `- ${targetPath}`)
  ];
  for (const rule of rules) {
    sections.push("", `--- ${rule.displayPath} ---`, rule.content.trimEnd());
  }
  return sections.join("\n");
}
function main() {
  const event = readEvent();
  if (Object.keys(event).length === 0) {
    return 0;
  }
  const projectRoot = findProjectRoot(event);
  const toolInput = event.tool_input;
  const rawPaths = directPaths(toolInput);
  if (isRecord(toolInput) && typeof toolInput.command === "string") {
    rawPaths.push(...commandPaths(toolInput.command));
  }
  const files = existingFiles(rawPaths, workingDirectory(event, projectRoot), projectRoot);
  if (files.length === 0) {
    return 0;
  }
  const rules = matchingRules(loadRules(projectRoot), files, projectRoot);
  if (rules.length === 0) {
    return 0;
  }
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: buildContext(rules, files, projectRoot)
    }
  };
  process.stdout.write(JSON.stringify(output));
  return 0;
}
process.exitCode = main();
