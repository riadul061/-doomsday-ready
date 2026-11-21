import express from 'express';
import {
  ApiError,
  createMovies,
  updateMovie,
  getRewatchPlan,
  createCinemas,
  getBookingQuote,
  loadSampleData,
} from './services.js';

/** Route params like "7" -> 7; anything else -> null (treated as not found). */
const parseId = (raw) => (/^\d+$/.test(raw) ? Number(raw) : null);

export function createApp(store) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // ---- movies ----
  api.post('/movies', (req, res) => res.status(201).json(createMovies(store, req.body)));
  api.get('/movies', (_req, res) => res.json(store.listMovies()));
  api.patch('/movies/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) throw new ApiError(404, 'NOT_FOUND', `Movie ${req.params.id} not found`);
    res.json(updateMovie(store, id, req.body));
  });
  api.get('/movies/:id/rewatch-order', (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) throw new ApiError(404, 'NOT_FOUND', `Movie ${req.params.id} not found`);
    res.json(getRewatchPlan(store, id));
  });

  // ---- cinemas ----
  api.post('/cinemas', (req, res) => res.status(201).json(createCinemas(store, req.body)));
  api.get('/cinemas', (_req, res) => res.json(store.listCinemas()));
  api.get('/cinemas/:id/booking', (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) throw new ApiError(404, 'NOT_FOUND', `Cinema ${req.params.id} not found`);
    res.json(getBookingQuote(store, id, req.query.groupSize));
  });

  // ---- extra: one-click sample data (only works on an empty database) ----
  api.post('/seed', (_req, res) => res.status(201).json(loadSampleData(store)));

  api.use((req, _res, next) => next(new ApiError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`)));

  app.use('/api', api);

  // Error handler: every failure is { error: { code, message, details? } }
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  });

  return app;
}
