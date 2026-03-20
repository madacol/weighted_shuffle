import { beforeEach, describe, expect, test } from 'bun:test';
import { createPlayerController } from '../player_controller.js';

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(value) {
        this.values.add(value);
    }

    remove(value) {
        this.values.delete(value);
    }

    contains(value) {
        return this.values.has(value);
    }
}

class FakeElement extends EventTarget {
    constructor() {
        super();
        this.textContent = '';
        this.title = '';
        this.value = 0;
        this.style = {};
        this.classList = new FakeClassList();
    }
}

class FakeAudioElement extends EventTarget {
    constructor() {
        super();
        this.paused = true;
        this.currentTime = 0;
        this.duration = 100;
        this.src = '';
        this.playCalls = 0;
        this.pauseCalls = 0;
    }

    async play() {
        this.paused = false;
        this.playCalls += 1;
        this.dispatchEvent(new Event('play'));
    }

    pause() {
        this.paused = true;
        this.pauseCalls += 1;
        this.dispatchEvent(new Event('pause'));
    }
}

beforeEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
            mediaSession: {
                metadata: null,
                setActionHandler() {}
            }
        }
    });

    Object.defineProperty(globalThis, 'MediaMetadata', {
        configurable: true,
        value: class MediaMetadata {
            constructor(init) {
                Object.assign(this, init);
            }
        }
    });

    Object.defineProperty(globalThis, 'URL', {
        configurable: true,
        value: {
            createObjectURL() {
                return 'blob:test-song';
            },
            revokeObjectURL() {}
        }
    });
});

describe('createPlayerController', () => {
    test('playFile updates playback UI and metadata', async () => {
        const audioPlayer = new FakeAudioElement();
        const seekBar = new FakeElement();
        const playPauseButton = new FakeElement();
        const nextButton = new FakeElement();
        const previousButton = new FakeElement();
        const nowPlayingEl = new FakeElement();
        const nowPlayingScoreEl = new FakeElement();

        const controller = createPlayerController({
            audioPlayer,
            seekBar,
            playPauseButton,
            nextButton,
            previousButton,
            nowPlayingEl,
            nowPlayingScoreEl,
            onNext() {},
            onPrevious() {},
            onEnded() {},
            getDisplayName: (path) => path.replace('.mp3', ''),
            getSongScore: () => 7
        });

        await controller.playFile({}, 'song-a.mp3');

        expect(audioPlayer.src).toBe('blob:test-song');
        expect(audioPlayer.playCalls).toBe(1);
        expect(nowPlayingEl.textContent).toBe('song-a');
        expect(nowPlayingScoreEl.textContent).toBe('Score: 7');
        expect(navigator.mediaSession.metadata.title).toBe('song-a');
    });

    test('transport buttons delegate to playback callbacks and refreshCurrentScore rereads state', async () => {
        const audioPlayer = new FakeAudioElement();
        const seekBar = new FakeElement();
        const playPauseButton = new FakeElement();
        const nextButton = new FakeElement();
        const previousButton = new FakeElement();
        const nowPlayingEl = new FakeElement();
        const nowPlayingScoreEl = new FakeElement();
        const transportCalls = [];
        let score = 3;

        const controller = createPlayerController({
            audioPlayer,
            seekBar,
            playPauseButton,
            nextButton,
            previousButton,
            nowPlayingEl,
            nowPlayingScoreEl,
            onNext() {
                transportCalls.push('next');
            },
            onPrevious() {
                transportCalls.push('previous');
            },
            onEnded() {},
            getDisplayName: (path) => path,
            getSongScore: () => score
        });

        playPauseButton.dispatchEvent(new Event('click'));
        playPauseButton.dispatchEvent(new Event('click'));
        nextButton.dispatchEvent(new Event('click'));
        previousButton.dispatchEvent(new Event('click'));

        await controller.playFile({}, 'song-a.mp3');
        score = 9;
        controller.refreshCurrentScore();

        expect(audioPlayer.playCalls).toBe(2);
        expect(audioPlayer.pauseCalls).toBe(1);
        expect(transportCalls).toEqual(['next', 'previous']);
        expect(nowPlayingScoreEl.textContent).toBe('Score: 9');
    });
});
