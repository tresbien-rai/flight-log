import type { AircraftType, Silhouette } from '../model';

/**
 * The drawing for a type: its own choice, else one worked out from class and engine.
 * Wing position is not known from class and engine, so an unlisted single is drawn low-wing.
 */
export function silhouetteOf(
  type: Pick<AircraftType, 'silhouette' | 'class' | 'engine' | 'multiPilot'>,
): Silhouette {
  if (type.silhouette) return type.silhouette;
  if (type.class === 'helicopter' || type.engine === 'turboshaft') return 'helicopter';
  if (type.engine === 'turbofan' || type.engine === 'turbojet') {
    return type.multiPilot ? 'airliner' : 'regional-jet';
  }
  if (type.engine === 'turboprop') return 'turboprop';
  if (type.class === 'AMEL' || type.class === 'AMES') return 'light-twin';
  return 'low-wing-single';
}
