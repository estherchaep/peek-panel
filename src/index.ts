// peek-panel: an overlay panel with a "peek" strip that slides aside on hover and
// slides the panel out to close. Importing this file registers <peek-panel> and
// wires up data-peek-open buttons; the engine is exported for custom setups.
import { definePeekPanel, wireTriggers } from "./element"

export { PeekController, defaultOptions, springPath } from "./core"
export type { PeekOptions, PeekParts, PeekCallbacks, CloseReason, Side } from "./core"
export { PeekPanelElement, definePeekPanel, wireTriggers, ATTRIBUTES } from "./element"

definePeekPanel()
wireTriggers()
