// Dedicated module worker: SQLite (wasm) on the opfs-sahpool VFS. Needs no COOP/COEP.
// Protocol: every request is { id, op, ... }; every reply is { id, ok: true, result } or { id, ok: false, error }.
// The first message must be { op: "init", wasmUrl }. Bindings are positional.
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

type Req =
  | { id: number; op: "init"; wasmUrl?: string; directory?: string }
  | { id: number; op: "open"; dbName: string }
  | { id: number; op: "exec"; sql: string }
  | { id: number; op: "run" | "get" | "all"; sql: string; params?: unknown[] }
  | { id: number; op: "begin" | "commit" | "rollback" }
  | { id: number; op: "close"; destroy?: boolean };

// Minimal structural types for the parts of the sqlite-wasm API used here.
type Db = { exec(opts: object | string): unknown; close(): void; filename: string };
type PoolUtil = { OpfsSAHPoolDb: new (name: string) => Db; unlink(name: string): boolean; pauseVfs(): unknown };

let pool: PoolUtil | undefined;
let db: Db | undefined;
let dbName = "";

function need(): Db {
  if (!db) throw new Error("database is not open");
  return db;
}

async function handle(m: Req): Promise<unknown> {
  switch (m.op) {
    case "init": {
      if (pool) return null;
      const wasmUrl = m.wasmUrl ?? new URL("/wasm/sqlite3.wasm", self.location.href).href;
      const sqlite3 = (await (sqlite3InitModule as unknown as (o: object) => Promise<any>)({
        locateFile: (f: string) => (f.endsWith(".wasm") ? wasmUrl : f),
        print: () => {},
        printErr: () => {},
      })) as any;
      pool = (await sqlite3.installOpfsSAHPoolVfs({ directory: m.directory ?? ".littletusk-sqlite", initialCapacity: 12 })) as PoolUtil;
      return null;
    }
    case "open": {
      if (!pool) throw new Error("not initialised");
      if (db) throw new Error("a database is already open in this worker");
      db = new pool.OpfsSAHPoolDb("/" + m.dbName);
      dbName = "/" + m.dbName;
      db.exec("PRAGMA foreign_keys = ON");
      return null;
    }
    case "exec":
      need().exec(m.sql);
      return null;
    case "run":
      need().exec({ sql: m.sql, bind: m.params?.length ? m.params : undefined });
      return null;
    case "get":
    case "all": {
      const rows = need().exec({ sql: m.sql, bind: m.params?.length ? m.params : undefined, rowMode: "object", returnValue: "resultRows" }) as object[];
      return m.op === "get" ? rows[0] : rows;
    }
    case "begin":
      need().exec("BEGIN IMMEDIATE");
      return null;
    case "commit":
      need().exec("COMMIT");
      return null;
    case "rollback":
      need().exec("ROLLBACK");
      return null;
    case "close": {
      if (db) {
        db.close();
        db = undefined;
        if (m.destroy && pool) pool.unlink(dbName);
      }
      // Releases the OPFS sync access handles so a later worker (e.g. after a reload) can take the pool.
      if (pool) pool.pauseVfs();
      pool = undefined;
      return null;
    }
  }
}

// Requests are processed strictly in order.
let chain: Promise<unknown> = Promise.resolve();
self.onmessage = (e: MessageEvent<Req>) => {
  const m = e.data;
  chain = chain.then(async () => {
    try {
      (self as unknown as Worker).postMessage({ id: m.id, ok: true, result: await handle(m) });
    } catch (err) {
      (self as unknown as Worker).postMessage({ id: m.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
};
