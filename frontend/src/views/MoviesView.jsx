import { useState } from 'react';
import { api, describeError, formatMinutes } from '../api.js';

const emptyForm = { title: '', releaseYear: '', runtime: '', prerequisites: [] };

/** Checkbox list used both when adding a movie and when editing its prerequisites. */
function PrerequisitePicker({ movies, selected, onChange, excludeId }) {
  const options = movies.filter((m) => m.id !== excludeId);
  if (options.length === 0) return <p className="muted small">No other movies yet.</p>;
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="chips">
      {options.map((m) => (
        <label key={m.id} className={selected.includes(m.id) ? 'chip on' : 'chip'}>
          <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
          {m.title}
        </label>
      ))}
    </div>
  );
}

function MovieRow({ movie, movies, titleOf, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(movie.prerequisites);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onChanged();
      return true;
    } catch (err) {
      setError(describeError(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (await run(() => api.updateMovie(movie.id, { prerequisites: draft }))) setEditing(false);
  };

  return (
    <li className={movie.watched ? 'movie watched' : 'movie'}>
      <div className="movie-main">
        <label className="check" title="Mark as watched">
          <input
            type="checkbox"
            checked={movie.watched}
            disabled={busy}
            onChange={(e) => run(() => api.updateMovie(movie.id, { watched: e.target.checked }))}
          />
          <span className="sr">Watched: {movie.title}</span>
        </label>
        <div className="movie-info">
          <div className="movie-title">{movie.title}</div>
          <div className="muted small">
            {movie.releaseYear} · {formatMinutes(movie.runtime)}
          </div>
          {!editing && (
            <div className="muted small">
              {movie.prerequisites.length === 0
                ? 'No prerequisites'
                : `Watch first: ${movie.prerequisites.map(titleOf).join(', ')}`}
            </div>
          )}
        </div>
        {!editing && (
          <button
            className="btn ghost"
            onClick={() => {
              setDraft(movie.prerequisites);
              setError('');
              setEditing(true);
            }}
          >
            Edit prerequisites
          </button>
        )}
      </div>

      {editing && (
        <div className="editor">
          <p className="small">Pick the movies to watch before <strong>{movie.title}</strong>:</p>
          <PrerequisitePicker movies={movies} selected={draft} onChange={setDraft} excludeId={movie.id} />
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={save}>
              Save
            </button>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <div className="alert error">{error}</div>}
    </li>
  );
}

export default function MoviesView({ movies, onChanged }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const titleOf = (id) => movies.find((m) => m.id === id)?.title ?? `#${id}`;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createMovie({
        title: form.title,
        releaseYear: Number(form.releaseYear),
        runtime: Number(form.runtime),
        prerequisites: form.prerequisites,
      });
      setForm(emptyForm);
      await onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const watchedCount = movies.filter((m) => m.watched).length;

  return (
    <div className="stack">
      <section className="card">
        <h2>Add a movie</h2>
        <form onSubmit={submit} className="stack">
          <div className="grid3">
            <label>
              Title
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Iron Man"
              />
            </label>
            <label>
              Release year
              <input
                required
                type="number"
                min="1888"
                max="2100"
                value={form.releaseYear}
                onChange={(e) => setForm({ ...form, releaseYear: e.target.value })}
                placeholder="2008"
              />
            </label>
            <label>
              Runtime (min)
              <input
                required
                type="number"
                min="1"
                max="300"
                value={form.runtime}
                onChange={(e) => setForm({ ...form, runtime: e.target.value })}
                placeholder="1–300"
              />
            </label>
          </div>
          <fieldset>
            <legend>Watch these first (optional)</legend>
            <PrerequisitePicker
              movies={movies}
              selected={form.prerequisites}
              onChange={(prerequisites) => setForm({ ...form, prerequisites })}
            />
          </fieldset>
          {error && <div className="alert error">{error}</div>}
          <div>
            <button className="btn primary" disabled={busy}>
              Add movie
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="row between">
          <h2>All movies</h2>
          <span className="muted small">
            {watchedCount} of {movies.length} watched
          </span>
        </div>
        {movies.length === 0 ? (
          <p className="muted">No movies yet. Add one above.</p>
        ) : (
          <ul className="movie-list">
            {movies.map((m) => (
              <MovieRow key={m.id} movie={m} movies={movies} titleOf={titleOf} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
