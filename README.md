# peek-panel

An overlay panel with a **peek strip**. Open a case study (or any panel) over your page and leave a slim strip of the page visible beside it. Hover the strip and the panel slides aside to give a glimpse of what's behind. Click it, swipe it, drag the edge, or press Esc, and the panel springs out of the way.

- **Works everywhere:** one web component, `<peek-panel>`, in plain HTML, Webflow, WordPress, React, Vue, Svelte, Angular and others
- **Phone layout built in:** below 810px wide the strip runs across the top and the panel slides up and down
- **Accessible:** focus moves into the overlay and stays there, Esc closes it, focus returns to the button that opened it, and reduced motion is respected
- **Nice details:** the page behind is usable again the moment closing starts, videos behind it pause while it's open, and the spring motion matches Framer's *Time* and *Bounce*
- **Small:** about 6 KB gzipped, no dependencies

**[Live demo →](https://estherchaep.github.io/peek-panel/)**

## Install

**From a CDN** (no build step, works in Webflow, WordPress, Squarespace and similar):

```html
<script src="https://cdn.jsdelivr.net/gh/estherchaep/peek-panel@v0.1.0/dist/peek-panel.min.js"></script>
```

**From GitHub with npm** (it isn't on the npm registry yet):

```bash
npm install github:estherchaep/peek-panel
```

```js
import "peek-panel" // registers <peek-panel>
```

## Quick start

```html
<button data-peek-open="case-study">Open case study</button>

<peek-panel id="case-study" label="Back to projects" dialog-label="Case study">
  <article>
    <button data-peek-close>← Back</button>
    <h2>My case study</h2>
    …
  </article>
</peek-panel>
```

- `data-peek-open="id"` on any element opens the overlay with that id.
- `data-peek-close` on any element inside the overlay closes it.
- The content scrolls inside the panel; the page behind stays where it was.

## Settings (attributes)

| Attribute | Default | What it does |
|---|---|---|
| `open` | — | Present while open. Add or remove it to open or close. |
| `label` | `Close` | Screen-reader label for the strip |
| `dialog-label` | — | Screen-reader label for the panel |
| `peek-distance` | `24` | How far the panel moves when you hover the strip (px) |
| `peek-time` | `0.15` | Duration of the peek (s) |
| `exit-offset` | `full` | How far the panel travels sliding in from and out to the right: `full` (from fully off-screen, out until it's gone) or a distance in px, e.g. `250` |
| `exit-offset-y` | `full` | The same for the phone layout, sliding up from and down to the bottom |
| `spring-time` | `1.1` | Spring duration for sliding in and out (s), like Framer's *Time* |
| `spring-bounce` | `0.2` | Spring bounce, 0–1, like Framer's *Bounce* |
| `drag-threshold` | `120` | How far a drag must go to close (px) |
| `side` | `auto` | `left`, `top`, or `auto` (top below `mobile-breakpoint`) |
| `mobile-breakpoint` | `810` | Width (px) below which `auto` switches to the top strip. `0` = never |
| `no-peek` | — | Turn off the hover peek |
| `no-drag` | — | Turn off dragging |
| `no-esc` | — | Esc doesn't close it |
| `no-backdrop-close` | — | Clicking the backdrop doesn't close it |
| `no-enter-animation` | — | Don't slide in when opening |
| `no-slide-out` | — | Fade out without sliding |
| `no-scroll-lock` | — | Let the page behind scroll |
| `no-pause-videos` | — | Keep videos behind playing |
| `no-cursor` | — | Use the normal pointer instead of the back-arrow cursor |

## Styling (CSS custom properties)

```css
peek-panel {
  --peek-strip-size: 48px;          /* strip width, left layout */
  --peek-strip-size-top: 56px;      /* strip height, phone layout */
  --peek-backdrop: rgba(0, 0, 0, 0.25);
  --peek-panel-background: #fff;
  --peek-radius: 32px;              /* left corners, left layout */
  --peek-radius-top: 24px;          /* top corners, phone layout */
  --peek-shadow: 0 0 40px rgba(0, 0, 0, 0.12);
  --peek-fade: 0.3s;                /* fade in/out */
  --peek-z-index: 1000;
  --peek-cursor-size: 40px;
  --peek-cursor-background: transparent; /* circle behind the back arrow */
  --peek-cursor-color: #000;              /* the back arrow */
  --peek-focus-ring: rgb(34, 34, 34);
}
```

For deeper changes, style the parts: `peek-panel::part(panel)`, `::part(strip)`, `::part(backdrop)`, `::part(cursor)`.

## JavaScript

```js
const overlay = document.querySelector("peek-panel")

overlay.open()      // optional: overlay.open(buttonToReturnFocusTo)
overlay.close()
overlay.toggle()
overlay.isOpen      // true / false

overlay.addEventListener("peek-open", () => {})
overlay.addEventListener("peek-close", (e) => e.detail.reason)  // closing started: "strip" | "drag" | "escape" | "backdrop" | "button" | "api"
overlay.addEventListener("peek-closed", (e) => e.detail.reason) // finished animating out
overlay.addEventListener("peek-hover", (e) => e.detail.peeking)
```

## Using it in frameworks

**React** (18 and 19): drive it through a ref. Don't pass `open` as a prop: the element has an `open()` method, and React would overwrite it.

```jsx
import { useEffect, useRef } from "react"
import "peek-panel"

export function CaseStudy({ open, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (open) ref.current.open()
    else ref.current.close()
  }, [open])
  useEffect(() => {
    const el = ref.current
    el.addEventListener("peek-close", onClose)
    return () => el.removeEventListener("peek-close", onClose)
  }, [onClose])
  return <peek-panel ref={ref} label="Back">{children}</peek-panel>
}
```

**Vue:** add `compilerOptions.isCustomElement = (tag) => tag === "peek-panel"`, then bind `open` as an attribute: `<peek-panel :open.attr="open ? '' : null" @peek-close="open = false">`.

**Svelte / Angular / anything else:** use the element like any HTML tag. Angular needs `CUSTOM_ELEMENTS_SCHEMA`.

**Your own markup:** the engine works on any four elements:

```js
import { PeekController } from "peek-panel"

const peek = new PeekController(
  { host, backdrop, panel, strip, cursor },   // your elements
  { peekDistance: 32, springTime: 1.2 },      // any options from the table above
  { onCloseStart: (reason) => {}, onClosed: () => {} }
)
peek.open()
```

The host gets `data-state` (`closed` / `open` / `closing` / `fading`), `data-mode` (`left` / `top`), `data-peeking` and `data-cursor` attributes for your CSS.

## Browser support

Current Chrome, Edge, Safari (macOS and iOS) and Firefox. It uses custom elements, Shadow DOM, pointer events and the CSS `translate` property.

## Development

```bash
npm install
npm run build      # dist/peek-panel.js (ES module), dist/peek-panel.min.js (script tag), dist/types
npm run typecheck
npm run demo       # http://localhost:5173/demo/
```

## License

MIT © Esther Park
