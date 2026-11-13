# Homelab deploy (meta.anishalle.com)

Every push to `main` runs `.github/workflows/deploy-homelab.yml`, which SSHes into the homelab as
the `deploy` user. That user can do exactly one thing: run the deploy script. You can also run it by
hand from the Actions tab (**Deploy to homelab → Run workflow**).

## What runs on the server

`/usr/local/bin/hackmeta-deploy` (root-owned; `hackmeta-deploy` in this folder is a reference copy):

1. `git fetch origin main` in `~/apps/hackmeta-26`
2. `git reset --hard origin/main` (the server only ever runs main; local edits there are discarded)
3. `docker compose up -d --build`
4. waits up to 90 s for `http://127.0.0.1:8420/api/v1/health`, else prints the backend logs and fails

Untracked files are never touched (no `git clean`): `.env`, `backend/.env`, `secrets/`, `backups/`.

## Database

Postgres 18 runs next to the backend as the compose `db` service (volume `hackmeta-26_db-data`, no host
port). The server's root `.env` holds `POSTGRES_PASSWORD`; `backend/.env` points at it with
`DATABASE_URL=postgresql://hackmeta:<POSTGRES_PASSWORD>@db:5432/hackmeta`. It replaced the Timescale
database in us-west-2 on 2026-11-13: the server is in us-east-1, so every query cost ~70 ms, and
`/moves/feed` dropped from 1.4 s to 34 ms. Dumps go in `backups/`:

```sh
docker compose exec -T db pg_dump -U hackmeta -Fc hackmeta > backups/hackmeta-$(date +%F-%H%M).dump
```

## How the `deploy` user is locked down

- `/home/deploy/.ssh/authorized_keys`:
  `restrict,command="sudo -n -u ubuntu /usr/local/bin/hackmeta-deploy" ssh-ed25519 … github-actions@hackmeta-26`
  The command the client sends is ignored; `restrict` turns off PTY, port, agent and X11 forwarding.
- `/etc/sudoers.d/hackmeta-deploy`: `deploy ALL=(ubuntu) NOPASSWD: /usr/local/bin/hackmeta-deploy ""`
  (that script, no arguments, nothing else).
- Password is locked; not in the `docker` or `sudo` groups.

The script is root-owned on the server and not read from the repo, so a push cannot change what the
key runs. Editing it means editing this copy and reinstalling it by hand:

```sh
scp deploy/homelab/hackmeta-deploy ubuntu@34.200.110.216:/tmp/
ssh ubuntu@34.200.110.216 'sudo install -o root -g root -m 755 /tmp/hackmeta-deploy /usr/local/bin/'
```

## GitHub secrets

| Secret | Value |
| --- | --- |
| `HOMELAB_DEPLOY_KEY` | private half of the deploy key (public half is in the deploy user's authorized_keys) |
| `HOMELAB_KNOWN_HOSTS` | `ssh-keyscan 34.200.110.216` output |
| `HOMELAB_HOST` | `34.200.110.216` |

To rotate: `ssh-keygen -t ed25519 -N "" -f k`, replace the key in the authorized_keys line above,
then `gh secret set HOMELAB_DEPLOY_KEY < k`.

To turn deploys off quickly: disable the workflow in the Actions tab, or comment out the key line on
the server.
