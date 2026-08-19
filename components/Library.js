import { MIN_SCORE, MAX_SCORE } from '../config.js';
import { getSongDisplayName } from '../media_source.js';

/**
 * @typedef {{
 *   get(path: string): number,
 *   set(path: string, score: number): Promise<number>
 * }} SongScoreService
 */

/** @param {number} score */
function getScoreColor(score) {
    const ratio = (score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE);
    if (ratio < 0.3) return 'var(--accent-red, #ff6b6b)';
    if (ratio < 0.6) return 'var(--text-secondary, #a0a0b0)';
    return 'var(--accent-green, #4ecca3)';
}

export class Library extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        /** @type {Array<[string, number]>} */
        this._songs = [];
        /** @type {SongScoreService|null} */
        this._scoreService = null;
        this._youtubeLinkStatus = '';
        this._youtubeLinkStatusTone = 'neutral';
    }

    connectedCallback() {
        this.render();
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
                .search-input {
                    width: 100%;
                    padding: 10px 14px;
                    background: var(--bg-secondary, #1a1a2e);
                    border: 1px solid var(--border, #2a2a3a);
                    border-radius: 8px;
                    color: var(--text-primary, #e0e0e0);
                    font-size: 14px;
                    margin-bottom: 12px;
                    box-sizing: border-box;
                    outline: none;
                    transition: border-color 0.2s;
                    font-family: inherit;
                }
                .link-form {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 6px;
                }
                .link-input {
                    min-width: 0;
                    flex: 1;
                    padding: 10px 14px;
                    background: var(--bg-secondary, #1a1a2e);
                    border: 1px solid var(--border, #2a2a3a);
                    border-radius: 8px;
                    color: var(--text-primary, #e0e0e0);
                    font-size: 14px;
                    box-sizing: border-box;
                    outline: none;
                    font-family: inherit;
                }
                .link-input:focus {
                    border-color: var(--accent, #e94560);
                }
                .add-link-btn {
                    border: 1px solid var(--border, #2a2a3a);
                    border-radius: 8px;
                    background: var(--bg-tertiary, #16213e);
                    color: var(--text-secondary, #a0a0b0);
                    cursor: pointer;
                    font: inherit;
                    font-weight: 700;
                    min-width: 42px;
                    transition: border-color 0.2s, color 0.2s, background-color 0.2s;
                }
                .add-link-btn:hover {
                    border-color: var(--accent, #e94560);
                    color: var(--text-primary, #e0e0e0);
                    background: var(--bg-hover, #2a2a4a);
                }
                .link-help,
                .link-status {
                    margin: 0 4px 10px;
                    font-size: 12px;
                    line-height: 1.35;
                    color: var(--text-muted, #606070);
                }
                .link-status {
                    min-height: 16px;
                }
                .link-status[data-tone="success"] {
                    color: var(--accent-green, #4ecca3);
                }
                .link-status[data-tone="error"] {
                    color: var(--accent-red, #ff6b6b);
                }
                .link-status[data-tone="pending"] {
                    color: var(--text-secondary, #a0a0b0);
                }
                .search-input:focus {
                    border-color: var(--accent, #e94560);
                }
                .search-input::placeholder {
                    color: var(--text-muted, #606070);
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
                    gap: 12px;
                    padding: 8px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background-color 0.15s;
                }
                .song-row:hover {
                    background: var(--bg-hover, #2a2a4a);
                }
                .song-row:focus-visible {
                    outline: 2px solid var(--accent, #e94560);
                    outline-offset: 2px;
                    background: var(--bg-hover, #2a2a4a);
                }
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
                    transition: border-color 0.2s, background-color 0.2s;
                    flex-shrink: 0;
                    font-family: inherit;
                    color: var(--text-secondary, #a0a0b0);
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
                .empty-state {
                    text-align: center;
                    color: var(--text-muted, #606070);
                    padding: 40px 0;
                    font-size: 14px;
                }
            </style>
            <div class="panel-header">Library</div>
            <form class="link-form">
                <input class="link-input" type="url" placeholder="Paste YouTube or YouTube Music URL" aria-describedby="youtube-link-help youtube-link-status">
                <button class="add-link-btn" type="submit" title="Add YouTube link to library and queue">+</button>
            </form>
            <p class="link-help" id="youtube-link-help">Paste a YouTube or YouTube Music song URL. The plus button saves it and adds it to the Queue.</p>
            <div class="link-status" id="youtube-link-status" role="status" aria-live="polite"></div>
            <input class="search-input" type="text" placeholder="Filter songs…">
            <div class="song-list"></div>
        `;
        this._renderYouTubeLinkStatus();
        this.shadowRoot.querySelector('.link-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const input = /** @type {HTMLInputElement} */ (this.shadowRoot.querySelector('.link-input'));
            const value = input.value.trim();
            if (!value) {
                this.setYouTubeLinkStatus('Paste a YouTube or YouTube Music link first.', 'error');
                input.focus();
                return;
            }

            this.setYouTubeLinkStatus('Adding link…', 'pending');
            this.dispatchEvent(new CustomEvent('add-youtube-link', {
                bubbles: true,
                composed: true,
                detail: { link: value }
            }));
        });
        this.shadowRoot.querySelector('.search-input').addEventListener('input', (e) => {
            this._filterSongs(/** @type {HTMLInputElement} */ (e.target).value);
        });
        this.shadowRoot.addEventListener('keydown', (event) => this._handleSongRowKeyDown(event));
    }

    /**
     * @param {string} message
     * @param {'neutral'|'pending'|'success'|'error'} tone
     */
    setYouTubeLinkStatus(message, tone = 'neutral') {
        this._youtubeLinkStatus = message;
        this._youtubeLinkStatusTone = tone;
        this._renderYouTubeLinkStatus();
    }

    clearYouTubeLinkInput() {
        const input = /** @type {HTMLInputElement|null} */ (this.shadowRoot?.querySelector('.link-input'));
        if (input) input.value = '';
    }

    focusSearch() {
        const searchInput = /** @type {HTMLInputElement|null} */ (this.shadowRoot?.querySelector('.search-input'));
        searchInput?.focus();
        searchInput?.select();
    }

    focusFirstSong() {
        this._focusSongRow(this._getVisibleSongRows()[0]);
    }

    focusLastSong() {
        this._focusSongRow(this._getVisibleSongRows().at(-1));
    }

    _renderYouTubeLinkStatus() {
        const status = /** @type {HTMLElement|null} */ (this.shadowRoot?.querySelector('.link-status'));
        if (!status) return;

        status.textContent = this._youtubeLinkStatus;
        status.dataset.tone = this._youtubeLinkStatusTone;
    }

    /** @param {SongScoreService} scoreService */
    set scoreService(scoreService) {
        this._scoreService = scoreService;
    }

    /** @returns {SongScoreService} */
    _getScoreService() {
        if (!this._scoreService) throw new Error('Library score service not configured');
        return this._scoreService;
    }

    /** @param {string} query */
    _filterSongs(query) {
        const q = query.toLowerCase();
        const rows = /** @type {NodeListOf<HTMLElement>} */ (this.shadowRoot.querySelectorAll('.song-row'));
        rows.forEach(row => {
            const name = row.getAttribute('data-path')?.toLowerCase() ?? '';
            row.style.display = name.includes(q) ? '' : 'none';
        });
    }

    /** @param {Array<[string, number]>} songs */
    updateLibrary(songs) {
        this._songs = songs;
        const list = /** @type {HTMLElement} */ (this.shadowRoot.querySelector('.song-list'));
        list.innerHTML = '';

        if (songs.length === 0) {
            list.innerHTML = '<div class="empty-state">No songs loaded</div>';
            return;
        }

        songs.forEach(([path, score]) => {
            const row = document.createElement('div');
            row.className = 'song-row';
            row.setAttribute('data-path', path);
            row.setAttribute('draggable', 'true');
            row.setAttribute('tabindex', '0');
            row.setAttribute('role', 'button');
            row.setAttribute('aria-label', `Add ${getSongDisplayName(path)} to queue`);
            row.innerHTML = /*html*/`
                <span class="song-name"></span>
                <span class="score-badge" style="border-left: 3px solid ${getScoreColor(score)}">${score}</span>
            `;
            const name = /** @type {HTMLElement} */ (row.querySelector('.song-name'));
            name.title = path;
            name.textContent = getSongDisplayName(path);
            const addSongToQueue = () => this._dispatchAddSongToQueue(path);

            row.addEventListener('dragstart', (event) => {
                const dragEvent = /** @type {DragEvent} */ (event);
                dragEvent.dataTransfer?.setData('text/plain', path);
                this.dispatchEvent(new CustomEvent('song-drag-start', {
                    bubbles: true,
                    composed: true,
                    detail: { path }
                }));
            });

            row.addEventListener('click', addSongToQueue);
            const badge = /** @type {HTMLElement} */ (row.querySelector('.score-badge'));
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editScore(badge, path, score);
            });

            list.appendChild(row);
        });
    }

    /** @param {string} song */
    _dispatchAddSongToQueue(song) {
        this.dispatchEvent(new CustomEvent('add-song-to-queue', {
            bubbles: true,
            composed: true,
            detail: { song }
        }));
    }

    /**
     * @param {HTMLElement} row
     * @param {number} offset
     */
    _focusAdjacentSongRow(row, offset) {
        const rows = this._getVisibleSongRows();
        const currentIndex = rows.indexOf(row);
        const nextIndex = Math.max(0, Math.min(rows.length - 1, currentIndex + offset));
        this._focusSongRow(rows[nextIndex]);
    }

    /** @returns {HTMLElement[]} */
    _getVisibleSongRows() {
        return Array.from(/** @type {NodeListOf<HTMLElement>} */ (this.shadowRoot.querySelectorAll('.song-row')))
            .filter(candidate => candidate.style.display !== 'none');
    }

    /** @param {HTMLElement|undefined} row */
    _focusSongRow(row) {
        row?.focus();
        row?.scrollIntoView({ block: 'nearest' });
    }

    /** @param {KeyboardEvent} event */
    _handleSongRowKeyDown(event) {
        const target = /** @type {HTMLElement|null} */ (event.target instanceof HTMLElement ? event.target : null);
        const row = target?.closest('.song-row');
        if (!row) return;

        if (event.key === 'Enter') {
            event.preventDefault();
            this._dispatchAddSongToQueue(row.dataset.path ?? '');
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            this._focusAdjacentSongRow(row, event.key === 'ArrowDown' ? 1 : -1);
            return;
        }

        if (event.key === 'Home') {
            event.preventDefault();
            this._focusSongRow(this._getVisibleSongRows()[0]);
            return;
        }

        if (event.key === 'End') {
            event.preventDefault();
            this._focusSongRow(this._getVisibleSongRows().at(-1));
        }
    }

    /**
     * @param {HTMLElement} badge
     * @param {string} path
     * @param {number} currentScore
     */
    _editScore(badge, path, currentScore) {
        const scoreService = this._getScoreService();
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'score-input';
        input.value = String(currentScore);
        input.min = String(MIN_SCORE);
        input.max = String(MAX_SCORE);
        badge.replaceWith(input);
        input.focus();
        input.select();
        input.addEventListener('click', (e) => e.stopPropagation());

        const commit = async () => {
            const newScore = parseInt(input.value);
            if (!isNaN(newScore) && newScore !== currentScore) {
                await scoreService.set(path, newScore);
            }
            const newBadge = document.createElement('span');
            newBadge.className = 'score-badge';
            const finalScore = scoreService.get(path);
            newBadge.style.borderLeft = `3px solid ${getScoreColor(finalScore)}`;
            newBadge.textContent = String(finalScore);
            input.replaceWith(newBadge);
            newBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editScore(newBadge, path, finalScore);
            });
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') {
                input.value = String(currentScore);
                input.blur();
            }
        });
    }
}

customElements.define('music-library', Library);
