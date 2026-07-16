/** @type {Promise<IDBDatabase>} */
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('weighted_shuffle', 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('handles', { keyPath: 'id' });
    };
    request.onsuccess = () => {
        resolve(request.result);
    };
    request.onerror = () => {
        console.error(request.error);
        reject(request.error);
    };
});

/**
 * Persists the user's last selected music folder.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<void>}
 */
export const rememberSelectedFolder = (dirHandle) => {
    return new Promise((resolve, reject) => {
        dbPromise.then((db) => {
            const transaction = db.transaction(['handles'], 'readwrite');
            const store = transaction.objectStore('handles');
            const request = store.put({ id: 'lastFolder', handle: dirHandle });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    });
};

/**
 * Recalls the user's last selected music folder.
 * @returns {Promise<FileSystemDirectoryHandle|undefined>}
 */
export const recallSelectedFolder = () => {
    return new Promise((resolve, reject) => {
        dbPromise.then((db) => {
            const transaction = db.transaction(['handles'], 'readonly');
            const store = transaction.objectStore('handles');
            const request = store.get('lastFolder');
            request.onsuccess = () => resolve(request.result?.handle);
            request.onerror = () => reject(request.error);
        });
    });
};
