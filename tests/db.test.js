import { describe, expect, test } from 'bun:test';
import { createSongRepositoryFromDatabase } from '../db.js';

class FakeDatabase {
    constructor(initialRows = {}) {
        this.rows = new Map(
            Object.entries(initialRows).map(([path, score]) => [path, { score, lastPlayed: 0 }])
        );
    }

    exec(query, params = []) {
        if (query.includes('SELECT score FROM song_scores WHERE path = ? LIMIT 1')) {
            const record = this.rows.get(params[0]);
            return record ? [{ values: [[record.score]] }] : [];
        }

        if (query.includes('SELECT path, score FROM song_scores ORDER BY score DESC')) {
            const values = [...this.rows.entries()]
                .sort((left, right) => right[1].score - left[1].score)
                .map(([path, record]) => [path, record.score]);
            return values.length > 0 ? [{ values }] : [];
        }

        if (query.includes('INSERT OR IGNORE INTO song_scores')) {
            const [path, score, lastPlayed] = params;
            if (!this.rows.has(path)) {
                this.rows.set(path, { score, lastPlayed });
            }
            return [];
        }

        if (query.includes('INSERT OR REPLACE INTO song_scores')) {
            const [path, score, lastPlayed] = params;
            this.rows.set(path, { score, lastPlayed });
            return [];
        }

        throw new Error(`Unsupported query: ${query}`);
    }

    export() {
        return new Uint8Array();
    }
}

function createImmediateRepository(initialRows = {}) {
    return createSongRepositoryFromDatabase({
        database: new FakeDatabase(initialRows),
        persist: async () => {},
        schedule: (callback) => {
            void callback();
            return null;
        },
        persistDelayMs: 0,
        now: () => 1234
    });
}

describe('createSongRepositoryFromDatabase', () => {
    test('addMissing preserves existing scores and listRanked sorts by score', async () => {
        const repository = createImmediateRepository({ 'existing.mp3': 10 });

        await repository.addMissing(['existing.mp3', 'new.mp3']);

        expect(repository.getScore('existing.mp3')).toBe(10);
        expect(repository.getScore('new.mp3')).toBe(2);
        expect(repository.listRanked()).toEqual([
            ['existing.mp3', 10],
            ['new.mp3', 2]
        ]);
    });

    test('setScore clamps values and repositories do not share state', async () => {
        const firstRepository = createImmediateRepository({ 'song-a.mp3': 1 });
        const secondRepository = createImmediateRepository({ 'song-a.mp3': 1 });

        await firstRepository.setScore('song-a.mp3', 999);
        await secondRepository.changeScore('song-a.mp3', -999);

        expect(firstRepository.getScore('song-a.mp3')).toBe(20);
        expect(secondRepository.getScore('song-a.mp3')).toBe(-1);
    });
});
