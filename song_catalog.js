/**
 * @param {{
 *   addMissing(paths: string[]): Promise<void>,
 *   listRanked(): Array<[string, number]>,
 *   getScore(path: string): number,
 *   setScore(path: string, score: number): Promise<number>,
 *   changeScore(path: string, delta: number): Promise<number>
 * }} songRepository
 */
export function createSongCatalogServices(songRepository) {
    const listeners = new Set();

    /**
     * @param {{ song: string, score: number }} event
     */
    function notify(event) {
        listeners.forEach(listener => listener(event));
    }

    const songCatalog = {
        /**
         * @param {string[]} paths
         * @returns {Promise<void>}
         */
        async addMissing(paths) {
            await songRepository.addMissing(paths);
        },

        /**
         * @returns {Array<[string, number]>}
         */
        listRanked() {
            return songRepository.listRanked();
        }
    };

    const songScores = {
        /**
         * @param {string} path
         * @returns {number}
         */
        get(path) {
            return songRepository.getScore(path);
        },

        /**
         * @param {string} path
         * @param {number} score
         * @returns {Promise<number>}
         */
        async set(path, score) {
            const nextScore = await songRepository.setScore(path, score);
            notify({ song: path, score: nextScore });
            return nextScore;
        },

        /**
         * @param {string} path
         * @param {number} delta
         * @returns {Promise<number>}
         */
        async change(path, delta) {
            const nextScore = await songRepository.changeScore(path, delta);
            notify({ song: path, score: nextScore });
            return nextScore;
        },

        /**
         * @param {(event: { song: string, score: number }) => void} listener
         * @returns {() => void}
         */
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };

    const queueSource = {
        /**
         * @returns {string|null}
         */
        pickWeighted() {
            const songs = songCatalog.listRanked();
            if (songs.length === 0) return null;

            const totalComputedScore = songs.reduce((sum, [, score]) => sum + 2 ** score, 0);
            let random = Math.random() * totalComputedScore;

            for (const [path, score] of songs) {
                random -= 2 ** score;
                if (random <= 0) return path;
            }

            return songs[Math.floor(Math.random() * songs.length)][0];
        }
    };

    return { songCatalog, songScores, queueSource };
}
