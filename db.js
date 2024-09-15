import { MIN_SCORE, MAX_SCORE, DEFAULT_SCORE } from './config.js';

let db = null;

/**
 * Initializes the database with the given music folder handle.
 * @param {FileSystemDirectoryHandle} musicFolderHandle - The handle to the music folder.
 * @returns {Promise<void>}
 */
export async function initDatabase(musicFolderHandle) {
    const SQL = await initSqlJs({
        locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/${filename}`
    });

    try {
        const dbFileHandle = await musicFolderHandle.getFileHandle('music_db.sqlite', { create: false });
        const dbFile = await dbFileHandle.getFile();
        const arrayBuffer = await dbFile.arrayBuffer();
        db = new SQL.Database(new Uint8Array(arrayBuffer));
    } catch (error) {
        if (error.name === 'NotFoundError') {
            console.log('Database file not found. Creating a new one.');
            db = new SQL.Database();
        } else {
            throw error;
        }
    }

    db.run(/*sql*/`
    CREATE TABLE IF NOT EXISTS song_scores (
        path TEXT PRIMARY KEY,
        score INTEGER,
        last_played TIMESTAMP
    )`);
}

/**
 * Executes an SQL query on the database.
 * @param {string} query - The SQL query to execute.
 * @param {Array} [params=[]] - The parameters for the SQL query.
 * @returns {Array} The result of the SQL query.
 * @throws {Error} If the database is not initialized.
 */
export function sql(query, params = []) {
    if (!db) throw new Error('Database not initialized');
    return db.exec(query, params);
}

/**
 * Adds new songs to the database.
 * @param {Array<string>} musicFiles - An array of file paths to add to the database.
 * @returns {Promise<void>}
 */
export async function addNewSongsToDatabase(musicFiles) {
    for (const file of musicFiles) {
        sql(/*sql*/`INSERT OR IGNORE INTO song_scores (path, score, last_played) VALUES (?, ?, ?)`,
            [file, DEFAULT_SCORE, Date.now()]);
    }
}

/**
 * Gets the score for a given song path.
 * @param {string} path - The path of the song.
 * @returns {number} The score of the song, or the default score if not found.
 */
export function getSongScore(path) {
    const result = sql(/*sql*/`SELECT score FROM song_scores WHERE path = ? LIMIT 1`, [path]);
    return result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : DEFAULT_SCORE;
}

/**
 * Updates the score for a given song path.
 * @param {string} path - The path of the song.
 * @param {number} increment - The amount to increment the score by.
 * @returns {number} The new score after updating.
 */
export function updateScore(path, increment) {
    const result = sql(/*sql*/`SELECT score FROM song_scores WHERE path = ?`, [path]);
    let score = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : DEFAULT_SCORE;
    let newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, score + increment));
    sql(/*sql*/`INSERT OR REPLACE INTO song_scores (path, score, last_played) VALUES (?, ?, ?)`,
        [path, newScore, Date.now()]);
    return newScore;
}
