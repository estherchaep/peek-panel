// peek-panel core: the framework-free engine behind <peek-panel>.
//
// An overlay panel (e.g. a case study card) sits over the page, leaving a strip of
// the page visible along its left edge (or along the top on phones). Hovering the
// strip "peeks": the panel slides aside a little, showing more of the page behind.
// Clicking or tapping the strip, pressing Esc, or dragging the panel's edge slides
// the panel out on a spring and closes the overlay.
//
// The controller works on four elements you give it (host, backdrop, panel, strip)
// and owns the overlay's behaviour: open/close, page scroll lock, focus handling,
// Esc, drag, peek, and an optional back-arrow cursor on the strip. The web component
// (element.ts) is one way to wire it up; any framework can use it the same way.

export type Side = "auto" | "left" | "top"
export type CloseReason = "strip" | "drag" | "escape" | "backdrop" | "button" | "api"

export interface PeekOptions {
    /** Slide the panel aside while the pointer is over the strip */
    peek: boolean
    /** How far the panel moves during a peek (px) */
    peekDistance: number
    /** Duration of the peek movement (s) */
    peekTime: number
    /** Slide the panel in when the overlay opens */
    enterAnimation: boolean
    /** Slide the panel out before the overlay fades away */
    slideOut: boolean
    /**
     * How far the panel travels when sliding in from / out to the right, strip on the
     * left: "full" (from fully off-screen to fully off-screen) or a distance in px
     */
    exitOffset: number | "full"
    /** The same for the phone layout, sliding up from / down to the bottom */
    exitOffsetY: number | "full"
    /** Spring duration for sliding in and out (s), like Framer's "Time" */
    springTime: number
    /** Spring bounce, 0 to 1, like Framer's "Bounce" */
    springBounce: number
    /** Let the panel be dragged away by its strip */
    drag: boolean
    /** Drag distance that closes the overlay (px) */
    dragThreshold: number
    /** Esc closes the overlay */
    escToClose: boolean
    /** Clicking the visible backdrop closes the overlay */
    backdropClose: boolean
    /** Where the strip sits: "auto" puts it on top below `mobileBreakpoint` */
    side: Side
    /** Window width (px) below which "auto" switches to the top strip; 0 = never */
    mobileBreakpoint: number
    /** Stop the page behind from scrolling while open */
    lockScroll: boolean
    /** Pause playing videos on the page behind while open */
    pauseVideos: boolean
    /** Show the back-arrow cursor over the strip (mouse only) */
    cursor: boolean
}

export const defaultOptions: PeekOptions = {
    peek: true,
    peekDistance: 24,
    peekTime: 0.15,
    enterAnimation: true,
    slideOut: true,
    exitOffset: "full",
    exitOffsetY: "full",
    springTime: 1.1,
    springBounce: 0.2,
    drag: true,
    dragThreshold: 120,
    escToClose: true,
    backdropClose: true,
    side: "auto",
    mobileBreakpoint: 810,
    lockScroll: true,
    pauseVideos: true,
    cursor: true,
}

export interface PeekParts {
    /** Outer element; gets data-state / data-mode / data-peeking attributes for styling */
    host: HTMLElement
    /** Full-screen layer behind the panel */
    backdrop: HTMLElement
    /** The sliding panel (gets focus when the overlay opens) */
    panel: HTMLElement
    /** The strip of page left visible beside the panel */
    strip: HTMLElement
    /** Optional element used as the back-arrow cursor */
    cursor?: HTMLElement | null
    /** Where tabbable content lives, for keeping focus inside (defaults to host) */
    content?: HTMLElement
}

export interface PeekCallbacks {
    onOpen?: () => void
    /** Closing has started: the page behind is usable again from here */
    onCloseStart?: (reason: CloseReason) => void
    /** The overlay has finished animating out */
    onClosed?: (reason: CloseReason) => void
    onPeekChange?: (peeking: boolean) => void
}

type State = "closed" | "open" | "closing" | "fading"

// ---- Springs: Framer's time-based spring ("Time" + "Bounce") ----
function springParams(duration: number, bounce: number) {
    const d = Math.min(10, Math.max(0.01, duration))
    const zeta = Math.min(1, Math.max(0.05, 1 - bounce))
    let w0: number
    if (zeta < 1) w0 = Math.log(zeta / Math.sqrt(1 - zeta * zeta) / 0.001) / (zeta * d)
    else {
        let lo = 0.01
        let hi = 1000
        for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2
            if (Math.exp(-mid * d) * (mid * d + 1) > 0.001) lo = mid
            else hi = mid
        }
        w0 = (lo + hi) / 2
    }
    return { w0, zeta }
}

/** Position over time on that spring, starting at velocity v0 (px/s) */
export function springPath(from: number, to: number, v0: number, duration: number, bounce: number) {
    const { w0, zeta } = springParams(duration, bounce)
    const A = from - to
    if (zeta < 1) {
        const wd = w0 * Math.sqrt(1 - zeta * zeta)
        const B = (v0 + zeta * w0 * A) / wd
        return (t: number) => to + Math.exp(-zeta * w0 * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t))
    }
    return (t: number) => to + Math.exp(-w0 * t) * (A + (v0 + w0 * A) * t)
}

// ---- Shared across instances ----
const openStack: PeekController[] = [] // open overlays, top one last (it gets Esc and Tab)
let scrollLocks = 0
let savedScroll: { overflow: string; paddingRight: string } | null = null
let lastPointer: { x: number; y: number } | null = null
if (typeof window !== "undefined")
    window.addEventListener(
        "pointermove",
        (ev) => {
            if (ev.pointerType === "mouse") lastPointer = { x: ev.clientX, y: ev.clientY }
        },
        { capture: true, passive: true }
    )

function lockPageScroll() {
    if (scrollLocks++ > 0) return
    const html = document.documentElement
    const gap = window.innerWidth - html.clientWidth // keep the layout from jumping
    savedScroll = { overflow: html.style.overflow, paddingRight: html.style.paddingRight }
    html.style.overflow = "hidden"
    if (gap > 0) html.style.paddingRight = `${gap}px`
}
function unlockPageScroll() {
    if (scrollLocks === 0 || --scrollLocks > 0) return
    const html = document.documentElement
    html.style.overflow = savedScroll?.overflow ?? ""
    html.style.paddingRight = savedScroll?.paddingRight ?? ""
    savedScroll = null
}

const TABBABLE =
    'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])'

const reducedMotion = () =>
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
const noHover = () => typeof matchMedia !== "undefined" && matchMedia("(hover: none)").matches

export class PeekController {
    private o: PeekOptions
    private state: State = "closed"
    private vertical = false
    private raf = 0
    private fadeTimer = 0
    private hovering = false
    private peeking = false
    private handled = false // swallow the browser's click after a tap or drag
    private press: null | {
        id: number
        x0: number
        y0: number
        t0: number
        type: string
        from: number
        moved: boolean
        samples: [number, number][]
    } = null
    private returnFocus: HTMLElement | null = null
    private paused: HTMLVideoElement[] = []
    private locked = false
    private cleanups: (() => void)[] = []
    private docCleanups: (() => void)[] = []

    constructor(
        private parts: PeekParts,
        options: Partial<PeekOptions> = {},
        private callbacks: PeekCallbacks = {}
    ) {
        this.o = { ...defaultOptions, ...options }
        this.bind()
        this.updateMode()
        this.setState("closed")
    }

    get isOpen() {
        return this.state === "open"
    }
    get options(): Readonly<PeekOptions> {
        return this.o
    }

    setOptions(options: Partial<PeekOptions>) {
        this.o = { ...this.o, ...options }
        if (!this.o.peek) this.setPeek(false)
        this.updateMode()
    }

    // ---- Opening ----
    open(trigger?: HTMLElement | null) {
        if (this.state === "open") return
        const { host, panel } = this.parts
        cancelAnimationFrame(this.raf)
        clearTimeout(this.fadeTimer)
        const wasClosed = this.state === "closed"
        this.returnFocus = trigger ?? (document.activeElement as HTMLElement | null)
        this.updateMode()

        host.setAttribute("data-visible", "")
        void host.offsetWidth // start the fade-in from the hidden state
        this.setState("open")

        if (this.o.lockScroll && !this.locked) {
            lockPageScroll()
            this.locked = true
        }
        if (this.o.pauseVideos) this.pauseVideos()
        openStack.push(this)
        this.listenToDocument()

        if (wasClosed && this.o.enterAnimation && !reducedMotion()) {
            const from = this.travel()
            panel.style.transition = "none"
            this.moveTo(from)
            this.animate(from, 0, 0, () => this.clearMove())
        } else {
            // reopened mid-close: spring back from wherever it is
            const from = this.offset()
            if (from && !reducedMotion()) this.animate(from, 0, 0, () => this.clearMove())
            else this.clearMove()
        }
        panel.focus({ preventScroll: true })
        this.checkPointerAlreadyOver()
        this.callbacks.onOpen?.()
    }

    // ---- Closing ----
    close(reason: CloseReason = "api", velocity = 0) {
        if (this.state !== "open") return
        this.setState("closing")
        this.setPeek(false)
        this.showCursor(false)
        this.press = null

        // Hand the page back right away: scrolling, clicks, videos and focus all work
        // again while the panel is still sliding out.
        if (this.locked) {
            unlockPageScroll()
            this.locked = false
        }
        this.resumeVideos()
        const i = openStack.indexOf(this)
        if (i >= 0) openStack.splice(i, 1)
        this.stopListeningToDocument()
        const back = this.returnFocus
        this.returnFocus = null
        if (back && back.isConnected && typeof back.focus === "function") back.focus({ preventScroll: true })
        this.callbacks.onCloseStart?.(reason)

        const fadeOut = () => {
            if (this.state !== "closing") return
            this.setState("fading")
            this.fadeTimer = window.setTimeout(() => this.finishClose(reason), this.fadeMs())
        }
        if (!this.o.slideOut || reducedMotion()) return fadeOut()
        this.parts.panel.style.transition = "none"
        this.animate(this.offset(), this.travel(), Math.max(0, velocity), fadeOut, true)
    }

    toggle() {
        if (this.state === "open") this.close("api")
        else this.open()
    }

    destroy() {
        cancelAnimationFrame(this.raf)
        clearTimeout(this.fadeTimer)
        if (this.locked) unlockPageScroll()
        this.locked = false
        this.resumeVideos()
        const i = openStack.indexOf(this)
        if (i >= 0) openStack.splice(i, 1)
        this.stopListeningToDocument()
        this.cleanups.forEach((f) => f())
        this.cleanups = []
    }

    private finishClose(reason: CloseReason) {
        if (this.state !== "fading") return
        this.setState("closed")
        this.parts.host.removeAttribute("data-visible")
        this.clearMove()
        this.callbacks.onClosed?.(reason)
    }

    // ---- State, mode, movement ----
    private setState(s: State) {
        this.state = s
        this.parts.host.setAttribute("data-state", s)
    }

    private updateMode() {
        const { side, mobileBreakpoint } = this.o
        const top =
            side === "top" ||
            (side === "auto" && mobileBreakpoint > 0 && typeof window !== "undefined" && window.innerWidth < mobileBreakpoint)
        if (top === this.vertical && this.parts.host.hasAttribute("data-mode")) return
        // switching direction while open: drop any sideways/downward offset first
        if (this.state === "open" && !this.press) {
            cancelAnimationFrame(this.raf)
            this.setPeek(false)
            this.clearMove()
        }
        this.vertical = top
        this.parts.host.setAttribute("data-mode", top ? "top" : "left")
    }

    /**
     * How far the panel slides in and out. "full" = until it's completely off-screen:
     * from its resting edge to the far edge of the viewport, plus room for its shadow.
     */
    private travel() {
        const v = this.vertical ? this.o.exitOffsetY : this.o.exitOffset
        if (typeof v === "number") return v
        const { panel } = this.parts
        const shadowRoom = 120
        return this.vertical
            ? window.innerHeight - panel.offsetTop + shadowRoom
            : window.innerWidth - panel.offsetLeft + shadowRoom
    }

    private moveTo(v: number) {
        this.parts.panel.style.translate = this.vertical ? `0 ${v}px` : `${v}px 0`
    }
    private clearMove() {
        this.parts.panel.style.translate = ""
        this.parts.panel.style.transition = ""
    }
    /** The panel's current offset along the strip's direction */
    private offset() {
        const t = getComputedStyle(this.parts.panel).translate
        if (!t || t === "none") return 0
        const [x, y] = t.split(" ").map((v) => parseFloat(v) || 0)
        return this.vertical ? y || 0 : x
    }

    /** Spring from `from` to `to`; `stopAtTarget` ends as soon as it gets there */
    private animate(from: number, to: number, v0: number, done?: () => void, stopAtTarget = false) {
        cancelAnimationFrame(this.raf)
        this.parts.panel.style.transition = "none" // the spring drives it frame by frame
        const { springTime: t, springBounce: b } = this.o
        if (t <= 0 || reducedMotion()) {
            this.moveTo(to)
            done?.()
            return
        }
        const x = springPath(from, to, v0, t, b)
        const t0 = performance.now()
        const towards = Math.sign(to - from) || 1
        const frame = (now: number) => {
            const s = (now - t0) / 1000
            const v = x(s)
            const arrived = stopAtTarget && (v - to) * towards >= -0.5
            if (s >= t || arrived) {
                this.moveTo(to)
                done?.()
                return
            }
            this.moveTo(v)
            this.raf = requestAnimationFrame(frame)
        }
        this.raf = requestAnimationFrame(frame)
    }

    private fadeMs() {
        const v = getComputedStyle(this.parts.host).getPropertyValue("--peek-fade").trim()
        if (!v) return 300
        return v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000 || 300
    }

    // ---- Peek ----
    private setPeek(on: boolean) {
        on = on && this.o.peek && this.state === "open" && !noHover() && !this.press
        if (on === this.peeking) return
        this.peeking = on
        const { host, panel } = this.parts
        host.toggleAttribute("data-peeking", on)
        cancelAnimationFrame(this.raf)
        panel.style.transition = `translate ${this.o.peekTime}s cubic-bezier(0.42, 0, 0.58, 1)`
        this.moveTo(on ? this.o.peekDistance : 0)
        this.callbacks.onPeekChange?.(on)
    }

    // ---- Cursor ----
    private showCursor(on: boolean, x?: number, y?: number) {
        const c = this.parts.cursor
        if (!c) return
        const use = on && this.o.cursor && !noHover()
        // Position with `translate`, not `transform`, so a `scale` or `transform` in a
        // custom cursor style can't shift where it sits (it would slide in from the corner)
        if (use && x !== undefined && y !== undefined) c.style.translate = `${x}px ${y}px`
        this.parts.host.toggleAttribute("data-cursor", use)
    }

    /** The overlay opened under a still mouse: browsers only report that on the next move */
    private checkPointerAlreadyOver() {
        const p = lastPointer
        if (!p || noHover()) return
        requestAnimationFrame(() => {
            if (this.state !== "open") return
            const root = this.parts.strip.getRootNode() as Document | ShadowRoot
            const hit = root.elementFromPoint?.(p.x, p.y)
            if (hit !== this.parts.strip) return
            this.hovering = true
            this.showCursor(true, p.x, p.y)
            this.setPeek(true)
        })
    }

    // ---- Videos on the page behind ----
    private holdPaused = (ev: Event) => (ev.target as HTMLVideoElement).pause()
    private pauseVideos() {
        if (this.paused.length) return
        const { host } = this.parts
        this.paused = [...document.querySelectorAll("video")].filter((v) => !v.paused && !host.contains(v))
        this.paused.forEach((v) => {
            v.pause()
            v.addEventListener("play", this.holdPaused)
        })
    }
    private resumeVideos() {
        const list = this.paused
        this.paused = []
        list.forEach((v) => {
            v.removeEventListener("play", this.holdPaused)
            if (v.isConnected) v.play().catch(() => {})
        })
    }

    // ---- Events ----
    private on<K extends keyof HTMLElementEventMap>(
        el: HTMLElement | Window | Document,
        type: K | string,
        fn: (ev: any) => void,
        opts?: AddEventListenerOptions,
        list = this.cleanups
    ) {
        el.addEventListener(type, fn, opts)
        list.push(() => el.removeEventListener(type, fn, opts))
    }

    private bind() {
        const { strip, backdrop, host } = this.parts
        this.on(strip, "pointerdown", (ev: PointerEvent) => this.onDown(ev))
        this.on(strip, "pointermove", (ev: PointerEvent) => this.onMove(ev))
        this.on(strip, "pointerup", (ev: PointerEvent) => this.onUp(ev))
        this.on(strip, "pointercancel", (ev: PointerEvent) => this.onUp(ev))
        this.on(strip, "pointerenter", (ev: PointerEvent) => {
            if (ev.pointerType !== "mouse" || this.state !== "open") return
            this.hovering = true
            this.showCursor(true, ev.clientX, ev.clientY)
            this.setPeek(true)
        })
        this.on(strip, "pointerleave", (ev: PointerEvent) => {
            this.hovering = false
            if (this.press) return
            this.showCursor(false)
            this.setPeek(false)
        })
        this.on(strip, "click", (ev: MouseEvent) => {
            ev.preventDefault()
            ev.stopPropagation()
            if (this.handled) {
                this.handled = false
                return
            }
            this.close("strip")
        })
        this.on(strip, "keydown", (ev: KeyboardEvent) => {
            if (ev.key !== "Enter" && ev.key !== " ") return
            ev.preventDefault()
            this.close("strip")
        })
        this.on(strip, "dragstart", (ev: Event) => ev.preventDefault())
        this.on(backdrop, "click", () => {
            if (this.o.backdropClose) this.close("backdrop")
        })
        // any element marked data-peek-close inside the overlay closes it
        this.on(host, "click", (ev: MouseEvent) => {
            const el = (ev.target as Element | null)?.closest?.("[data-peek-close]")
            if (!el || !host.contains(el)) return
            ev.preventDefault()
            this.close("button")
        })
        let resizeRaf = 0
        this.on(window, "resize", () => {
            cancelAnimationFrame(resizeRaf)
            resizeRaf = requestAnimationFrame(() => this.updateMode())
        })
    }

    private listenToDocument() {
        this.stopListeningToDocument()
        this.on(
            document,
            "keydown",
            (ev: KeyboardEvent) => {
                if (openStack[openStack.length - 1] !== this) return
                if (ev.key === "Escape" && this.o.escToClose) {
                    const t = ev.target as HTMLElement | null
                    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
                    ev.preventDefault()
                    ev.stopPropagation()
                    this.close("escape")
                } else if (ev.key === "Tab") this.trapTab(ev)
            },
            { capture: true },
            this.docCleanups
        )
    }
    private stopListeningToDocument() {
        this.docCleanups.forEach((f) => f())
        this.docCleanups = []
    }

    /** Keep Tab inside the overlay: the strip, then the panel's content */
    private trapTab(ev: KeyboardEvent) {
        const { strip, panel, host } = this.parts
        const content = this.parts.content ?? host
        const items = [
            strip,
            ...[...content.querySelectorAll<HTMLElement>(TABBABLE)].filter(
                (el) => el.getClientRects().length > 0 && !el.closest("[inert]")
            ),
        ]
        const shadow = strip.getRootNode() as ShadowRoot | Document
        const active =
            (shadow instanceof ShadowRoot ? (shadow.activeElement as HTMLElement | null) : null) ??
            (document.activeElement as HTMLElement | null)
        const first = items[0]
        const last = items[items.length - 1]
        const inside = !!active && (active === panel || items.includes(active))
        if (!inside) {
            ev.preventDefault()
            first.focus()
        } else if (ev.shiftKey && (active === first || active === panel)) {
            ev.preventDefault()
            last.focus()
        } else if (!ev.shiftKey && active === last) {
            ev.preventDefault()
            first.focus()
        }
    }

    // ---- Pointer: taps, clicks and dragging the panel by its strip ----
    private onDown(ev: PointerEvent) {
        this.handled = false
        if (this.state !== "open") return
        if (ev.pointerType === "mouse" && ev.button !== 0) return
        if (ev.pointerType === "mouse") ev.preventDefault() // no text selection while dragging
        this.press = {
            id: ev.pointerId,
            x0: ev.clientX,
            y0: ev.clientY,
            t0: ev.timeStamp,
            type: ev.pointerType,
            from: this.offset(),
            moved: false,
            samples: [[ev.timeStamp, this.vertical ? ev.clientY : ev.clientX]],
        }
        this.parts.strip.setPointerCapture?.(ev.pointerId)
    }

    private onMove(ev: PointerEvent) {
        if (this.hovering && ev.pointerType === "mouse") this.showCursor(true, ev.clientX, ev.clientY)
        const d = this.press
        if (!d || d.id !== ev.pointerId || !this.o.drag) return
        const along = this.vertical ? ev.clientY - d.y0 : ev.clientX - d.x0
        if (!d.moved) {
            const across = this.vertical ? ev.clientX - d.x0 : ev.clientY - d.y0
            const slop = d.type === "mouse" ? 5 : 12
            if (along < slop || Math.abs(along) < Math.abs(across) * 1.2) return // only a clear pull
            d.moved = true
            cancelAnimationFrame(this.raf)
            this.parts.panel.style.transition = "none"
            this.parts.host.setAttribute("data-dragging", "")
        }
        this.moveTo(Math.max(0, d.from + along))
        d.samples.push([ev.timeStamp, this.vertical ? ev.clientY : ev.clientX])
        if (d.samples.length > 6) d.samples.shift()
    }

    private onUp(ev: PointerEvent) {
        const d = this.press
        if (!d || d.id !== ev.pointerId) return
        this.press = null
        this.parts.host.removeAttribute("data-dragging")
        if (!d.moved) {
            // touch / pen: a short press that stayed put is a tap (phones cancel their own
            // click as soon as the finger shifts a little)
            const dist = Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0)
            if (d.type !== "mouse" && ev.type !== "pointercancel" && dist < 20 && ev.timeStamp - d.t0 < 600) {
                this.handled = true
                this.close("strip")
            }
            return
        }
        this.handled = true
        const x = this.offset()
        const first = d.samples[0]
        const last = d.samples[d.samples.length - 1]
        const v = ((last[1] - first[1]) / Math.max(1, last[0] - first[0])) * 1000
        if (ev.type !== "pointercancel" && (x >= this.o.dragThreshold || (v > 900 && x > 24))) {
            this.close("drag", v)
            return
        }
        // not far enough: spring back (to the peek position if the mouse is still over the strip)
        const r = this.parts.strip.getBoundingClientRect()
        const over =
            ev.pointerType === "mouse" &&
            ev.clientX >= r.left &&
            ev.clientX <= r.right &&
            ev.clientY >= r.top &&
            ev.clientY <= r.bottom
        const target = over && this.o.peek && !noHover() ? this.o.peekDistance : 0
        this.peeking = target > 0
        this.parts.host.toggleAttribute("data-peeking", this.peeking)
        if (!over) this.showCursor(false)
        this.animate(x, target, v, () => {
            if (!target) this.clearMove()
        })
    }
}
