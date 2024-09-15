/** @type {Promise<IDBDatabase>} */
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('weighted_shuffle', 1);
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        db.createObjectStore('handles', { keyPath: 'id' });
    };
    request.onsuccess = (event) => {
        resolve(event.target.result);
    };
    request.onerror = (event) => {
        console.error(event);
        reject(event.target.error);
    };
});

/**
 * Saves a directory handle to the database.
 * @param {FileSystemDirectoryHandle} dirHandle - The directory handle to save.
 * @returns {Promise<void>} A promise that resolves when the handle is saved.
 */
export const saveDirHandle = (dirHandle) => {
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
 * Retrieves the last saved folder handle from the database.
 * @returns {Promise<FileSystemDirectoryHandle|undefined>} A promise that resolves with the folder handle or undefined if not found.
 */
export const getLastFolderHandle = () => {
    return new Promise((resolve, reject) => {
        dbPromise.then((db) => {
            const transaction = db.transaction(['handles'], 'readonly');
            const store = transaction.objectStore('handles');
            const request = store.get('lastFolder');
            request.onsuccess = (event) => resolve(event.target.result?.handle);
            request.onerror = () => reject(request.error);
        });
    });
};
