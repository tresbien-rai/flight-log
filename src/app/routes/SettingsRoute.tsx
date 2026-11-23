import type { FlightNumberStyle, NameOrder } from '@core/importers';
import { useState } from 'react';
import type { Backup } from '@core/backup';
import { completePilotProfile, type PilotProfile } from '@core/model';
import { BackupSettings } from '../components/BackupSettings';
import { DriveTrial } from '../components/DriveTrial';
import { useProfileDoc } from '../hooks/useProfileDoc';
import { useShell } from './shellContext';

/** Printed at the head of the experience report. Typed in, not tracked. */
function PilotSettings() {
  const { value: pilot, save } = useProfileDoc('pilot', completePilotProfile);
  const set = (patch: Partial<PilotProfile>) => void save({ ...pilot, ...patch });
  const setDate = (key: 'flightReview' | 'ipc', value: string) => {
    const next = { ...pilot, [key]: value };
    if (!value) delete next[key];
    void save(next);
  };
  const setCertificate = (i: number, patch: Partial<PilotProfile['certificates'][number]>) =>
    set({
      certificates: pilot.certificates.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    });

  return (
    <fieldset className="settings-group">
      <legend className="section-title">For the experience report</legend>
      <p className="lede">
        Printed at the top of the report. Nothing here is checked or tracked; type it as it should
        appear.
      </p>
      <label className="field">
        Name
        <input
          className="input"
          value={pilot.name}
          autoComplete="name"
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <div className="pilot-certs">
        {pilot.certificates.map((c, i) => (
          <div key={i} className="pilot-cert">
            <label className="field">
              Certificate
              <input
                className="input"
                value={c.title}
                placeholder="Commercial Pilot"
                onChange={(e) => setCertificate(i, { title: e.target.value })}
              />
            </label>
            <label className="field">
              Ratings
              <input
                className="input"
                value={c.details}
                placeholder="Airplane Single Engine Land"
                onChange={(e) => setCertificate(i, { details: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="btn btn-link"
              aria-label={`Remove ${c.title || 'this certificate'}`}
              onClick={() => set({ certificates: pilot.certificates.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => set({ certificates: [...pilot.certificates, { title: '', details: '' }] })}
        >
          Add a certificate
        </button>
      </div>
      <div className="pilot-dates">
        <label className="field">
          Medical class
          <input
            className="input"
            value={pilot.medical.class}
            placeholder="First"
            onChange={(e) => set({ medical: { ...pilot.medical, class: e.target.value } })}
          />
        </label>
        <label className="field">
          Medical date
          <input
            className="input"
            type="date"
            value={pilot.medical.date ?? ''}
            onChange={(e) => {
              const medical: PilotProfile['medical'] = { ...pilot.medical, date: e.target.value };
              if (!medical.date) delete medical.date;
              set({ medical });
            }}
          />
        </label>
        <label className="field">
          Last flight review
          <input
            className="input"
            type="date"
            value={pilot.flightReview ?? ''}
            onChange={(e) => setDate('flightReview', e.target.value)}
          />
        </label>
        <label className="field">
          Last IPC
          <input
            className="input"
            type="date"
            value={pilot.ipc ?? ''}
            onChange={(e) => setDate('ipc', e.target.value)}
          />
        </label>
      </div>
    </fieldset>
  );
}

const STYLES: { value: FlightNumberStyle; label: string; example: string }[] = [
  { value: 'spaced', label: 'With a space', example: 'DL 3939' },
  { value: 'joined', label: 'Without a space', example: 'DL3939' },
];

const ORDERS: { value: NameOrder; label: string; example: string }[] = [
  { value: 'family-first', label: 'Last name first', example: 'Example, Pat' },
  { value: 'given-first', label: 'First name first', example: 'Pat Example' },
];

export function SettingsRoute() {
  const { prefs, setNameOrder, setFlightNumberStyle } = useShell();
  /** Counts restores, so the pilot details are read again after one. */
  const [restores, setRestores] = useState(0);
  const onRestored = (backup: Backup) => {
    const order = backup.settings['app.nameOrder'];
    const style = backup.settings['app.flightNumberStyle'];
    if (order === 'family-first' || order === 'given-first') setNameOrder(order);
    if (style === 'spaced' || style === 'joined') setFlightNumberStyle(style);
    setRestores((n) => n + 1);
  };
  return (
    <div className="screen">
      <div className="screen-inner">
        <h1 className="screen-title">Settings</h1>
        <PilotSettings key={restores} />
        <fieldset className="settings-group">
          <legend className="section-title">People’s names</legend>
          <p className="lede">
            How crew names are written on screen. First and last names are stored separately, so
            this can be changed at any time.
          </p>
          <div className="check-list">
            {ORDERS.map((order) => (
              <label key={order.value} className="check">
                <input
                  type="radio"
                  name="name-order"
                  checked={prefs.nameOrder === order.value}
                  onChange={() => setNameOrder(order.value)}
                />
                <span>{order.label}</span>
                <span className="muted">{order.example}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="settings-group">
          <legend className="section-title">Flight numbers</legend>
          <p className="lede">
            How flight numbers are written on screen. They are stored the same way whichever you
            choose, so both forms are found by search.
          </p>
          <div className="check-list">
            {STYLES.map((style) => (
              <label key={style.value} className="check">
                <input
                  type="radio"
                  name="flight-number-style"
                  checked={prefs.flightNumberStyle === style.value}
                  onChange={() => setFlightNumberStyle(style.value)}
                />
                <span>{style.label}</span>
                <span className="muted">{style.example}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <BackupSettings onRestored={onRestored} />
        <DriveTrial />
      </div>
    </div>
  );
}
