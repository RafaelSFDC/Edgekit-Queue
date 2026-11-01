import { DatabaseSync } from 'node:sqlite';

/**
 * Creates a real SQLite-backed DurableObjectState mock using Node.js built-in DatabaseSync.
 * This runs true SQLite queries, indexes, RETURNING clauses, and subqueries.
 */
export function createRealSqliteDOState() {
  const db = new DatabaseSync(':memory:');
  let alarmTime: number | null = null;
  const backgroundPromises: Promise<any>[] = [];

  const state = {
    db,
    blockConcurrencyWhile: async (fn: () => Promise<void>) => {
      await fn();
    },
    waitUntil: (p: Promise<any>) => {
      backgroundPromises.push(p);
    },
    storage: {
      setAlarm: async (t: number) => {
        alarmTime = t;
      },
      getAlarm: async () => alarmTime,
      deleteAlarm: async () => {
        alarmTime = null;
      },
      sql: {
        exec: (query: string, ...args: any[]) => {
          const q = query.trim();
          if (args.length === 0) {
            db.exec(q);
            return { toArray: () => [] };
          }
          const stmt = db.prepare(q);
          const rows = stmt.all(...args);
          return { toArray: () => rows };
        },
      },
    },
    waitForBackground: async () => {
      await Promise.allSettled(backgroundPromises);
    },
  };

  return state;
}
