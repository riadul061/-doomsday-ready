import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS movies (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  release_year INTEGER NOT NULL CHECK (release_year BETWEEN 1888 AND 2100),
  runtime      INTEGER NOT NULL CHECK (runtime BETWEEN 1 AND 300),
  watched      INTEGER NOT NULL DEFAULT 0 CHECK (watched IN (0, 1))
);

-- "movie_id needs prerequisite_id watched first" (many-to-many, self-reference)
CREATE TABLE IF NOT EXISTS movie_prerequisites (
  movie_id        INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  prerequisite_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, prerequisite_id),
  CHECK (movie_id <> prerequisite_id)
);

CREATE TABLE IF NOT EXISTS cinemas (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS cinema_bundles (
  cinema_id INTEGER NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
  size      INTEGER NOT NULL CHECK (size BETWEEN 1 AND 500),
  PRIMARY KEY (cinema_id, size)
);
`;

const toMovie = (row, prerequisites) => ({
  id: row.id,
  title: row.title,
  releaseYear: row.release_year,
  runtime: row.runtime,
  prerequisites,
  watched: row.watched === 1,
});

/**
 * Opens (and creates, if needed) the database and returns a small store object.
 * Pass ':memory:' for an isolated, throwaway database (used by the tests).
 */
export function openStore(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const sql = {
    allMovies: db.prepare('SELECT * FROM movies ORDER BY id'),
    allPrereqs: db.prepare('SELECT movie_id, prerequisite_id FROM movie_prerequisites ORDER BY movie_id, prerequisite_id'),
    movieById: db.prepare('SELECT * FROM movies WHERE id = ?'),
    prereqsOf: db.prepare('SELECT prerequisite_id FROM movie_prerequisites WHERE movie_id = ? ORDER BY prerequisite_id'),
    movieIdByTitle: db.prepare('SELECT id FROM movies WHERE title = ?'),
    insertMovie: db.prepare('INSERT INTO movies (title, release_year, runtime, watched) VALUES (?, ?, ?, ?)'),
    updateMovie: db.prepare('UPDATE movies SET title = ?, release_year = ?, runtime = ?, watched = ? WHERE id = ?'),
    clearPrereqs: db.prepare('DELETE FROM movie_prerequisites WHERE movie_id = ?'),
    addPrereq: db.prepare('INSERT INTO movie_prerequisites (movie_id, prerequisite_id) VALUES (?, ?)'),

    allCinemas: db.prepare('SELECT * FROM cinemas ORDER BY id'),
    allBundles: db.prepare('SELECT cinema_id, size FROM cinema_bundles ORDER BY cinema_id, size'),
    cinemaById: db.prepare('SELECT * FROM cinemas WHERE id = ?'),
    bundlesOf: db.prepare('SELECT size FROM cinema_bundles WHERE cinema_id = ? ORDER BY size'),
    cinemaIdByName: db.prepare('SELECT id FROM cinemas WHERE name = ?'),
    insertCinema: db.prepare('INSERT INTO cinemas (name) VALUES (?)'),
    addBundle: db.prepare('INSERT INTO cinema_bundles (cinema_id, size) VALUES (?, ?)'),
  };

  let depth = 0;

  return {
    /** Runs fn atomically. Re-entrant: nested calls join the outer transaction. */
    tx(fn) {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      } finally {
        depth--;
      }
    },

    close() {
      db.close();
    },

    // ---- movies ----
    listMovies() {
      const byMovie = new Map();
      for (const r of sql.allPrereqs.all()) {
        if (!byMovie.has(r.movie_id)) byMovie.set(r.movie_id, []);
        byMovie.get(r.movie_id).push(r.prerequisite_id);
      }
      return sql.allMovies.all().map((row) => toMovie(row, byMovie.get(row.id) ?? []));
    },

    getMovie(id) {
      const row = sql.movieById.get(id);
      if (!row) return null;
      return toMovie(row, sql.prereqsOf.all(id).map((r) => r.prerequisite_id));
    },

    findMovieIdByTitle(title) {
      return sql.movieIdByTitle.get(title)?.id ?? null;
    },

    /** Map<movieId, prerequisiteId[]> for graph algorithms. */
    prerequisiteMap() {
      const map = new Map();
      for (const r of sql.allPrereqs.all()) {
        if (!map.has(r.movie_id)) map.set(r.movie_id, []);
        map.get(r.movie_id).push(r.prerequisite_id);
      }
      return map;
    },

    insertMovie({ title, releaseYear, runtime, watched }) {
      return Number(sql.insertMovie.run(title, releaseYear, runtime, watched ? 1 : 0).lastInsertRowid);
    },

    updateMovie(id, { title, releaseYear, runtime, watched }) {
      sql.updateMovie.run(title, releaseYear, runtime, watched ? 1 : 0, id);
    },

    setPrerequisites(id, prerequisiteIds) {
      sql.clearPrereqs.run(id);
      for (const pid of prerequisiteIds) sql.addPrereq.run(id, pid);
    },

    // ---- cinemas ----
    listCinemas() {
      const byCinema = new Map();
      for (const r of sql.allBundles.all()) {
        if (!byCinema.has(r.cinema_id)) byCinema.set(r.cinema_id, []);
        byCinema.get(r.cinema_id).push(r.size);
      }
      return sql.allCinemas.all().map((row) => ({
        id: row.id,
        name: row.name,
        bundleSizes: byCinema.get(row.id) ?? [],
      }));
    },

    getCinema(id) {
      const row = sql.cinemaById.get(id);
      if (!row) return null;
      return { id: row.id, name: row.name, bundleSizes: sql.bundlesOf.all(id).map((r) => r.size) };
    },

    findCinemaIdByName(name) {
      return sql.cinemaIdByName.get(name)?.id ?? null;
    },

    insertCinema(name, bundleSizes) {
      const id = Number(sql.insertCinema.run(name).lastInsertRowid);
      for (const size of bundleSizes) sql.addBundle.run(id, size);
      return id;
    },
  };
}
