import { useEffect, useState } from 'react';
import { api, describeError } from '../api.js';

function AddCinema({ onChanged }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sizes, setSizes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const parts = sizes.split(/[\s,]+/).filter(Boolean);
    const bundleSizes = parts.map(Number);
    if (bundleSizes.some((n) => !Number.isInteger(n))) {
      setError('Bundle sizes must be whole numbers separated by commas, e.g. 2, 5');
      return;
    }
    setBusy(true);
    try {
      await api.createCinema({ name, bundleSizes });
      setName('');
      setSizes('');
      setOpen(false);
      await onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="btn ghost" onClick={() => setOpen(true)}>
        + Add a cinema
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="stack editor">
      <div className="grid2">
        <label>
          Cinema name
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Star Cinema" />
        </label>
        <label>
          Bundle sizes (1–10 sizes, 1–500 seats each)
          <input required value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="2, 5" />
        </label>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="row">
        <button className="btn primary" disabled={busy}>
          Save cinema
        </button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function BookingView({ cinemas, onChanged }) {
  const [cinemaId, setCinemaId] = useState('');
  const [groupSize, setGroupSize] = useState('');
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cinemaId && cinemas.length > 0) setCinemaId(String(cinemas[0].id));
  }, [cinemas, cinemaId]);

  // Quote automatically as the user types (with a short pause), once the input is valid.
  useEffect(() => {
    const n = Number(groupSize);
    if (!cinemaId || groupSize === '') {
      setQuote(null);
      setError('');
      return;
    }
    if (!Number.isInteger(n) || n < 1 || n > 10000) {
      setQuote(null);
      setError('Group size must be a whole number between 1 and 10,000.');
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      api
        .booking(cinemaId, n)
        .then((q) => {
          if (!stale) {
            setQuote(q);
            setError('');
          }
        })
        .catch((err) => {
          if (!stale) {
            setQuote(null);
            setError(describeError(err));
          }
        });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [cinemaId, groupSize]);

  const cinema = cinemas.find((c) => String(c.id) === cinemaId);

  return (
    <div className="stack">
      <section className="card">
        <h2>Book the opening-night watch party</h2>
        {cinemas.length === 0 ? (
          <p className="muted">No cinemas yet. Add one below.</p>
        ) : (
          <div className="grid2">
            <label>
              Cinema
              <select value={cinemaId} onChange={(e) => setCinemaId(e.target.value)}>
                {cinemas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Group size
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="10000"
                value={groupSize}
                onChange={(e) => setGroupSize(e.target.value)}
                placeholder="1–10,000"
              />
            </label>
          </div>
        )}
        {cinema && (
          <p className="muted small">
            Sells bundles of: {cinema.bundleSizes.map((s) => `${s} seats`).join(' · ')}
          </p>
        )}
      </section>

      {error && <div className="alert error">{error}</div>}

      {quote && (
        <section className={quote.possible ? 'card result ok' : 'card result bad'} aria-live="polite">
          {quote.possible ? (
            <>
              <h3>
                {quote.totalBundles} {quote.totalBundles === 1 ? 'bundle' : 'bundles'} for {quote.groupSize} seats
              </h3>
              <ul className="bundles">
                {quote.bundles.map((b) => (
                  <li key={b.size}>
                    <span className="count">{b.count}×</span> bundle of <strong>{b.size}</strong>
                    <span className="muted small"> = {b.count * b.size} seats</span>
                  </li>
                ))}
              </ul>
              <p className="muted small">The fewest bundles that fill every seat exactly, so nobody pays for an empty one.</p>
            </>
          ) : (
            <>
              <h3>Not possible</h3>
              <p>{quote.message}</p>
              <p className="muted small">Try a different group size or another cinema.</p>
            </>
          )}
        </section>
      )}

      <section className="card">
        <AddCinema onChanged={onChanged} />
      </section>
    </div>
  );
}
