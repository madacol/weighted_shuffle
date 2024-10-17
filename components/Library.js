import { MIN_SCORE, MAX_SCORE } from '../config.js';
import { getSongScore, updateScore } from '../db.js';

class Library extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
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
                    max-width: 900px;
                    padding: 2em;
                    box-sizing: border-box;
                    width: 100%;
                }
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
            </style>
            <h3>Library:</h3>
            <table>
                <tbody></tbody>
            </table>
        `;
    }

    updateLibrary(songs) {
        const tableBody = this.shadowRoot.querySelector('table tbody');
        tableBody.innerHTML = '';

        if (songs.length > 0) {
            songs.forEach(([path, score]) => {
                const row = tableBody.insertRow();
                row.innerHTML = /*html*/`
                    <td class="song-path" draggable="true">${path}</td>
                    <td><input type="number" class="edit-score" value="${score}" min="${MIN_SCORE}" max="${MAX_SCORE}"></td>
                `;
                row.querySelector('td.song-path').addEventListener('dragstart', (event) => {
                    event.dataTransfer.setData('text/plain', path);
                    // Dispatch a custom event to the main document
                    this.dispatchEvent(new CustomEvent('song-drag-start', { 
                        bubbles: true, 
                        composed: true,
                        detail: { path }
                    }));
                });
                row.querySelector('.song-path').addEventListener('click', () => {
                    this.dispatchEvent(new CustomEvent('play-song', { 
                        bubbles: true, 
                        composed: true,
                        detail: { song: path }
                    }));
                });
                row.querySelector('input').addEventListener('change', async (event) => {
                    if (event.target instanceof HTMLInputElement) {
                        const newScore = parseInt(event.target.value);
                        await updateScore(path, newScore - getSongScore(path));
                    }
                });
            });
        }
    }
}

customElements.define('music-library', Library);