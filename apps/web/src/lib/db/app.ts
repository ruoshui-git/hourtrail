import { openDb } from './schema';
import { createRepo } from './repo';

/**
 * The app's single database and repository. Screens import these; tests create
 * their own with openDb(name) and createRepo(db, clock, zone).
 */
export const db = openDb();
export const repo = createRepo(db);
