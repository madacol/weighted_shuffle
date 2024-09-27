import { initDatabase, sql, addNewSongsToDatabase } from './db.js';
import { saveDirHandle, getLastFolderHandle } from './file_handle_store.js';
import './components/Library.js';
import './components/Playlist.js';

(async () => {
    /** @type {HTMLAudioElement} The audio player element */
    const audioPlayer = document.getElementsByTagName('audio')[0];

    /** @type {FileSystemDirectoryHandle|null} The handle for the selected music folder */
    let musicFolderHandle = null;

    /** @type {import('./components/Library.js').Library} */
    const libraryComponent = document.querySelector('music-library');
    /** @type {import('./components/Playlist.js').Playlist} */
    const playlistComponent = document.querySelector('music-playlist');

    // Initializes the application
    try {
        const lastFolderHandle = await getLastFolderHandle();
        if (lastFolderHandle) {
            await loadMusicFolder(lastFolderHandle);
        } else {
            // show popover to select a folder
            console.log('No previous folder selected. Showing popover to select a folder.');
            const popover = document.createElement('div');
            popover.setAttribute('popover', '');
            popover.id = 'folder-select-popover';
            popover.innerHTML = /*html*/`
                <p>Please select a music folder</p>
                <button id="select-folder-btn">Select Folder</button>
            `;
            document.body.appendChild(popover);

            const selectButton = document.getElementById('select-folder-btn');
            selectButton.addEventListener('click', async () => {
                try {
                    const folderHandle = await window.showDirectoryPicker({mode: 'readwrite'});
                    await loadMusicFolder(folderHandle);
                    popover.hidePopover();
                } catch (error) {
                    console.error('Error selecting folder:', error);
                    popover.querySelector('p').textContent = 'Failed to select folder.';
                }
            });

            popover.showPopover();
        }
    } catch (err) {
        console.error("Error initializing app:", err);
    }

    // Sets up the Media Session API handlers
    navigator.mediaSession.setActionHandler('nexttrack', () => playlistComponent.playNext());
    navigator.mediaSession.setActionHandler('previoustrack', () => playlistComponent.playPrevious());
    navigator.mediaSession.setActionHandler('seekforward', () => audioPlayer.currentTime += 5);
    navigator.mediaSession.setActionHandler('seekbackward', () => audioPlayer.currentTime -= 5);

    // Event Listeners
    document.getElementById('selectFolder').addEventListener('click', async () => loadMusicFolder(await window.showDirectoryPicker({mode: 'readwrite'})));
    document.getElementById('playPause').addEventListener('click', () => audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause());
    document.getElementById('next').addEventListener('click', () => playlistComponent.playNext());
    document.getElementById('previous').addEventListener('click', () => playlistComponent.playPrevious());
    document.getElementById('upvote').addEventListener('click', () => playlistComponent.updateCurrentSongScore(1));
    document.getElementById('downvote').addEventListener('click', () => playlistComponent.updateCurrentSongScore(-1));
    audioPlayer.addEventListener('ended', () => playlistComponent.handleSongEnd());

    libraryComponent.addEventListener('play-song', (event) => playSong(event.detail.song));
    playlistComponent.addEventListener('play-song', (event) => playSong(event.detail.song));
    /**
     * Recursively gets all audio files in a directory
     * @param {FileSystemDirectoryHandle} dirHandle - The directory handle to search
     * @param {string} path - The current path
     * @returns {Promise<string[]>} An array of file paths
     */
    async function getFiles(dirHandle, path = "") {
        const files = [];
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.wma', '.ape', '.alac', '.aiff', '.mid', '.midi'];

        for await (const entry of dirHandle.values()) {
            if (entry.kind === "file") {
                const fileHandle = /** @type {FileSystemFileHandle} */ (entry);
                const fileName = fileHandle.name.toLowerCase();
                const fileExtension = '.' + fileName.split('.').pop();

                if (audioExtensions.includes(fileExtension)) {
                    files.push(`${path}${fileHandle.name}`);
                } else {
                    // check if it's an audio file using the mime type
                    try {
                        const file = await fileHandle.getFile();
                        if (file.type.startsWith('audio/')) {
                            files.push(`${path}${fileHandle.name}`);
                        }
                    } catch (error) {
                        console.warn(`Error checking file type for ${fileHandle.name}:`, error);
                    }
                }
            } else if (entry.kind === "directory") {
                files.push(...await getFiles(/** @type {FileSystemDirectoryHandle} */ (entry), `${path}${entry.name}/`));
            }
        }
        return files;
    }

    /**
     * Loads the music folder and sets up the database
     * @param {FileSystemDirectoryHandle} folderHandle - The handle for the music folder
     */
    async function loadMusicFolder(folderHandle) {
        musicFolderHandle = folderHandle;
        try {
            await initDatabase(folderHandle);
            const musicFiles = await getFiles(folderHandle);
            await addNewSongsToDatabase(musicFiles);
            await saveDirHandle(folderHandle);
            playlistComponent.fillPlaylist();
            if (!audioPlayer.src && playlistComponent.playlist.length > 0) {
                playSong(playlistComponent.playlist[0]);
            }
        } catch (err) {
            console.error("Error loading music folder:", err);
        }
        updateLibrary();
    }

    async function updateLibrary() {
        const songs = sql(/*sql*/`SELECT path, score FROM song_scores ORDER BY score DESC`);
        libraryComponent.updateLibrary(songs[0].values);
    }

    /**
     * Plays a song
     * @param {string} path - The file path of the song to play
     */
    async function playSong(path) {
        const pathParts = path.split('/');
        let folderHandle = musicFolderHandle;
        /** @type {FileSystemFileHandle} */
        let fileHandle;
        for (const part of pathParts) {
            if (part) {
                if (part === pathParts.at(-1)) {
                    fileHandle = await folderHandle.getFileHandle(part);
                } else {
                    folderHandle = await folderHandle.getDirectoryHandle(part);
                }
            }
        }
        const file = await fileHandle.getFile();
        audioPlayer.src = URL.createObjectURL(file);
        try {
            await audioPlayer.play();
        } catch (error) {
            console.error(`Failed to play: "${path}"`, error);
            if (error.name !== 'NotAllowedError')
                return playlistComponent.playNext();
        }
        const nowPlaying = document.getElementById('nowPlaying');
        nowPlaying.textContent = path;
        nowPlaying.title = path;
        playlistComponent.fillPlaylist();
        updateMediaSessionMetadata(path);
    }

    /**
     * Updates the media session metadata
     * @param {string} title - The title of the current song
     */
    function updateMediaSessionMetadata(title) {
        navigator.mediaSession.metadata = new MediaMetadata({ title });
    }
})();
