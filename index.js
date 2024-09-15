import { saveDirHandle, getLastFolderHandle } from './file_handle_store.js';

(async () => {
    // Constants
    const MIN_SCORE = -1;
    const DEFAULT_SCORE = 2;
    const MAX_SCORE = 15;
    const MAX_PLAYLIST_SIZE = 20;

    /** @type {HTMLAudioElement} The audio player element */
    const audioPlayer = document.getElementsByTagName('audio')[0];

    /** @type {string[]} The playlist array containing file paths */
    const playlist = [];

    /** @type {number} The index of the currently playing song in the playlist */
    let currentIndex = 0;

    /** @type {FileSystemDirectoryHandle|null} The handle for the selected music folder */
    let musicFolderHandle = null;

    /** @type {Database|null} The SQLite database instance */
    let db = null;

    // File system access
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
     */
    async function loadMusicFolder() {
        try {
            musicFolderHandle = await window.showDirectoryPicker({mode: 'readwrite'});
            await setupDatabase();
            const musicFiles = await getFiles(musicFolderHandle);
            await addNewSongsToDatabase(musicFiles);
            await saveDatabase();
            await saveDirHandle(musicFolderHandle);
            fillPlaylist();
            if (!audioPlayer.src && playlist.length > 0) playSong(playlist[0]);
        } catch (err) {
            console.error("Error loading music folder:", err);
        }
    }

    /**
     * Sets up the SQLite database
     * @returns {Promise<Database>} The SQLite database instance
     */
    async function setupDatabase() {
        const SQL = await initSqlJs({
            locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/${filename}`
        });

        try {
            const dbFileHandle = await musicFolderHandle.getFileHandle('music_db.sqlite', { create: false });
            const dbFile = await dbFileHandle.getFile();
            const arrayBuffer = await dbFile.arrayBuffer();
            db = new SQL.Database(new Uint8Array(arrayBuffer));
        } catch (error) {
            if (error.name === 'NotFoundError') {
                console.log('Database file not found. Creating a new one.');
                db = new SQL.Database();
            } else {
                throw error;
            }
        }

        db.run(/*sql*/`
        CREATE TABLE IF NOT EXISTS song_scores (
            path TEXT PRIMARY KEY,
            score INTEGER,
            last_played TIMESTAMP
        )`);

        return db;
    }

    /**
     * Saves the database to the music folder
     */
    async function saveDatabase() {
        if (!db || !musicFolderHandle) return;

        const data = db.export();
        const dbFileHandle = await musicFolderHandle.getFileHandle('music_db.sqlite', { create: true });
        const writable = await dbFileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        await updateLibrary();
    }

    /**
     * Adds new songs to the database
     * @param {string[]} musicFiles - Array of file paths
     */
    async function addNewSongsToDatabase(musicFiles) {
        for (const file of musicFiles) {
            db.run(/*sql*/`INSERT OR IGNORE INTO song_scores (path, score, last_played) VALUES (?, ?, ?)`,
                [file, DEFAULT_SCORE, Date.now()]);
        }
    }

    async function updateLibrary() {
        const songs = db.exec(/*sql*/`SELECT path, score FROM song_scores ORDER BY score DESC`);
        /** @type {HTMLTableSectionElement} */
        const tableBody = document.querySelector('#library tbody');
        tableBody.innerHTML = '';

        if (songs.length > 0 && songs[0].values.length > 0) {
            songs[0].values.forEach(([path, score]) => {
                const row = tableBody.insertRow();
                row.insertCell(0).textContent = path;
                row.insertCell(1).innerHTML = /*html*/`<input type="number" class="edit-score" value="${score}" min="${MIN_SCORE}" max="${MAX_SCORE}">`;
            });
        }

        // add event listeners
        document.querySelectorAll('.edit-score').forEach( /** @param {HTMLInputElement} input */ input => {
            input.addEventListener('change', async () => {
                const row = input.closest('tr');
                const path = row.cells[0].textContent;
                const newScore = parseInt(input.value);
                await updateScore(path, newScore - getSongScore(path));
            });
        });
    }

    /**
     * Gets a weighted shuffled song from the database
     * @returns {string|null} The path of the selected song, or null if no songs are available
     */
    function getWeightedShuffledSong() {
        const songs = db.exec(/*sql*/`SELECT path, score FROM song_scores ORDER BY score DESC`);
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
        const playlistTableBody = document.querySelector('#playlistTable tbody');
        const fragment = document.createDocumentFragment();

        playlist.forEach((song, index) => {
            const row = document.createElement('tr');
            row.innerHTML = /*html*/`
                <td>${song}</td>
                <td><input type="number" class="edit-score" value="${getSongScore(song)}" min="${MIN_SCORE}" max="${MAX_SCORE}"></td>
                <td><button class="delete-from-playlist">Delete</button></td>
            `;
            if (index === currentIndex) row.style.fontWeight = 'bold';
            fragment.appendChild(row);
        });

        playlistTableBody.innerHTML = '';
        playlistTableBody.appendChild(fragment);

        // add event listeners
        document.querySelectorAll('.delete-from-playlist').forEach( /** @param {HTMLButtonElement} button */ button => {
            button.addEventListener('click', async () => {
                const row = button.closest('tr');
                const path = row.cells[0].textContent;
                playlist.splice(playlist.indexOf(path), 1);
                updatePlaylistUI();
                fillPlaylist();
            });
        });
        document.querySelectorAll('.edit-score').forEach( /** @param {HTMLInputElement} input */ input => {
            input.addEventListener('change', async () => {
                const row = input.closest('tr');
                const path = row.cells[0].textContent;
                const newScore = parseInt(input.value);
                await updateScore(path, newScore - getSongScore(path));
            });
        });
    }

    /**
     * Gets the score of a song
     * @param {string} path - The file path of the song
     * @returns {number} The score of the song
     */
    function getSongScore(path) {
        const result = db.exec(/*sql*/`SELECT score FROM song_scores WHERE path = ? LIMIT 1`, [path]);
        return result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : DEFAULT_SCORE;
    }

    /**
     * Plays a song
     * @param {string} path - The file path of the song to play
     */
    async function playSong(path) {
        if (!musicFolderHandle) return;
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
        document.getElementById('nowPlaying').textContent = path;
        updatePlaylistUI();
        updateMediaSessionMetadata(path);
    }

    function playNext() {
        currentIndex = (currentIndex + 1) % playlist.length;
        playSong(playlist[currentIndex]);
        fillPlaylist();
    }

    function playPrevious() {
        currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        playSong(playlist[currentIndex]);
    }

    /**
     * Updates the score of a song
     * @param {string} path - The file path of the song
     * @param {number} increment - The amount to increment the score by
     * @returns {Promise<number>} The new score of the song
     */
    async function updateScore(path, increment) {
        const result = db.exec(/*sql*/`SELECT score FROM song_scores WHERE path = ?`, [path]);
        let score = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : DEFAULT_SCORE;
        let newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, score + increment));
        db.run(/*sql*/`INSERT OR REPLACE INTO song_scores (path, score, last_played) VALUES (?, ?, ?)`, 
            [path, newScore, Date.now()]);
        await saveDatabase();
        updatePlaylistUI();
        return newScore;
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
        }
    }

    // Initializes the application
    try {
        const lastFolderHandle = await getLastFolderHandle();
        if (lastFolderHandle) {
            musicFolderHandle = lastFolderHandle;
            await setupDatabase();
            const musicFiles = await getFiles(musicFolderHandle);
            await addNewSongsToDatabase(musicFiles);
            await saveDatabase();
            fillPlaylist();
            if (!audioPlayer.src && playlist.length > 0) playSong(playlist[0]);
        }
    } catch (err) {
        console.error("Error initializing app:", err);
    }

    // Sets up the Media Session API handlers
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
    navigator.mediaSession.setActionHandler('seekforward', () => audioPlayer.currentTime += 10);
    navigator.mediaSession.setActionHandler('seekbackward', () => audioPlayer.currentTime -= 10);

    // Event Listeners
    document.getElementById('selectFolder').addEventListener('click', loadMusicFolder);
    document.getElementById('playPause').addEventListener('click', () => audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause());
    document.getElementById('next').addEventListener('click', playNext);
    document.getElementById('previous').addEventListener('click', playPrevious);
    document.getElementById('upvote').addEventListener('click', () => updateCurrentSongScore(1));
    document.getElementById('downvote').addEventListener('click', () => updateCurrentSongScore(-1));
    audioPlayer.addEventListener('ended', playNext);
})();