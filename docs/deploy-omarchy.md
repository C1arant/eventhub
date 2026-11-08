# Deploying EventHub on Omarchy

For someone comfortable with a terminal but not a Linux expert. Omarchy is Arch-based (Hyprland), so packages come from `pacman`. EventHub runs in Docker and is exposed to phones by either a Cloudflare Tunnel or a Tailscale Funnel. No router port-forwarding is needed.

## 1. Install Docker

Omarchy may already ship Docker. Check first:

```bash
docker --version && docker compose version
```

If either is missing:

```bash
sudo pacman -S --needed docker docker-compose docker-buildx git
sudo systemctl enable --now docker.service
sudo usermod -aG docker $USER
```

Log out and back in (so the `docker` group applies), then confirm `docker ps` works without sudo.

## 2. Get the code onto the PC

Either `git clone <your-own-remote-url> ~/eventhub`, or copy the project folder to `~/eventhub` (USB stick, `scp`, `rsync`). Do not copy `node_modules`, `data` or `build`.

## 3. First run

```bash
cd ~/eventhub
mkdir -p data backups
cp .env.example .env
$EDITOR .env          # set PUBLIC_URL, ADDRESS_HEADER (see below), tunnel secrets
docker compose up -d --build
```

Open <http://localhost:3000/setup> and create the owner account. There are no default credentials. Check health with `curl localhost:3000/healthz` (prints `ok`) or `docker compose ps` (should say healthy).

The `mkdir` matters: if Docker has to create the folders it makes them root-owned. The image's entrypoint repairs ownership of `data` and `backups` on start (it chowns them to the container's `node` user, uid 1000, then drops privileges), but creating them yourself keeps them owned by you.

The app only listens on `127.0.0.1:3000` of the host. Only this PC and the tunnel containers (over the compose network, at `http://app:3000`) can reach it.

### Proxy headers (how the app knows it is behind https)

The container runs `server.js`, a thin wrapper around the SvelteKit adapter-node handler. adapter-node 6 ignores a runtime `ORIGIN` variable; it builds the request origin from headers. So:

- `PROTOCOL_HEADER=x-forwarded-proto` is set in the image. The tunnels send `x-forwarded-proto: https`. If the header is absent (direct `http://localhost:3000`), `server.js` sets it to `http`, so first-run setup works over plain http.
- `HOST_HEADER` is optional: adapter-node falls back to the normal `Host` header when it is unset or the header is absent.
- `ADDRESS_HEADER` selects where the real client IP comes from. If it is set but absent on a request (e.g. direct localhost access), `server.js` fills it from the socket address.

### Why ADDRESS_HEADER matters

Behind a tunnel every request arrives from the tunnel container's IP. If the app does not read the real client IP, the login rate limit (5 failures, then an increasing lockout, per IP and per email) treats every visitor as one person, and a few wrong passwords from anyone lock everyone out. Set it in `.env`:

| Tunnel | `.env` |
|---|---|
| Cloudflare | `ADDRESS_HEADER=cf-connecting-ip` |
| Tailscale Funnel | `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1` |
| Local only | leave blank |

After editing `.env`: `docker compose up -d`.

## 4. Option A: Cloudflare Tunnel

Needs a domain whose DNS is on Cloudflare.

1. Cloudflare dashboard, Zero Trust, Networks, Tunnels, Create a tunnel (Cloudflared). Copy the token.
2. Add a public hostname, e.g. `events.example.com`, service type HTTP, URL `http://app:3000`.
3. In `.env`: `TUNNEL_TOKEN=<token>`, `PUBLIC_URL=https://events.example.com`, `ADDRESS_HEADER=cf-connecting-ip`.
4. `docker compose --profile cloudflare up -d`

## 5. Option B: Tailscale Funnel

Free `*.ts.net` address; no domain needed.

1. In the Tailscale admin console, enable HTTPS certificates (DNS page) and allow Funnel for the node (Access controls: grant the `funnel` node attribute to `autogroup:member`, or to the tag your auth key uses).
2. Settings, Keys, Generate auth key (reusable is fine). Put it in `.env` as `TS_AUTHKEY=...`; choose `TS_HOSTNAME` (default `eventhub`).
3. In `.env`: `ADDRESS_HEADER=x-forwarded-for`, `XFF_DEPTH=1`.
4. `docker compose --profile tailscale up -d`
5. Your URL is `https://eventhub.<tailnet-name>.ts.net`; put it in `PUBLIC_URL`. `deploy/tailscale-serve.json` configures Funnel on 443 proxying to `http://app:3000`.

## 6. Keep the PC awake

The app is offline whenever the PC sleeps. Omarchy's Hyprland idle daemon (hypridle) may suspend it. Either edit `~/.config/hypr/hypridle.conf` and remove or comment the `listener` block that runs `systemctl suspend`, or hold an inhibit lock: `systemd-inhibit --what=idle:sleep --who=eventhub --why="serving events" sleep infinity` (wrap it in a service if you want it permanent). Also check BIOS/power settings. Docker's `restart: unless-stopped` brings the containers back after a reboot.

## 7. Backups

`scripts/backup.mjs` makes a consistent online copy of the SQLite database (better-sqlite3 `.backup()`) and copies `data/uploads` into `./backups/YYYY-MM-DD/`, then keeps only the newest 14 daily folders. Run it by hand:

```bash
./scripts/backup.sh          # same as: docker compose exec -u node app node scripts/backup.mjs
```

Daily at 03:30 with a systemd user timer (the unit assumes the repo is at `~/eventhub`; edit `WorkingDirectory`/`ExecStart` if not):

```bash
mkdir -p ~/.config/systemd/user
cp deploy/eventhub-backup.service deploy/eventhub-backup.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now eventhub-backup.timer
loginctl enable-linger $USER      # run even when you are logged out
systemctl --user list-timers      # confirm
systemctl --user status eventhub-backup   # result of the last run
journalctl --user -u eventhub-backup -e   # its output
```

A backup run exits non-zero (and the service shows `failed`) if the app container is not running, because it runs inside it. Start the app and run `./scripts/backup.sh` again.

Also copy `./backups` somewhere off this PC now and then (external disk, cloud storage); a backup on the same disk does not survive a disk failure.

## 8. Updating

```bash
cd ~/eventhub
git pull
docker compose up -d --build
```

Migrations run automatically at start-up. Take a backup first (`./scripts/backup.sh`).

Tunnel image versions are pinned in `docker-compose.yml` (`cloudflare/cloudflared`, `tailscale/tailscale`). To bump: look up the latest release tag on Docker Hub, edit the tag, then `docker compose --profile cloudflare pull` (or `--profile tailscale`) and `up -d`.

## 9. Restoring from a backup

```bash
cd ~/eventhub
docker compose stop app
mv data data.broken
mkdir -p data
cp backups/2026-11-08/eventhub.db data/eventhub.db
cp -r backups/2026-11-08/uploads data/uploads      # if present
sudo chown -R 1000:1000 data                        # the container's "node" user
docker compose start app
```

Use the date you want. The backup is a single file, so there are no `-wal`/`-shm` files to copy. Confirm in the app, then delete `data.broken`.

## 10. Troubleshooting

- Logs: `docker compose logs -f app` (or `cloudflared` / `tailscale`).
- **403 on every form submit**: the app believes the request protocol differs from the browser's. Check the tunnel sends `x-forwarded-proto` and that you did not override `PROTOCOL_HEADER`.
- **"Too many attempts" for everyone**: `ADDRESS_HEADER` is not set for your tunnel (see the table above), so all visitors share one IP. Fix `.env`, then `docker compose up -d`. Lockouts clear on their own within 15 minutes.
- **Permission denied writing `/app/data`**: normally repaired by the entrypoint; otherwise `sudo chown -R 1000:1000 data backups`.
- **Tunnel up but site unreachable**: confirm the public hostname service is `http://app:3000` (not `localhost`).
- **Site offline overnight**: the PC suspended; see "Keep the PC awake".
