/**
 * Engine kinds as reports group them. An entry's aircraft keeps the engine it actually has;
 * a report asks in the regulation's or the application's terms. See docs/DESIGN.md §8.
 */
import type { EngineType } from '../model';

export type EngineBucket = 'turbojet-powered' | 'turbine' | 'piston';

const BUCKETS: Record<EngineBucket, ReadonlySet<EngineType>> = {
  /** 14 CFR uses "turbojet-powered" for turbojets and turbofans alike. */
  'turbojet-powered': new Set(['turbojet', 'turbofan']),
  turbine: new Set(['turbojet', 'turbofan', 'turboprop', 'turboshaft']),
  piston: new Set(['piston']),
};

export function inEngineBucket(engine: EngineType, bucket: EngineBucket): boolean {
  return BUCKETS[bucket].has(engine);
}
