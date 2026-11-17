import Dexie, { type EntityTable } from 'dexie';
import type { AircraftType, Airframe, Entry, Person, TrainingDevice } from '@core/model';
import type { BookId, BookInfo } from './types';

/** A stored row: the model object's fields, flat, plus the book it belongs to. */
export type Row<T> = T & { book: BookId };

export interface SettingRow {
  key: string;
  value: unknown;
}

export const DB_NAME = 'flight-log';

export class FlightLogDb extends Dexie {
  entries!: EntityTable<Row<Entry>>;
  airframes!: EntityTable<Row<Airframe>>;
  aircraftTypes!: EntityTable<Row<AircraftType>>;
  devices!: EntityTable<Row<TrainingDevice>>;
  people!: EntityTable<Row<Person>>;
  books!: EntityTable<BookInfo, 'book'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      entries: '[book+id], book, [book+date]',
      airframes: '[book+id], book',
      aircraftTypes: '[book+id], book',
      devices: '[book+id], book',
      people: '[book+id], book',
      books: 'book',
      settings: 'key',
    });
  }
}
