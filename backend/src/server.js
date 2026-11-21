import { createApp } from './app.js';
import { openStore } from './db.js';
import { loadSampleData } from './services.js';

const port = Number(process.env.PORT) || 3001;
const dbPath = process.env.DB_PATH || './data/doomsday.db';

const store = openStore(dbPath);

// Optional: SEED=true loads the sample MCU data when the database is empty.
if (process.env.SEED === 'true' && store.listMovies().length === 0 && store.listCinemas().length === 0) {
  console.log('Seeded sample data:', loadSampleData(store));
}

const server = createApp(store).listen(port, () => {
  console.log(`Doomsday Ready API listening on http://localhost:${port}/api (db: ${dbPath})`);
});

const shutdown = () => server.close(() => {
  store.close();
  process.exit(0);
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
