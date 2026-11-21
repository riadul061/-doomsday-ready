import { openStore } from './db.js';
import { loadSampleData } from './services.js';

const store = openStore(process.env.DB_PATH || './data/doomsday.db');
try {
  console.log('Loaded sample data:', loadSampleData(store));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  store.close();
}
