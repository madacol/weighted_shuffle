/**
 * @param {string} value
 * @returns {URL|null}
 */
function parseHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    } catch {
        return null;
    }
}

/**
 * @param {string} value
 * @returns {string|null}
 */
export function getYouTubeVideoId(value) {
    const url = parseHttpUrl(value);
    if (!url) return null;

    const host = url.hostname.replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);

    let videoId = null;
    if (host === 'youtu.be') {
        videoId = parts[0] || null;
    } else if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
        if (url.pathname === '/watch') {
            videoId = url.searchParams.get('v');
        } else if (['embed', 'shorts'].includes(parts[0])) {
            videoId = parts[1] || null;
        }
    }

    return videoId && /^[A-Za-z0-9_-]{6,}$/.test(videoId) ? videoId : null;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isYouTubeMusicLink(value) {
    const url = parseHttpUrl(value);
    if (!url) return false;

    return url.hostname.replace(/^www\./, '') === 'music.youtube.com' && getYouTubeVideoId(value) !== null;
}

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeYouTubeMusicLink(value) {
    const videoId = getYouTubeVideoId(value.trim());
    if (!videoId) {
        throw new Error('Paste a YouTube Music song link with a video id.');
    }

    return `https://music.youtube.com/watch?v=${videoId}`;
}

/**
 * @param {string} source
 * @returns {string}
 */
export function getSongDisplayName(source) {
    if (isYouTubeMusicLink(source)) {
        return `YouTube Music ${getYouTubeVideoId(source)}`;
    }

    return source.split('/').pop().replace(/\.[^.]+$/, '');
}
