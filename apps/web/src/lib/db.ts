import "server-only";
import { getDb, type Db } from "@agentshelf/core";

/** One database handle per server process (PGlite must not be opened twice). */
export function db(): Promise<Db> {
  return getDb();
}
