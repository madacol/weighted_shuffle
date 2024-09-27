import { MIN_SCORE, MAX_SCORE, MAX_PLAYLIST_SIZE } from '../config.js';
import { getSongScore, sql, updateScore } from '../db.js';

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

class Playlist extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        /** @type {string[]} */
        this.playlist = [];
        /** @type {number} */
        this.currentIndex = 0;
        /** @type {string|null} */
        this.lastPlayedSong = null;
        /** @type {number|null} */
        this.playStartTime = null;
    }

    connectedCallback() {
        this.render();
        this.setupDragAndDrop();
    }

    render() {
        this.shadowRoot.innerHTML = /*html*/`
            <style>
                :host { display: contents; }
                table {
                    display: block;
                    border: 1px solid #ddd;
                    overflow: auto;
                    flex-shrink: 1;
                    box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
                }
                td {
                    padding: 8px;
                    text-align: left;
                }
                .edit-score { width: 50px; }
                .song-path { cursor: pointer; }
                .song-path:hover { background-color: #ddd; }
                .playing { background-color: #f2f2f2; }
            </style>
            <h3>Playlist:</h3>
            <table>
                <tbody></tbody>
            </table>
        `;
    }

    setupDragAndDrop() {
        const tbody = this.shadowRoot.querySelector('tbody');
        tbody.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        });
        tbody.addEventListener('drop', (event) => {
            event.preventDefault();
            const songPath = event.dataTransfer.getData('text/plain');
            const sourceIndex = event.dataTransfer.getData('source-index');
            const targetIndex = this.getDropIndex(event);
            
            if (sourceIndex) {
                // Internal playlist reordering
                this.reorderSong(parseInt(sourceIndex), targetIndex);
            } else {
                // Song dropped from library
                this.addSongToPlaylist(songPath, targetIndex);
            }
        });
    }

    getDropIndex(event) {
        const rows = this.shadowRoot.querySelectorAll('tbody tr');
        for (let i = 0; i < rows.length; i++) {
            const rect = rows[i].getBoundingClientRect();
            if (event.clientY < rect.top + rect.height / 2) {
                return i;
            }
        }
        return rows.length;
    }
    reorderSong(sourceIndex, targetIndex) {
        const [movedSong] = this.playlist.splice(sourceIndex, 1);
        this.playlist.splice(targetIndex, 0, movedSong);
        if (this.currentIndex === sourceIndex) {
            this.currentIndex = targetIndex;
        } else if (this.currentIndex > sourceIndex && this.currentIndex <= targetIndex) {
            this.currentIndex--;
        } else if (this.currentIndex < sourceIndex && this.currentIndex >= targetIndex) {
            this.currentIndex++;
        }
        this.updatePlaylistUI();
    }

    addSongToPlaylist(songPath, targetIndex) {
        if (targetIndex !== undefined) {
            this.playlist.splice(targetIndex, 0, songPath);
            if (this.currentIndex >= targetIndex) {
                this.currentIndex++;
            }
        } else {
            this.playlist.push(songPath);
        }
        this.updatePlaylistUI();
    }

    deleteSong(index) {
        this.playlist.splice(index, 1);
        this.updatePlaylistUI();
    }

    updatePlaylistUI() {
        const tbody = this.shadowRoot.querySelector('tbody');
        tbody.innerHTML = '';

        this.playlist.forEach((song, index) => {
            const row = tbody.insertRow();
            row.innerHTML = /*html*/`
                <td><button class="delete-from-playlist">Delete</button></td>
                <td class="song-path" draggable="true">${song}</td>
                <td><input type="number" class="edit-score" value="${getSongScore(song)}" min="${MIN_SCORE}" max="${MAX_SCORE}"></td>
            `;
            const song_path = row.querySelector('.song-path');
            song_path.addEventListener('click', () => {
                this.currentIndex = index;
                this.playSong(song);
            });
            if (index === this.currentIndex) {
                song_path.classList.add('playing');
            }

            // Add drag start event listener
            song_path.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text/plain', song);
                event.dataTransfer.setData('source-index', index.toString());
            });

            row.querySelector('button').addEventListener('click', () => this.deleteSong(index));
            row.querySelector('.edit-score').addEventListener('change', async (event) => {
                if (event.target instanceof HTMLInputElement) {
                    const newScore = parseInt(event.target.value);
                    await updateScore(song, newScore - getSongScore(song));
                    event.target.value = getSongScore(song).toString();
                }
            });
        });
    }

    fillPlaylist() {
        let maxTries = 10;
        while (this.playlist.length - this.currentIndex < MAX_PLAYLIST_SIZE) {
            let newSong = getWeightedShuffledSong();
            if (!newSong) return console.log("No songs in library");

            if (!this.playlist.slice(-MAX_PLAYLIST_SIZE).includes(newSong) || maxTries-- <= 0) {
                this.playlist.push(newSong);
            }
        }
        this.updatePlaylistUI();
    }

    playSong(song) {
        this.lastPlayedSong = song;
        this.playStartTime = Date.now();
        this.dispatchEvent(new CustomEvent('play-song', { detail: { song, index: this.currentIndex } }));
        const songElement = this.shadowRoot.querySelectorAll('.song-path')[this.currentIndex];
        songElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    playNext() {
        if (this.playStartTime && Date.now() - this.playStartTime < 5000) {
            this.updateCurrentSongScore(-1);
        }
        this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        this.playSong(this.playlist[this.currentIndex]);
    }

    playPrevious() {
        this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        this.playSong(this.playlist[this.currentIndex]);
    }

    updateCurrentSongScore(increment) {
        const path = this.playlist[this.currentIndex];
        updateScore(path, increment).then(newScore => {
            console.log(`Score updated. New score: ${newScore}`);
            this.updatePlaylistUI();
        });
    }
}

customElements.define('music-playlist', Playlist);