/** What each report column and section is called, and which columns a section can show. */
import type { CustomFieldDef } from '../importers/presets';
import type {
  BuiltInColumn,
  ColumnId,
  ColumnInfo,
  ColumnUnit,
  CustomColumn,
  SectionId,
} from './types';
import { BUILT_IN_COLUMNS } from './types';

const BUILT_IN: Record<BuiltInColumn, { label: string; short: string; unit: ColumnUnit }> = {
  total: { label: 'Total time', short: 'Total', unit: 'minutes' },
  pic: { label: 'Pilot in command', short: 'PIC', unit: 'minutes' },
  sic: { label: 'Second in command', short: 'SIC', unit: 'minutes' },
  crossCountry: { label: 'Cross-country', short: 'XC', unit: 'minutes' },
  crossCountry50: { label: 'Cross-country over 50 NM', short: 'XC 50 NM', unit: 'minutes' },
  night: { label: 'Night', short: 'Night', unit: 'minutes' },
  actualInstrument: { label: 'Actual instrument', short: 'Actual inst', unit: 'minutes' },
  simulatedInstrument: { label: 'Simulated instrument', short: 'Sim inst', unit: 'minutes' },
  dualGiven: { label: 'Dual given', short: 'Dual given', unit: 'minutes' },
  dualReceived: { label: 'Dual received', short: 'Dual rcvd', unit: 'minutes' },
  solo: { label: 'Solo', short: 'Solo', unit: 'minutes' },
  picNight: { label: 'Night as pilot in command', short: 'PIC night', unit: 'minutes' },
  picCrossCountry: { label: 'Cross-country as pilot in command', short: 'PIC XC', unit: 'minutes' },
  picInstrument: { label: 'Instrument as pilot in command', short: 'PIC inst', unit: 'minutes' },
  picTurbine: { label: 'Pilot in command, turbine', short: 'PIC turbine', unit: 'minutes' },
  picMultiEngine: { label: 'Pilot in command, multi-engine', short: 'PIC ME', unit: 'minutes' },
  dayTakeoffs: { label: 'Day takeoffs', short: 'Day T/O', unit: 'count' },
  nightTakeoffs: { label: 'Night takeoffs', short: 'Night T/O', unit: 'count' },
  dayLandings: { label: 'Day landings, touch-and-goes included', short: 'Day ldg', unit: 'count' },
  nightLandings: {
    label: 'Night landings, touch-and-goes included',
    short: 'Night ldg',
    unit: 'count',
  },
  dayFullStop: { label: 'Day full-stop landings', short: 'Day FS ldg', unit: 'count' },
  nightFullStop: { label: 'Night full-stop landings', short: 'Night FS ldg', unit: 'count' },
  allLandings: { label: 'All landings', short: 'All ldg', unit: 'count' },
  approaches: { label: 'Instrument approaches', short: 'Appr', unit: 'count' },
  holds: { label: 'Holds', short: 'Holds', unit: 'count' },
  simulator: { label: 'Simulated flight (session length)', short: 'Sim flight', unit: 'minutes' },
};

export const isBuiltInColumn = (id: string): id is BuiltInColumn =>
  (BUILT_IN_COLUMNS as readonly string[]).includes(id);

export const customColumn = (fieldId: string): CustomColumn => `custom:${fieldId}`;

/** The custom field a column shows, or undefined for a built-in column. */
export const customFieldId = (id: ColumnId): string | undefined =>
  id.startsWith('custom:') ? id.slice('custom:'.length) : undefined;

/** Describes a column, or undefined for a custom column whose field is not defined. */
export function columnInfo(
  id: ColumnId,
  customFields: readonly CustomFieldDef[],
): ColumnInfo | undefined {
  if (isBuiltInColumn(id)) return { id, ...BUILT_IN[id] };
  const fieldId = customFieldId(id);
  const field = customFields.find((f) => f.id === fieldId);
  if (!field || field.kind === 'text') return undefined;
  return {
    id,
    label: field.label,
    short: field.short,
    unit: field.kind === 'duration' ? 'minutes' : 'count',
  };
}

/** Columns of flight sections: everything but the simulator session length. */
const FLIGHT_COLUMNS: readonly BuiltInColumn[] = BUILT_IN_COLUMNS.filter((c) => c !== 'simulator');

/** Columns of simulator sections. */
const SIMULATOR_COLUMNS: readonly BuiltInColumn[] = [
  'simulator',
  'simulatedInstrument',
  'dualGiven',
  'dualReceived',
  'approaches',
  'holds',
];

export function isSimulatorSection(section: SectionId): boolean {
  return section === 'simulatorLevels' || section === 'simulatorTypes';
}

/** Every column a section can show, in the order the layout panel offers them. */
export function sectionColumns(
  section: SectionId,
  customFields: readonly CustomFieldDef[],
): ColumnInfo[] {
  const ids: ColumnId[] = isSimulatorSection(section)
    ? [...SIMULATOR_COLUMNS]
    : [
        ...FLIGHT_COLUMNS,
        ...customFields.filter((f) => f.kind !== 'text').map((f) => customColumn(f.id)),
      ];
  return ids.flatMap((id) => columnInfo(id, customFields) ?? []);
}

export const SECTION_INFO: Record<
  SectionId,
  { title: string; rowHeading: string; countNoun?: { one: string; many: string } }
> = {
  recent: { title: 'Recent experience', rowHeading: 'Period' },
  characteristics: { title: 'Aircraft characteristics', rowHeading: 'Characteristic' },
  categoryClass: { title: 'Category and class', rowHeading: 'Class' },
  engine: { title: 'Engine type', rowHeading: 'Engine' },
  rule: { title: 'Operating rule', rowHeading: 'Rule' },
  types: {
    title: 'Experience by aircraft type',
    rowHeading: 'Aircraft type',
    countNoun: { one: 'flight', many: 'flights' },
  },
  simulatorLevels: { title: 'Simulators by device level', rowHeading: 'Device level' },
  simulatorTypes: {
    title: 'Simulators by type represented',
    rowHeading: 'Type represented',
    countNoun: { one: 'session', many: 'sessions' },
  },
};
