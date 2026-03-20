import { createSongRepository } from './db.js';
import { createSongCatalogServices } from './song_catalog.js';
import { createQueueModel } from './queue_model.js';
import { createPlayerController } from './player_controller.js';
import { rememberSelectedFolder, recallSelectedFolder } from './file_handle_store.js';
import { scanAudioFiles, openSongFile } from './music_folder.js';
import './components/Library.js';
import './components/Playlist.js';

(async () => {
    /** @type {HTMLAudioElement} */
    const audioPlayer = document.getElementById('audioPlayer');
    const seekBar = document.getElementById('seekBar');
    const playPauseBtn = document.getElementById('playPause');
    const nextBtn = document.getElementById('next');
    const previousBtn = document.getElementById('previous');
    const nowPlayingEl = document.getElementById('nowPlaying');
    const nowPlayingScoreEl = document.getElementById('nowPlayingScore');
    const upvoteBtn = document.getElementById('upvote');
    const downvoteBtn = document.getElementById('downvote');

    /** @type {FileSystemDirectoryHandle|null} */
    let musicFolderHandle = null;
    let songCatalog = null;
    let songScores = null;
    let unsubscribeFromScoreChanges = null;

    /** @type {import('./components/Library.js').Library} */
    const libraryComponent = document.querySelector('music-library');
    /** @type {import('./components/Playlist.js').Playlist} */
    const playlistComponent = document.querySelector('music-playlist');

    const playerController = createPlayerController({
        audioPlayer,
        seekBar,
        playPauseButton: playPauseBtn,
        nextButton: nextBtn,
        previousButton: previousBtn,
        nowPlayingEl,
        nowPlayingScoreEl,
        onNext: () => playlistComponent.playNext(),
        onPrevious: () => playlistComponent.playPrevious(),
        onEnded: () => {
            playlistComponent.handleSongEnd();
            void updateLibrary();
            playerController.refreshCurrentScore();
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

    document.getElementById('selectFolder').addEventListener('click', async () => {
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

    libraryComponent.addEventListener('play-song', (event) => void playSong(event.detail.song));
    playlistComponent.addEventListener('play-song', (event) => void playSong(event.detail.song));

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

        const selectButton = document.getElementById('select-folder-btn');
        selectButton.addEventListener('click', async () => {
            try {
                const folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                await loadMusicFolder(folderHandle);
                popover.hidePopover();
            } catch (error) {
                console.error('Error selecting folder:', error);
                popover.querySelector('p').textContent = 'Failed to select folder. Try again.';
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

    /** @param {string} path */
    function getDisplayName(path) {
        return path.split('/').pop().replace(/\.[^.]+$/, '');
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
    }

    async function updateLibrary() {
        if (!songCatalog) return;
        libraryComponent.updateLibrary(songCatalog.listRanked());
    }

    /**
     * @param {string} path
     */
    async function playSong(path) {
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
