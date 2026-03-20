import { describe, expect, test } from 'bun:test';
import { createQueueModel } from '../queue_model.js';

describe('createQueueModel', () => {
    test('fill uses the queue source until the queue reaches the target size', () => {
        const picks = ['song-a.mp3', 'song-a.mp3', 'song-b.mp3'];
        const model = createQueueModel({
            queueSource: {
                pickWeighted() {
                    return picks.shift() ?? null;
                }
            },
            songScores: {
                async change() {
                    return 0;
                }
            },
            maxSize: 2
        });

        model.fill();

        expect(model.getState()).toEqual({
            playlist: ['song-a.mp3', 'song-b.mp3'],
            currentIndex: 0
        });
    });

    test('playNext penalizes a fast skip on the current song', async () => {
        const scoreChanges = [];
        let currentTime = 1000;
        const picks = ['song-a.mp3', 'song-b.mp3'];
        const model = createQueueModel({
            queueSource: {
                pickWeighted() {
                    return picks.shift() ?? null;
                }
            },
            songScores: {
                async change(path, delta) {
                    scoreChanges.push([path, delta]);
                    return 0;
                }
            },
            maxSize: 2,
            now: () => currentTime
        });

        model.fill();
        expect(model.select(0)).toBe('song-a.mp3');
        currentTime = 1001;

        expect(model.playNext()).toBe('song-b.mp3');
        await Promise.resolve();

        expect(scoreChanges).toContainEqual(['song-a.mp3', -1]);
    });

    test('handleSongEnd upvotes a repeated song before advancing', async () => {
        const scoreChanges = [];
        const now = (() => {
            let currentTime = 1000;
            return () => {
                currentTime += 6000;
                return currentTime;
            };
        })();

        const model = createQueueModel({
            queueSource: {
                pickWeighted() {
                    return 'song-a.mp3';
                }
            },
            songScores: {
                async change(path, delta) {
                    scoreChanges.push([path, delta]);
                    return 0;
                }
            },
            maxSize: 1,
            now
        });

        model.fill();
        expect(model.select(0)).toBe('song-a.mp3');
        expect(model.handleSongEnd()).toBe('song-a.mp3');
        expect(model.handleSongEnd()).toBe('song-a.mp3');
        await Promise.resolve();

        expect(scoreChanges).toContainEqual(['song-a.mp3', 1]);
    });
});
