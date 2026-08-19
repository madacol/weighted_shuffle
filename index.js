import { createSongRepository } from './db.js';
import { createSongCatalogServices } from './song_catalog.js';
import { REPEAT_MODES, createQueueModel } from './queue_model.js';
import { createPlayerController } from './player_controller.js';
import { rememberSelectedFolder, recallSelectedFolder } from './file_handle_store.js';
import { scanAudioFiles, openSongFile } from './music_folder.js';
import { getSongDisplayName, getYouTubeVideoId, isYouTubeMusicLink, normalizeYouTubeMusicLink } from './media_source.js';
import './components/Library.js';
import './components/Playlist.js';

/**
 * @template {Element} T
 * @param {string} selector
 * @returns {T}
 */
function getRequiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing required element: ${selector}`);
    return /** @type {T} */ (element);
}

(async () => {
    const audioPlayer = /** @type {HTMLAudioElement} */ (getRequiredElement('#audioPlayer'));
    const seekBar = /** @type {HTMLInputElement} */ (getRequiredElement('#seekBar'));
    const playPauseBtn = /** @type {HTMLButtonElement} */ (getRequiredElement('#playPause'));
    const nextBtn = /** @type {HTMLButtonElement} */ (getRequiredElement('#next'));
    const previousBtn = /** @type {HTMLButtonElement} */ (getRequiredElement('#previous'));
    const repeatBtn = /** @type {HTMLButtonElement} */ (getRequiredElement('#repeat'));
    const nowPlayingEl = /** @type {HTMLElement} */ (getRequiredElement('#nowPlaying'));
    const nowPlayingScoreEl = /** @type {HTMLElement} */ (getRequiredElement('#nowPlayingScore'));
    const upvoteBtn = /** @type {HTMLButtonElement} */ (getRequiredElement('#upvote'));
    const downvoteBtn = /** @type {HTMLButtonElement} */ (getRequiredElement('#downvote'));
    const youtubePlayerEl = /** @type {HTMLElement} */ (getRequiredElement('#youtubePlayer'));
    const youtubePlayerShell = /** @type {HTMLElement} */ (getRequiredElement('#youtube-player-shell'));
    const keyboardHelpBtn = /** @type {HTMLButtonElement} */ (getRequiredElement('#keyboardHelp'));
    const keyboardShortcutsDialog = /** @type {HTMLDialogElement} */ (getRequiredElement('#keyboardShortcutsDialog'));
    const closeKeyboardShortcutsBtn = /** @type {HTMLButtonElement} */ (getRequiredElement('#closeKeyboardShortcuts'));
    const selectFolderBtn = /** @type {HTMLButtonElement} */ (getRequiredElement('#selectFolder'));

    const repeatModeLabels = {
        [REPEAT_MODES.OFF]: 'Repeat off',
        [REPEAT_MODES.ALL]: 'Repeat all',
        [REPEAT_MODES.ONE]: 'Repeat one'
    };

    /** @type {FileSystemDirectoryHandle|null} */
    let musicFolderHandle = null;
    /** @type {string|null} */
    let pendingYouTubeLink = null;
    /** @type {ReturnType<typeof createSongCatalogServices>['songCatalog']|null} */
    let songCatalog = null;
    /** @type {ReturnType<typeof createSongCatalogServices>['songScores']|null} */
    let songScores = null;
    /** @type {(() => void)|null} */
    let unsubscribeFromScoreChanges = null;

    const libraryComponent = /** @type {import('./components/Library.js').Library} */ (getRequiredElement('music-library'));
    const playlistComponent = /** @type {import('./components/Playlist.js').Playlist} */ (getRequiredElement('music-playlist'));

    const playerController = createPlayerController({
        audioPlayer,
        seekBar,
        playPauseButton: playPauseBtn,
        nextButton: nextBtn,
        previousButton: previousBtn,
        nowPlayingEl,
        nowPlayingScoreEl,
        youtubePlayerEl,
        youtubePlayerShell,
        onNext: () => playlistComponent.playNext(),
        onPrevious: () => playlistComponent.playPrevious(),
        onEnded: () => {
            playlistComponent.handleSongEnd();
            void updateLibrary();
            playerController.refreshCurrentScore();
        },
        onPlaybackStateChange: (isPlaying) => {
            playlistComponent.isPlaying = isPlaying;
        },
        getDisplayName,
        getSongScore: (path) => path && songScores ? songScores.get(path) : null
    });

    try {
        const lastFolderHandle = await recallSelectedFolder();
        if (lastFolderHandle) {
            await loadMusicFolder(lastFolderHandle);
        } else {
            showFolderSelectionPopover();
        }
    } catch (err) {
        console.error('Error initializing app:', err);
    }

    selectFolderBtn.addEventListener('click', async () => {
        await loadMusicFolder(await window.showDirectoryPicker({ mode: 'readwrite' }));
    });

    upvoteBtn.addEventListener('click', () => {
        void playlistComponent.updateCurrentSongScore(1);
        animateBtn(upvoteBtn);
    });

    downvoteBtn.addEventListener('click', () => {
        void playlistComponent.updateCurrentSongScore(-1);
        animateBtn(downvoteBtn);
    });

    repeatBtn.addEventListener('click', cycleRepeatMode);
    keyboardHelpBtn.addEventListener('click', showKeyboardShortcuts);
    closeKeyboardShortcutsBtn.addEventListener('click', () => keyboardShortcutsDialog.close());
    keyboardShortcutsDialog.addEventListener('click', (event) => {
        if (event.target === keyboardShortcutsDialog) {
            keyboardShortcutsDialog.close();
        }
    });
    document.addEventListener('keydown', handleGlobalKeyDown);

    libraryComponent.addEventListener('add-song-to-queue', (event) => {
        const { song } = /** @type {CustomEvent<{ song: string }>} */ (event).detail;
        addSongToQueue(song);
    });
    libraryComponent.addEventListener('add-youtube-link', (event) => {
        const { link } = /** @type {CustomEvent<{ link: string }>} */ (event).detail;
        void addYouTubeMusicLink(link);
    });
    playlistComponent.addEventListener('play-song', (event) => {
        const { song } = /** @type {CustomEvent<{ song: string }>} */ (event).detail;
        void playSong(song);
    });

    updateRepeatButton(REPEAT_MODES.OFF);

    function showFolderSelectionPopover() {
        console.log('No previous folder selected. Showing popover to select a folder.');
        const popover = document.createElement('div');
        popover.setAttribute('popover', '');
        popover.id = 'folder-select-popover';
        popover.innerHTML = /*html*/`
            <p>Select your music folder to get started</p>
            <button id="select-folder-btn">📂 Browse</button>
        `;
        document.body.appendChild(popover);

        const selectButton = /** @type {HTMLButtonElement} */ (getRequiredElement('#select-folder-btn'));
        selectButton.addEventListener('click', async () => {
            try {
                const folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                await loadMusicFolder(folderHandle);
                popover.hidePopover();
            } catch (error) {
                console.error('Error selecting folder:', error);
                /** @type {HTMLParagraphElement} */ (popover.querySelector('p')).textContent = 'Failed to select folder. Try again.';
            }
        });

        popover.showPopover();
    }

    /** @param {HTMLElement} btn */
    function animateBtn(btn) {
        btn.classList.remove('vote-pulse');
        void btn.offsetWidth;
        btn.classList.add('vote-pulse');
        btn.addEventListener('animationend', () => btn.classList.remove('vote-pulse'), { once: true });
    }

    /** @param {string} source */
    function getDisplayName(source) {
        return getSongDisplayName(source);
    }

    /**
     * @param {FileSystemDirectoryHandle} folderHandle
     */
    async function loadMusicFolder(folderHandle) {
        musicFolderHandle = folderHandle;

        try {
            const songRepository = await createSongRepository(folderHandle);
            const services = createSongCatalogServices(songRepository);
            songCatalog = services.songCatalog;
            songScores = services.songScores;
            unsubscribeFromScoreChanges?.();
            unsubscribeFromScoreChanges = songScores.subscribe(() => {
                playerController.refreshCurrentScore();
                void updateLibrary();
            });
            libraryComponent.scoreService = songScores;
            playlistComponent.scoreService = songScores;
            playlistComponent.model = createQueueModel({
                queueSource: services.queueSource,
                songScores
            });
            updateRepeatButton(playlistComponent.repeatMode);

            const musicFiles = await scanAudioFiles(folderHandle);
            await songCatalog.addMissing(musicFiles);
            await rememberSelectedFolder(folderHandle);
            playlistComponent.fillPlaylist();

            if (!audioPlayer.src && playlistComponent.playlist.length > 0) {
                await playSong(playlistComponent.playlist[0]);
            }
        } catch (err) {
            console.error('Error loading music folder:', err);
        }

        await updateLibrary();
        playerController.refreshCurrentScore();

        if (songCatalog && pendingYouTubeLink) {
            const linkToAdd = pendingYouTubeLink;
            pendingYouTubeLink = null;
            await addYouTubeMusicLink(linkToAdd);
        }
    }

    async function updateLibrary() {
        if (!songCatalog) return;
        libraryComponent.updateLibrary(songCatalog.listRanked());
    }

    /**
     * @param {string} song
     */
    function addSongToQueue(song) {
        if (!song) return;

        try {
            playlistComponent.addSongToPlaylist(song);
        } catch (error) {
            console.error('Failed to add song to queue:', error);
        }
    }

    /**
     * @param {string} rawLink
     */
    async function addYouTubeMusicLink(rawLink) {
        if (!songCatalog) {
            pendingYouTubeLink = rawLink;
            libraryComponent.setYouTubeLinkStatus('Select a music folder to finish adding this YouTube link.', 'pending');
            showFolderSelectionPopover();
            return;
        }

        try {
            libraryComponent.setYouTubeLinkStatus('Adding YouTube link…', 'pending');
            const link = normalizeYouTubeMusicLink(rawLink);
            await songCatalog.addMissing([link]);
            addSongToQueue(link);
            await updateLibrary();
            libraryComponent.clearYouTubeLinkInput();
            libraryComponent.setYouTubeLinkStatus('Added to the library and queued.', 'success');
        } catch (error) {
            console.error('Failed to add YouTube Music link:', error);
            const message = error instanceof Error ? error.message : 'Failed to add YouTube link.';
            libraryComponent.setYouTubeLinkStatus(message, 'error');
        }
    }

    function cycleRepeatMode() {
        const repeatMode = playlistComponent.cycleRepeatMode();
        updateRepeatButton(repeatMode);
    }

    /** @param {'off'|'all'|'one'} repeatMode */
    function updateRepeatButton(repeatMode) {
        const label = repeatModeLabels[repeatMode] ?? repeatModeLabels[REPEAT_MODES.OFF];
        repeatBtn.dataset.repeatMode = repeatMode;
        repeatBtn.classList.toggle('is-active', repeatMode !== REPEAT_MODES.OFF);
        repeatBtn.title = label;
        repeatBtn.setAttribute('aria-label', label);
        repeatBtn.setAttribute('aria-pressed', repeatMode === REPEAT_MODES.OFF ? 'false' : repeatMode === REPEAT_MODES.ALL ? 'true' : 'mixed');
    }

    function showKeyboardShortcuts() {
        if (keyboardShortcutsDialog.open) return;

        if (typeof keyboardShortcutsDialog.showModal === 'function') {
            keyboardShortcutsDialog.showModal();
            return;
        }

        keyboardShortcutsDialog.setAttribute('open', '');
    }

    function toggleKeyboardShortcuts() {
        if (keyboardShortcutsDialog.open) {
            keyboardShortcutsDialog.close();
            return;
        }

        showKeyboardShortcuts();
    }

    /** @param {KeyboardEvent} event */
    function handleGlobalKeyDown(event) {
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
        if (isEditableShortcutTarget(event)) return;

        if (event.key === '?') {
            event.preventDefault();
            toggleKeyboardShortcuts();
            return;
        }

        if (keyboardShortcutsDialog.open) return;

        switch (event.key.toLowerCase()) {
            case ' ':
            case 'k':
                event.preventDefault();
                playerController.togglePlayback();
                break;
            case 'n':
                event.preventDefault();
                playlistComponent.playNext();
                break;
            case 'p':
                event.preventDefault();
                playlistComponent.playPrevious();
                break;
            case 'j':
            case 'arrowleft':
                event.preventDefault();
                playerController.seekBy(-10);
                break;
            case 'l':
            case 'arrowright':
                event.preventDefault();
                playerController.seekBy(10);
                break;
            case 'r':
                event.preventDefault();
                cycleRepeatMode();
                break;
            case 'f':
            case '/':
                event.preventDefault();
                libraryComponent.focusSearch();
                break;
            case 'q':
                event.preventDefault();
                playlistComponent.focusCurrentSong();
                break;
            case 'g':
                event.preventDefault();
                if (event.shiftKey) {
                    libraryComponent.focusLastSong();
                } else {
                    libraryComponent.focusFirstSong();
                }
                break;
            case 'u':
            case '=':
            case '+':
                event.preventDefault();
                void playlistComponent.updateCurrentSongScore(1);
                animateBtn(upvoteBtn);
                break;
            case 'd':
            case '-':
            case '_':
                event.preventDefault();
                void playlistComponent.updateCurrentSongScore(-1);
                animateBtn(downvoteBtn);
                break;
        }
    }

    /** @param {KeyboardEvent} event */
    function isEditableShortcutTarget(event) {
        const [origin] = event.composedPath();
        if (!(origin instanceof HTMLElement)) return false;

        return origin.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(origin.tagName);
    }

    /**
     * @param {string} path
     */
    async function playSong(path) {
        if (isYouTubeMusicLink(path)) {
            const videoId = getYouTubeVideoId(path);
            if (!videoId) throw new Error(`Invalid YouTube Music link: ${path}`);
            await playerController.playYouTubeVideo(videoId, path);
            playlistComponent.fillPlaylist();
            return;
        }

        try {
            const file = await openSongFile(musicFolderHandle, path);
            await playerController.playFile(file, path);
        } catch (error) {
            console.error(`Failed to play: "${path}"`, error);
            if (error.name !== 'NotAllowedError') {
                playlistComponent.playNext();
                return;
            }
        }

        playlistComponent.fillPlaylist();
    }
})();
