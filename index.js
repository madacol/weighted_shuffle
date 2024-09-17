import { initDatabase, sql, addNewSongsToDatabase, getSongScore, updateScore } from './db.js';
import { saveDirHandle, getLastFolderHandle } from './file_handle_store.js';
import { MIN_SCORE, MAX_SCORE, DEFAULT_SCORE, MAX_PLAYLIST_SIZE } from './config.js';
(async () => {
    /** @type {HTMLAudioElement} The audio player element */
    const audioPlayer = document.getElementsByTagName('audio')[0];

    /** @type {string[]} The playlist array containing file paths */
    const playlist = [];

    /** @type {number} The index of the currently playing song in the playlist */
    let currentIndex = 0;

    /** @type {FileSystemDirectoryHandle|null} The handle for the selected music folder */
    let musicFolderHandle = null;

    // Initializes the application
    try {
        const lastFolderHandle = await getLastFolderHandle();
        if (lastFolderHandle) {
            await loadMusicFolder(lastFolderHandle);
            updateLibrary();
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
                    const folderHandle = await showDirectoryPicker({mode: 'readwrite'});
                    await loadMusicFolder(folderHandle);
                    updateLibrary();
                    popover.hidePopover();
                } catch (error) {
                    console.error('Error selecting folder:', error);
                    popover.querySelector('p').textContent = 'Failed to select folder. Please try again.';
                }
            });

            popover.showPopover();
        }
    } catch (err) {
        console.error("Error initializing app:", err);
    }

    // Sets up the Media Session API handlers
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
    navigator.mediaSession.setActionHandler('seekforward', () => audioPlayer.currentTime += 5);
    navigator.mediaSession.setActionHandler('seekbackward', () => audioPlayer.currentTime -= 5);

    // Event Listeners
    document.getElementById('selectFolder').addEventListener('click', async () => loadMusicFolder(await window.showDirectoryPicker({mode: 'readwrite'})));
    document.getElementById('playPause').addEventListener('click', () => audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause());
    document.getElementById('next').addEventListener('click', playNext);
    document.getElementById('previous').addEventListener('click', playPrevious);
    document.getElementById('upvote').addEventListener('click', () => updateCurrentSongScore(1));
    document.getElementById('downvote').addEventListener('click', () => updateCurrentSongScore(-1));
    audioPlayer.addEventListener('ended', playNext);
    /** @type {HTMLTableSectionElement} */
    const playlistTableBody = document.querySelector('#playlistTable tbody');
    playlistTableBody.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    });
    playlistTableBody.addEventListener('drop', (event) => {
        event.preventDefault();
        const songPath = event.dataTransfer.getData('text/plain');
        addToQueue(songPath);
        updatePlaylistUI();
    });

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
            fillPlaylist();
            if (!audioPlayer.src && playlist.length > 0) playSong(playlist[0]);
        } catch (err) {
            console.error("Error loading music folder:", err);
        }
    }

    async function updateLibrary() {
        const songs = sql(/*sql*/`SELECT path, score FROM song_scores ORDER BY score DESC`);
        /** @type {HTMLTableSectionElement} */
        const tableBody = document.querySelector('#library tbody');
        tableBody.innerHTML = '';

        if (songs.length > 0 && songs[0].values.length > 0) {
            songs[0].values.forEach(([path, score]) => {
                const row = tableBody.insertRow();
                row.innerHTML = /*html*/`
                    <td><input type="number" class="edit-score" value="${score}" min="${MIN_SCORE}" max="${MAX_SCORE}"></td>
                    <td class="song-path" draggable="true">${path}</td>
                `;
                row.querySelector('td.song-path').addEventListener('dragstart', /** @param {DragEvent} event */ (event) => {
                    event.dataTransfer.setData('text/plain', path);
                });
                row.querySelector('.song-path').addEventListener('click', () => playSong(path));
            });
        }

        // add event listeners
        document.querySelectorAll('.edit-score').forEach(/** @param {HTMLInputElement} input */ input => {
            input.addEventListener('change', async () => {
                const row = input.closest('tr');
                const path = row.cells[0].textContent;
                const newScore = parseInt(input.value);
                await updateScore(path, newScore - getSongScore(path));
                await updateLibrary();
            });
        });
    }

    function addToQueue(path) {
        playlist.push(path);
        updatePlaylistUI();
    }

    /**
     * Gets a weighted shuffled song from the database
     * @returns {string|null} The path of the selected song, or null if no songs are available
     */
    function getWeightedShuffledSong() {
        const songs = sql(/*sql*/`SELECT path, score FROM song_scores ORDER BY score DESC`);
        if (songs.length === 0 || songs[0].values.length === 0) return null;

        const totalComputedScore = songs[0].values.reduce((sum, song) => sum + Math.pow(2, song[1]), 0);
        let r = Math.random() * totalComputedScore;
        for (let song of songs[0].values) {
            r -= 2 ** song[1];
            if (r <= 0) return song[0];
        }
        return songs[0].values[Math.floor(Math.random() * songs[0].values.length)][0];
    }

    /**
     * Fills the playlist with new songs
     */
    function fillPlaylist() {
        let maxTries = 10;
        while (playlist.length - currentIndex < MAX_PLAYLIST_SIZE) {
            let newSong = getWeightedShuffledSong();
            if (!newSong) return console.log("No songs in library");

            if (!playlist.slice(-MAX_PLAYLIST_SIZE).includes(newSong) || maxTries-- <= 0) {
                playlist.push(newSong);
            }
        }
        updatePlaylistUI();
    }

    function updatePlaylistUI() {
        /** @type {HTMLTableSectionElement} */
        const playlistTableBody = document.querySelector('#playlistTable tbody');
        playlistTableBody.innerHTML = '';

        playlist.forEach((song, index) => {
            const row = playlistTableBody.insertRow();
            row.innerHTML = /*html*/`
                <td><input type="number" class="edit-score" value="${getSongScore(song)}" min="${MIN_SCORE}" max="${MAX_SCORE}"></td>
                <td class="song-path">${song}</td>
                <td><button class="delete-from-playlist">Delete</button></td>
            `;
            const song_path = row.querySelector('.song-path');
            song_path.addEventListener('click', () => { currentIndex = index; playSong(song) });
            if (index === currentIndex) {
                song_path.classList.add('playing');
            }
        });

        // add event listeners
        document.querySelectorAll('.delete-from-playlist').forEach(/** @param {HTMLButtonElement} button */ button => {
            button.addEventListener('click', async () => {
                const row = button.closest('tr');
                const path = row.cells[0].textContent;
                playlist.splice(playlist.indexOf(path), 1);
                row.remove();
            });
        });
        document.querySelectorAll('.edit-score').forEach(/** @param {HTMLInputElement} input */ input => {
            input.addEventListener('change', async () => {
                const row = input.closest('tr');
                const path = row.cells[0].textContent;
                const newScore = parseInt(input.value);
                await updateScore(path, newScore - getSongScore(path));
                await updateLibrary();
            });
        });
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
        audioPlayer.play();
        const nowPlaying = document.getElementById('nowPlaying');
        nowPlaying.textContent = path;
        nowPlaying.title = path;
        fillPlaylist();
        updateMediaSessionMetadata(path);
    }

    function playNext() {
        currentIndex = (currentIndex + 1) % playlist.length;
        playSong(playlist[currentIndex]);
        const song_path = document.querySelector(`#playlistTable tbody tr:nth-child(${currentIndex + 1}) .song-path`);
        song_path.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function playPrevious() {
        currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        playSong(playlist[currentIndex]);
        const song_path = document.querySelector(`#playlistTable tbody tr:nth-child(${currentIndex + 1}) .song-path`);
        song_path.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Updates the media session metadata
     * @param {string} title - The title of the current song
     */
    function updateMediaSessionMetadata(title) {
        navigator.mediaSession.metadata = new MediaMetadata({ title });
    }

    /**
     * Updates the score of the currently playing song
     * @async
     * @param {number} increment - The amount to increment the score by
     */
    async function updateCurrentSongScore(increment) {
        if (audioPlayer.src) {
            const path = playlist[currentIndex];
            const newScore = await updateScore(path, increment);
            console.log(`Score updated. New score: ${newScore}`);
            await updateLibrary();
        }
    }
})();
