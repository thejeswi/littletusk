// Durable storage for Little Tusk: pi-durable's SqliteStorage over a SQLite-wasm worker (opfs-sahpool).
import type { SqliteDatabase, SqliteExecutor, SqliteValue } from "@earendil-works/pi-durable/storage/sqlite";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";

type Reply = { id: number; ok: boolean; result?: unknown; error?: string };

class Rpc {
  private next = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  constructor(readonly worker: Worker) {
    worker.onmessage = (e: MessageEvent<Reply>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error("sqlite worker failed: " + e.message));
      this.pending.clear();
    };
  }
  call<T = unknown>(msg: Record<string, unknown>): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...msg });
    });
  }
}

class Executor implements SqliteExecutor {
  constructor(protected readonly rpc: Rpc) {}
  exec(sql: string): Promise<void> {
    return this.rpc.call({ op: "exec", sql }).then(() => undefined);
  }
  run(sql: string, ...params: SqliteValue[]): Promise<void> {
    return this.rpc.call({ op: "run", sql, params }).then(() => undefined);
  }
  get<T extends object>(sql: string, ...params: SqliteValue[]): Promise<T | undefined> {
    return this.rpc.call<T | undefined>({ op: "get", sql, params });
  }
  all<T extends object>(sql: string, ...params: SqliteValue[]): Promise<T[]> {
    return this.rpc.call<T[]>({ op: "all", sql, params });
  }
}

/** A handle that is only valid while its transaction callback runs. */
class TransactionHandle extends Executor {
  active = true;
  private check() {
    if (!this.active) throw new Error("transaction handle used after the transaction finished");
  }
  override exec(sql: string) { this.check(); return super.exec(sql); }
  override run(sql: string, ...p: SqliteValue[]) { this.check(); return super.run(sql, ...p); }
  override get<T extends object>(sql: string, ...p: SqliteValue[]) { this.check(); return super.get<T>(sql, ...p); }
  override all<T extends object>(sql: string, ...p: SqliteValue[]) { this.check(); return super.all<T>(sql, ...p); }
}

/** SqliteDatabase over the worker RPC. Unrelated calls queue behind an open transaction. */
export class WorkerSqliteDatabase extends Executor implements SqliteDatabase {
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  /** Delete the database file when closed (tests). */
  destroyOnClose = false;

  private constructor(rpc: Rpc) {
    super(rpc);
  }

  static async open(opts: { dbName: string; worker?: Worker; wasmUrl?: string }): Promise<WorkerSqliteDatabase> {
    const worker = opts.worker ?? new Worker(new URL("./sqlite.worker.ts", import.meta.url), { type: "module" });
    const rpc = new Rpc(worker);
    const wasmUrl = opts.wasmUrl ?? (typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("wasm/sqlite3.wasm") : undefined);
    try {
      await rpc.call({ op: "init", wasmUrl });
      await rpc.call({ op: "open", dbName: opts.dbName });
    } catch (e) {
      worker.terminate();
      throw e;
    }
    return new WorkerSqliteDatabase(rpc);
  }

  /** Serialise: run `fn` after everything queued before it. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }

  override exec(sql: string) { return this.enqueue(() => super.exec(sql)); }
  override run(sql: string, ...p: SqliteValue[]) { return this.enqueue(() => super.run(sql, ...p)); }
  override get<T extends object>(sql: string, ...p: SqliteValue[]) { return this.enqueue(() => super.get<T>(sql, ...p)); }
  override all<T extends object>(sql: string, ...p: SqliteValue[]) { return this.enqueue(() => super.all<T>(sql, ...p)); }

  transaction<T>(callback: (transaction: SqliteExecutor) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      await this.rpc.call({ op: "begin" });
      const handle = new TransactionHandle(this.rpc);
      let value: T;
      try {
        value = await callback(handle);
      } catch (err) {
        handle.active = false;
        try {
          await this.rpc.call({ op: "rollback" });
        } catch (rollbackError) {
          throw new AggregateError([err, rollbackError], "transaction rollback failed");
        }
        throw err;
      }
      handle.active = false;
      try {
        await this.rpc.call({ op: "commit" });
      } catch (commitError) {
        try { await this.rpc.call({ op: "rollback" }); } catch { /* already rolled back */ }
        throw commitError;
      }
      return value;
    });
  }

  /** Waits for queued work, closes the database, releases the OPFS pool and stops the worker. */
  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    return this.enqueue(async () => {
      try {
        await this.rpc.call({ op: "close", destroy: this.destroyOnClose });
      } finally {
        this.rpc.worker.terminate();
      }
    });
  }
}

export type TuskStorage = {
  storage: SqliteStorage;
  /** The raw database (same queue as pi-durable's), for small app tables. Do not close it directly. */
  database: WorkerSqliteDatabase;
  /** Closes the storage and the database. `destroy: true` also deletes the database file (tests). */
  close(opts?: { destroy?: boolean }): Promise<void>;
};

export async function openTuskStorage(opts: { dbName?: string; wasmUrl?: string; worker?: Worker } = {}): Promise<TuskStorage> {
  const database = await WorkerSqliteDatabase.open({ dbName: opts.dbName ?? "littletusk.sqlite3", wasmUrl: opts.wasmUrl, worker: opts.worker });
  let storage: SqliteStorage;
  try {
    storage = await SqliteStorage.open(database, { prefix: "pi_" });
  } catch (e) {
    await database.close();
    throw e;
  }
  return {
    storage,
    database,
    async close(o) {
      database.destroyOnClose = !!o?.destroy;
      await storage.close(BACKGROUND_CONTEXT);
    },
  };
}
