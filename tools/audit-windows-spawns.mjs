#!/usr/bin/env node
/**
 * audit-windows-spawns.mjs — list the child_process spawn sites in an installed
 * tree that would open a console window on Windows.
 *
 * A console application started by a process that owns no console gets a fresh
 * console window unless it is created with CREATE_NO_WINDOW, which is what
 * child_process sets when it is passed `windowsHide: true`. A host launched
 * from Explorer — or any GUI — owns no console, so every unguarded spawn
 * flashes a window.
 *
 * Usage:
 *   node tools/audit-windows-spawns.mjs [root ...]
 *
 * Defaults to the @deepseek-ai packages of the installed dsh. Exits 1 when an
 * unguarded child_process site is found, so it can gate a release.
 *
 * How a site is classified, stated so the result can be judged:
 *   - Only files that mention child_process are scanned.
 *   - A call is `child_process` when its callee is a namespace bound to
 *     child_process (`cp.spawn(…)`, `import_node_child_process.spawn(…)`) or a
 *     bare name destructured from it. Anything else — a regex `exec(text)`, a
 *     local helper, a method declaration — is `unresolved` and reported
 *     separately, never as an unguarded site.
 *   - `windowsHide` is looked for inside the call's own parentheses. A call
 *     that assembles its options elsewhere is reported as `unknown`.
 *   - pty spawns are skipped: an interactive terminal is meant to have a
 *     console.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FAMILY = ["spawnSync", "spawn", "execFileSync", "execFile", "execSync", "exec", "fork"];

/** Balanced-paren scan from the `(` at `open`; returns the matching index or -1. */
function matchParen(source, open) {
	let depth = 0;
	let quote = null;
	for (let i = open; i < source.length; i += 1) {
		const ch = source[i];
		if (quote !== null) {
			if (ch === "\\") i += 1;
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") quote = ch;
		else if (ch === "(") depth += 1;
		else if (ch === ")") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function lineAt(source, index) {
	let line = 1;
	for (let i = 0; i < index; i += 1) if (source[i] === "\n") line += 1;
	return line;
}

/** Local names bound to child_process, in either module or destructured form. */
function bindings(source) {
	const namespaces = new Set();
	const destructured = new Set();
	const add = (text) => {
		for (const entry of text.split(",")) {
			const name = /^\s*([A-Za-z_$][\w$]*)/.exec(entry)?.[1];
			if (name !== undefined) destructured.add(name);
		}
	};
	for (const match of source.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*(?:__toESM\()?require\(\s*["'](?:node:)?child_process["']\s*\)/g)) {
		namespaces.add(match[1]);
	}
	for (const match of source.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*["'](?:node:)?child_process["']/g)) {
		namespaces.add(match[1]);
	}
	for (const match of source.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:__toESM\()?require\(\s*["'](?:node:)?child_process["']\s*\)/g)) {
		add(match[1]);
	}
	for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](?:node:)?child_process["']/g)) {
		add(match[1]);
	}
	return { namespaces, destructured };
}

/** A method or function declaration, not a call: `spawn(spec) {` on its own. */
function isDeclaration(source, index, close) {
	const after = source.slice(close + 1).match(/^\s*/)[0].length + close + 1;
	if (source[after] !== "{") return false;
	const before = source.slice(0, index).match(/\S*$/)[0];
	return before === "" || /[;{},]$/.test(before) || /=>$/.test(before) || /function$/.test(before);
}

function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			yield* walk(path);
		} else if (entry.isFile() && entry.name.endsWith(".js")) {
			yield path;
		}
	}
}

/**
 * Blank out comment text while keeping every byte offset and newline, so a site
 * mentioned inside a comment (`Node treats spawnSync({ timeout: 0 }) …`) is not
 * reported as a call.
 */
function stripComments(source) {
	const out = [...source];
	let quote = null;
	for (let i = 0; i < source.length; i += 1) {
		const ch = source[i];
		if (quote !== null) {
			if (ch === "\\") i += 1;
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") {
			quote = ch;
			continue;
		}
		if (ch === "/" && source[i + 1] === "/") {
			while (i < source.length && source[i] !== "\n") {
				out[i] = " ";
				i += 1;
			}
			continue;
		}
		if (ch === "/" && source[i + 1] === "*") {
			while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
				if (source[i] !== "\n") out[i] = " ";
				i += 1;
			}
			if (i < source.length) out[i] = out[i + 1] = " ";
			i += 1;
		}
	}
	return out.join("");
}

/** Name of the nearest enclosing `function` declaration, for judging reach. */
function enclosing(source, index) {
	const matches = [...source.slice(0, index).matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)];
	return matches.length === 0 ? "" : matches.at(-1)[1];
}

function inspect(path) {
	const raw = readFileSync(path, "utf8");
	if (!raw.includes("child_process")) return null;
	const source = stripComments(raw);
	const { namespaces, destructured } = bindings(source);
	const sites = [];
	for (const name of FAMILY) {
		const needle = `${name}(`;
		let index = source.indexOf(needle);
		while (index !== -1) {
			const open = index + needle.length - 1;
			const close = matchParen(source, open);
			if (close === -1) break;
			const previous = source[index - 1];
			const bare = previous === undefined || !/[\w$.]/.test(previous);
			if (bare && !isDeclaration(source, index, close)) {
				const namespace = /([A-Za-z_$][\w$]*)\.$/.exec(source.slice(Math.max(0, index - 40), index))?.[1];
				const kind =
					namespace !== undefined
						? namespaces.has(namespace)
							? "child_process"
							: "unresolved"
						: destructured.has(name)
							? "child_process"
							: "unresolved";
				const call = source.slice(index, close + 1);
				sites.push({
					name,
					kind,
					line: lineAt(source, index),
					hidden: call.includes("windowsHide"),
					owner: enclosing(source, index),
					snippet: call.replace(/\s+/g, " ").slice(0, 110),
				});
			}
			index = source.indexOf(needle, close);
		}
	}
	return sites.length === 0 ? null : sites;
}

function roots(argv) {
	if (argv.length > 0) return argv;
	if (process.env.APPDATA === undefined) return [];
	return [join(process.env.APPDATA, "npm", "node_modules", "@deepseek-ai", "dsh", "node_modules")];
}

const targets = roots(process.argv.slice(2));
if (targets.length === 0) {
	console.error("pass at least one directory to scan, or run on Windows where %APPDATA% resolves the install");
	process.exit(2);
}

let guarded = 0;
let unguarded = 0;
let unresolved = 0;
const flagged = [];

for (const target of targets) {
	console.log(`\n### ${target}`);
	for (const file of walk(target)) {
		const sites = inspect(file);
		if (sites === null) continue;
		const real = sites.filter((site) => site.kind === "child_process");
		const bad = real.filter((site) => !site.hidden);
		guarded += real.length - bad.length;
		unresolved += sites.length - real.length;
		if (bad.length === 0) continue;
		unguarded += bad.length;
		flagged.push({ file: file.slice(target.length + 1), bad });
		console.log(`\n  ${file.slice(target.length + 1)}`);
		for (const site of bad) {
			console.log(`    L${site.line}  ${site.name}(…) in ${site.owner || "?"}  ${site.snippet}`);
		}
	}
}

console.log(
	`\n${unguarded} unguarded child_process site(s) in ${flagged.length} file(s); ` +
		`${guarded} already pass windowsHide; ${unresolved} call(s) resolved to something else.`,
);
process.exitCode = unguarded === 0 ? 0 : 1;
