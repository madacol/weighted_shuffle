import { MAX_PLAYLIST_SIZE } from './config.js';

export const REPEAT_MODES = Object.freeze({
    OFF: 'off',
    ALL: 'all',
    ONE: 'one'
});

const REPEAT_MODE_ORDER = [
    REPEAT_MODES.OFF,
    REPEAT_MODES.ALL,
    REPEAT_MODES.ONE
];

/**
 * @typedef {'off'|'all'|'one'} RepeatMode
 */

/**
 * @typedef {{
 *   playlist: string[],
 *   currentIndex: number,
 *   repeatMode: RepeatMode
 * }} QueueState
 */

/**
 * @param {{
 *   queueSource: { pickWeighted(): string|null },
 *   songScores: { change(path: string, delta: number): Promise<number> },
 *   maxSize?: number,
 *   minSkipPenaltyMs?: number,
 *   initialRepeatMode?: RepeatMode,
 *   now?: () => number
 * }} options
 */
export function createQueueModel({
    queueSource,
    songScores,
    maxSize = MAX_PLAYLIST_SIZE,
    minSkipPenaltyMs = 5000,
    initialRepeatMode = REPEAT_MODES.OFF,
    now = () => Date.now()
}) {
    /** @type {string[]} */
    let playlist = [];
    let currentIndex = 0;
    let repeatMode = normalizeRepeatMode(initialRepeatMode);
    let playStartTime = null;
    let lastEndedSong = null;
    const listeners = new Set();

    /** @returns {QueueState} */
    function getState() {
        return {
            playlist: [...playlist],
            currentIndex,
            repeatMode
        };
    }

    function notify() {
        const state = getState();
        listeners.forEach(listener => listener(state));
    }

    /**
     * @param {(state: QueueState) => void} listener
     * @returns {() => void}
     */
    function subscribe(listener) {
        listeners.add(listener);
        listener(getState());
        return () => listeners.delete(listener);
    }

    /** @returns {string|null} */
    function playCurrent() {
        if (playlist.length === 0) return null;
        playStartTime = now();
        notify();
        return playlist[currentIndex];
    }

    /**
     * @param {number} index
     * @returns {string|null}
     */
    function select(index) {
        if (index < 0 || index >= playlist.length) return null;
        currentIndex = index;
        return playCurrent();
    }

    /**
     * @param {number} sourceIndex
     * @param {number} targetIndex
     */
    function reorder(sourceIndex, targetIndex) {
        const [movedSong] = playlist.splice(sourceIndex, 1);
        playlist.splice(targetIndex, 0, movedSong);

        if (currentIndex === sourceIndex) {
            currentIndex = targetIndex;
        } else if (currentIndex > sourceIndex && currentIndex <= targetIndex) {
            currentIndex--;
        } else if (currentIndex < sourceIndex && currentIndex >= targetIndex) {
            currentIndex++;
        }

        notify();
    }

    /**
     * @param {string} songPath
     * @param {number|undefined} targetIndex
     */
    function add(songPath, targetIndex) {
        if (!songPath) return;

        if (targetIndex !== undefined) {
            playlist.splice(targetIndex, 0, songPath);
            if (currentIndex >= targetIndex) {
                currentIndex++;
            }
        } else {
            playlist.push(songPath);
        }

        notify();
    }

    /**
     * @param {string} mode
     * @returns {RepeatMode}
     */
    function normalizeRepeatMode(mode) {
        if (REPEAT_MODE_ORDER.includes(/** @type {RepeatMode} */ (mode))) {
            return /** @type {RepeatMode} */ (mode);
        }

        return REPEAT_MODES.OFF;
    }

    /**
     * @param {RepeatMode} mode
     * @returns {RepeatMode}
     */
    function setRepeatMode(mode) {
        const nextMode = normalizeRepeatMode(mode);
        if (repeatMode === nextMode) return repeatMode;

        repeatMode = nextMode;
        notify();
        return repeatMode;
    }

    /** @returns {RepeatMode} */
    function cycleRepeatMode() {
        const currentModeIndex = REPEAT_MODE_ORDER.indexOf(repeatMode);
        const nextMode = REPEAT_MODE_ORDER[(currentModeIndex + 1) % REPEAT_MODE_ORDER.length];
        return setRepeatMode(nextMode);
    }

    /** @param {number} index */
    function remove(index) {
        playlist.splice(index, 1);
        if (currentIndex >= index && currentIndex > 0) {
            currentIndex--;
        }
        notify();
    }

    function fill() {
        if (repeatMode !== REPEAT_MODES.OFF) return;

        let maxTries = 10;
        let changed = false;

        while (playlist.length - currentIndex < maxSize) {
            const newSong = queueSource.pickWeighted();
            if (!newSong) break;

            if (!playlist.slice(-maxSize).includes(newSong) || maxTries-- <= 0) {
                playlist.push(newSong);
                changed = true;
            }
        }

        if (changed) notify();
    }

    /** @returns {string|null} */
    function playNext() {
        if (playlist.length === 0) return null;

        if (playStartTime && now() - playStartTime < minSkipPenaltyMs) {
            void updateCurrentSongScore(-1);
        }

        currentIndex = (currentIndex + 1) % playlist.length;
        return playCurrent();
    }

    /** @returns {string|null} */
    function playPrevious() {
        if (playlist.length === 0) return null;
        currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        return playCurrent();
    }

    /**
     * @param {number} increment
     * @returns {Promise<number|null>}
     */
    async function updateCurrentSongScore(increment) {
        const path = playlist[currentIndex];
        if (!path) return null;

        const newScore = await songScores.change(path, increment);
        notify();
        return newScore;
    }

    /** @returns {string|null} */
    function handleSongEnd() {
        const currentSong = playlist[currentIndex];
        if (!currentSong) return null;

        if (currentSong === lastEndedSong) {
            void updateCurrentSongScore(1);
        }
        lastEndedSong = currentSong;

        if (repeatMode === REPEAT_MODES.ONE) {
            return playCurrent();
        }

        return playNext();
    }

    return {
        subscribe,
        getState,
        select,
        reorder,
        add,
        remove,
        setRepeatMode,
        cycleRepeatMode,
        fill,
        playNext,
        playPrevious,
        updateCurrentSongScore,
        handleSongEnd
    };
}
