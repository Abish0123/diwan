import { smartDb } from "@/lib/localDb";

// Minimal shape every entity in this app already satisfies (every table row
// has an id; most also carry uid/createdAt, but those aren't required here).
export interface Entity {
  id: string;
}

export interface IRepository<T extends Entity> {
  getAll(scopeUid?: string, queryParams?: Record<string, string>): Promise<T[]>;
  getOne(id: string): Promise<T | null>;
  create(data: Omit<T, "id"> & { id?: string }): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

// Thin, typed wrapper around smartDb for one entity — this is the seam that
// replaces direct `fetch("/api/data/...")` call sites scattered across the
// app (see the Phase 0 audit) with a single, entity-scoped, typed surface.
// Deliberately NOT a rewrite of smartDb's transport (MySQL-first,
// best-effort Firestore mirror) — that logic stays exactly as-is underneath;
// this only gives each entity its own typed home instead of every caller
// re-stringing `/api/data/${entity}` and re-guessing the response shape.
export class BaseRepository<T extends Entity> implements IRepository<T> {
  constructor(protected readonly entityName: string) {}

  async getAll(scopeUid?: string, queryParams?: Record<string, string>): Promise<T[]> {
    const rows = await smartDb.getAll(this.entityName, scopeUid, queryParams);
    return (Array.isArray(rows) ? rows : []) as T[];
  }

  async getOne(id: string): Promise<T | null> {
    return (await smartDb.getOne(this.entityName, id)) as T | null;
  }

  async create(data: Omit<T, "id"> & { id?: string }): Promise<T> {
    const { id, ...rest } = data as { id?: string } & Record<string, unknown>;
    return (await smartDb.create(this.entityName, rest, id)) as T;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    return (await smartDb.update(this.entityName, id, data as Record<string, unknown>)) as T;
  }

  async delete(id: string): Promise<void> {
    await smartDb.delete(this.entityName, id);
  }
}
