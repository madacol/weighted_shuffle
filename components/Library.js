import { MIN_SCORE, MAX_SCORE } from '../config.js';

/**
 * @typedef {{
 *   get(path: string): number,
 *   set(path: string, score: number): Promise<number>
 * }} SongScoreService
 */

/** @param {string} path */
function getDisplayName(path) {
    return path.split('/').pop().replace(/\.[^.]+$/, '');
}

/** @param {number} score */
function getScoreColor(score) {
    const ratio = (score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE);
    if (ratio < 0.3) return 'var(--accent-red, #ff6b6b)';
    if (ratio < 0.6) return 'var(--text-secondary, #a0a0b0)';
    return 'var(--accent-green, #4ecca3)';
}

class Library extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        /** @type {Array<[string, number]>} */
        this._songs = [];
        /** @type {SongScoreService|null} */
        this._scoreService = null;
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
            <input class="search-input" type="text" placeholder="Filter songs…">
            <div class="song-list"></div>
        `;
        this.shadowRoot.querySelector('.search-input').addEventListener('input', (e) => {
            this._filterSongs(e.target.value);
        });
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

    _filterSongs(query) {
        const q = query.toLowerCase();
        const rows = this.shadowRoot.querySelectorAll('.song-row');
        rows.forEach(row => {
            const name = row.getAttribute('data-path').toLowerCase();
            row.style.display = name.includes(q) ? '' : 'none';
        });
    }

    updateLibrary(songs) {
        this._songs = songs;
        const list = this.shadowRoot.querySelector('.song-list');
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
            row.innerHTML = /*html*/`
                <span class="song-name" title="${path}">${getDisplayName(path)}</span>
                <span class="score-badge" style="border-left: 3px solid ${getScoreColor(score)}">${score}</span>
            `;

            row.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text/plain', path);
                this.dispatchEvent(new CustomEvent('song-drag-start', {
                    bubbles: true,
                    composed: true,
                    detail: { path }
                }));
            });

            row.querySelector('.song-name').addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('play-song', {
                    bubbles: true,
                    composed: true,
                    detail: { song: path }
                }));
            });

            const badge = row.querySelector('.score-badge');
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editScore(badge, path, score);
            });

            list.appendChild(row);
        });
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
            const newBadge = document.createElement('span');
            newBadge.className = 'score-badge';
            const finalScore = scoreService.get(path);
            newBadge.style.borderLeft = `3px solid ${getScoreColor(finalScore)}`;
            newBadge.textContent = finalScore;
            input.replaceWith(newBadge);
            newBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editScore(newBadge, path, finalScore);
            });
            this.dispatchEvent(new CustomEvent('song-score-changed', {
                bubbles: true,
                composed: true,
                detail: { song: path, score: finalScore }
            }));
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
}

customElements.define('music-library', Library);
