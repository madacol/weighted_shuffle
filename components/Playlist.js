import { MIN_SCORE, MAX_SCORE } from '../config.js';

/**
 * @typedef {{
 *   get(path: string): number,
 *   set(path: string, score: number): Promise<number>
 * }} SongScoreService
 *
 * @typedef {{
 *   playlist: string[],
 *   currentIndex: number
 * }} QueueState
 *
 * @typedef {{
 *   subscribe(listener: (state: QueueState) => void): () => void,
 *   getState(): QueueState,
 *   select(index: number): string|null,
 *   reorder(sourceIndex: number, targetIndex: number): void,
 *   add(songPath: string, targetIndex?: number): void,
 *   remove(index: number): void,
 *   fill(): void,
 *   playNext(): string|null,
 *   playPrevious(): string|null,
 *   updateCurrentSongScore(increment: number): Promise<number|null>,
 *   handleSongEnd(): string|null
 * }} QueueModel
 */

/** @param {string} path */
function getDisplayName(path) {
    return path.split('/').pop().replace(/\.[^.]+$/, '');
}

class Playlist extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        /** @type {SongScoreService|null} */
        this._scoreService = null;
        /** @type {QueueModel|null} */
        this._model = null;
        /** @type {(() => void)|null} */
        this._unsubscribe = null;
        /** @type {QueueState} */
        this._state = { playlist: [], currentIndex: 0 };
    }

    connectedCallback() {
        this.render();
        this.setupDragAndDrop();
        this.updatePlaylistUI();
    }

    disconnectedCallback() {
        this._unsubscribe?.();
        this._unsubscribe = null;
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

    /** @param {SongScoreService} scoreService */
    set scoreService(scoreService) {
        this._scoreService = scoreService;
        this.updatePlaylistUI();
    }

    /** @param {QueueModel} model */
    set model(model) {
        this._unsubscribe?.();
        this._model = model;
        this._unsubscribe = model.subscribe((state) => {
            this._state = state;
            this.updatePlaylistUI();
        });
    }

    /** @returns {QueueModel} */
    _getModel() {
        if (!this._model) throw new Error('Playlist model not configured');
        return this._model;
    }

    /** @returns {SongScoreService} */
    _getScoreService() {
        if (!this._scoreService) throw new Error('Playlist score service not configured');
        return this._scoreService;
    }

    /** @returns {string[]} */
    get playlist() {
        return this._state.playlist;
    }

    /** @returns {number} */
    get currentIndex() {
        return this._state.currentIndex;
    }

    setupDragAndDrop() {
        const list = this.shadowRoot.querySelector('.song-list');
        list.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';

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
        this._getModel().reorder(sourceIndex, targetIndex);
    }

    addSongToPlaylist(songPath, targetIndex) {
        this._getModel().add(songPath, targetIndex);
    }

    deleteSong(index) {
        this._getModel().remove(index);
    }

    updatePlaylistUI() {
        const list = this.shadowRoot?.querySelector('.song-list');
        if (!list || !this._scoreService) return;

        const scoreService = this._getScoreService();
        list.innerHTML = '';

        if (this.playlist.length === 0) {
            list.innerHTML = '<div class="empty-state">Queue is empty</div>';
            return;
        }

        this.playlist.forEach((song, index) => {
            const row = document.createElement('div');
            row.className = 'song-row';
            if (index === this.currentIndex) row.classList.add('playing');

            const score = scoreService.get(song);
            row.innerHTML = /*html*/`
                ${index === this.currentIndex ? '<div class="eq-bars"><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div></div>' : '<span class="drag-handle">⠿</span>'}
                <span class="song-name" title="${song}">${getDisplayName(song)}</span>
                <span class="score-badge">${score}</span>
                <button class="delete-btn" title="Remove">✕</button>
            `;

            row.setAttribute('draggable', 'true');
            row.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text/plain', song);
                event.dataTransfer.setData('source-index', index.toString());
                row.style.opacity = '0.4';
            });
            row.addEventListener('dragend', () => { row.style.opacity = ''; });

            row.querySelector('.song-name').addEventListener('click', () => {
                const songToPlay = this._getModel().select(index);
                if (songToPlay) {
                    this._dispatchPlaySong(songToPlay);
                }
            });

            row.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteSong(index);
            });

            const badge = row.querySelector('.score-badge');
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editScore(badge, song, score);
            });

            list.appendChild(row);
        });

        const playing = list.querySelector('.song-row.playing');
        if (playing) {
            playing.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    _dispatchPlaySong(song) {
        this.dispatchEvent(new CustomEvent('play-song', {
            detail: { song, index: this.currentIndex }
        }));
    }

    _dispatchScoreChanged(song, score) {
        this.dispatchEvent(new CustomEvent('song-score-changed', {
            bubbles: true,
            composed: true,
            detail: { song, score }
        }));
    }

    _editScore(badge, path, currentScore) {
        const scoreService = this._getScoreService();
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
                await scoreService.set(path, newScore);
            }
            const finalScore = scoreService.get(path);
            const newBadge = document.createElement('span');
            newBadge.className = 'score-badge';
            newBadge.textContent = finalScore;
            input.replaceWith(newBadge);
            newBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editScore(newBadge, path, finalScore);
            });
            this._dispatchScoreChanged(path, finalScore);
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
        this._getModel().fill();
    }

    playNext() {
        const song = this._getModel().playNext();
        if (song) {
            this._dispatchPlaySong(song);
        }
    }

    playPrevious() {
        const song = this._getModel().playPrevious();
        if (song) {
            this._dispatchPlaySong(song);
        }
    }

    async updateCurrentSongScore(increment) {
        const path = this.playlist[this.currentIndex];
        const newScore = await this._getModel().updateCurrentSongScore(increment);
        if (path && newScore !== null) {
            console.log(`Score updated. New score: ${newScore}`);
            this._dispatchScoreChanged(path, newScore);
        }
        return newScore;
    }

    handleSongEnd() {
        const song = this._getModel().handleSongEnd();
        if (song) {
            this._dispatchPlaySong(song);
        }
    }
}

customElements.define('music-playlist', Playlist);
