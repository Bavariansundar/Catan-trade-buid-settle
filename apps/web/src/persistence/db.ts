import { openDB, type IDBPDatabase } from "idb";
import type { Action } from "@baychearsbar/engine";
import type { SinglePlayerConfig } from "../worker/useEngineWorker.js";

const DB_NAME = "baychearsbar";
const STORE_NAME = "singlePlayerSave";
/** One save slot for now — single-player is one offline game at a time. */
const SAVE_KEY = "current";

export interface SinglePlayerSave {
  readonly config: SinglePlayerConfig;
  readonly actions: readonly Action[];
  readonly savedAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    },
  });
  return dbPromise;
}

export async function saveSinglePlayerGame(save: SinglePlayerSave): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, save, SAVE_KEY);
}

export async function loadSinglePlayerGame(): Promise<SinglePlayerSave | null> {
  const db = await getDb();
  const save = (await db.get(STORE_NAME, SAVE_KEY)) as SinglePlayerSave | undefined;
  return save ?? null;
}

export async function clearSinglePlayerGame(): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, SAVE_KEY);
}
