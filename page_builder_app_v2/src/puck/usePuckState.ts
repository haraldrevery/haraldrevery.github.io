/*
 * The one way this app reads Puck's editor state: `usePuckState(s => s.x)`.
 *
 * Bare `usePuck()` subscribes to the WHOLE store, so its caller re-renders on
 * every store write — during a drag that is one per pointer move — and Puck
 * logs a warning saying so. The selector form re-renders only when the
 * selected value changes. Selectors must return a primitive or a reference
 * Puck already holds (not a fresh object), or every write looks like a change.
 *
 * For values needed only inside event handlers, use Puck's useGetPuck()
 * instead: it reads the current state without subscribing at all.
 */
import { createUsePuck } from "@puckeditor/core";

export const usePuckState = createUsePuck();
