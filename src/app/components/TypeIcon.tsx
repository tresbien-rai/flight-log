import type { Silhouette } from '@core/model';
import { SILHOUETTE_PATHS, SILHOUETTE_VIEWBOX, SIMULATOR_PATH } from '../art/silhouettes';

const parts = new Map<string, string[]>();

/** Splits path data into its closed parts (each ends in `Z`). */
export function partsOf(d: string): string[] {
  let list = parts.get(d);
  if (!list) {
    list = d
      .split(/(?<=Z)\s*/)
      .map((p) => p.trim())
      .filter((p) => p !== '');
    parts.set(d, list);
  }
  return list;
}

/** A side-view drawing of a type's general shape, or of a training device. Decorative. */
export function TypeIcon({
  silhouette,
  className = 'type-icon',
}: {
  silhouette: Silhouette | 'simulator';
  className?: string;
}) {
  const d = silhouette === 'simulator' ? SIMULATOR_PATH : SILHOUETTE_PATHS[silhouette];
  return (
    <svg
      className={className}
      viewBox={SILHOUETTE_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      data-silhouette={silhouette}
    >
      {/* One path per part, so overlapping parts never cut holes in each other. */}
      {partsOf(d).map((part, i) => (
        <path key={i} d={part} fill="currentColor" />
      ))}
    </svg>
  );
}
