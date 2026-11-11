export type Side = "auto" | "left" | "top";
export type CloseReason = "strip" | "drag" | "escape" | "backdrop" | "button" | "api";
export interface PeekOptions {
    /** Slide the panel aside while the pointer is over the strip */
    peek: boolean;
    /** How far the panel moves during a peek (px) */
    peekDistance: number;
    /** Duration of the peek movement (s) */
    peekTime: number;
    /** Slide the panel in when the overlay opens */
    enterAnimation: boolean;
    /** Slide the panel out before the overlay fades away */
    slideOut: boolean;
    /**
     * How far the panel travels when sliding in from / out to the right, strip on the
     * left: "full" (from fully off-screen to fully off-screen) or a distance in px
     */
    exitOffset: number | "full";
    /** The same for the phone layout, sliding up from / down to the bottom */
    exitOffsetY: number | "full";
    /** Spring duration for sliding in and out (s), like Framer's "Time" */
    springTime: number;
    /** Spring bounce, 0 to 1, like Framer's "Bounce" */
    springBounce: number;
    /** Let the panel be dragged away by its strip */
    drag: boolean;
    /** Drag distance that closes the overlay (px) */
    dragThreshold: number;
    /** Esc closes the overlay */
    escToClose: boolean;
    /** Clicking the visible backdrop closes the overlay */
    backdropClose: boolean;
    /** Where the strip sits: "auto" puts it on top below `mobileBreakpoint` */
    side: Side;
    /** Window width (px) below which "auto" switches to the top strip; 0 = never */
    mobileBreakpoint: number;
    /** Stop the page behind from scrolling while open */
    lockScroll: boolean;
    /** Pause playing videos on the page behind while open */
    pauseVideos: boolean;
    /** Show the back-arrow cursor over the strip (mouse only) */
    cursor: boolean;
}
export declare const defaultOptions: PeekOptions;
export interface PeekParts {
    /** Outer element; gets data-state / data-mode / data-peeking attributes for styling */
    host: HTMLElement;
    /** Full-screen layer behind the panel */
    backdrop: HTMLElement;
    /** The sliding panel (gets focus when the overlay opens) */
    panel: HTMLElement;
    /** The strip of page left visible beside the panel */
    strip: HTMLElement;
    /** Optional element used as the back-arrow cursor */
    cursor?: HTMLElement | null;
    /** Where tabbable content lives, for keeping focus inside (defaults to host) */
    content?: HTMLElement;
}
export interface PeekCallbacks {
    onOpen?: () => void;
    /** Closing has started: the page behind is usable again from here */
    onCloseStart?: (reason: CloseReason) => void;
    /** The overlay has finished animating out */
    onClosed?: (reason: CloseReason) => void;
    onPeekChange?: (peeking: boolean) => void;
}
/** Position over time on that spring, starting at velocity v0 (px/s) */
export declare function springPath(from: number, to: number, v0: number, duration: number, bounce: number): (t: number) => number;
export declare class PeekController {
    private parts;
    private callbacks;
    private o;
    private state;
    private vertical;
    private raf;
    private fadeTimer;
    private hovering;
    private peeking;
    private handled;
    private press;
    private returnFocus;
    private paused;
    private locked;
    private cleanups;
    private docCleanups;
    constructor(parts: PeekParts, options?: Partial<PeekOptions>, callbacks?: PeekCallbacks);
    get isOpen(): boolean;
    get options(): Readonly<PeekOptions>;
    setOptions(options: Partial<PeekOptions>): void;
    open(trigger?: HTMLElement | null): void;
    close(reason?: CloseReason, velocity?: number): void;
    toggle(): void;
    destroy(): void;
    private finishClose;
    private setState;
    private updateMode;
    /**
     * How far the panel slides in and out. "full" = until it's completely off-screen:
     * from its resting edge to the far edge of the viewport, plus room for its shadow.
     */
    private travel;
    private moveTo;
    private clearMove;
    /** The panel's current offset along the strip's direction */
    private offset;
    /** Spring from `from` to `to`; `stopAtTarget` ends as soon as it gets there */
    private animate;
    private fadeMs;
    private setPeek;
    private showCursor;
    /** The overlay opened under a still mouse: browsers only report that on the next move */
    private checkPointerAlreadyOver;
    private holdPaused;
    private pauseVideos;
    private resumeVideos;
    private on;
    private bind;
    private listenToDocument;
    private stopListeningToDocument;
    /** Keep Tab inside the overlay: the strip, then the panel's content */
    private trapTab;
    private onDown;
    private onMove;
    private onUp;
}
