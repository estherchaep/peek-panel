import { PeekController, type PeekOptions } from "./core";
type Kind = "number" | "distance" | "string" | "off";
/** Attribute name → option, e.g. <peek-panel peek-distance="32" no-drag> */
export declare const ATTRIBUTES: Record<string, [keyof PeekOptions, Kind]>;
declare const HTMLElementBase: typeof HTMLElement;
export declare class PeekPanelElement extends HTMLElementBase {
    static get observedAttributes(): string[];
    /** The engine; use it for options not covered by attributes */
    controller: PeekController | null;
    private syncing;
    private strip;
    private panel;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, old: string | null, value: string | null): void;
    /** Open the overlay. Focus returns to `trigger` (or what had focus) when it closes. */
    open(trigger?: HTMLElement | null): void;
    close(): void;
    toggle(): void;
    get isOpen(): boolean;
    /** Every attribute-backed option: its attribute's value, or the default when it's absent */
    private readOptions;
    private updateLabels;
    private reflectOpen;
    private emit;
}
/** Register <peek-panel> (safe to call more than once) */
export declare function definePeekPanel(tag?: string): void;
export declare function wireTriggers(): void;
declare global {
    interface HTMLElementTagNameMap {
        "peek-panel": PeekPanelElement;
    }
}
export {};
