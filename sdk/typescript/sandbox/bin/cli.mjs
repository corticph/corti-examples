#!/usr/bin/env node
/**
 * Corti SDK Sandbox launcher.
 *
 * Starts the local server (which serves the built SPA and proxies REST to
 * Corti) and opens a browser. Credentials are BYO per-user and live on this
 * machine only — read from CORTI_* env / a local .env, or prompted for on
 * first run. They are never bundled into the browser.
 */
import dotenv from "dotenv";
dotenv.config({ override: true });
import readline from "node:readline";
import { spawn } from "node:child_process";
import { existsSync, appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "../dist/server/node-build.mjs");

// ---- arg parsing -----------------------------------------------------------
const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--help" || a === "-h") flags.help = true;
  else if (a === "--no-open") flags.noOpen = true;
  else if (a === "--port" || a === "-p") flags.port = argv[++i];
  else if (a === "--cluster") flags.cluster = argv[++i];
  else if (a === "--tenant") flags.tenant = argv[++i];
  else if (a === "--client-id") flags.clientId = argv[++i];
  else if (a === "--client-secret") flags.clientSecret = argv[++i];
}

if (flags.help) {
  console.log(`
corti-sdk-sandbox — local tester for Corti's Speech-to-Text APIs

Usage: corti-sdk-sandbox [options]

Options:
  -p, --port <n>          Port to listen on (default 8080, or $PORT)
      --no-open           Do not open the browser automatically
      --cluster <name>    Corti cluster (e.g. dev-weu); else $CORTI_ENVIRONMENT
      --tenant <name>     Corti tenant; else $CORTI_TENANT_NAME
      --client-id <id>    OAuth client id; else $CORTI_CLIENT_ID
      --client-secret <s> OAuth client secret; else $CORTI_CLIENT_SECRET
  -h, --help              Show this help

Credentials are read from CORTI_* env vars or a local .env file, and you are
prompted for any that are missing. They stay on this machine and are never
exposed to the browser. Use a non-prod cluster + disposable tenant.
`);
  process.exit(0);
}

// ---- interactive prompt helpers --------------------------------------------
// Pull lines from a single readline async iterator, which BUFFERS lines — so
// it works whether the user types one line per prompt (TTY) or input arrives
// in a burst (piped). `rl.question` does not queue and loses bursted lines.
function makePrompter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY === true,
  });
  const lines = rl[Symbol.asyncIterator]();
  const defaultWrite = rl._writeToOutput?.bind(rl);

  const ask = async (query, { hidden = false } = {}) => {
    process.stdout.write(query);
    if (hidden && defaultWrite) rl._writeToOutput = () => {}; // mute echo
    const { value, done } = await lines.next();
    if (hidden) {
      if (defaultWrite) rl._writeToOutput = defaultWrite;
      process.stdout.write("\n");
    }
    return done ? "" : String(value).trim();
  };

  return { ask, close: () => rl.close() };
}

// ---- resolve credentials (flags > env > prompt) ----------------------------
async function resolveCreds() {
  const creds = {
    CORTI_CLIENT_ID: flags.clientId || process.env.CORTI_CLIENT_ID,
    CORTI_CLIENT_SECRET: flags.clientSecret || process.env.CORTI_CLIENT_SECRET,
    CORTI_ENVIRONMENT: flags.cluster || process.env.CORTI_ENVIRONMENT,
    CORTI_TENANT_NAME: flags.tenant || process.env.CORTI_TENANT_NAME,
  };

  const missing = Object.entries(creds).filter(([, v]) => !v);
  if (missing.length === 0) return creds;

  const { ask, close } = makePrompter();
  console.log("\nCorti credentials needed (stored on this machine only):");
  if (!creds.CORTI_ENVIRONMENT)
    creds.CORTI_ENVIRONMENT = (await ask("  Cluster [dev-weu]: ")) || "dev-weu";
  if (!creds.CORTI_TENANT_NAME) creds.CORTI_TENANT_NAME = await ask("  Tenant: ");
  if (!creds.CORTI_CLIENT_ID)
    creds.CORTI_CLIENT_ID = await ask("  Client ID: ");
  if (!creds.CORTI_CLIENT_SECRET)
    creds.CORTI_CLIENT_SECRET = await ask("  Client secret: ", {
      hidden: true,
    });

  // Don't offer to save incomplete credentials: empty KEY= lines would block
  // saving the real values on a later run. main() reports what's missing.
  if (
    !creds.CORTI_CLIENT_ID ||
    !creds.CORTI_CLIENT_SECRET ||
    !creds.CORTI_TENANT_NAME
  ) {
    close();
    return creds;
  }

  // Offer to persist to .env in the current directory for next time.
  const envPath = path.join(process.cwd(), ".env");
  const save = (
    await ask("\nSave these to ./.env for next time? [Y/n]: ")
  ).toLowerCase();
  close();
  if (save === "" || save === "y" || save === "yes") {
    const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    const lines = Object.entries(creds)
      .filter(([k]) => !new RegExp(`^${k}=`, "m").test(existing))
      .map(([k, v]) => `${k}=${v}`);
    if (lines.length) {
      appendFileSync(
        envPath,
        (existing && !existing.endsWith("\n") ? "\n" : "") +
          lines.join("\n") +
          "\n",
      );
      console.log(`Saved to ${envPath}`);
    }
  }
  return creds;
}

// ---- open browser (dependency-free, cross-platform) ------------------------
function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* non-fatal — the URL is printed anyway */
  }
}

// ---- main ------------------------------------------------------------------
async function main() {
  if (!existsSync(SERVER_ENTRY)) {
    console.error(
      `Build output not found at ${SERVER_ENTRY}.\nRun "npm run build" first (or reinstall the package).`,
    );
    process.exit(1);
  }

  const creds = await resolveCreds();
  Object.assign(process.env, creds);

  if (
    !creds.CORTI_CLIENT_ID ||
    !creds.CORTI_CLIENT_SECRET ||
    !creds.CORTI_TENANT_NAME
  ) {
    console.error("\nMissing required credentials. Aborting.");
    process.exit(1);
  }

  const port = Number(flags.port || process.env.PORT || 8080);
  // Tell node-build not to auto-start; we own startup here.
  process.env.CORTI_SANDBOX_BIN = "1";

  const { startProdServer } = await import(SERVER_ENTRY);
  startProdServer(port);

  const url = `http://localhost:${port}`;
  console.log(
    `\nTargeting Corti cluster "${creds.CORTI_ENVIRONMENT}", tenant "${creds.CORTI_TENANT_NAME}".`,
  );
  if (!flags.noOpen) {
    console.log(`Opening ${url} …`);
    openBrowser(url);
  } else {
    console.log(`Open ${url} in your browser.`);
  }
}

main().catch((err) => {
  console.error("Failed to start:", err?.message ?? err);
  process.exit(1);
});
