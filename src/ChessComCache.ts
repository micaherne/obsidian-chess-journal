const DB_NAME = "chess-journal-chesscom";
const DB_VERSION = 1;
const STORE_NAME = "monthly-pgn";

export class ChessComCache {
	private db: IDBDatabase | null = null;

	async open(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			};
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};
			request.onerror = () => reject(request.error);
		});
	}

	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}

	async get(key: string): Promise<string | undefined> {
		if (!this.db) return undefined;
		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(STORE_NAME, "readonly");
			const store = tx.objectStore(STORE_NAME);
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result as string | undefined);
			request.onerror = () => reject(request.error);
		});
	}

	async put(key: string, pgn: string): Promise<void> {
		if (!this.db) return;
		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			const request = store.put(pgn, key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}
}
