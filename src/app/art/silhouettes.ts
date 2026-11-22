/**
 * Side-view drawings of each general aircraft shape, nose to the right, drawn for this app.
 *
 * Each drawing is SVG path data on a 120 × 40 grid, filled with the text colour. To add a
 * shape: add its name to `SILHOUETTES` in `src/core/model/aircraft.ts`, add its drawing here,
 * and give the types that use it `silhouette` in `src/core/aircraft/catalog.ts` (or pick it on
 * the type's edit form). A drawing can come from any vector editor: export a single path on a
 * 120 × 40 artboard and paste its `d` attribute.
 */
import type { Silhouette } from '@core/model';

export const SILHOUETTE_VIEWBOX = '0 0 120 40';

/** Gear for small aeroplanes: main wheel under the wing, nose wheel under the engine. */
const TRICYCLE =
  'M70 25 L71.5 25 L73 31 L71.5 31 Z M72 33 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 Z ' +
  'M105 25 L106.5 25 L107 30.5 L105.5 30.5 Z M106 32.5 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 Z';

/** A small aeroplane's fuselage, tail fin and tailplane, and propeller. */
const LIGHT_BODY =
  // Fuselage: tail at the left, cowling at the right.
  'M10 21 L24 19 L58 16 Q66 14 76 14 L96 15 L106 17 L113 20 L114 24 L106 27 L80 28 L56 27 L24 23.5 Z ' +
  // Fin and rudder.
  'M9 21.5 L5 8 L12 8 L24 19.5 Z ' +
  // Tailplane, seen edge-on.
  'M4 20.5 L22 20 L22 22 L4 22 Z ' +
  // Spinner and propeller disc.
  'M113 19 Q118 21.5 113 25 Z M117 10 L118.5 10 L118.5 34 L117 34 Z';

export const SILHOUETTE_PATHS: Record<Silhouette, string> = {
  'high-wing-single':
    LIGHT_BODY +
    // Wing on top of the cabin, and its strut.
    ' M60 11 L94 11 L94 14 L60 14 Z M71 25 L73 25 L86 14 L84 14 Z ' +
    TRICYCLE,

  'low-wing-single':
    LIGHT_BODY +
    // Canopy over the cabin.
    ' M66 15 Q74 9 88 11 L96 15 Z' +
    // Wing low on the fuselage.
    ' M60 25 L96 25 Q98 26.5 96 28 L60 28 Z ' +
    TRICYCLE,

  'light-twin':
    // Fuselage and pointed nose.
    'M10 21 L24 19 L58 16 Q68 13 82 13.5 L104 16 L114 21 L104 25.5 L80 27 L56 27 L24 23.5 Z ' +
    // T-tail: fin with the tailplane on top.
    'M9 21.5 L6 5 L13 5 L24 19.5 Z M2 4 L19 4 L19 6.5 L2 6.5 Z ' +
    // Canopy.
    'M66 15 Q76 9 90 12 L98 15 Z ' +
    // Low wing with an engine nacelle and its propeller.
    'M56 25 L92 25 Q94 26.5 92 28 L56 28 Z M70 22 L90 22 Q96 23.5 90 26 L70 26 Z ' +
    'M95 13 L96.5 13 L96.5 35 L95 35 Z ' +
    TRICYCLE,

  turboprop:
    // Long fuselage with a rounded nose.
    'M6 22 L20 18 L40 15 L100 15 Q112 15 116 20 Q114 26 104 27 L40 27 L20 25 Z ' +
    // T-tail.
    'M6 22 L4 4 L12 4 L24 17 Z M0 3 L18 3 L18 5.5 L0 5.5 Z ' +
    // High wing with an engine nacelle hanging below it, and the propeller.
    'M52 12 L84 12 L84 15 L52 15 Z M64 15 L84 15 L88 18 L84 21 L64 21 Z ' +
    'M88 9 L89.5 9 L89.5 27 L88 27 Z ' +
    // Gear.
    'M62 27 L64 27 L64 32 L62 32 Z M63 34 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 Z ' +
    'M104 27 L105.5 27 L105.5 31 L104 31 Z M104.8 32.6 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z',

  'regional-jet':
    // Slender fuselage with a pointed nose.
    'M4 21 L18 17 L40 15.5 L100 15.5 Q110 15.5 118 20.5 Q112 25 102 25.5 L40 25.5 L18 24 Z ' +
    // T-tail.
    'M6 20 L4 2 L11 2 L26 16 Z M0 1 L18 1 L18 3.5 L0 3.5 Z ' +
    // Engines on the rear fuselage, above the wing line.
    'M22 10 L40 10 Q44 12.5 40 15 L22 15 Z M38 13 L44 13 L44 15.5 L38 15.5 Z ' +
    // Low wing, swept, seen from the side.
    'M54 24 L80 24 L84 26.5 L54 26.5 Z ' +
    // Gear.
    'M66 26 L68 26 L68 31 L66 31 Z M67 33 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 Z ' +
    'M106 25 L107.5 25 L107.5 30 L106 30 Z M106.8 31.6 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z',

  airliner:
    // Wide fuselage with a rounded nose.
    'M4 22 L16 16 L36 14 L100 14 Q112 14 118 20 Q114 26 102 27 L36 27 L16 25 Z ' +
    // Fin, with the tailplane low on the fuselage.
    'M6 21 L6 2 L13 2 L30 15 Z M2 18 L22 18 L22 20.5 L2 20.5 Z ' +
    // Low wing and an engine slung under it.
    'M50 25 L80 25 L84 27.5 L50 27.5 Z M62 27 L80 27 Q85 29.5 80 32 L62 32 Z ' +
    // Gear.
    'M56 27 L58 27 L58 33 L56 33 Z M57 35 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 Z ' +
    'M104 27 L105.5 27 L105.5 32 L104 32 Z M104.8 33.6 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z',

  helicopter:
    // Cabin and tail boom.
    'M60 14 Q86 10 96 20 Q96 30 80 31 L64 31 Q54 30 54 22 Z M8 19 L56 17 L56 22 L8 21 Z ' +
    // Tail rotor and fin.
    'M4 12 L10 12 L12 22 L6 22 Z ' +
    // Mast and main rotor.
    'M72 8 L75 8 L75 12 L72 12 Z M24 6 L118 6 L118 8 L24 8 Z ' +
    // Skids.
    'M60 31 L62 31 L60 35 L58 35 Z M84 31 L86 31 L88 35 L86 35 Z M52 35 L96 35 Q98 36 96 37 L52 37 Z',
};

/** A training device: a cockpit box on motion legs. */
export const SIMULATOR_PATH =
  'M30 6 L86 6 Q96 6 98 16 L98 24 L30 24 Z M36 10 L56 10 L56 16 L36 16 Z ' +
  'M40 24 L44 24 L36 34 L32 34 Z M60 24 L64 24 L64 34 L60 34 Z M84 24 L88 24 L96 34 L92 34 Z ' +
  'M22 34 L106 34 L106 37 L22 37 Z';
