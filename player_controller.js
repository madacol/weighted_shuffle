/**
 * @param {{
 *   audioPlayer: HTMLAudioElement,
 *   seekBar: HTMLInputElement,
 *   playPauseButton: HTMLButtonElement,
 *   nextButton: HTMLButtonElement,
 *   previousButton: HTMLButtonElement,
 *   nowPlayingEl: HTMLElement,
 *   nowPlayingScoreEl: HTMLElement,
 *   onNext: () => void,
 *   onPrevious: () => void,
 *   onEnded: () => void,
 *   getDisplayName: (path: string) => string,
 *   getSongScore: (path: string|null) => number|null
 * }} options
 */
export function createPlayerController({
    audioPlayer,
    seekBar,
    playPauseButton,
    nextButton,
    previousButton,
    nowPlayingEl,
    nowPlayingScoreEl,
    onNext,
    onPrevious,
    onEnded,
    getDisplayName,
    getSongScore
}) {
    let currentPath = null;
    let currentObjectUrl = null;

    audioPlayer.addEventListener('play', () => {
        playPauseButton.classList.add('is-playing');
        playPauseButton.title = 'Pause';
    });

    audioPlayer.addEventListener('pause', () => {
        playPauseButton.classList.remove('is-playing');
        playPauseButton.title = 'Play';
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (!audioPlayer.duration) return;

        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 1000;
        seekBar.value = percent;
        const pct = (percent / 10).toFixed(1);
        seekBar.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
    });

    seekBar.addEventListener('input', () => {
        if (!audioPlayer.duration) return;
        audioPlayer.currentTime = (seekBar.value / 1000) * audioPlayer.duration;
    });

    playPauseButton.addEventListener('click', () => {
        if (audioPlayer.paused) {
            void audioPlayer.play();
            return;
        }

        audioPlayer.pause();
    });

    nextButton.addEventListener('click', onNext);
    previousButton.addEventListener('click', onPrevious);
    audioPlayer.addEventListener('ended', onEnded);

    if (navigator.mediaSession) {
        navigator.mediaSession.setActionHandler('nexttrack', onNext);
        navigator.mediaSession.setActionHandler('previoustrack', onPrevious);
        navigator.mediaSession.setActionHandler('seekforward', () => {
            audioPlayer.currentTime += 5;
        });
        navigator.mediaSession.setActionHandler('seekbackward', () => {
            audioPlayer.currentTime -= 5;
        });
    }

    function resetSeekBar() {
        seekBar.value = 0;
        seekBar.style.background = 'linear-gradient(to right, var(--accent) 0%, var(--border) 0%)';
    }

    function updateMediaSessionMetadata(title) {
        if (!navigator.mediaSession || typeof MediaMetadata === 'undefined') return;
        navigator.mediaSession.metadata = new MediaMetadata({ title });
    }

    function refreshCurrentScore() {
        const score = getSongScore(currentPath);
        nowPlayingScoreEl.textContent = score === null ? '' : `Score: ${score}`;
    }

    return {
        /**
         * @param {File} file
         * @param {string} path
         * @returns {Promise<void>}
         */
        async playFile(file, path) {
            if (currentObjectUrl) {
                URL.revokeObjectURL(currentObjectUrl);
            }

            currentObjectUrl = URL.createObjectURL(file);
            audioPlayer.src = currentObjectUrl;
            resetSeekBar();

            try {
                await audioPlayer.play();
            } catch (error) {
                if (error.name !== 'NotAllowedError') throw error;
            }

            currentPath = path;
            nowPlayingEl.textContent = getDisplayName(path);
            nowPlayingEl.title = path;
            refreshCurrentScore();
            updateMediaSessionMetadata(getDisplayName(path));
        },

        refreshCurrentScore,

        /** @returns {string|null} */
        getCurrentPath() {
            return currentPath;
        }
    };
}
