declare module 'bun:test' {
    export const beforeEach: any;
    export const describe: any;
    export const expect: any;
    export const test: any;
}

interface FileSystemWritableFileStream {
    write(data: BufferSource | Blob | string): Promise<void>;
    close(): Promise<void>;
}

interface FileSystemFileHandle {
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle {
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface Window {
    showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
}

interface YouTubePlayer {
    getDuration(): number;
    getCurrentTime(): number;
    getPlayerState(): number;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    pauseVideo(): void;
    playVideo(): void;
    loadVideoById(videoId: string): void;
}

interface YouTubeIframeApi {
    Player: new (element: HTMLElement, options: object) => YouTubePlayer;
    PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
    };
}

declare function initSqlJs(options: {
    locateFile(filename: string): string;
}): Promise<{
    Database: new (data?: Uint8Array) => any;
}>;
