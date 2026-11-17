# Zeekay Game World

**▶ Play / publish without coding: see [PLAY_AND_DEPLOY.md](PLAY_AND_DEPLOY.md)**

A cross-platform (web · iOS · Android) **2.5D side-view archery action-RPG**. Aim with a slingshot drag,
read the wind, and loose arrows through four kingdoms of Ardenfall to reunite the shattered Sunshard.

- **Story campaign**: 4 kingdoms × 3 stages (clear · rescue · escort · defense · waves · boss), per-kingdom visuals, hazards and music
- **Arena**: Duel · Endless Survival · 3-round Tournament · Co-op (2 AI allies) — all scores post to the **Hall of Champions**
- **RPG**: 3 classes, 4 attributes (+3 points/level, free respec), 8 bows, 6 armors, crafting with kingdom materials,
  5 elemental arrows, 4 abilities, Training Yard drills → mastery ranks
- **Physics combat**: gravity + wind ballistics, trajectory preview, headshots, shields, ragdolls, explosive barrels,
  cages/hostages, telegraphed boss attacks and hazards (geysers, blizzard icicles, lightning)
- **Saves**: device-first, auto cloud sync with an anonymous player key (newer `updated_at` wins)

## Repository layout

```
backend/            FastAPI + Motor (MongoDB). All routes under /api.
  server.py         players, saves, scores, leaderboard, champions
  scripts/dev_inmemory.py   run the API on an in-memory Mongo (no MongoDB needed)
  tests/test_api.py pytest suite (mongomock-motor)
tools/generate_audio.py     numpy synthesizer → frontend/assets/audio/*.wav (19 files, deterministic)
frontend/           Expo SDK 58 · React Native 0.88 · expo-router · @shopify/react-native-skia
  index.ts          entry (loads CanvasKit on web before the router)
  app/              routes: title, settings, mission/[stageId], combat/[stageId], (tabs)/story|arena|armory|champions
  src/game/         engine.ts (pure TS simulation) · render.tsx (Skia) · missions.ts · rpg.ts · palette.ts · audio.ts · types.ts
  src/state/        progression.ts (save schema + rules, pure) · save.tsx (SaveProvider + cloud sync)
  src/components/   ui kit, icons, combat HUD/controls, animated vista
  tests/            engine-sim.ts (aim-bot plays every mission) · progression.ts
```

## Run locally

Backend (Python 3.11+):

```bash
cd backend && pip install -r requirements.txt
```

```bash
cp backend/.env.example backend/.env   # set MONGO_URL / DB_NAME
```

```bash
cd backend && uvicorn server:app --host 0.0.0.0 --port 8001
```

No MongoDB handy? Use the in-memory server (data is lost on exit):

```bash
cd backend && python scripts/dev_inmemory.py
```

Frontend:

```bash
cd frontend && yarn install && cp .env.example .env   # EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

```bash
cd frontend && yarn web        # or: yarn ios / yarn android (development build — Skia & audio are native modules)
```

Without `EXPO_PUBLIC_BACKEND_URL` the game is fully playable offline; leaderboards show an offline state.

## Controls

| Input | Draw / fire | Aim | Move | Abilities | Element | Pause |
|---|---|---|---|---|---|---|
| Touch | drag on battlefield, release | drag direction (pull down-left → aim up-right) | hold ◀ ▶ pads | tap 1–4 | tap chip | ⏸ |
| Keyboard | hold Space | W/S or ↑/↓ | A/D | 1–4 | Q | Esc |

Input flows through one action map (`beginDraw / aimDelta / aimNudge / releaseDraw / setMove / useAbility / setElement`)
on the engine — the seam for gamepad support.

## Checks

```bash
cd frontend && npx tsc --noEmit && npx eslint . && yarn test
```

```bash
cd backend && python -m pytest -q tests
```

```bash
backend/scripts/smoke.sh http://localhost:8001        # curl suite against a running API
```

```bash
cd frontend && BASE_URL=http://127.0.0.1:3000 node tests/e2e/smoke.js   # browser smoke on the web build
```

```bash
python3 tools/generate_audio.py
```

## Design notes / deviations from the original brief

- **Renderer**: each frame is recorded into a single `SkPicture` and shown via one `<Picture/>` node instead of a
  declarative tree of hundreds of Skia elements re-reconciled at 60 fps — same Skia output, far less React work on
  mid-range Android.
- **Native tabs** import from `expo-router/native-tabs` (the SDK 58 location); classic tabs from `expo-router/tabs`.
- **Fonts** are static weights (Outfit Bold/ExtraBold/SemiBold, Plus Jakarta Sans Regular/SemiBold/Bold) from the
  `@expo-google-fonts` packages — static weights render reliably on Android, unlike variable fonts.
- **theme.ts** keeps the brief's tokens; a local `NamedStyles` type replaces `StyleSheet.NamedStyles`, which RN 0.88 no
  longer exports.
- **Backend** keeps the brief's API but adds input validation (player key format, score bounds, mode pattern,
  difficulty enum). Scores are still client-authoritative — fine for v1, but a competitive launch needs server-side
  run validation (see Roadmap).
- Settings uses `KeyboardAvoidingView` (react-native-keyboard-controller was not added — one text field).

## Roadmap

1. Server-side score plausibility checks / signed run summaries before public leaderboards
2. Gamepad mapping (Gamepad API on web, native controller module) on the existing action map
3. Human multiplayer (the engine already separates teams, input and identity keys)
