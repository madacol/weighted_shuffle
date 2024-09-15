import { MIN_SCORE, MAX_SCORE, DEFAULT_SCORE } from './config.js';

let db = null;

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

export function sql(query, params = []) {
    if (!db) throw new Error('Database not initialized');
    return db.exec(query, params);
}

export async function addNewSongsToDatabase(musicFiles) {
    for (const file of musicFiles) {
        sql(/*sql*/`INSERT OR IGNORE INTO song_scores (path, score, last_played) VALUES (?, ?, ?)`,
            [file, DEFAULT_SCORE, Date.now()]);
    }
}

export function getSongScore(path) {
    const result = sql(/*sql*/`SELECT score FROM song_scores WHERE path = ? LIMIT 1`, [path]);
    return result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : DEFAULT_SCORE;
}

export function updateScore(path, increment) {
    const result = sql(/*sql*/`SELECT score FROM song_scores WHERE path = ?`, [path]);
    let score = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : DEFAULT_SCORE;
    let newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, score + increment));
    sql(/*sql*/`INSERT OR REPLACE INTO song_scores (path, score, last_played) VALUES (?, ?, ?)`,
        [path, newScore, Date.now()]);
    return newScore;
}
