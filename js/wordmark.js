// The daydeck wordmark (alex 2026-11-23, "Bold narrow, rounder, soft k"): drawn letters, one even stroke, flat ends.
// The same drawing is saved as daydeck-wordmark-white/black/marigold.svg in the design canvas. Colour comes from currentColor.
import { h } from "./util.js";

export const D = "M21.75,-49.25 H22.25 A15,15 0 0 1 37.25,-34.25 V-21.75 A15,15 0 0 1 22.25,-6.75 H21.75 A15,15 0 0 1 6.75,-21.75 V-34.25 A15,15 0 0 1 21.75,-49.25 Z M37.25,-80 V0 M69.75,-49.25 H70.25 A15,15 0 0 1 85.25,-34.25 V-21.75 A15,15 0 0 1 70.25,-6.75 H69.75 A15,15 0 0 1 54.75,-21.75 V-34.25 A15,15 0 0 1 69.75,-49.25 Z M85.25,-56 V0 M102.75,-56 V-21.75 A15,15 0 0 0 117.75,-6.75 H118.25 A15,15 0 0 0 133.25,-21.75 M133.25,-56 V7 A15,15 0 0 1 118.25,22.0 H104.75 M165.75,-49.25 H166.25 A15,15 0 0 1 181.25,-34.25 V-21.75 A15,15 0 0 1 166.25,-6.75 H165.75 A15,15 0 0 1 150.75,-21.75 V-34.25 A15,15 0 0 1 165.75,-49.25 Z M181.25,-80 V0 M198.75,-28.0 H229.25 V-34.25 A15,15 0 0 0 214.25,-49.25 H213.75 A15,15 0 0 0 198.75,-34.25 V-21.75 A15,15 0 0 0 213.75,-6.75 H235.0 M283.0,-49.25 H261.75 A15,15 0 0 0 246.75,-34.25 V-21.75 A15,15 0 0 0 261.75,-6.75 H283.0 M291.75,-80 V0 M322.84,-55 Q297.15,-34.72 291.75,-22.400 M294.45,-25.76 Q308.460,-22.400 323.84,0";
// For drawing on a canvas (the weekly card): Path2D(D), stroke 13.5 wide, butt ends, round joins, in a box 345.59 by 126 from (-8, -94).
export function wordmark(height = 36) {
  return h("svg", { viewBox: "-8 -94 345.59 126", height: String(height), role: "img", "aria-label": "daydeck", class: "wordmark" },
    h("path", { d: D, fill: "none", stroke: "currentColor", "stroke-width": "13.5", "stroke-linecap": "butt", "stroke-linejoin": "round" }));
}
