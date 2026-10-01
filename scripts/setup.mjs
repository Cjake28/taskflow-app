#!/usr/bin/env node
/**
 * One-command local setup: `npm run setup` (or `npm run quickstart` to also start the app).
 *
 *   1. installs dependencies (if needed)
 *   2. creates backend/.env from .env.example with a random JWT secret (an existing .env is kept)
 *   3. starts PostgreSQL, Redis and Mailpit with Docker Compose and waits until they are healthy
 *   4. applies the Prisma migrations
 *   5. loads the demo accounts
 *
 * Safe to run again. Options:
 *   --no-docker   use your own PostgreSQL/Redis/SMTP (the URLs in backend/.env) instead of Docker
 *   --no-seed     skip the demo data
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const useDocker = !args.has('--no-docker');
const seed = !args.has('--no-seed');

const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = color('1');
const green = color('32');
const yellow = color('33');
const red = color('31');
const dim = color('2');

const STEPS = 5;
let step = 0;
const title = (text) => console.log(`\n${bold(`[${++step}/${STEPS}]`)} ${bold(text)}`);
const done = (text) => console.log(`  ${green('✓')} ${text}`);
const note = (text) => console.log(`  ${dim(text)}`);

function fail(message, hints = []) {
  console.error(`\n${red('✗ Setup stopped:')} ${message}`);
  for (const hint of hints) console.error(`  ${yellow('→')} ${hint}`);
  console.error(`\nFix that and run ${bold('npm run setup')} again (it is safe to repeat).`);
  process.exit(1);
}

/** Runs a command in the repo (shell: true so npm.cmd/docker.exe resolve on Windows). */
function run(command, { quiet = false, cwd = root } = {}) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

// --- 0. Node ---------------------------------------------------------------------------------
const nodeMajor = Number(process.versions.node.split('.')[0]);
console.log(bold('TaskFlow setup'));
if (nodeMajor < 24) {
  fail(`Node.js 24 or newer is required (you have ${process.versions.node}).`, [
    'Install the current Node.js from https://nodejs.org and open a new terminal.',
  ]);
}

// --- 1. Dependencies -------------------------------------------------------------------------
title('Dependencies');
if (existsSync(join(root, 'node_modules', '.package-lock.json'))) {
  done('already installed');
} else {
  note('npm install (first run takes a minute or two)…');
  if (!run('npm install').ok) fail('npm install failed (see the output above).');
  done('installed');
}

// --- 2. Environment --------------------------------------------------------------------------
title('Environment');
const envPath = join(root, 'backend', '.env');
const PLACEHOLDER = 'change-me-to-a-random-string-of-at-least-32-chars';
if (existsSync(envPath)) {
  done('backend/.env exists, keeping it');
} else {
  copyFileSync(join(root, 'backend', '.env.example'), envPath);
  done('created backend/.env from backend/.env.example');
}
const envText = readFileSync(envPath, 'utf8');
if (envText.includes(PLACEHOLDER)) {
  writeFileSync(envPath, envText.replace(PLACEHOLDER, randomBytes(48).toString('base64url')));
  done('generated a random JWT_ACCESS_SECRET');
}

// --- 3. Services -----------------------------------------------------------------------------
title('Services (PostgreSQL, Redis, Mailpit)');
if (!useDocker) {
  done('--no-docker: using the DATABASE_URL, REDIS_URL and SMTP_* in backend/.env');
} else {
  if (!run('docker --version', { quiet: true }).ok) {
    fail('Docker is not installed.', [
      'Install Docker Desktop: https://www.docker.com/products/docker-desktop/',
      'Or run PostgreSQL 17 and Redis 7+ yourself, set their URLs in backend/.env and use: npm run setup -- --no-docker',
    ]);
  }
  if (!run('docker info', { quiet: true }).ok) {
    fail('Docker is installed but not running.', [
      'Start Docker Desktop, wait until it says "running", then try again.',
    ]);
  }
  note('docker compose up -d --wait (the first run downloads the images)…');
  const up = run('docker compose up -d --wait postgres redis mailpit', { quiet: false });
  if (!up.ok) {
    fail('the Docker services did not start.', [
      'If a port is already in use (5432, 6379, 1025 or 8025), set another one in a root .env file,',
      '  e.g. TASKFLOW_POSTGRES_PORT=5433, and use the same port in DATABASE_URL in backend/.env.',
      'See "Ports already in use?" in the README.',
    ]);
  }
  done('PostgreSQL, Redis and Mailpit are running (Mailpit inbox: http://localhost:8025)');
}

// --- 4. Database -----------------------------------------------------------------------------
title('Database');
if (!run('npm run prisma:generate -w @taskflow/backend --silent').ok) {
  fail('could not generate the Prisma client.');
}
if (!run('npm run db:deploy -w @taskflow/backend --silent').ok) {
  fail('the migrations could not be applied.', [
    'Check that PostgreSQL is reachable at DATABASE_URL in backend/.env.',
  ]);
}
done('schema up to date (Prisma migrations applied)');

// --- 5. Demo data ----------------------------------------------------------------------------
title('Demo data');
if (!seed) {
  done('--no-seed: skipped');
} else if (!run('npm run db:seed --silent').ok) {
  fail('the demo data could not be loaded.');
} else {
  done('demo accounts ready');
}

const port = /^PORT=(\d+)/m.exec(readFileSync(envPath, 'utf8'))?.[1] ?? '4000';
console.log(`
${green(bold('All set!'))} Start the app with:

  ${bold('npm run dev')}

  Web app      http://localhost:5173
  API docs     http://localhost:5173/api/docs
  Health       http://localhost:${port}/api/v1/health
  Emails       http://localhost:8025 (Mailpit)

  Demo login   ${bold('demo@taskflow.dev')} / ${bold('Demo@12345!')}
`);
