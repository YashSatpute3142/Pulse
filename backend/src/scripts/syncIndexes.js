// `npm run db:sync-indexes`: builds/updates all indexes (production runs with autoIndex off).
import { connectDb, disconnectDb } from '../config/db.js';
import * as models from '../models/index.js';

await connectDb();
for (const [name, Model] of Object.entries(models)) {
  const dropped = await Model.syncIndexes();
  console.log(`${name}: indexes synced${dropped.length ? ` (dropped ${dropped.join(', ')})` : ''}`);
}
await disconnectDb();
