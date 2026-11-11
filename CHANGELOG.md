# Changelog

## 0.1.0 — 2026-11-11

First release.

- `<peek-panel>` web component, usable in plain HTML and any framework
- Framework-free `PeekController` engine for custom setups
- Hover the strip to peek (0.15s); click, tap, Esc, drag or a `data-peek-close` button to slide out and close
- The panel slides in from fully off-screen and slides out until it's completely gone (`exit-offset` / `exit-offset-y`: `full` by default, or a distance in px)
- Spring motion matching Framer's Time + Bounce (1.1s, bounce 0.2 by default)
- Phone layout: strip across the top, panel slides up and down
- Back-arrow cursor over the strip that appears instantly, right under the pointer
- Page scroll lock, focus moved in and kept inside, focus returned on close, reduced-motion support
- The page behind is usable again the moment closing starts
- Pauses videos on the page behind while open
- `data-peek-open` buttons, `open` attribute, `open()` / `close()` / `toggle()`, and `peek-open` / `peek-close` / `peek-closed` / `peek-hover` events
