#!/usr/bin/env node
/**
 * patch-dsh-nopopup.mjs — stop @deepseek-ai/dsh from flashing console windows.
 *
 * Why this exists
 * ---------------
 * A host that owns no console of its own (an editor extension, a GUI launcher,
 * a service) makes every subprocess open a fresh console window, because
 * Windows gives a console application a new console whenever its parent has
 * none. dsh 0.1.5-rc.1 has two such paths:
 *
 *   1. @deepseek-ai/dsh-win32-process calls CreateProcessW and
 *      CreateProcessAsUserW with CREATE_SUSPENDED (and
 *      CREATE_UNICODE_ENVIRONMENT) but without CREATE_NO_WINDOW.
 *   2. @deepseek-ai/dsh-subprocess-local spawns its Windows runner with
 *      child_process.spawn without windowsHide: true.
 *
 * The fix belongs upstream (deepseek-harness commit "fix(subprocess): give
 * spawned processes no console window on Windows"). This script re-applies it
 * to an already-installed copy, because `npm i -g @deepseek-ai/dsh` ships the
 * published bundles and silently reverts the fix.
 *
 * What it changes
 * ---------------
 * Exactly four things, all additive:
 *   - the creationFlags argument of both createRestrictedProcess call sites
 *     (which forwards into CreateProcessAsUserW) gains `| 0x08000000`;
 *   - the creationFlags argument of the api.createProcessW call site gains
 *     `| 0x08000000`;
 *   - the runner spawn options gain `windowsHide: true`.
 *
 * It deliberately does NOT touch node-pty spawns: an interactive terminal is
 * meant to have a console.
 *
 * Safety
 * ------
 * The script is idempotent, copies each file to `<file>.nopopup.bak` before the
 * first edit, refuses to guess (a call site that does not look as expected
 * aborts that file untouched), and syntax-checks the result with `node --check`
 * before leaving it in place. Nothing else in the bundle is rewritten.
 *
 * Usage
 * -----
 *   node tools/patch-dsh-nopopup.mjs --check    # report, change nothing (exit 1 if pending)
 *   node tools/patch-dsh-nopopup.mjs            # apply
 *   node tools/patch-dsh-nopopup.mjs --revert   # restore the .nopopup.bak copies
 *   node tools/patch-dsh-nopopup.mjs --root <dir> [--check]
 *
 * <dir> is the directory that contains dsh-win32-process/ and
 * dsh-subprocess-local/ (usually .../node_modules/@deepseek-ai). Defaults to
 * $DSH_NOPOPUP_ROOT, else the @deepseek-ai/dsh global install.
 *
 * The patched process is the one that spawns children, so restart DSH after
 * applying.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

/** CREATE_NO_WINDOW. */
const NO_WINDOW = "0x08000000";
/** CREATE_NO_WINDOW as the bundler folds it into a decimal literal. */
const NO_WINDOW_DECIMAL = "134217728";
const BACKUP_SUFFIX = ".nopopup.bak";

const FILES = {
	win32: "dsh-win32-process/lib/index.js",
	subprocess: "dsh-subprocess-local/lib/index.js",
};

/* ------------------------------------------------------------------ parsing */

/**
 * Split a call's argument list on top-level commas, ignoring commas nested in
 * (), [], {} or quotes. Returns each argument with its absolute source span so
 * edits can be spliced in place.
 */
function splitArguments(source, start, end) {
	const args = [];
	let depth = 0;
	let quote = null;
	let argStart = start;
	for (let i = start; i < end; i += 1) {
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
		if (ch === "(" || ch === "[" || ch === "{") depth += 1;
		else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
		else if (ch === "," && depth === 0) {
			args.push(span(source, argStart, i));
			argStart = i + 1;
		}
	}
	if (source.slice(argStart, end).trim() !== "") args.push(span(source, argStart, end));
	// A trailing comma would leave an empty final argument; drop it.
	return args.filter((arg) => arg.text !== "");
}

function span(source, start, end) {
	const raw = source.slice(start, end);
	const lead = raw.length - raw.trimStart().length;
	const text = raw.trim();
	return { start: start + lead, end: start + lead + text.length, text };
}

/**
 * Find every call of `callee` in `source` and return its arguments with spans.
 * Matching is case-sensitive so the diagnostic string "CreateProcessW" is not
 * mistaken for a call.
 */
function findCalls(source, callee) {
	const needle = `${callee}(`;
	const calls = [];
	let index = source.indexOf(needle);
	while (index !== -1) {
		const open = index + needle.length - 1;
		const close = matchParen(source, open);
		if (close === -1) break;
		// Skip the declaration; only call sites carry a creationFlags value.
		if (!/\bfunction\s*$/.test(source.slice(0, index))) {
			calls.push({ args: splitArguments(source, open + 1, close) });
		}
		index = source.indexOf(needle, close);
	}
	return calls;
}

/** Index of the `)` matching the `(` at `open`, or -1. */
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

/* ------------------------------------------------------------------- patching */

const carriesNoWindow = (text) =>
	text.includes(NO_WINDOW) || text.includes(NO_WINDOW_DECIMAL);

/** OR CREATE_NO_WINDOW into a creationFlags expression. */
function withNoWindow(text) {
	const base = text.trim();
	// `0 | FLAG` is just FLAG; keep the result as short as the source form was.
	if (base === "0" || base === "0x0") return NO_WINDOW;
	return `${base} | ${NO_WINDOW}`;
}

/** Splice replacements in right-to-left so earlier spans stay valid. */
function splice(source, edits) {
	const ordered = [...edits].sort((a, b) => b.start - a.start);
	let out = source;
	for (const edit of ordered) {
		out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
	}
	return out;
}

/**
 * Rule 1 — creationFlags for CreateProcessAsUserW. createRestrictedProcess is a
 * thin forwarder, so both of its call sites must carry the flag.
 */
function patchWin32(source) {
	const notes = [];
	const edits = [];

	const forwarders = findCalls(source, "createRestrictedProcess");
	if (forwarders.length !== 2) {
		throw new Error(
			`expected 2 createRestrictedProcess call sites, found ${forwarders.length}`,
		);
	}
	for (const call of forwarders) {
		const flags = call.args[3];
		if (flags === undefined) throw new Error("createRestrictedProcess: no creationFlags argument");
		if (carriesNoWindow(flags.text)) {
			notes.push("createRestrictedProcess: already carries CREATE_NO_WINDOW");
			continue;
		}
		edits.push({ start: flags.start, end: flags.end, text: withNoWindow(flags.text) });
		notes.push(`createRestrictedProcess: ${flags.text} → ${withNoWindow(flags.text)}`);
	}

	let direct = findCalls(source, "api.createProcessW");
	if (direct.length === 0) direct = findCalls(source, "createProcessW");
	if (direct.length !== 1) {
		throw new Error(`expected 1 api.createProcessW call site, found ${direct.length}`);
	}
	const wCall = direct[0];
	if (wCall.args.length !== 10) {
		throw new Error(
			`api.createProcessW: expected 10 arguments, found ${wCall.args.length}`,
		);
	}
	const wFlags = wCall.args[5];
	if (carriesNoWindow(wFlags.text)) {
		notes.push("api.createProcessW: already carries CREATE_NO_WINDOW");
	} else {
		edits.push({ start: wFlags.start, end: wFlags.end, text: withNoWindow(wFlags.text) });
		notes.push(`api.createProcessW: ${wFlags.text} → ${withNoWindow(wFlags.text)}`);
	}

	return { source: splice(source, edits), changed: edits.length > 0, notes };
}

/**
 * Rule 2 — the Windows runner launch in windows-job.ts. The options object is
 * recognised by its stdio field: the Windows runner pipes stdin through
 * `ignoredStdinFd`, while the Linux scope launcher (linux-scope.ts) calls
 * runnerStdio with `false` and is deliberately left alone, since windowsHide
 * means nothing there.
 */
function patchSubprocessLocal(source) {
	const notes = [];
	// The windows-job runner pipes stdin through ignoredStdinFd; the Linux scope
	// launcher calls runnerStdio with `false` and is left alone.
	const patterns = [
		/stdio:\s*runnerStdio\(spec,\s*true[^)]*\)/,
		/stdio:\s*[^,\n]*ignoredStdinFd[^,\n]*/,
	];
	const found = patterns.map((pattern) => pattern.exec(source)).find((m) => m !== null);
	if (found === undefined) {
		throw new Error(
			"runner spawn: could not locate the Windows runner options object (unexpected bundle shape)",
		);
	}
	const at = found.index + found[0].length;
	const lineEnd = source.indexOf("\n", found.index);
	const line = source.slice(found.index, lineEnd === -1 ? source.length : lineEnd);
	if (line.includes("windowsHide")) {
		notes.push("runner spawn: already passes windowsHide: true");
		return { source, changed: false, notes };
	}
	notes.push(`runner spawn: added windowsHide: true after \`${found[0].trim()}\``);
	return {
		source: `${source.slice(0, at)}, windowsHide: true${source.slice(at)}`,
		changed: true,
		notes,
	};
}

/* ---------------------------------------------------------------------- io */

function syntaxOk(path) {
	const result = spawnSync(process.execPath, ["--check", path], {
		encoding: "utf8",
		windowsHide: true,
	});
	if (result.status === 0) return null;
	return (result.stderr || result.stdout || "node --check failed").trim();
}

/**
 * Candidate directories holding the @deepseek-ai packages, best first. `npm` is
 * a shell script on POSIX and a `.cmd` on Windows, which spawnSync cannot
 * execute without a shell, so the prefix query is only a hint; the well-known
 * locations are checked as well.
 */
function roots(explicit) {
	if (explicit !== undefined) return [explicit];
	if (process.env.DSH_NOPOPUP_ROOT) return [process.env.DSH_NOPOPUP_ROOT];
	const candidates = [];
	const npm = process.platform === "win32" ? "npm.cmd" : "npm";
	// A single command string keeps shell: true from tripping DEP0190; the
	// fallback candidates below mean a failed query is not fatal.
	const query =
		process.platform === "win32"
			? spawnSync(`${npm} root -g`, { encoding: "utf8", windowsHide: true, shell: true })
			: spawnSync(npm, ["root", "-g"], { encoding: "utf8", windowsHide: true });
	const prefix = (query.stdout ?? "").trim();
	if (query.status === 0 && prefix !== "") candidates.push(join(prefix, "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai"));
	if (process.env.APPDATA !== undefined) {
		candidates.push(join(process.env.APPDATA, "npm", "node_modules", "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai"));
	}
	const nodeDir = dirname(process.execPath);
	candidates.push(join(nodeDir, "node_modules", "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai"));
	candidates.push(join(nodeDir, "..", "lib", "node_modules", "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai"));
	return candidates;
}

function resolveRoot(explicit) {
	const candidates = roots(explicit);
	const found = candidates.find((dir) => existsSync(join(dir, FILES.win32)));
	if (found !== undefined) return found;
	throw new Error(
		`could not locate an installed @deepseek-ai/dsh; pass --root <dir>. Checked:\n  ${candidates.join("\n  ")}`,
	);
}

function main(argv) {
	const check = argv.includes("--check");
	const revert = argv.includes("--revert");
	const rootFlag = argv.indexOf("--root");
	const root = resolveRoot(rootFlag === -1 ? undefined : argv[rootFlag + 1]);

	const targets = Object.entries(FILES).map(([key, rel]) => ({
		key,
		rel,
		path: join(root, rel),
		patch: key === "win32" ? patchWin32 : patchSubprocessLocal,
	}));

	for (const target of targets) {
		if (!existsSync(target.path)) {
			console.error(`✗ missing: ${target.path}`);
			console.error("  Pass --root <dir> pointing at the directory holding dsh-win32-process/ and dsh-subprocess-local/.");
			return 1;
		}
	}

	if (revert) {
		let restored = 0;
		for (const target of targets) {
			const backup = target.path + BACKUP_SUFFIX;
			if (!existsSync(backup)) {
				console.log(`- ${target.rel}: no backup, left as is`);
				continue;
			}
			copyFileSync(backup, target.path);
			console.log(`↺ ${target.rel}: restored from ${BACKUP_SUFFIX}`);
			restored += 1;
		}
		console.log(`\nRestored ${restored} file(s). Restart DSH for this to take effect.`);
		return 0;
	}

	console.log(`dsh install: ${root}\n`);
	let pending = 0;
	let failed = 0;

	for (const target of targets) {
		const source = readFileSync(target.path, "utf8");
		let result;
		try {
			result = target.patch(source);
		} catch (error) {
			console.error(`✗ ${target.rel}: ${error.message}`);
			failed += 1;
			continue;
		}

		for (const note of result.notes) console.log(`  · ${target.rel}: ${note}`);

		if (!result.changed) {
			console.log(`= ${target.rel}: already patched`);
			continue;
		}
		if (check) {
			console.log(`! ${target.rel}: needs patching`);
			pending += 1;
			continue;
		}

		const backup = target.path + BACKUP_SUFFIX;
		if (!existsSync(backup)) copyFileSync(target.path, backup);
		writeFileSync(target.path, result.source);

		const syntaxError = syntaxOk(target.path);
		if (syntaxError !== null) {
			copyFileSync(backup, target.path);
			console.error(`✗ ${target.rel}: patched file failed node --check, rolled back`);
			console.error(syntaxError);
			failed += 1;
			continue;
		}
		console.log(`✓ ${target.rel}: patched (backup: ${BACKUP_SUFFIX})`);
	}

	if (failed > 0) {
		console.error(`\n${failed} file(s) could not be patched. Nothing was left half-edited.`);
		return 1;
	}
	if (pending > 0) {
		console.log(`\n${pending} file(s) need patching. Re-run without --check to apply.`);
		return 1;
	}
	if (check) {
		console.log("\nAll files already suppress console windows.");
		return 0;
	}
	console.log("\nDone. Restart DSH — the process that spawns children is the one that must be reloaded.");
	return 0;
}

process.exitCode = main(process.argv.slice(2));
