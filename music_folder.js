const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.wma', '.ape', '.alac', '.aiff', '.mid', '.midi'];

/**
 * Recursively lists audio files within a selected folder.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} path
 * @returns {Promise<string[]>}
 */
export async function scanAudioFiles(dirHandle, path = '') {
    const files = [];

    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            const fileHandle = /** @type {FileSystemFileHandle} */ (entry);
            const fileName = fileHandle.name.toLowerCase();
            const fileExtension = '.' + fileName.split('.').pop();

            if (AUDIO_EXTENSIONS.includes(fileExtension)) {
                files.push(`${path}${fileHandle.name}`);
                continue;
            }

            try {
                const file = await fileHandle.getFile();
                if (file.type.startsWith('audio/')) {
                    files.push(`${path}${fileHandle.name}`);
                }
            } catch (error) {
                console.warn(`Error checking file type for ${fileHandle.name}:`, error);
            }
            continue;
        }

        files.push(...await scanAudioFiles(
            /** @type {FileSystemDirectoryHandle} */ (entry),
            `${path}${entry.name}/`
        ));
    }

    return files;
}

/**
 * Opens a song file from a selected folder.
 * @param {FileSystemDirectoryHandle} folderHandle
 * @param {string} path
 * @returns {Promise<File>}
 */
export async function openSongFile(folderHandle, path) {
    const pathParts = path.split('/');
    let currentFolder = folderHandle;
    /** @type {FileSystemFileHandle} */
    let fileHandle;

    for (const part of pathParts) {
        if (!part) continue;

        if (part === pathParts.at(-1)) {
            fileHandle = await currentFolder.getFileHandle(part);
        } else {
            currentFolder = await currentFolder.getDirectoryHandle(part);
        }
    }

    return fileHandle.getFile();
}
