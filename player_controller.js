/** @type {Promise<YouTubeIframeApi>|null} */
let youtubeApiPromise = null;

function loadYouTubeIframeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (youtubeApiPromise) return youtubeApiPromise;

    youtubeApiPromise = new Promise((resolve) => {
        const previousCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            previousCallback?.();
            resolve(window.YT);
        };

        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
    });

    return youtubeApiPromise;
}

/**
 * @param {{
 *   audioPlayer: HTMLAudioElement,
 *   seekBar: HTMLInputElement,
 *   playPauseButton: HTMLButtonElement,
 *   nextButton: HTMLButtonElement,
 *   previousButton: HTMLButtonElement,
 *   nowPlayingEl: HTMLElement,
 *   nowPlayingScoreEl: HTMLElement,
 *   youtubePlayerEl?: HTMLElement|null,
 *   youtubePlayerShell?: HTMLElement|null,
 *   onNext: () => void,
 *   onPrevious: () => void,
 *   onEnded: () => void,
 *   onPlaybackStateChange?: (isPlaying: boolean) => void,
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
    youtubePlayerEl = null,
    youtubePlayerShell = null,
    onNext,
    onPrevious,
    onEnded,
    onPlaybackStateChange = /** @type {(isPlaying: boolean) => void} */ (() => {}),
    getDisplayName,
    getSongScore
}) {
    /** @type {string|null} */
    let currentPath = null;
    /** @type {string|null} */
    let currentObjectUrl = null;
    /** @type {'audio'|'youtube'} */
    let activePlayer = 'audio';
    /** @type {YouTubePlayer|null} */
    let youtubePlayer = null;
    /** @type {Promise<YouTubePlayer>|null} */
    let youtubePlayerPromise = null;
    /** @type {ReturnType<typeof setInterval>|null} */
    let youtubeProgressHandle = null;

    audioPlayer.addEventListener('play', () => {
        if (activePlayer !== 'audio') return;
        playPauseButton.classList.add('is-playing');
        playPauseButton.title = 'Pause';
        onPlaybackStateChange(true);
    });

    audioPlayer.addEventListener('pause', () => {
        if (activePlayer !== 'audio') return;
        playPauseButton.classList.remove('is-playing');
        playPauseButton.title = 'Play';
        onPlaybackStateChange(false);
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (activePlayer !== 'audio' || !audioPlayer.duration) return;

        updateSeekBar(audioPlayer.currentTime, audioPlayer.duration);
    });

    seekBar.addEventListener('input', () => {
        if (activePlayer === 'youtube') {
            if (!youtubePlayer?.getDuration) return;
            const duration = youtubePlayer.getDuration();
            youtubePlayer.seekTo((Number(seekBar.value) / 1000) * duration, true);
            return;
        }

        if (!audioPlayer.duration) return;
        audioPlayer.currentTime = (Number(seekBar.value) / 1000) * audioPlayer.duration;
    });

    playPauseButton.addEventListener('click', () => {
        togglePlayback();
    });

    nextButton.addEventListener('click', onNext);
    previousButton.addEventListener('click', onPrevious);
    audioPlayer.addEventListener('ended', () => {
        if (activePlayer !== 'audio') return;
        onPlaybackStateChange(false);
        onEnded();
    });

    if (navigator.mediaSession) {
        navigator.mediaSession.setActionHandler('nexttrack', onNext);
        navigator.mediaSession.setActionHandler('previoustrack', onPrevious);
        navigator.mediaSession.setActionHandler('seekforward', () => seekBy(5));
        navigator.mediaSession.setActionHandler('seekbackward', () => seekBy(-5));
    }

    function togglePlayback() {
        if (activePlayer === 'youtube') {
            const state = youtubePlayer?.getPlayerState?.();
            if (state === window.YT?.PlayerState?.PLAYING) {
                youtubePlayer.pauseVideo();
                return;
            }

            youtubePlayer?.playVideo();
            return;
        }

        if (audioPlayer.paused) {
            void audioPlayer.play();
            return;
        }

        audioPlayer.pause();
    }

    function resetSeekBar() {
        seekBar.value = '0';
        seekBar.style.background = 'linear-gradient(to right, var(--accent) 0%, var(--border) 0%)';
    }

    /**
     * @param {number} currentTime
     * @param {number} duration
     */
    function updateSeekBar(currentTime, duration) {
        if (!duration) return;

        const percent = (currentTime / duration) * 1000;
        seekBar.value = String(percent);
        const pct = (percent / 10).toFixed(1);
        seekBar.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
    }

    /** @param {number} seconds */
    function seekBy(seconds) {
        if (activePlayer === 'youtube') {
            if (!youtubePlayer?.getDuration) return;

            const duration = youtubePlayer.getDuration();
            if (!duration) return;

            const nextTime = Math.max(0, Math.min(duration, youtubePlayer.getCurrentTime() + seconds));
            youtubePlayer.seekTo(nextTime, true);
            updateSeekBar(nextTime, duration);
            return;
        }

        if (!audioPlayer.duration) return;
        audioPlayer.currentTime = Math.max(0, Math.min(audioPlayer.duration, audioPlayer.currentTime + seconds));
        updateSeekBar(audioPlayer.currentTime, audioPlayer.duration);
    }

    function updateMediaSessionMetadata(title) {
        if (!navigator.mediaSession || typeof MediaMetadata === 'undefined') return;
        navigator.mediaSession.metadata = new MediaMetadata({ title });
    }

    function refreshCurrentScore() {
        const score = getSongScore(currentPath);
        nowPlayingScoreEl.textContent = score === null ? '' : `Score: ${score}`;
    }

    function setPlaybackUi(isPlaying) {
        playPauseButton.classList.toggle('is-playing', isPlaying);
        playPauseButton.title = isPlaying ? 'Pause' : 'Play';
        onPlaybackStateChange(isPlaying);
    }

    function updateNowPlaying(path) {
        currentPath = path;
        nowPlayingEl.textContent = getDisplayName(path);
        nowPlayingEl.title = path;
        refreshCurrentScore();
        updateMediaSessionMetadata(getDisplayName(path));
    }

    function clearObjectUrl() {
        if (!currentObjectUrl) return;

        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }

    function stopYouTubeProgressSync() {
        if (!youtubeProgressHandle) return;

        clearInterval(youtubeProgressHandle);
        youtubeProgressHandle = null;
    }

    function startYouTubeProgressSync() {
        stopYouTubeProgressSync();
        youtubeProgressHandle = setInterval(() => {
            if (activePlayer !== 'youtube' || !youtubePlayer?.getDuration) return;

            const duration = youtubePlayer.getDuration();
            if (!duration) return;

            updateSeekBar(youtubePlayer.getCurrentTime(), duration);
        }, 500);
    }

    function showYouTubePlayer() {
        if (!youtubePlayerShell) return;
        youtubePlayerShell.hidden = false;
    }

    function hideYouTubePlayer() {
        if (!youtubePlayerShell) return;
        youtubePlayerShell.hidden = true;
    }

    async function getYouTubePlayer() {
        if (youtubePlayer) return youtubePlayer;
        if (youtubePlayerPromise) return youtubePlayerPromise;
        if (!youtubePlayerEl) throw new Error('YouTube player element not configured');

        youtubePlayerPromise = loadYouTubeIframeApi().then(YT => new Promise((resolve) => {
            youtubePlayer = new YT.Player(youtubePlayerEl, {
                width: '100%',
                height: '100%',
                playerVars: {
                    controls: 0,
                    disablekb: 1,
                    playsinline: 1,
                    rel: 0
                },
                events: {
                    onReady() {
                        resolve(/** @type {YouTubePlayer} */ (youtubePlayer));
                    },
                    onStateChange(event) {
                        if (activePlayer !== 'youtube') return;

                        if (event.data === YT.PlayerState.PLAYING) {
                            setPlaybackUi(true);
                        } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                            setPlaybackUi(false);
                        }

                        if (event.data === YT.PlayerState.ENDED) {
                            onEnded();
                        }
                    }
                }
            });
        }));

        return youtubePlayerPromise;
    }

    return {
        /**
         * @param {Blob} file
         * @param {string} path
         * @returns {Promise<void>}
         */
        async playFile(file, path) {
            activePlayer = 'audio';
            stopYouTubeProgressSync();
            youtubePlayer?.pauseVideo?.();
            hideYouTubePlayer();
            clearObjectUrl();

            currentObjectUrl = URL.createObjectURL(file);
            audioPlayer.src = currentObjectUrl;
            resetSeekBar();

            try {
                await audioPlayer.play();
            } catch (error) {
                if (error.name !== 'NotAllowedError') throw error;
            }

            updateNowPlaying(path);
        },

        /**
         * @param {string} videoId
         * @param {string} path
         * @returns {Promise<void>}
         */
        async playYouTubeVideo(videoId, path) {
            activePlayer = 'youtube';
            audioPlayer.pause();
            audioPlayer.removeAttribute('src');
            clearObjectUrl();
            showYouTubePlayer();
            resetSeekBar();
            updateNowPlaying(path);

            const player = await getYouTubePlayer();
            player.loadVideoById(videoId);
            startYouTubeProgressSync();
        },

        refreshCurrentScore,

        togglePlayback,

        seekBy,

        /** @returns {string|null} */
        getCurrentPath() {
            return currentPath;
        }
    };
}
