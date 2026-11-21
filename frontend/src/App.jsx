import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from './api.js';
import MoviesView from './views/MoviesView.jsx';
import RewatchView from './views/RewatchView.jsx';
import BookingView from './views/BookingView.jsx';

const TABS = [
  { id: 'movies', label: 'Movies' },
  { id: 'plan', label: 'Rewatch Plan' },
  { id: 'booking', label: 'Booking' },
];

export default function App() {
  const [tab, setTab] = useState('movies');
  const [movies, setMovies] = useState([]);
  const [cinemas, setCinemas] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([api.listMovies(), api.listCinemas()]);
      setMovies(m);
      setCinemas(c);
      setLoadError('');
    } catch (err) {
      setLoadError(describeError(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadSample = async () => {
    try {
      await api.loadSampleData();
      await refresh();
    } catch (err) {
      setLoadError(describeError(err));
    }
  };

  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">Avengers: Doomsday · Opening night</p>
        <h1>
          Doomsday <span>Ready</span>
        </h1>
        <p className="tagline">Catch up on the MCU in the right order, then book the watch party.</p>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {loadError && <div className="alert error">{loadError}</div>}

        {loaded && movies.length === 0 && cinemas.length === 0 && !loadError && (
          <div className="card sample">
            <div>
              <strong>Starting from scratch?</strong>
              <p className="muted">Load the sample MCU movies and four cinemas from the challenge brief.</p>
            </div>
            <button className="btn primary" onClick={loadSample}>
              Load sample data
            </button>
          </div>
        )}

        {tab === 'movies' && <MoviesView movies={movies} onChanged={refresh} />}
        {tab === 'plan' && <RewatchView movies={movies} onChanged={refresh} />}
        {tab === 'booking' && <BookingView cinemas={cinemas} onChanged={refresh} />}
      </main>
    </div>
  );
}
