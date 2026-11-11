// <peek-panel>: the web component. Works in plain HTML and in any framework.
//
//   <button data-peek-open="case1">Open case study</button>
//   <peek-panel id="case1" label="Back to home">
//     <button data-peek-close>Back</button>
//     …your case study…
//   </peek-panel>
//
// Methods: open(), close(), toggle(). Property: isOpen.
// Events: peek-open, peek-close (closing started), peek-closed (fully gone), peek-hover.
// Settings are attributes (see ATTRIBUTES below); looks are CSS custom properties.

import { PeekController, defaultOptions, type CloseReason, type PeekOptions } from "./core"

const STYLE = /* css */ `
:host {
  --peek-strip-size: 48px;
  --peek-strip-size-top: 56px;
  --peek-backdrop: rgba(0, 0, 0, 0.25);
  --peek-panel-background: #fff;
  --peek-radius: 32px;
  --peek-radius-top: 24px;
  --peek-shadow: 0 0 40px rgba(0, 0, 0, 0.12);
  --peek-fade: 0.3s;
  --peek-z-index: 1000;
  --peek-cursor-size: 40px;
  --peek-cursor-background: transparent;
  --peek-cursor-color: #000;
  --peek-focus-ring: rgb(34, 34, 34);
  position: fixed;
  inset: 0;
  z-index: var(--peek-z-index);
  display: none;
}
:host([data-visible]) { display: block; }
:host([data-state="closing"]), :host([data-state="fading"]) { pointer-events: none; }

.backdrop {
  position: absolute;
  inset: 0;
  background: var(--peek-backdrop);
  opacity: 0;
  transition: opacity var(--peek-fade) ease;
}
.panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: var(--peek-strip-size);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  background: var(--peek-panel-background);
  border-radius: var(--peek-radius) 0 0 var(--peek-radius);
  box-shadow: var(--peek-shadow);
  opacity: 0;
  transition: opacity var(--peek-fade) ease;
  outline: none;
}
:host([data-state="open"]) .backdrop, :host([data-state="closing"]) .backdrop,
:host([data-state="open"]) .panel, :host([data-state="closing"]) .panel { opacity: 1; }

.strip {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--peek-strip-size);
  z-index: 1;
  cursor: pointer;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
}
/* the strip grows with the gap a peek opens up, so the pointer stays on it */
:host([data-peeking]) .strip { width: calc(var(--peek-strip-size) + var(--peek-distance, 24px)); }
:host([data-cursor]) .strip { cursor: none; }
.strip:focus-visible { box-shadow: inset 0 0 0 2px var(--peek-focus-ring); }

/* Phone layout: strip across the top, panel slides up and down */
:host([data-mode="top"]) .panel {
  top: var(--peek-strip-size-top);
  left: 0;
  border-radius: var(--peek-radius-top) var(--peek-radius-top) 0 0;
}
:host([data-mode="top"]) .strip { right: 0; bottom: auto; width: auto; height: var(--peek-strip-size-top); }
:host([data-mode="top"][data-peeking]) .strip { width: auto; height: calc(var(--peek-strip-size-top) + var(--peek-distance, 24px)); }

:host([data-dragging]) { user-select: none; -webkit-user-select: none; }

.cursor {
  position: fixed;
  left: calc(var(--peek-cursor-size) / -2);
  top: calc(var(--peek-cursor-size) / -2);
  width: var(--peek-cursor-size);
  height: var(--peek-cursor-size);
  border-radius: 50%;
  background: var(--peek-cursor-background);
  color: var(--peek-cursor-color);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
  opacity: 0; /* appears and disappears instantly, right under the pointer */
}
:host([data-cursor]) .cursor { opacity: 1; }
.cursor svg { width: 50%; height: 50%; }

@media (prefers-reduced-motion: reduce) {
  .backdrop, .panel { transition-duration: 0.01s; }
}
`

const ARROW = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5L4 10L9 15M4 10H14.5C17.5376 10 20 12.4624 20 15.5C20 18.5376 17.5376 21 14.5 21H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

type Kind = "number" | "distance" | "string" | "off" // "off": the attribute's presence turns the option off
// "distance": a number of px, or "full"

/** Attribute name → option, e.g. <peek-panel peek-distance="32" no-drag> */
export const ATTRIBUTES: Record<string, [keyof PeekOptions, Kind]> = {
    "peek-distance": ["peekDistance", "number"],
    "peek-time": ["peekTime", "number"],
    "exit-offset": ["exitOffset", "distance"],
    "exit-offset-y": ["exitOffsetY", "distance"],
    "spring-time": ["springTime", "number"],
    "spring-bounce": ["springBounce", "number"],
    "drag-threshold": ["dragThreshold", "number"],
    "mobile-breakpoint": ["mobileBreakpoint", "number"],
    side: ["side", "string"],
    "no-peek": ["peek", "off"],
    "no-drag": ["drag", "off"],
    "no-esc": ["escToClose", "off"],
    "no-backdrop-close": ["backdropClose", "off"],
    "no-enter-animation": ["enterAnimation", "off"],
    "no-slide-out": ["slideOut", "off"],
    "no-scroll-lock": ["lockScroll", "off"],
    "no-pause-videos": ["pauseVideos", "off"],
    "no-cursor": ["cursor", "off"],
}

const HTMLElementBase: typeof HTMLElement =
    typeof HTMLElement !== "undefined" ? HTMLElement : (class {} as unknown as typeof HTMLElement)

export class PeekPanelElement extends HTMLElementBase {
    static get observedAttributes() {
        return ["open", "label", "dialog-label", ...Object.keys(ATTRIBUTES)]
    }

    /** The engine; use it for options not covered by attributes */
    controller: PeekController | null = null
    private syncing = false
    private strip: HTMLElement
    private panel: HTMLElement

    constructor() {
        super()
        const root = this.attachShadow({ mode: "open" })
        root.innerHTML = `<style>${STYLE}</style>
<div class="backdrop" part="backdrop"></div>
<div class="strip" part="strip" role="button" tabindex="0"></div>
<div class="panel" part="panel" role="dialog" aria-modal="true" tabindex="-1"><slot></slot></div>
<div class="cursor" part="cursor" aria-hidden="true">${ARROW}</div>`
        this.strip = root.querySelector(".strip")!
        this.panel = root.querySelector(".panel")!
    }

    connectedCallback() {
        this.updateLabels()
        if (!this.controller) {
            const root = this.shadowRoot!
            this.controller = new PeekController(
                {
                    host: this,
                    backdrop: root.querySelector(".backdrop")!,
                    panel: this.panel,
                    strip: this.strip,
                    cursor: root.querySelector<HTMLElement>(".cursor"),
                    content: this,
                },
                this.readOptions(),
                {
                    onOpen: () => {
                        this.reflectOpen(true)
                        this.emit("peek-open")
                    },
                    onCloseStart: (reason) => {
                        this.reflectOpen(false)
                        this.emit("peek-close", reason)
                    },
                    onClosed: (reason) => this.emit("peek-closed", reason),
                    onPeekChange: (peeking) => this.emit("peek-hover", undefined, { peeking }),
                }
            )
        }
        if (this.hasAttribute("open") && !this.controller.isOpen) this.controller.open()
    }

    disconnectedCallback() {
        this.controller?.destroy()
        this.controller = null
    }

    attributeChangedCallback(name: string, old: string | null, value: string | null) {
        if (name === "label" || name === "dialog-label") return this.updateLabels()
        if (!this.controller) return
        if (name === "open") {
            if (this.syncing) return
            if (value !== null) this.controller.open()
            else this.controller.close("api")
            return
        }
        this.controller.setOptions(this.readOptions())
    }

    /** Open the overlay. Focus returns to `trigger` (or what had focus) when it closes. */
    open(trigger?: HTMLElement | null) {
        this.controller?.open(trigger)
    }
    close() {
        this.controller?.close("api")
    }
    toggle() {
        this.controller?.toggle()
    }
    get isOpen() {
        return !!this.controller?.isOpen
    }

    /** Every attribute-backed option: its attribute's value, or the default when it's absent */
    private readOptions(): Partial<PeekOptions> {
        const out: Partial<PeekOptions> = {}
        for (const [attr, [key, kind]] of Object.entries(ATTRIBUTES)) {
            const v = this.getAttribute(attr)
            let value: unknown = defaultOptions[key]
            if (kind === "off") value = v === null
            else if (v !== null && kind === "number" && !isNaN(parseFloat(v))) value = parseFloat(v)
            else if (v !== null && kind === "distance")
                value = v.trim() === "full" || isNaN(parseFloat(v)) ? "full" : parseFloat(v)
            else if (v !== null && kind === "string") value = v
            ;(out as Record<string, unknown>)[key] = value
        }
        this.style.setProperty("--peek-distance", `${out.peekDistance}px`)
        return out
    }

    private updateLabels() {
        this.strip.setAttribute("aria-label", this.getAttribute("label") || "Close")
        const d = this.getAttribute("dialog-label")
        if (d) this.panel.setAttribute("aria-label", d)
        else this.panel.removeAttribute("aria-label")
    }

    private reflectOpen(open: boolean) {
        this.syncing = true
        this.toggleAttribute("open", open)
        this.syncing = false
    }

    private emit(type: string, reason?: CloseReason, extra: object = {}) {
        this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail: { reason, ...extra } }))
    }
}

/** Register <peek-panel> (safe to call more than once) */
export function definePeekPanel(tag = "peek-panel") {
    if (typeof customElements === "undefined" || customElements.get(tag)) return
    customElements.define(tag, tag === "peek-panel" ? PeekPanelElement : class extends PeekPanelElement {})
}

// Buttons anywhere on the page: <button data-peek-open="overlay-id">
let triggersWired = false
export function wireTriggers() {
    if (triggersWired || typeof document === "undefined") return
    triggersWired = true
    document.addEventListener("click", (ev) => {
        const t = (ev.target as Element | null)?.closest?.("[data-peek-open]") as HTMLElement | null
        if (!t) return
        const target = document.getElementById(t.getAttribute("data-peek-open") || "")
        if (!(target instanceof PeekPanelElement)) return
        ev.preventDefault()
        target.open(t)
    })
}

declare global {
    interface HTMLElementTagNameMap {
        "peek-panel": PeekPanelElement
    }
}
