import { closeDb, getDb, runMigrations } from "./client";

const db = await getDb();
const ran = await runMigrations(db);
console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Database is up to date.");
await closeDb();
