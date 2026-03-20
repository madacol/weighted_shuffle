import { MIN_SCORE, MAX_SCORE, DEFAULT_SCORE } from './config.js';

const DEFAULT_PERSIST_DELAY_MS = 5000;

/**
 * Creates a song repository around a database-like object.
 * @param {{
 *   database: { exec(query: string, params?: Array): Array, export(): Uint8Array },
 *   persist?: (data: Uint8Array) => Promise<void>,
 *   now?: () => number,
 *   schedule?: (callback: () => void | Promise<void>, delay: number) => unknown,
 *   persistDelayMs?: number
 * }} options
 */
export function createSongRepositoryFromDatabase({
    database,
    persist = async () => {},
    now = () => Date.now(),
    schedule = (callback, delay) => setTimeout(callback, delay),
    persistDelayMs = DEFAULT_PERSIST_DELAY_MS
}) {
    let persistHandle = null;

    async function saveDatabase() {
        if (persistHandle) return;

        persistHandle = schedule(async () => {
            await persist(database.export());
            persistHandle = null;
        }, persistDelayMs);
    }

    /**
     * @param {string} query
     * @param {Array} params
     * @returns {Array}
     */
    function runQuery(query, params = []) {
        return database.exec(query, params);
    }

    /**
     * @param {string} path
     * @returns {number}
     */
    function readScore(path) {
        const result = runQuery(/*sql*/`SELECT score FROM song_scores WHERE path = ? LIMIT 1`, [path]);
        return result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : DEFAULT_SCORE;
    }

    /**
     * @param {number} score
     * @returns {number}
     */
    function clampScore(score) {
        return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score));
    }

    /**
     * @param {string} path
     * @param {number} score
     * @returns {Promise<number>}
     */
    async function setScore(path, score) {
        const boundedScore = clampScore(score);
        runQuery(/*sql*/`INSERT OR REPLACE INTO song_scores (path, score, last_played) VALUES (?, ?, ?)`,
            [path, boundedScore, now()]);
        await saveDatabase();
        return boundedScore;
    }

    return {
        /**
         * @param {string[]} musicFiles
         * @returns {Promise<void>}
         */
        async addMissing(musicFiles) {
            for (const file of musicFiles) {
                runQuery(/*sql*/`INSERT OR IGNORE INTO song_scores (path, score, last_played) VALUES (?, ?, ?)`,
                    [file, DEFAULT_SCORE, now()]);
            }
            await saveDatabase();
        },

        /**
         * @returns {Array<[string, number]>}
         */
        listRanked() {
            const result = runQuery(/*sql*/`SELECT path, score FROM song_scores ORDER BY score DESC`);
            return result.length > 0 ? result[0].values : [];
        },

        /**
         * @param {string} path
         * @returns {number}
         */
        getScore(path) {
            return readScore(path);
        },

        setScore,

        /**
         * @param {string} path
         * @param {number} increment
         * @returns {Promise<number>}
         */
        async changeScore(path, increment) {
            return setScore(path, readScore(path) + increment);
        }
    };
}

/**
 * Creates a repository backed by sql.js and the selected folder's SQLite file.
 * @param {FileSystemDirectoryHandle} folderHandle
 */
export async function createSongRepository(folderHandle) {
    const SQL = await initSqlJs({
        locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/${filename}`
    });

    /** @type {FileSystemFileHandle} */
    let dbFileHandle;
    /** @type {InstanceType<typeof SQL.Database>} */
    let database;

    try {
        dbFileHandle = await folderHandle.getFileHandle('music_db.sqlite', { create: false });
        const dbFile = await dbFileHandle.getFile();
        const arrayBuffer = await dbFile.arrayBuffer();
        database = new SQL.Database(new Uint8Array(arrayBuffer));
    } catch (error) {
        if (error.name !== 'NotFoundError') throw error;

        console.log('Database file not found. Creating a new one.');
        database = new SQL.Database();
        dbFileHandle = await folderHandle.getFileHandle('music_db.sqlite', { create: true });
    }

    database.run(/*sql*/`
    CREATE TABLE IF NOT EXISTS song_scores (
        path TEXT PRIMARY KEY,
        score INTEGER,
        last_played TIMESTAMP
    )`);

    return createSongRepositoryFromDatabase({
        database,
        persist: async (data) => {
            const writable = await dbFileHandle.createWritable();
            await writable.write(data);
            await writable.close();
        }
    });
}
