import { MIN_SCORE, MAX_SCORE, MAX_PLAYLIST_SIZE } from '../config.js';
import { getSongScore, sql, updateScore } from '../db.js';

/** @param {string} path */
function getDisplayName(path) {
    return path.split('/').pop().replace(/\.[^.]+$/, '');
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
        /** @type {string|null} */
        this.lastEndedSong = null;
    }

    connectedCallback() {
        this.render();
        this.setupDragAndDrop();
    }

    render() {
        this.shadowRoot.innerHTML = /*html*/`
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    max-height: 100vh;
                    padding: 16px;
                    box-sizing: border-box;
                    width: 100%;
                    overflow: hidden;
                }
                .panel-header {
                    font-size: 13px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    color: var(--text-muted, #606070);
                    margin: 0 0 12px 4px;
                }
                .song-list {
                    overflow-y: auto;
                    flex: 1;
                    scrollbar-width: thin;
                    scrollbar-color: var(--bg-hover, #2a2a4a) transparent;
                }
                .song-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background-color 0.15s;
                    position: relative;
                }
                .song-row:hover {
                    background: var(--bg-hover, #2a2a4a);
                }
                .song-row.playing {
                    background: var(--bg-active, #0f3460);
                    border-left: 3px solid var(--accent, #e94560);
                    padding-left: 9px;
                }
                .song-row.playing .song-name {
                    color: var(--accent, #e94560);
                    font-weight: 600;
                }
                .song-row.drag-over-top {
                    box-shadow: inset 0 2px 0 0 var(--accent, #e94560);
                }
                .song-row.drag-over-bottom {
                    box-shadow: inset 0 -2px 0 0 var(--accent, #e94560);
                }
                .drag-handle {
                    color: var(--text-muted, #606070);
                    cursor: grab;
                    font-size: 12px;
                    padding: 0 2px;
                    user-select: none;
                    flex-shrink: 0;
                }
                .drag-handle:active { cursor: grabbing; }
                .song-name {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    font-size: 14px;
                    color: var(--text-primary, #e0e0e0);
                }
                .score-badge {
                    background: var(--bg-secondary, #1a1a2e);
                    border: 1px solid var(--border, #2a2a3a);
                    border-radius: 12px;
                    padding: 2px 10px;
                    font-size: 12px;
                    font-weight: 600;
                    min-width: 30px;
                    text-align: center;
                    cursor: pointer;
                    transition: border-color 0.2s;
                    flex-shrink: 0;
                    color: var(--text-secondary, #a0a0b0);
                    font-family: inherit;
                }
                .score-badge:hover {
                    border-color: var(--accent, #e94560);
                }
                .score-input {
                    width: 50px;
                    background: var(--bg-secondary, #1a1a2e);
                    border: 1px solid var(--accent, #e94560);
                    border-radius: 12px;
                    padding: 2px 6px;
                    font-size: 12px;
                    font-weight: 600;
                    text-align: center;
                    color: var(--text-primary, #e0e0e0);
                    outline: none;
                    font-family: inherit;
                }
                .delete-btn {
                    background: none;
                    border: none;
                    color: var(--text-muted, #606070);
                    cursor: pointer;
                    font-size: 14px;
                    padding: 4px 6px;
                    border-radius: 4px;
                    transition: color 0.2s, background-color 0.2s;
                    line-height: 1;
                    flex-shrink: 0;
                }
                .delete-btn:hover {
                    color: var(--accent-red, #ff6b6b);
                    background: rgba(255, 107, 107, 0.1);
                }
                .eq-bars {
                    display: flex;
                    align-items: flex-end;
                    gap: 2px;
                    height: 14px;
                    flex-shrink: 0;
                }
                .eq-bar {
                    width: 3px;
                    background: var(--accent, #e94560);
                    border-radius: 1px;
                    animation: eq-bounce 0.8s ease infinite;
                }
                .eq-bar:nth-child(2) { animation-delay: 0.2s; }
                .eq-bar:nth-child(3) { animation-delay: 0.4s; }
                @keyframes eq-bounce {
                    0%, 100% { height: 3px; }
                    50% { height: 12px; }
                }
                .empty-state {
                    text-align: center;
                    color: var(--text-muted, #606070);
                    padding: 40px 0;
                    font-size: 14px;
                }
            </style>
            <div class="panel-header">Queue</div>
            <div class="song-list"></div>
        `;
    }

    setupDragAndDrop() {
        const list = this.shadowRoot.querySelector('.song-list');
        list.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';

            // Visual drop indicator
            const rows = this.shadowRoot.querySelectorAll('.song-row');
            rows.forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
            const target = event.target.closest?.('.song-row') || event.composedPath().find(el => el.classList?.contains('song-row'));
            if (target) {
                const rect = target.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                target.classList.add(event.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
            }
        });
        list.addEventListener('dragleave', () => {
            this.shadowRoot.querySelectorAll('.song-row').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
        });
        list.addEventListener('drop', (event) => {
            event.preventDefault();
            this.shadowRoot.querySelectorAll('.song-row').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
            const songPath = event.dataTransfer.getData('text/plain');
            const sourceIndex = event.dataTransfer.getData('source-index');
            const targetIndex = this.getDropIndex(event);

            if (sourceIndex) {
                this.reorderSong(parseInt(sourceIndex), targetIndex);
            } else {
                this.addSongToPlaylist(songPath, targetIndex);
            }
        });
    }

    getDropIndex(event) {
        const rows = this.shadowRoot.querySelectorAll('.song-row');
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
        if (this.currentIndex >= index && this.currentIndex > 0) {
            this.currentIndex--;
        }
        this.updatePlaylistUI();
    }

    updatePlaylistUI() {
        const list = this.shadowRoot.querySelector('.song-list');
        list.innerHTML = '';

        if (this.playlist.length === 0) {
            list.innerHTML = '<div class="empty-state">Queue is empty</div>';
            return;
        }

        this.playlist.forEach((song, index) => {
            const row = document.createElement('div');
            row.className = 'song-row';
            if (index === this.currentIndex) row.classList.add('playing');

            const score = getSongScore(song);
            row.innerHTML = /*html*/`
                ${index === this.currentIndex ? '<div class="eq-bars"><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div></div>' : '<span class="drag-handle">⠿</span>'}
                <span class="song-name" title="${song}">${getDisplayName(song)}</span>
                <span class="score-badge">${score}</span>
                <button class="delete-btn" title="Remove">✕</button>
            `;

            // Drag
            row.setAttribute('draggable', 'true');
            row.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text/plain', song);
                event.dataTransfer.setData('source-index', index.toString());
                row.style.opacity = '0.4';
            });
            row.addEventListener('dragend', () => { row.style.opacity = ''; });

            // Play on click
            row.querySelector('.song-name').addEventListener('click', () => {
                this.currentIndex = index;
                this.playSong(song);
            });

            // Delete
            row.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteSong(index);
            });

            // Score editing
            const badge = row.querySelector('.score-badge');
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editScore(badge, song, score);
            });

            list.appendChild(row);
        });

        // Scroll to current
        const playing = list.querySelector('.song-row.playing');
        if (playing) {
            playing.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    _editScore(badge, path, currentScore) {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'score-input';
        input.value = currentScore;
        input.min = MIN_SCORE;
        input.max = MAX_SCORE;
        badge.replaceWith(input);
        input.focus();
        input.select();

        const commit = async () => {
            const newScore = parseInt(input.value);
            if (!isNaN(newScore) && newScore !== currentScore) {
                await updateScore(path, newScore - getSongScore(path));
            }
            const finalScore = getSongScore(path);
            const newBadge = document.createElement('span');
            newBadge.className = 'score-badge';
            newBadge.textContent = finalScore;
            input.replaceWith(newBadge);
            newBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editScore(newBadge, path, finalScore);
            });
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') {
                input.value = currentScore;
                input.blur();
            }
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
        this.updatePlaylistUI();
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

    handleSongEnd() {
        const currentSong = this.playlist[this.currentIndex];

        if (currentSong === this.lastEndedSong) {
            this.updateCurrentSongScore(1);
            console.log(`Upvoted song "${currentSong}" for repeating`);
        }
        this.lastEndedSong = currentSong;

        this.playNext();
    }
}

customElements.define('music-playlist', Playlist);
