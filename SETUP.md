# TaskFlow: setup guide

The shortest way to get TaskFlow running on your computer. Copy and paste the commands in order.

- **Option A: with Docker.** Easiest: 3 commands.
- **Option B: without Docker.** You install PostgreSQL, Redis and Mailpit yourself.
- **Optional extras:** [real emails through Gmail](#7-optional-send-real-emails-gmail-smtp) and [Google / GitHub sign-in](#8-optional-google-and-github-sign-in).

Everything is preconfigured for local use: database user and password, Redis password, email inbox, ports and demo accounts. You don't have to edit any settings (except one line in Option B, explained there).

> **Email works out of the box.** TaskFlow sends real emails: sign-up codes, password reset links, email-change codes, reminders. **Mailpit**, a local email inbox at http://localhost:8025, catches all of them, so the whole system can be tested without any Gmail or SMTP account. With Docker it starts automatically; without Docker, install it in Option B, Step 3.
>
> **Google / GitHub sign-in is optional.** Everything works and can be tested without it.

---

## 1. Install these first

| What                               | Get it                                          | Check it works                                           |
| ---------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| **Node.js 24 or newer**            | https://nodejs.org (the "LTS" button)           | `node -v` shows `v24` or higher                          |
| **Git**                            | https://git-scm.com/downloads                   | `git --version`                                          |
| **Docker Desktop** (Option A only) | https://www.docker.com/products/docker-desktop/ | open Docker Desktop and wait until it says it is running |

On Windows you can also use: `winget install OpenJS.NodeJS.LTS Git.Git Docker.DockerDesktop`

Open a **new** terminal after installing, so the commands are found.

---

## 2. Option A: with Docker (recommended)

Make sure **Docker Desktop is running**, then:

```bash
git clone https://github.com/Cjake28/taskflow-app.git
cd taskflow-app
npm run quickstart
```

`npm run quickstart` does everything:

1. installs the packages;
2. creates the settings file `backend/.env`;
3. starts the database (PostgreSQL), Redis and the email inbox (Mailpit) in Docker;
4. creates the tables;
5. adds the demo accounts;
6. starts the app.

The first run takes a few minutes (it downloads packages and Docker images).

When you see the web app's address in the terminal, open **http://localhost:5173** and log in:

- **Email:** `demo@taskflow.dev`
- **Password:** `Demo@12345!`

**Next time,** just run `npm run dev` inside the `taskflow` folder (with Docker Desktop running).

**To stop the app,** press `Ctrl + C` in the terminal.

---

## 3. Option B: without Docker

You install PostgreSQL, Redis and the email inbox (Mailpit) on your computer.

### Step 1: PostgreSQL (the database)

Install **PostgreSQL 17**:

- **Windows:** download the installer from https://www.postgresql.org/download/windows/. During setup, choose a password for the `postgres` user and remember it. Keep port `5432`.
- **macOS:** `brew install postgresql@17 && brew services start postgresql@17`
- **Ubuntu/Debian:** `sudo apt install -y postgresql && sudo systemctl start postgresql`

Open the PostgreSQL command line as the admin user:

- **Windows:** Start menu → **SQL Shell (psql)**. Press Enter for each question, then type the `postgres` password you chose.
- **macOS:** `psql postgres`
- **Ubuntu/Debian:** `sudo -u postgres psql`

Paste these three lines and press Enter:

```sql
CREATE USER taskflow WITH PASSWORD 'taskflow' CREATEDB;
CREATE DATABASE taskflow OWNER taskflow;
CREATE DATABASE taskflow_test OWNER taskflow;
```

Type `\q` to exit.

They create the user and databases that TaskFlow (through Prisma) uses: user `taskflow`, password `taskflow`, database `taskflow`, plus `taskflow_test` for the automated tests.

### Step 2: Redis

Install Redis and start it on the default port `6379`:

- **Windows:** install **Memurai Developer** (free, Redis-compatible) from https://www.memurai.com/get-memurai. It runs in the background by itself.
  - Or, if you use WSL (Ubuntu): `sudo apt install -y redis-server && sudo service redis-server start`
- **macOS:** `brew install redis && brew services start redis`
- **Ubuntu/Debian:** `sudo apt install -y redis-server && sudo systemctl start redis-server`

### Step 3: Mailpit (the email inbox)

Needed to test the full system. Mailpit is where you read the **sign-up code** (registering needs it), the **password reset link**, the **email-change code** and **reminder emails**. Without it, only logging in with the demo accounts works.

- **Windows:** download `mailpit-windows-amd64.zip` from https://github.com/axllent/mailpit/releases/latest, unzip it and double-click `mailpit.exe`. Keep that window open.
- **macOS:** `brew install mailpit && brew services start mailpit`
- **Linux:** `sudo bash < <(curl -sL https://raw.githubusercontent.com/axllent/mailpit/develop/install.sh)`, then run `mailpit`.

The inbox is at **http://localhost:8025**.

### Step 4: Get TaskFlow and point it at your Redis

```bash
git clone https://github.com/Cjake28/taskflow-app.git
cd taskflow-app
```

Create the settings file:

- **Windows (PowerShell):** `Copy-Item backend\.env.example backend\.env`
- **macOS / Linux:** `cp backend/.env.example backend/.env`

Open `backend/.env` in any text editor. Find this line:

```env
REDIS_URL=redis://:taskflow@127.0.0.1:6379/0
```

Change it to the following, because a fresh Redis has no password:

```env
REDIS_URL=redis://127.0.0.1:6379/0
```

Save the file. This is the only setting you need to change.

### Step 5: Start

```bash
npm run quickstart -- --no-docker
```

It installs the packages, creates the tables, adds the demo accounts and starts the app. Open **http://localhost:5173** and log in with `demo@taskflow.dev` / `Demo@12345!`.

**Next time,** just run `npm run dev` (with PostgreSQL and Redis running).

---

## 4. The ready-made settings

These are already in `backend/.env` (copied from `backend/.env.example`). `npm run setup` also fills in a random `JWT_ACCESS_SECRET`.

| Setting                   | Value                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Web app                   | http://localhost:5173                                                                 |
| API                       | http://localhost:4000 (docs: http://localhost:5173/api/docs)                          |
| Database (used by Prisma) | `postgresql://taskflow:taskflow@127.0.0.1:5432/taskflow`                              |
| Database user / password  | `taskflow` / `taskflow`                                                               |
| Test database             | `taskflow_test` (only for `npm test`)                                                 |
| Redis                     | `redis://:taskflow@127.0.0.1:6379/0` (password `taskflow`; Option B uses no password) |
| Email (SMTP)              | Mailpit at `127.0.0.1:1025`, inbox http://localhost:8025                              |
| Uploaded images           | saved in `backend/storage`                                                            |

These values are for your own computer only. They are not secrets and are not used anywhere else.

### Demo accounts

| Email               | Password      | What's inside                                                              |
| ------------------- | ------------- | -------------------------------------------------------------------------- |
| `demo@taskflow.dev` | `Demo@12345!` | 24 tasks, images, reminders, notifications                                 |
| `alex@taskflow.dev` | `Alex@12345!` | a few tasks; use it to check that one user can't open another user's tasks |

You can also register your own account. The 6-digit code arrives in Mailpit (http://localhost:8025).

---

## 5. Try these

- **Forgot password:** on the login page, click **Forgot password?**, enter `demo@taskflow.dev`, and open the email in Mailpit (http://localhost:8025).
- **Reminders:** create a task, click **Add reminder**, pick **Custom date & time** two minutes from now, and wait. The bell and Mailpit show it.
- **Dark mode:** Profile → Security → This device → Appearance (or follow your system's setting).

---

## 6. If something goes wrong

| You see                                                | Do this                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Docker is installed but not running`                  | Open Docker Desktop, wait until it is running, run `npm run quickstart` again.                                                              |
| `port is already allocated` / `address already in use` | Another program uses 5432, 6379, 1025, 8025, 4000 or 5173. Close it, or see "Ports already in use?" in the [README](README.md#quick-start). |
| `password authentication failed for user "taskflow"`   | Step 1 of Option B wasn't run (or used another password). Run the three SQL lines again.                                                    |
| `ERR AUTH` or `NOAUTH` (Redis)                         | The `REDIS_URL` password doesn't match your Redis. Without Docker, use `redis://127.0.0.1:6379/0` (Step 4).                                 |
| `Node.js 24 or newer is required`                      | Install Node.js 24+ from https://nodejs.org and open a new terminal.                                                                        |
| The page opens but you can't log in                    | Make sure the terminal running `npm run dev` shows `API listening`.                                                                         |
| No sign-up code / reset email arrives                  | Open http://localhost:8025. Without Docker, make sure Mailpit is running (Option B, Step 3). Emails arrive within a few seconds.            |

**Reset the demo accounts** (both options): `npm run db:seed`

**Start over from scratch** (deletes all local data):

- **Option A:** `docker compose down -v`, then `npm run setup`.
- **Option B:** `npx -w @taskflow/backend prisma migrate reset --force` (empties the database and re-creates the tables), then `npm run db:seed` for the demo accounts.

You can run `npm run setup` as many times as you like. It keeps your `backend/.env`, applies any new migrations and resets the demo accounts (add `-- --no-seed` to leave them as they are).

---

## 7. Optional: send real emails (Gmail SMTP)

By default every email goes to **Mailpit** (http://localhost:8025), not to real inboxes. That is enough to test everything. Follow this only if you want emails delivered to a real address.

1. **Turn on 2-Step Verification** for your Google account: https://myaccount.google.com/security → **2-Step Verification**. App passwords need it.
2. **Create an app password:** https://myaccount.google.com/apppasswords
   - App name: `TaskFlow` → **Create**.
   - Copy the 16-character password. Google shows it only once.
3. **Edit `backend/.env`.** Replace the six `SMTP_` / `MAIL_FROM` lines with these, using your Gmail address and the app password **without spaces**:

   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=you@gmail.com
   SMTP_PASS=abcdefghijklmnop
   MAIL_FROM="TaskFlow <you@gmail.com>"
   ```

4. **Restart the app:** press `Ctrl + C`, then run `npm run dev`.
5. **Try it:** register with your real email, or use **Forgot password?** on an account with your email. The email arrives in your inbox (check Spam the first time).

To go back to Mailpit, copy the six lines back from `backend/.env.example`.

`backend/.env` is ignored by Git, so your app password never ends up in the repository. Don't share it.

---

## 8. Optional: Google and GitHub sign-in

The **Google** and **GitHub** buttons on the login page appear only after you add the keys below. They don't need SMTP or Mailpit. Each takes about 5 minutes and is free.

The addresses below use the default web app port `5173`. If you changed `WEB_PORT`, use your port instead.

### Google

1. Open https://console.cloud.google.com and sign in.
2. Top bar → project picker → **New project** → name it `TaskFlow` → **Create**. Make sure it is selected.
3. Menu → **APIs & Services** → **OAuth consent screen** (also called **Google Auth Platform**) → **Get started**:
   - App name `TaskFlow`;
   - your email as the support email;
   - Audience **External**;
   - your email as the contact.

   → **Create**. Leave the **Branding** page (logo, links) empty; it isn't needed for local use.

4. **Audience** → **Test users** → **Add users** → add the Gmail addresses that will sign in. While the app is in "Testing", only these accounts can use Google sign-in.
5. **Clients** → **Create client**:
   - Application type: **Web application**;
   - Name: `TaskFlow local`;
   - **Authorized redirect URIs** → **Add URI**: `http://localhost:5173/api/v1/auth/oauth/google/callback`.

   → **Create**.

6. Copy the **Client ID** and **Client secret** right away (the secret is shown only once; **Download JSON** keeps a copy).
7. In `backend/.env`, fill in:

   ```env
   GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

8. Restart the app (`Ctrl + C`, then `npm run dev`). The login page now shows **Google**.

If Google says **redirect_uri_mismatch**, check that the redirect URI matches exactly (port included) and wait a few minutes: Google can take that long to apply changes. If it says **Access blocked**, add that Gmail address to **Test users**.

### GitHub

1. Open https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - Application name: `TaskFlow`;
   - Homepage URL: `http://localhost:5173`;
   - Authorization callback URL: `http://localhost:5173/api/v1/auth/oauth/github/callback`.

   Leave "Enable Device Flow" unchecked → **Register application**.

3. Copy the **Client ID**, then click **Generate a new client secret** and copy it (shown only once).
4. In `backend/.env`, fill in:

   ```env
   GITHUB_CLIENT_ID=Ov23li...
   GITHUB_CLIENT_SECRET=...
   ```

5. Restart the app. The login page now shows **GitHub**. Any GitHub account can sign in; there is no test-user list.

**Already have a TaskFlow account?** Sign in with your password, then use Profile → **Connected accounts** → **Connect** to link Google or GitHub to it.

---

For how the app works, the API and the tests, see the [README](README.md).
