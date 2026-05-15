import { describe, expect, test } from 'bun:test';
import { getSongDisplayName, getYouTubeVideoId, isYouTubeMusicLink, normalizeYouTubeMusicLink } from '../media_source.js';

describe('media source helpers', () => {
    test('recognizes and normalizes YouTube Music links', () => {
        expect(isYouTubeMusicLink('https://music.youtube.com/watch?v=M7lc1UVf-VE&si=test')).toBe(true);
        expect(getYouTubeVideoId('https://music.youtube.com/watch?v=M7lc1UVf-VE&si=test')).toBe('M7lc1UVf-VE');
        expect(normalizeYouTubeMusicLink('https://music.youtube.com/watch?v=M7lc1UVf-VE&si=test')).toBe('https://music.youtube.com/watch?v=M7lc1UVf-VE');
    });

    test('rejects non-YouTube Music links for library additions', () => {
        expect(isYouTubeMusicLink('https://www.youtube.com/watch?v=M7lc1UVf-VE')).toBe(false);
        expect(isYouTubeMusicLink('https://open.spotify.com/track/abc123')).toBe(false);
        expect(() => normalizeYouTubeMusicLink('https://open.spotify.com/track/abc123')).toThrow('Paste a YouTube Music song link with a video id.');
    });

    test('formats display names for local files and YouTube Music entries', () => {
        expect(getSongDisplayName('albums/song-a.mp3')).toBe('song-a');
        expect(getSongDisplayName('https://music.youtube.com/watch?v=M7lc1UVf-VE')).toBe('YouTube Music M7lc1UVf-VE');
    });
});
