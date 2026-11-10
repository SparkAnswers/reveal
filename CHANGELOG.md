# Changelog

All notable changes to the Reveal panel plugin are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.0.1 (2026-11-10)

### Fixed

- The Preview slider no longer affects viewers. Its position was stored in the panel options, so
  saving a dashboard with the slider at, say, 100 % left the image revealed for everyone and
  overrode expiry and the hidden periods of repeat schedules. The preview is now kept in memory
  only, applies solely to the panel open in the panel editor, and is never saved. A value saved
  by 1.0.0 is ignored, so affected dashboards follow their schedule again without re-saving.
- The "Dashboard time" progress source can no longer run ahead of the real clock, so moving the
  time picker into the future does not reveal the image early or skip a hidden period. Looking
  back at an earlier state still works for dated reveals; repeat schedules always run on the real
  clock, so their hidden periods cannot be skipped in either direction. Expiry is always judged against the real clock, so an
  older time range cannot bring an expired image back.
- Advent mode no longer shows the whole image behind closed doors. The cells were left unclipped
  so the doors could swing open, which also left the image unclipped; only opened doors now show
  their part of the image.
- A start date typed in the editor is no longer silently reset when it is not before the reveal
  date; the field now explains the problem instead.
- The Preview slider's "Live" label now matches the panel for repeating schedules, expired reveals
  and panels without a reveal date, and stays current while the editor is open.

### Changed

- The "Reveal demo" dashboard runs on a new window (2026-10-11 to 2027-01-19) so its panels are
  mid-reveal again.
- The start, reveal and expire date fields use Grafana's own date-time picker instead of the
  browser's native control. A typed value is applied on Enter or when leaving the field.
- New plugin icon.
- The local Docker stack defaults to Grafana 13.3.0.

## 1.0.0 (2026-10-06)

Initial release.

### Added

- Reveal panel (`sparkanswers-reveal-panel`): hold one image (PNG/JPEG/WebP/SVG/GIF) behind a
  time-based reveal that completes on a configurable reveal date.
- Reveal modes: fade, blur (default), pixelate, jigsaw, shuffle, wipe, iris, scratch, blinds,
  mosaic, brightness, color, advent, puzzle and combo (ordered stack of modes).
- Easings: linear, ease-in (default), ease-out, ease-in-out and steps (one step per day,
  recommended for jigsaw/advent).
- Progress source: browser clock or dashboard time; optional countdown and post-reveal caption.
- Deterministic seeded tile orders (seed derived from the reveal date) so every viewer and every
  refresh sees the same state.
- Image upload stored inline as a data URL in the dashboard JSON, with a 1 MB warning and a
  4 MB hard cap; animated GIFs are frozen until fully revealed unless opted in.
- Editor preview override (0-100 %) to inspect any point of the reveal.
- Docker-only toolchain: multi-stage `Dockerfile` (deps / build / dist / runtime),
  `docker-compose.yaml` tool services, `Makefile` targets, provisioned "Reveal demo"
  dashboard with blur, pixelate, jigsaw and advent panels.

### Known limitations

- The image is embedded in the dashboard JSON: anyone with dashboard read access (or API
  access) can extract it. The reveal is cosmetic, not a secrecy mechanism.
- Pixelate (canvas) and combo render only the first frame of animated GIFs.
