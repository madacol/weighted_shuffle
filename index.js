
(async () => {

    /**********************
     * CONSTANTS
     **********************/

    const MIN_SCORE = -1;
    const DEFAULT_SCORE = 2;
    const MAX_SCORE = 15;
    const DISABLE_WEIGHTED_SHUFFLE_THRESHOLD = 0.3;
    const MAX_PLAYLIST_SIZE = 20;

    let audioPlayer = document.getElementById('audioPlayer');
    let playlist = [];
    let currentIndex = 0;
    let musicFolderHandle = null;
    let db = null;

    /**********************
     * FILE SYSTEM ACCESS
     **********************/

    async function getFiles(dirHandle, path = "") {
        const files = [];
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.wma', '.ape', '.alac', '.aiff', '.mid', '.midi'];

        for await (const entry of dirHandle.values()) {
            if (entry.kind === "file") {
                const fileName = entry.name.toLowerCase();
                const fileExtension = '.' + fileName.split('.').pop();

                if (audioExtensions.includes(fileExtension)) {
                    files.push(`${path}${entry.name}`);
                } else {
                    try {
                        const file = await entry.getFile();
                        if (file.type.startsWith('audio/')) {
                            files.push(`${path}${entry.name}`);
                        }
                    } catch (error) {
                        console.warn(`Error checking file type for ${entry.name}:`, error);
                    }
                }
            } else if (entry.kind === "directory") {
                files.push(...await getFiles(entry, `${path}${entry.name}/`));
            }
        }
        return files;
    }

    async function loadMusicFolder() {
        try {
            musicFolderHandle = await window.showDirectoryPicker({mode: 'readwrite'});
            await setupDatabase();
            const musicFiles = await getFiles(musicFolderHandle);

            // Add new songs to the database
            for (const file of musicFiles) {
                db.run(/*sql*/`INSERT OR IGNORE INTO song_scores (path, score, last_played) VALUES (?, ?, ?)`,
                    [file, DEFAULT_SCORE, Date.now()]);
            }

            await saveDatabase();
            FillPlaylist();
            if (!audioPlayer.src && playlist.length > 0) playSong(playlist[0]);
        } catch (err) {
            console.error("Error loading music folder:", err);
        }
    }

    /**********************
     * SETUP DATABASE
     **********************/

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

    async function saveDatabase() {
        if (!db || !musicFolderHandle) return;

        const data = db.export();
        const dbFileHandle = await musicFolderHandle.getFileHandle('music_db.sqlite', { create: true });
        const writable = await dbFileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        await updateLibrary();
    }

    /**********************
     * HELPER FUNCTIONS
     **********************/

    async function updateLibrary() {
        const songs = db.exec(/*sql*/`SELECT path, score FROM song_scores ORDER BY score DESC`);
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
        document.querySelectorAll('.edit-score').forEach(input => {
            input.addEventListener('change', async (event) => {
                const row = event.target.closest('tr');
                const path = row.cells[0].textContent;
                const newScore = parseInt(event.target.value);
                await updateScore(path, newScore - getSongScore(path));
            });
        });
    }

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

    function FillPlaylist() {
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
        document.querySelectorAll('.delete-from-playlist').forEach(button => {
            button.addEventListener('click', async (event) => {
                const row = event.target.closest('tr');
                const path = row.cells[0].textContent;
                playlist = playlist.filter(song => song !== path);
                updatePlaylistUI();
                FillPlaylist();
            });
        });
        document.querySelectorAll('.edit-score').forEach(input => {
            input.addEventListener('change', async (event) => {
                const row = event.target.closest('tr');
                const path = row.cells[0].textContent;
                const newScore = parseInt(event.target.value);
                await updateScore(path, newScore - getSongScore(path));
            });
        });
    }

    function getSongScore(path) {
        const result = db.exec(/*sql*/`SELECT score FROM song_scores WHERE path = ? LIMIT 1`, [path]);
        return result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : DEFAULT_SCORE;
    }

    async function playSong(path) {
        if (!musicFolderHandle) return;
        const pathParts = path.split('/');
        let fileHandle = musicFolderHandle;
        for (const part of pathParts) {
            if (part) {
                fileHandle = await fileHandle.getDirectoryHandle(part).catch(() => fileHandle.getFileHandle(part));
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
        FillPlaylist();
    }

    function playPrevious() {
        currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        playSong(playlist[currentIndex]);
    }

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

    /**********************
     * EVENT LISTENERS
     **********************/

    document.getElementById('selectFolder').addEventListener('click', loadMusicFolder);
    document.getElementById('playPause').addEventListener('click', () => audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause());
    document.getElementById('next').addEventListener('click', playNext);
    document.getElementById('previous').addEventListener('click', playPrevious);

    document.getElementById('upvote').addEventListener('click', async () => {
        if (audioPlayer.src) {
            const path = playlist[currentIndex];
            const newScore = await updateScore(path, 1);
            console.log(`Upvoted. New score: ${newScore}`);
        }
    });

    document.getElementById('downvote').addEventListener('click', async () => {
        if (audioPlayer.src) {
            const path = playlist[currentIndex];
            const newScore = await updateScore(path, -1);
            console.log(`Downvoted. New score: ${newScore}`);
        }
    });

    audioPlayer.addEventListener('ended', playNext);

    /**********************
     * SETUP
     **********************/

    // Try to recover the music folder permission
    if ('launchQueue' in window && 'files' in LaunchParams.prototype) {
        launchQueue.setConsumer(async (launchParams) => {
            if (!launchParams.files.length) {
                return;
            }
            const [fileHandle] = launchParams.files;
            musicFolderHandle = await fileHandle.getParent();
            await loadMusicFolder();
        });
    }

    // Media Session API
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
    navigator.mediaSession.setActionHandler('seekforward', () => audioPlayer.currentTime += 10);
    navigator.mediaSession.setActionHandler('seekbackward', () => audioPlayer.currentTime -= 10);

    function updateMediaSessionMetadata(title) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: title.slice(-30) });
    }
})();