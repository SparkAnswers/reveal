# Reveal — Architecture & Decisions (v0.1, 2026-10-05)

Grafana panel that progressively reveals an uploaded image/GIF as a target date approaches.
All builds run in Docker. **Note:** `docker`, `podman`, `nerdctl` are not on PATH and `/var/run/docker.sock` is absent on this machine; plan assumes Docker Engine + Compose v2 get installed.

Docs consulted (context7, `/grafana/plugin-tools`): *how-to-guides/panel-plugins/custom-panel-option-editors* (`addCustomEditor`), *shared/backend-plugin-anatomy* (`backend`/`executable`), *shared/implement-resource-handler* + *app-plugins/add-resource-handler* (`httpadapter`, `/api/plugins/<id>/resources/...`), *shared/troubleshoot-plugin-doesnt-load* (unsigned/dev mode), *get-started* (`mage -v build:linux`).

## 1. Plugin type & image storage

| Option | Pros | Cons |
|---|---|---|
| **(a) Panel-only, base64 data URL in panel options** | Zero backend, trivial Docker build, works anywhere incl. Grafana Cloud | Dashboard JSON bloat; every dashboard *version* row stores the blob; image is public to anyone with dashboard read |
| (b) Panel + Go backend, files on volume, served via `/api/plugins/<id>/resources/img/<hash>` | Big files OK; enables server-side degraded images (true secrecy) | Needs `backend: true` + `executable` in plugin.json, Go toolchain, mage, platform binaries; a panel plugin with a backend is unusual — in practice this becomes an **App plugin** (backend + bundled panel) |
| (c) External URL only | Simplest | No upload; owner must host images; CORS/hotlink issues for canvas modes |

**Size reality for (a):** Grafana documents no explicit dashboard-size limit. Practical ceilings: reverse proxies (nginx default `client_max_body_size` 1 MB), MySQL `max_allowed_packet`/column type, and the fact that dashboard JSON is fetched on every load and copied into version history. Guideline: **warn above 1 MB encoded, hard-cap 4 MB** (~3 MB raw image). Enforce in the upload editor (client-side downscale/compress non-GIF images; reject oversize GIFs).

**Recommendation:** **v1 = (a) + (c)**: frontend-only panel, `image.kind: 'dataUrl' | 'url'`. Ships fast, Docker build is Node-only.
**v2 = (b) as an App plugin** (`reveal-app` with nested panel) once owner confirms server-side enforcement/large files matter. Options schema keeps `image.kind: 'resource'` reserved so dashboards migrate without breaking.

Dev settings: `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=<plugin-id>` (or `GF_DEFAULT_APP_MODE=development`). Backend plugins additionally require a signed/allow-listed binary and `backend: true`, `executable: "gpx_reveal"` in plugin.json.

## 2. Reveal engine

- `p = clamp((now − start) / (reveal − start), 0, 1)`; `start` defaults to panel creation time if unset.
- `eased = easing(p)`; easings: `linear | easeIn | easeOut | easeInOut | steps(n)`. Modes consume `eased`.
- **`now` source:** browser clock by default; toggle **"Use dashboard time"** (`timeRange.to`) to look back at earlier states (capped at the real clock, so it cannot reveal early); an in-memory, editor-only preview slider forces a value in the editor. Server time is v2 (backend returns `now` to defeat clock tampering).
- **Cadence:** `setInterval` inside the panel, period = `max(1s, (reveal − start)/1000)` clamped to ≤60 s, plus recompute on every panel render/refresh. Clear on unmount.
- **Security, plainly:** in v1 the *full* image is in the dashboard JSON / network response. Anyone who can view the dashboard can open DevTools and see it immediately. The reveal is cosmetic. True secrecy requires v2's backend serving only a server-degraded image for the current `p`.

## 3. GIF handling

| Mode family | Technique | GIF stays animated? |
|---|---|---|
| fade, blur, brightness, saturate | CSS `filter`/`opacity` on `<img>` | Yes |
| wipe, iris, blinds | `clip-path` / `mask-image` on `<img>` | Yes |
| pixelate, tile-puzzle/shuffle, scatter | `<canvas>` | No by default |

**Recommendation:** v1 canvas modes draw the **first frame** for GIFs (decode via `createImageBitmap`; note in UI "animation resumes at 100%", then swap to native `<img>`). Add **gifuct-js** frame decoding in v1.1 behind a `modeSettings.animateGif` flag with a frame-count cap (e.g. ≤200 frames) to bound CPU. Pixelate can alternatively be done with CSS `image-rendering: pixelated` on a downscaled canvas, so only shuffle truly needs per-frame work.

## 4. Panel options schema

```ts
export type RevealMode = 'fade' | 'blur' | 'pixelate' | 'tiles' | 'wipe' | 'iris';
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface ImageRef {
  kind: 'dataUrl' | 'url' | 'resource';   // 'resource' reserved for v2 backend
  src: string;                              // data:... | https://... | /api/plugins/<id>/resources/img/<hash>
  mime?: string; width?: number; height?: number; bytes?: number;
}

export interface RevealOptions {
  image?: ImageRef;
  startDate?: string;        // ISO-8601; default = first save
  revealDate: string;        // ISO-8601
  mode: RevealMode;
  modeSettings: {
    blurMaxPx?: number; pixelMinSize?: number;
    tiles?: { cols: number; rows: number; seed: number };
    wipe?: { direction: 'ltr' | 'rtl' | 'ttb' | 'btt' | 'radial' };
    animateGif?: boolean;
  };
  easing: Easing;
  timeSource: 'browser' | 'dashboard';
  showCountdown: boolean;
  caption?: string;
  previewOverride?: number;  // 0..1, editor-only
}
```

## 5. Repo layout

```
reveal/
  src/
    module.ts                 # PanelPlugin<RevealOptions>, addCustomEditor(ImageUploadEditor)
    plugin.json               # id: <org>-reveal-panel, type: panel
    types.ts                  # RevealOptions
    components/RevealPanel.tsx
    components/Countdown.tsx
    components/editors/ImageUploadEditor.tsx   # drop zone, size guard, downscale
    reveal/progress.ts        # p, easing, clock source
    reveal/modes/{index,fade,blur,pixelate,tiles,wipe,iris}.ts  # Mode interface: render(ctx, eased)
    reveal/gif.ts             # first-frame / gifuct adapter
  pkg/                        # v2 only: main.go, plugin/{app,resources,store}.go, Magefile.go
  tests/                      # jest (unit) ; e2e via @grafana/plugin-e2e later
  Dockerfile  docker-compose.yml  package.json
```

## 6. Docker build & dev loop

**Dockerfile**
```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run test -- --ci

# v2 only; harmless when pkg/ is absent (--target frontend)
FROM golang:1.23-alpine AS backend
WORKDIR /app
RUN go install github.com/magefile/mage@latest
COPY . .
RUN [ -d pkg ] && mage -v build:linux || true

FROM scratch AS dist
COPY --from=frontend /app/dist /dist
COPY --from=backend  /app/dist /dist
```

**docker-compose.yml**
```yaml
services:
  build:
    build: { context: ., target: frontend }
    volumes: [ "./:/app", "node_modules:/app/node_modules" ]
    command: npm run build
  test:
    extends: build
    command: npm test -- --ci
  grafana:
    image: grafana/grafana:11.6.0
    ports: [ "3000:3000" ]
    environment:
      GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: "<org>-reveal-panel"
      GF_DEFAULT_APP_MODE: development
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: Admin
    volumes:
      - ./dist:/var/lib/grafana/plugins/reveal
      - ./provisioning:/etc/grafana/provisioning
volumes: { node_modules: {} }
```

Commands: scaffold `docker run --rm -it -v "$PWD":/w -w /w node:22 npx @grafana/create-plugin@latest --plugin-type=panel --no-backend` · build `docker compose run --rm build` · test `docker compose run --rm test` · run `docker compose up grafana` → http://localhost:3000 · watch `docker compose run --rm build npm run dev`. Grafana reloads plugin assets on page refresh; restart `grafana` only when plugin.json changes.

## 7. Risks / open questions for owner

- **Max upload size:** is a ~3 MB raw / 4 MB encoded cap acceptable for v1, or are large GIFs core to the use case (pushes v2 forward)?
- **Secrecy requirement:** is "cosmetic reveal, image technically downloadable" OK, or must the reveal be enforced server-side?
- **Multiple images per panel** (sequence/gallery) or strictly one?
- **Deployment target:** self-hosted only (unsigned OK) or Grafana Cloud (requires signing; backend plugins cannot write local disk there — v2 storage would need object storage)?
- **Clock trust:** is browser-clock manipulation an accepted loophole for v1?
- **Grafana version floor:** 11.x assumed; confirm no 10.x installs to support.
