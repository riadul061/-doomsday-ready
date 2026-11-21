import { useEffect, useState } from 'react';
import { api, describeError, formatMinutes } from '../api.js';

export default function RewatchView({ movies, onChanged }) {
  const [targetId, setTargetId] = useState('');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState(null);

  // Default to the most recent release (the one everyone is preparing for).
  useEffect(() => {
    if (!targetId && movies.length > 0) {
      const latest = [...movies].sort((a, b) => b.releaseYear - a.releaseYear || b.id - a.id)[0];
      setTargetId(String(latest.id));
    }
  }, [movies, targetId]);

  // Reload the plan whenever the target changes or movies are edited (e.g. ticked as watched).
  useEffect(() => {
    if (!targetId) return;
    let stale = false;
    api
      .rewatchOrder(targetId)
      .then((p) => {
        if (!stale) {
          setPlan(p);
          setError('');
        }
      })
      .catch((err) => {
        if (!stale) {
          setPlan(null);
          setError(describeError(err));
        }
      });
    return () => {
      stale = true;
    };
  }, [targetId, movies]);

  const toggle = async (movie) => {
    setPendingId(movie.id);
    try {
      await api.updateMovie(movie.id, { watched: !movie.watched });
      await onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPendingId(null);
    }
  };

  if (movies.length === 0) {
    return (
      <section className="card">
        <h2>Rewatch plan</h2>
        <p className="muted">Add some movies first, then pick a target to see what to watch before it.</p>
      </section>
    );
  }

  const percent = plan && plan.totalMovies > 0 ? Math.round((plan.watchedCount / plan.totalMovies) * 100) : 100;

  return (
    <div className="stack">
      <section className="card">
        <h2>Rewatch plan</h2>
        <label>
          I want to be ready for
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {movies.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} ({m.releaseYear})
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && <div className="alert error">{error}</div>}

      {plan && (
        <section className="card">
          {plan.totalMovies === 0 ? (
            <p className="empty">
              Nothing to catch up on. <strong>{plan.target.title}</strong> has no prerequisites.
            </p>
          ) : (
            <>
              <div className="row between">
                <strong>
                  {plan.watchedCount} of {plan.totalMovies} watched
                </strong>
                <span className="remaining">
                  {plan.remainingRuntimeMinutes === 0
                    ? 'All caught up! 🎉'
                    : `${formatMinutes(plan.remainingRuntimeMinutes)} left to watch`}
                </span>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={plan.totalMovies}
                aria-valuenow={plan.watchedCount}
                aria-label={`${plan.watchedCount} of ${plan.totalMovies} watched`}
              >
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>

              <ol className="plan">
                {plan.order.map((m, i) => (
                  <li key={m.id} className={m.watched ? 'plan-item done' : 'plan-item'}>
                    <span className="step">{i + 1}</span>
                    <label className="check">
                      <input type="checkbox" checked={m.watched} disabled={pendingId === m.id} onChange={() => toggle(m)} />
                      <span className="sr">Watched: {m.title}</span>
                    </label>
                    <div className="movie-info">
                      <div className="movie-title">{m.title}</div>
                      <div className="muted small">
                        {m.releaseYear} · {formatMinutes(m.runtime)}
                      </div>
                    </div>
                    {m.watched && <span className="tick" aria-hidden="true">✓</span>}
                  </li>
                ))}
              </ol>
              <p className="muted small">
                Then: <strong>{plan.target.title}</strong>
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
