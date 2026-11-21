import { findCycle } from './algorithms/cycle.js';
import { rewatchOrder } from './algorithms/rewatch.js';
import { minBundles } from './algorithms/booking.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const validation = (details, message = 'Invalid request') =>
  new ApiError(400, 'VALIDATION_ERROR', message, details);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Reasonable choice (the brief gives no range): cinema has existed since 1888.
const MIN_YEAR = 1888;
const MAX_YEAR = 2100;

// ---------------------------------------------------------------------------
// Movies
// ---------------------------------------------------------------------------

/** Checks a movie body. `partial` = PATCH (every field optional). */
function parseMovieInput(body, { partial }) {
  if (!isObject(body)) throw validation([{ field: 'body', message: 'Body must be a JSON object' }]);

  const errors = [];
  const out = {};
  const has = (key) => body[key] !== undefined;

  if (has('title') || !partial) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      errors.push({ field: 'title', message: 'title is required and must be a non-empty string' });
    } else if (body.title.trim().length > 200) {
      errors.push({ field: 'title', message: 'title must be at most 200 characters' });
    } else {
      out.title = body.title.trim();
    }
  }

  if (has('releaseYear') || !partial) {
    if (!Number.isInteger(body.releaseYear) || body.releaseYear < MIN_YEAR || body.releaseYear > MAX_YEAR) {
      errors.push({ field: 'releaseYear', message: `releaseYear must be an integer between ${MIN_YEAR} and ${MAX_YEAR}` });
    } else {
      out.releaseYear = body.releaseYear;
    }
  }

  if (has('runtime') || !partial) {
    if (!Number.isInteger(body.runtime) || body.runtime < 1 || body.runtime > 300) {
      errors.push({ field: 'runtime', message: 'runtime must be an integer between 1 and 300 (minutes)' });
    } else {
      out.runtime = body.runtime;
    }
  }

  if (has('watched')) {
    if (typeof body.watched !== 'boolean') {
      errors.push({ field: 'watched', message: 'watched must be true or false' });
    } else {
      out.watched = body.watched;
    }
  }

  if (has('prerequisites')) {
    const list = body.prerequisites;
    const valid =
      Array.isArray(list) &&
      list.every((p) => (Number.isInteger(p) && p > 0) || (typeof p === 'string' && p.trim() !== ''));
    if (!valid) {
      errors.push({
        field: 'prerequisites',
        message: 'prerequisites must be an array of movie ids (or exact movie titles)',
      });
    } else {
      out.prerequisites = list;
    }
  }

  if (errors.length > 0) throw validation(errors);
  if (partial && Object.keys(out).length === 0) {
    throw validation(
      [{ field: 'body', message: 'Provide at least one of: title, releaseYear, runtime, watched, prerequisites' }],
      'Nothing to update',
    );
  }
  return out;
}

/** Turns ids / titles into a de-duplicated list of existing movie ids (sorted). */
function resolvePrerequisites(store, refs) {
  const ids = new Set();
  const unknown = [];
  for (const ref of refs) {
    const id = typeof ref === 'number' ? (store.getMovie(ref) ? ref : null) : store.findMovieIdByTitle(ref.trim());
    if (id === null) unknown.push(ref);
    else ids.add(id);
  }
  if (unknown.length > 0) {
    throw new ApiError(400, 'UNKNOWN_PREREQUISITE', `Unknown prerequisite movie(s): ${unknown.join(', ')}`, {
      unknown,
    });
  }
  return [...ids].sort((a, b) => a - b);
}

/** Throws 409 CIRCULAR_DEPENDENCY if giving `movieId` these prerequisites would create a cycle. */
function assertNoCycle(store, movieId, prerequisiteIds) {
  const cycle = findCycle(store.prerequisiteMap(), movieId, prerequisiteIds);
  if (!cycle) return;
  const titles = new Map(store.listMovies().map((m) => [m.id, m.title]));
  const path = cycle.map((id) => ({ id, title: titles.get(id) }));
  throw new ApiError(
    409,
    'CIRCULAR_DEPENDENCY',
    `This would create a circular dependency: ${path.map((p) => p.title).join(' -> ')}`,
    { cycle: path },
  );
}

function assertTitleFree(store, title, exceptId = null) {
  const existing = store.findMovieIdByTitle(title);
  if (existing !== null && existing !== exceptId) {
    throw new ApiError(409, 'DUPLICATE_TITLE', `A movie titled "${title}" already exists`);
  }
}

export function createMovie(store, body) {
  const input = parseMovieInput(body, { partial: false });
  return store.tx(() => {
    assertTitleFree(store, input.title);
    const prerequisiteIds = resolvePrerequisites(store, input.prerequisites ?? []);
    const id = store.insertMovie({ ...input, watched: input.watched ?? false });
    assertNoCycle(store, id, prerequisiteIds);
    store.setPrerequisites(id, prerequisiteIds);
    return store.getMovie(id);
  });
}

/** POST /movies accepts one movie or an array (all-or-nothing). */
export function createMovies(store, body) {
  if (!Array.isArray(body)) return createMovie(store, body);
  if (body.length === 0) throw validation([{ field: 'body', message: 'Send at least one movie' }]);
  return store.tx(() =>
    body.map((item, index) => {
      try {
        return createMovie(store, item);
      } catch (err) {
        if (err instanceof ApiError) {
          throw new ApiError(err.status, err.code, `Movie #${index + 1}: ${err.message}`, err.details);
        }
        throw err;
      }
    }),
  );
}

export function updateMovie(store, id, body) {
  const input = parseMovieInput(body, { partial: true });
  return store.tx(() => {
    const current = store.getMovie(id);
    if (!current) throw new ApiError(404, 'NOT_FOUND', `Movie ${id} not found`);

    if (input.title !== undefined) assertTitleFree(store, input.title, id);

    let prerequisiteIds = null;
    if (input.prerequisites !== undefined) {
      prerequisiteIds = resolvePrerequisites(store, input.prerequisites);
      assertNoCycle(store, id, prerequisiteIds);
    }

    store.updateMovie(id, {
      title: input.title ?? current.title,
      releaseYear: input.releaseYear ?? current.releaseYear,
      runtime: input.runtime ?? current.runtime,
      watched: input.watched ?? current.watched,
    });
    if (prerequisiteIds) store.setPrerequisites(id, prerequisiteIds);
    return store.getMovie(id);
  });
}

export function getRewatchPlan(store, id) {
  const target = store.getMovie(id);
  if (!target) throw new ApiError(404, 'NOT_FOUND', `Movie ${id} not found`);

  const movies = store.listMovies();
  const byId = new Map(movies.map((m) => [m.id, m]));
  const prereqMap = new Map(movies.map((m) => [m.id, m.prerequisites]));

  const order = rewatchOrder(prereqMap, id).map((movieId) => {
    const { prerequisites, ...movie } = byId.get(movieId);
    return movie;
  });

  const watchedCount = order.filter((m) => m.watched).length;
  const remainingRuntimeMinutes = order.filter((m) => !m.watched).reduce((sum, m) => sum + m.runtime, 0);

  return {
    target: { id: target.id, title: target.title },
    order,
    totalMovies: order.length,
    watchedCount,
    remainingRuntimeMinutes,
  };
}

// ---------------------------------------------------------------------------
// Cinemas
// ---------------------------------------------------------------------------

function parseCinemaInput(body) {
  if (!isObject(body)) throw validation([{ field: 'body', message: 'Body must be a JSON object' }]);
  const errors = [];
  let name;
  let bundleSizes;

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    errors.push({ field: 'name', message: 'name is required and must be a non-empty string' });
  } else if (body.name.trim().length > 200) {
    errors.push({ field: 'name', message: 'name must be at most 200 characters' });
  } else {
    name = body.name.trim();
  }

  const sizes = body.bundleSizes;
  if (!Array.isArray(sizes) || sizes.length < 1 || sizes.length > 10) {
    errors.push({ field: 'bundleSizes', message: 'bundleSizes must be an array of 1 to 10 sizes' });
  } else if (!sizes.every((s) => Number.isInteger(s) && s >= 1 && s <= 500)) {
    errors.push({ field: 'bundleSizes', message: 'every bundle size must be an integer between 1 and 500' });
  } else if (new Set(sizes).size !== sizes.length) {
    // The brief says "different bundle sizes", so repeats are rejected rather than silently merged.
    errors.push({ field: 'bundleSizes', message: 'bundle sizes must all be different' });
  } else {
    bundleSizes = [...sizes].sort((a, b) => a - b);
  }

  if (errors.length > 0) throw validation(errors);
  return { name, bundleSizes };
}

export function createCinema(store, body) {
  const { name, bundleSizes } = parseCinemaInput(body);
  return store.tx(() => {
    if (store.findCinemaIdByName(name) !== null) {
      throw new ApiError(409, 'DUPLICATE_NAME', `A cinema named "${name}" already exists`);
    }
    return store.getCinema(store.insertCinema(name, bundleSizes));
  });
}

/** POST /cinemas accepts one cinema or an array (all-or-nothing). */
export function createCinemas(store, body) {
  if (!Array.isArray(body)) return createCinema(store, body);
  if (body.length === 0) throw validation([{ field: 'body', message: 'Send at least one cinema' }]);
  return store.tx(() =>
    body.map((item, index) => {
      try {
        return createCinema(store, item);
      } catch (err) {
        if (err instanceof ApiError) {
          throw new ApiError(err.status, err.code, `Cinema #${index + 1}: ${err.message}`, err.details);
        }
        throw err;
      }
    }),
  );
}

export function getBookingQuote(store, cinemaId, groupSizeRaw) {
  const cinema = store.getCinema(cinemaId);
  if (!cinema) throw new ApiError(404, 'NOT_FOUND', `Cinema ${cinemaId} not found`);

  const text = typeof groupSizeRaw === 'string' ? groupSizeRaw.trim() : '';
  const groupSize = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > 10000) {
    throw validation([{ field: 'groupSize', message: 'groupSize must be a whole number between 1 and 10,000' }]);
  }

  const result = minBundles(cinema.bundleSizes, groupSize);
  const base = { cinemaId: cinema.id, cinemaName: cinema.name, bundleSizes: cinema.bundleSizes, groupSize };
  if (!result) {
    return {
      ...base,
      possible: false,
      totalBundles: null,
      bundles: [],
      message: `No combination of ${cinema.bundleSizes.join(', ')}-seat bundles adds up to exactly ${groupSize} seats`,
    };
  }
  return { ...base, possible: true, totalBundles: result.totalBundles, bundles: result.bundles };
}

// ---------------------------------------------------------------------------
// Sample data (the table from the brief)
// ---------------------------------------------------------------------------

export function loadSampleData(store) {
  if (store.listMovies().length > 0 || store.listCinemas().length > 0) {
    throw new ApiError(409, 'NOT_EMPTY', 'Sample data can only be loaded into an empty database');
  }
  // Release years and runtimes are real except Doomsday's runtime, which is not announced (placeholder).
  createMovies(store, [
    { title: 'Iron Man', releaseYear: 2008, runtime: 126 },
    { title: 'Captain America: The First Avenger', releaseYear: 2011, runtime: 124 },
    { title: 'The Avengers', releaseYear: 2012, runtime: 143, prerequisites: ['Iron Man', 'Captain America: The First Avenger'] },
    { title: 'Captain America: Civil War', releaseYear: 2016, runtime: 147, prerequisites: ['The Avengers'] },
    { title: 'Thor: Ragnarok', releaseYear: 2017, runtime: 130 },
    { title: 'Avengers: Infinity War', releaseYear: 2018, runtime: 149, prerequisites: ['Captain America: Civil War', 'Thor: Ragnarok'] },
    { title: 'Avengers: Endgame', releaseYear: 2019, runtime: 181, prerequisites: ['Avengers: Infinity War'] },
    { title: 'Avengers: Doomsday', releaseYear: 2026, runtime: 150, prerequisites: ['Avengers: Endgame'] },
  ]);
  createCinemas(store, [
    { name: 'Cineplex Alpha', bundleSizes: [1, 3, 4] },
    { name: 'Star Cinema', bundleSizes: [2, 5] },
    { name: 'Grand Multiplex', bundleSizes: [6, 9, 20] },
    { name: 'Mini Theatre', bundleSizes: [4, 6] },
  ]);
  return { movies: store.listMovies().length, cinemas: store.listCinemas().length };
}
