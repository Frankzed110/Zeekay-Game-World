# Zeekay Game World — Publish & Play (no coding needed)

Everything below is **free** and done in your web browser. No installs.

---

## Part 1 — Put the game online (≈ 5 minutes, once)

1. Open your repository: **https://github.com/Frankzed110/Zeekay-Game-World**
2. Click **Settings** (top bar of the repo) → **Pages** (left menu).
3. Under **Build and deployment → Source**, choose **GitHub Actions**. (It saves automatically.)
4. Click the **Actions** tab (top bar) → on the left click **Deploy web game** →
   click **Run workflow** (right side) → green **Run workflow** button.
5. Wait for the green ✓ (about 3–5 minutes). Click the finished run — the link is shown
   under **deploy**:

   ### 👉 https://frankzed110.github.io/Zeekay-Game-World/

That link is your public game. Share it with anyone — it works on computers, tablets and phones.
Every time new code is pushed to the repository, the game updates itself automatically.

**On phones:** open the link → browser menu → **Add to Home Screen**. It then opens full-screen like an
app. Turn the phone sideways (landscape) for the best view.

---

## Part 2 — Turn on online leaderboards & cloud saves (optional, ≈ 15 minutes)

The game is fully playable without this (progress saves on each player's device). Do this
when you want the **Hall of Champions** to be shared between all players.

### A. Free database (MongoDB Atlas)
1. Go to **https://www.mongodb.com/cloud/atlas/register** and sign up (free).
2. Create a **free M0** cluster (any region near Saudi Arabia, e.g. Bahrain/Frankfurt).
3. **Database Access** → Add user → choose a username + password (write them down).
4. **Network Access** → Add IP Address → **Allow access from anywhere** (`0.0.0.0/0`).
5. **Connect** → **Drivers** → copy the connection string. It looks like
   `mongodb+srv://USER:<password>@cluster0.xxxxx.mongodb.net/` — replace `<password>` with yours.

### B. Free server (Render)
1. Go to **https://render.com** → sign up with your GitHub account (free).
2. **New → Blueprint** → choose **Zeekay-Game-World** → **Apply**.
3. When asked for **MONGO_URL**, paste the connection string from step A5.
4. Wait until it says **Live**, then copy its address, e.g. `https://zeekay-api.onrender.com`.
   Open `https://zeekay-api.onrender.com/health` — you should see `{"status":"ok"}`.

### C. Connect the game to the server
1. GitHub repo → **Settings → Secrets and variables → Actions → Variables** tab →
   **New repository variable**.
2. Name: `BACKEND_URL` · Value: your Render address (no slash at the end).
3. **Actions → Deploy web game → Run workflow** again. Done — leaderboards are live.

> Free-tier note: the Render server sleeps after ~15 minutes without players. The first visitor
> after that waits about a minute for leaderboards; the game itself never waits.

---

## Part 3 — Play it on your own computer (optional, for testing changes)

Only needed if you want to try changes before publishing.
1. Install **Node.js 22 LTS** from https://nodejs.org and **Python 3.12** from https://python.org.
2. Download the repo (green **Code** button → **Download ZIP**) and unzip it.
3. Open a terminal in the `frontend` folder and run, one at a time:
   ```
   npm install -g yarn
   yarn install
   yarn web
   ```
4. Your browser opens the game at http://localhost:8081.

---

## Mobile app stores (not free)

The web link already works on every phone. Publishing to the stores later costs money:
Google Play **$25 one-time**, Apple App Store **$99/year**. The project is already set up for
Expo's build service (EAS) when you are ready.

## How to play

| | Computer | Phone / tablet |
|---|---|---|
| Aim & shoot | Hold **Space** (or drag with the mouse), **W/S** to aim, release to fire | Drag on the battlefield like a slingshot, release to fire |
| Move | **A / D** | Hold the ◀ ▶ buttons |
| Abilities | **1 2 3 4** | Tap the round buttons |
| Arrow element | **Q** | Tap the coloured chips |
| Pause | **Esc** | ⏸ button |

Tip: watch the **wind** meter at the top — it bends your arrows. Aim for heads for double damage.
