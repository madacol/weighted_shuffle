import { describe, expect, test } from 'bun:test';
import { createSongCatalogServices } from '../song_catalog.js';

describe('createSongCatalogServices', () => {
    test('songScores notifies subscribers for set and change operations', async () => {
        const events = [];
        const services = createSongCatalogServices({
            async addMissing() {},
            listRanked() {
                return [];
            },
            getScore() {
                return 0;
            },
            async setScore(path, score) {
                return score;
            },
            async changeScore(path, delta) {
                return 4 + delta;
            }
        });

        const unsubscribe = services.songScores.subscribe((event) => {
            events.push(event);
        });

        await services.songScores.set('song-a.mp3', 8);
        await services.songScores.change('song-a.mp3', -1);
        unsubscribe();

        expect(events).toEqual([
            { song: 'song-a.mp3', score: 8 },
            { song: 'song-a.mp3', score: 3 }
        ]);
    });
});
