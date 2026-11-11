// src/core.ts
var defaultOptions = {
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
  cursor: true
};
function springParams(duration, bounce) {
  const d = Math.min(10, Math.max(0.01, duration));
  const zeta = Math.min(1, Math.max(0.05, 1 - bounce));
  let w0;
  if (zeta < 1) w0 = Math.log(zeta / Math.sqrt(1 - zeta * zeta) / 1e-3) / (zeta * d);
  else {
    let lo = 0.01;
    let hi = 1e3;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (Math.exp(-mid * d) * (mid * d + 1) > 1e-3) lo = mid;
      else hi = mid;
    }
    w0 = (lo + hi) / 2;
  }
  return { w0, zeta };
}
function springPath(from, to, v0, duration, bounce) {
  const { w0, zeta } = springParams(duration, bounce);
  const A = from - to;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const B = (v0 + zeta * w0 * A) / wd;
    return (t) => to + Math.exp(-zeta * w0 * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
  }
  return (t) => to + Math.exp(-w0 * t) * (A + (v0 + w0 * A) * t);
}
var openStack = [];
var scrollLocks = 0;
var savedScroll = null;
var lastPointer = null;
if (typeof window !== "undefined")
  window.addEventListener(
    "pointermove",
    (ev) => {
      if (ev.pointerType === "mouse") lastPointer = { x: ev.clientX, y: ev.clientY };
    },
    { capture: true, passive: true }
  );
function lockPageScroll() {
  if (scrollLocks++ > 0) return;
  const html = document.documentElement;
  const gap = window.innerWidth - html.clientWidth;
  savedScroll = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
  html.style.overflow = "hidden";
  if (gap > 0) html.style.paddingRight = `${gap}px`;
}
function unlockPageScroll() {
  if (scrollLocks === 0 || --scrollLocks > 0) return;
  const html = document.documentElement;
  html.style.overflow = savedScroll?.overflow ?? "";
  html.style.paddingRight = savedScroll?.paddingRight ?? "";
  savedScroll = null;
}
var TABBABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';
var reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
var noHover = () => typeof matchMedia !== "undefined" && matchMedia("(hover: none)").matches;
var PeekController = class {
  constructor(parts, options = {}, callbacks = {}) {
    this.parts = parts;
    this.callbacks = callbacks;
    this.state = "closed";
    this.vertical = false;
    this.raf = 0;
    this.fadeTimer = 0;
    this.hovering = false;
    this.peeking = false;
    this.handled = false;
    // swallow the browser's click after a tap or drag
    this.press = null;
    this.returnFocus = null;
    this.paused = [];
    this.locked = false;
    this.cleanups = [];
    this.docCleanups = [];
    // ---- Videos on the page behind ----
    this.holdPaused = (ev) => ev.target.pause();
    this.o = { ...defaultOptions, ...options };
    this.bind();
    this.updateMode();
    this.setState("closed");
  }
  get isOpen() {
    return this.state === "open";
  }
  get options() {
    return this.o;
  }
  setOptions(options) {
    this.o = { ...this.o, ...options };
    if (!this.o.peek) this.setPeek(false);
    this.updateMode();
  }
  // ---- Opening ----
  open(trigger) {
    if (this.state === "open") return;
    const { host, panel } = this.parts;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.fadeTimer);
    const wasClosed = this.state === "closed";
    this.returnFocus = trigger ?? document.activeElement;
    this.updateMode();
    host.setAttribute("data-visible", "");
    void host.offsetWidth;
    this.setState("open");
    if (this.o.lockScroll && !this.locked) {
      lockPageScroll();
      this.locked = true;
    }
    if (this.o.pauseVideos) this.pauseVideos();
    openStack.push(this);
    this.listenToDocument();
    if (wasClosed && this.o.enterAnimation && !reducedMotion()) {
      const from = this.travel();
      panel.style.transition = "none";
      this.moveTo(from);
      this.animate(from, 0, 0, () => this.clearMove());
    } else {
      const from = this.offset();
      if (from && !reducedMotion()) this.animate(from, 0, 0, () => this.clearMove());
      else this.clearMove();
    }
    panel.focus({ preventScroll: true });
    this.checkPointerAlreadyOver();
    this.callbacks.onOpen?.();
  }
  // ---- Closing ----
  close(reason = "api", velocity = 0) {
    if (this.state !== "open") return;
    this.setState("closing");
    this.setPeek(false);
    this.showCursor(false);
    this.press = null;
    if (this.locked) {
      unlockPageScroll();
      this.locked = false;
    }
    this.resumeVideos();
    const i = openStack.indexOf(this);
    if (i >= 0) openStack.splice(i, 1);
    this.stopListeningToDocument();
    const back = this.returnFocus;
    this.returnFocus = null;
    if (back && back.isConnected && typeof back.focus === "function") back.focus({ preventScroll: true });
    this.callbacks.onCloseStart?.(reason);
    const fadeOut = () => {
      if (this.state !== "closing") return;
      this.setState("fading");
      this.fadeTimer = window.setTimeout(() => this.finishClose(reason), this.fadeMs());
    };
    if (!this.o.slideOut || reducedMotion()) return fadeOut();
    this.parts.panel.style.transition = "none";
    this.animate(this.offset(), this.travel(), Math.max(0, velocity), fadeOut, true);
  }
  toggle() {
    if (this.state === "open") this.close("api");
    else this.open();
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.fadeTimer);
    if (this.locked) unlockPageScroll();
    this.locked = false;
    this.resumeVideos();
    const i = openStack.indexOf(this);
    if (i >= 0) openStack.splice(i, 1);
    this.stopListeningToDocument();
    this.cleanups.forEach((f) => f());
    this.cleanups = [];
  }
  finishClose(reason) {
    if (this.state !== "fading") return;
    this.setState("closed");
    this.parts.host.removeAttribute("data-visible");
    this.clearMove();
    this.callbacks.onClosed?.(reason);
  }
  // ---- State, mode, movement ----
  setState(s) {
    this.state = s;
    this.parts.host.setAttribute("data-state", s);
  }
  updateMode() {
    const { side, mobileBreakpoint } = this.o;
    const top = side === "top" || side === "auto" && mobileBreakpoint > 0 && typeof window !== "undefined" && window.innerWidth < mobileBreakpoint;
    if (top === this.vertical && this.parts.host.hasAttribute("data-mode")) return;
    if (this.state === "open" && !this.press) {
      cancelAnimationFrame(this.raf);
      this.setPeek(false);
      this.clearMove();
    }
    this.vertical = top;
    this.parts.host.setAttribute("data-mode", top ? "top" : "left");
  }
  /**
   * How far the panel slides in and out. "full" = until it's completely off-screen:
   * from its resting edge to the far edge of the viewport, plus room for its shadow.
   */
  travel() {
    const v = this.vertical ? this.o.exitOffsetY : this.o.exitOffset;
    if (typeof v === "number") return v;
    const { panel } = this.parts;
    const shadowRoom = 120;
    return this.vertical ? window.innerHeight - panel.offsetTop + shadowRoom : window.innerWidth - panel.offsetLeft + shadowRoom;
  }
  moveTo(v) {
    this.parts.panel.style.translate = this.vertical ? `0 ${v}px` : `${v}px 0`;
  }
  clearMove() {
    this.parts.panel.style.translate = "";
    this.parts.panel.style.transition = "";
  }
  /** The panel's current offset along the strip's direction */
  offset() {
    const t = getComputedStyle(this.parts.panel).translate;
    if (!t || t === "none") return 0;
    const [x, y] = t.split(" ").map((v) => parseFloat(v) || 0);
    return this.vertical ? y || 0 : x;
  }
  /** Spring from `from` to `to`; `stopAtTarget` ends as soon as it gets there */
  animate(from, to, v0, done, stopAtTarget = false) {
    cancelAnimationFrame(this.raf);
    this.parts.panel.style.transition = "none";
    const { springTime: t, springBounce: b } = this.o;
    if (t <= 0 || reducedMotion()) {
      this.moveTo(to);
      done?.();
      return;
    }
    const x = springPath(from, to, v0, t, b);
    const t0 = performance.now();
    const towards = Math.sign(to - from) || 1;
    const frame = (now) => {
      const s = (now - t0) / 1e3;
      const v = x(s);
      const arrived = stopAtTarget && (v - to) * towards >= -0.5;
      if (s >= t || arrived) {
        this.moveTo(to);
        done?.();
        return;
      }
      this.moveTo(v);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  fadeMs() {
    const v = getComputedStyle(this.parts.host).getPropertyValue("--peek-fade").trim();
    if (!v) return 300;
    return v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1e3 || 300;
  }
  // ---- Peek ----
  setPeek(on) {
    on = on && this.o.peek && this.state === "open" && !noHover() && !this.press;
    if (on === this.peeking) return;
    this.peeking = on;
    const { host, panel } = this.parts;
    host.toggleAttribute("data-peeking", on);
    cancelAnimationFrame(this.raf);
    panel.style.transition = `translate ${this.o.peekTime}s cubic-bezier(0.42, 0, 0.58, 1)`;
    this.moveTo(on ? this.o.peekDistance : 0);
    this.callbacks.onPeekChange?.(on);
  }
  // ---- Cursor ----
  showCursor(on, x, y) {
    const c = this.parts.cursor;
    if (!c) return;
    const use = on && this.o.cursor && !noHover();
    if (use && x !== void 0 && y !== void 0) c.style.translate = `${x}px ${y}px`;
    this.parts.host.toggleAttribute("data-cursor", use);
  }
  /** The overlay opened under a still mouse: browsers only report that on the next move */
  checkPointerAlreadyOver() {
    const p = lastPointer;
    if (!p || noHover()) return;
    requestAnimationFrame(() => {
      if (this.state !== "open") return;
      const root = this.parts.strip.getRootNode();
      const hit = root.elementFromPoint?.(p.x, p.y);
      if (hit !== this.parts.strip) return;
      this.hovering = true;
      this.showCursor(true, p.x, p.y);
      this.setPeek(true);
    });
  }
  pauseVideos() {
    if (this.paused.length) return;
    const { host } = this.parts;
    this.paused = [...document.querySelectorAll("video")].filter((v) => !v.paused && !host.contains(v));
    this.paused.forEach((v) => {
      v.pause();
      v.addEventListener("play", this.holdPaused);
    });
  }
  resumeVideos() {
    const list = this.paused;
    this.paused = [];
    list.forEach((v) => {
      v.removeEventListener("play", this.holdPaused);
      if (v.isConnected) v.play().catch(() => {
      });
    });
  }
  // ---- Events ----
  on(el, type, fn, opts, list = this.cleanups) {
    el.addEventListener(type, fn, opts);
    list.push(() => el.removeEventListener(type, fn, opts));
  }
  bind() {
    const { strip, backdrop, host } = this.parts;
    this.on(strip, "pointerdown", (ev) => this.onDown(ev));
    this.on(strip, "pointermove", (ev) => this.onMove(ev));
    this.on(strip, "pointerup", (ev) => this.onUp(ev));
    this.on(strip, "pointercancel", (ev) => this.onUp(ev));
    this.on(strip, "pointerenter", (ev) => {
      if (ev.pointerType !== "mouse" || this.state !== "open") return;
      this.hovering = true;
      this.showCursor(true, ev.clientX, ev.clientY);
      this.setPeek(true);
    });
    this.on(strip, "pointerleave", (ev) => {
      this.hovering = false;
      if (this.press) return;
      this.showCursor(false);
      this.setPeek(false);
    });
    this.on(strip, "click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this.handled) {
        this.handled = false;
        return;
      }
      this.close("strip");
    });
    this.on(strip, "keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      this.close("strip");
    });
    this.on(strip, "dragstart", (ev) => ev.preventDefault());
    this.on(backdrop, "click", () => {
      if (this.o.backdropClose) this.close("backdrop");
    });
    this.on(host, "click", (ev) => {
      const el = ev.target?.closest?.("[data-peek-close]");
      if (!el || !host.contains(el)) return;
      ev.preventDefault();
      this.close("button");
    });
    let resizeRaf = 0;
    this.on(window, "resize", () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => this.updateMode());
    });
  }
  listenToDocument() {
    this.stopListeningToDocument();
    this.on(
      document,
      "keydown",
      (ev) => {
        if (openStack[openStack.length - 1] !== this) return;
        if (ev.key === "Escape" && this.o.escToClose) {
          const t = ev.target;
          if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
          ev.preventDefault();
          ev.stopPropagation();
          this.close("escape");
        } else if (ev.key === "Tab") this.trapTab(ev);
      },
      { capture: true },
      this.docCleanups
    );
  }
  stopListeningToDocument() {
    this.docCleanups.forEach((f) => f());
    this.docCleanups = [];
  }
  /** Keep Tab inside the overlay: the strip, then the panel's content */
  trapTab(ev) {
    const { strip, panel, host } = this.parts;
    const content = this.parts.content ?? host;
    const items = [
      strip,
      ...[...content.querySelectorAll(TABBABLE)].filter(
        (el) => el.getClientRects().length > 0 && !el.closest("[inert]")
      )
    ];
    const shadow = strip.getRootNode();
    const active = (shadow instanceof ShadowRoot ? shadow.activeElement : null) ?? document.activeElement;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = !!active && (active === panel || items.includes(active));
    if (!inside) {
      ev.preventDefault();
      first.focus();
    } else if (ev.shiftKey && (active === first || active === panel)) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  }
  // ---- Pointer: taps, clicks and dragging the panel by its strip ----
  onDown(ev) {
    this.handled = false;
    if (this.state !== "open") return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (ev.pointerType === "mouse") ev.preventDefault();
    this.press = {
      id: ev.pointerId,
      x0: ev.clientX,
      y0: ev.clientY,
      t0: ev.timeStamp,
      type: ev.pointerType,
      from: this.offset(),
      moved: false,
      samples: [[ev.timeStamp, this.vertical ? ev.clientY : ev.clientX]]
    };
    this.parts.strip.setPointerCapture?.(ev.pointerId);
  }
  onMove(ev) {
    if (this.hovering && ev.pointerType === "mouse") this.showCursor(true, ev.clientX, ev.clientY);
    const d = this.press;
    if (!d || d.id !== ev.pointerId || !this.o.drag) return;
    const along = this.vertical ? ev.clientY - d.y0 : ev.clientX - d.x0;
    if (!d.moved) {
      const across = this.vertical ? ev.clientX - d.x0 : ev.clientY - d.y0;
      const slop = d.type === "mouse" ? 5 : 12;
      if (along < slop || Math.abs(along) < Math.abs(across) * 1.2) return;
      d.moved = true;
      cancelAnimationFrame(this.raf);
      this.parts.panel.style.transition = "none";
      this.parts.host.setAttribute("data-dragging", "");
    }
    this.moveTo(Math.max(0, d.from + along));
    d.samples.push([ev.timeStamp, this.vertical ? ev.clientY : ev.clientX]);
    if (d.samples.length > 6) d.samples.shift();
  }
  onUp(ev) {
    const d = this.press;
    if (!d || d.id !== ev.pointerId) return;
    this.press = null;
    this.parts.host.removeAttribute("data-dragging");
    if (!d.moved) {
      const dist = Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0);
      if (d.type !== "mouse" && ev.type !== "pointercancel" && dist < 20 && ev.timeStamp - d.t0 < 600) {
        this.handled = true;
        this.close("strip");
      }
      return;
    }
    this.handled = true;
    const x = this.offset();
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const v = (last[1] - first[1]) / Math.max(1, last[0] - first[0]) * 1e3;
    if (ev.type !== "pointercancel" && (x >= this.o.dragThreshold || v > 900 && x > 24)) {
      this.close("drag", v);
      return;
    }
    const r = this.parts.strip.getBoundingClientRect();
    const over = ev.pointerType === "mouse" && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    const target = over && this.o.peek && !noHover() ? this.o.peekDistance : 0;
    this.peeking = target > 0;
    this.parts.host.toggleAttribute("data-peeking", this.peeking);
    if (!over) this.showCursor(false);
    this.animate(x, target, v, () => {
      if (!target) this.clearMove();
    });
  }
};

// src/element.ts
var STYLE = (
  /* css */
  `
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
);
var ARROW = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5L4 10L9 15M4 10H14.5C17.5376 10 20 12.4624 20 15.5C20 18.5376 17.5376 21 14.5 21H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
var ATTRIBUTES = {
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
  "no-cursor": ["cursor", "off"]
};
var HTMLElementBase = typeof HTMLElement !== "undefined" ? HTMLElement : class {
};
var PeekPanelElement = class extends HTMLElementBase {
  constructor() {
    super();
    /** The engine; use it for options not covered by attributes */
    this.controller = null;
    this.syncing = false;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style>
<div class="backdrop" part="backdrop"></div>
<div class="strip" part="strip" role="button" tabindex="0"></div>
<div class="panel" part="panel" role="dialog" aria-modal="true" tabindex="-1"><slot></slot></div>
<div class="cursor" part="cursor" aria-hidden="true">${ARROW}</div>`;
    this.strip = root.querySelector(".strip");
    this.panel = root.querySelector(".panel");
  }
  static get observedAttributes() {
    return ["open", "label", "dialog-label", ...Object.keys(ATTRIBUTES)];
  }
  connectedCallback() {
    this.updateLabels();
    if (!this.controller) {
      const root = this.shadowRoot;
      this.controller = new PeekController(
        {
          host: this,
          backdrop: root.querySelector(".backdrop"),
          panel: this.panel,
          strip: this.strip,
          cursor: root.querySelector(".cursor"),
          content: this
        },
        this.readOptions(),
        {
          onOpen: () => {
            this.reflectOpen(true);
            this.emit("peek-open");
          },
          onCloseStart: (reason) => {
            this.reflectOpen(false);
            this.emit("peek-close", reason);
          },
          onClosed: (reason) => this.emit("peek-closed", reason),
          onPeekChange: (peeking) => this.emit("peek-hover", void 0, { peeking })
        }
      );
    }
    if (this.hasAttribute("open") && !this.controller.isOpen) this.controller.open();
  }
  disconnectedCallback() {
    this.controller?.destroy();
    this.controller = null;
  }
  attributeChangedCallback(name, old, value) {
    if (name === "label" || name === "dialog-label") return this.updateLabels();
    if (!this.controller) return;
    if (name === "open") {
      if (this.syncing) return;
      if (value !== null) this.controller.open();
      else this.controller.close("api");
      return;
    }
    this.controller.setOptions(this.readOptions());
  }
  /** Open the overlay. Focus returns to `trigger` (or what had focus) when it closes. */
  open(trigger) {
    this.controller?.open(trigger);
  }
  close() {
    this.controller?.close("api");
  }
  toggle() {
    this.controller?.toggle();
  }
  get isOpen() {
    return !!this.controller?.isOpen;
  }
  /** Every attribute-backed option: its attribute's value, or the default when it's absent */
  readOptions() {
    const out = {};
    for (const [attr, [key, kind]] of Object.entries(ATTRIBUTES)) {
      const v = this.getAttribute(attr);
      let value = defaultOptions[key];
      if (kind === "off") value = v === null;
      else if (v !== null && kind === "number" && !isNaN(parseFloat(v))) value = parseFloat(v);
      else if (v !== null && kind === "distance")
        value = v.trim() === "full" || isNaN(parseFloat(v)) ? "full" : parseFloat(v);
      else if (v !== null && kind === "string") value = v;
      out[key] = value;
    }
    this.style.setProperty("--peek-distance", `${out.peekDistance}px`);
    return out;
  }
  updateLabels() {
    this.strip.setAttribute("aria-label", this.getAttribute("label") || "Close");
    const d = this.getAttribute("dialog-label");
    if (d) this.panel.setAttribute("aria-label", d);
    else this.panel.removeAttribute("aria-label");
  }
  reflectOpen(open) {
    this.syncing = true;
    this.toggleAttribute("open", open);
    this.syncing = false;
  }
  emit(type, reason, extra = {}) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail: { reason, ...extra } }));
  }
};
function definePeekPanel(tag = "peek-panel") {
  if (typeof customElements === "undefined" || customElements.get(tag)) return;
  customElements.define(tag, tag === "peek-panel" ? PeekPanelElement : class extends PeekPanelElement {
  });
}
var triggersWired = false;
function wireTriggers() {
  if (triggersWired || typeof document === "undefined") return;
  triggersWired = true;
  document.addEventListener("click", (ev) => {
    const t = ev.target?.closest?.("[data-peek-open]");
    if (!t) return;
    const target = document.getElementById(t.getAttribute("data-peek-open") || "");
    if (!(target instanceof PeekPanelElement)) return;
    ev.preventDefault();
    target.open(t);
  });
}

// src/index.ts
definePeekPanel();
wireTriggers();
export {
  ATTRIBUTES,
  PeekController,
  PeekPanelElement,
  defaultOptions,
  definePeekPanel,
  springPath,
  wireTriggers
};
