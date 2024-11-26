# Weighted Shuffle Web Music Player

This web application provides a music player with weighted shuffle functionality. It prioritizes songs based on scores that you assign to them.

## How It Works

The application uses a SQLite database (via sql.js) to store song scores. When shuffling, songs with higher scores have an exponentially higher probability of being played (weight is calculated as $2^{score}$).

## Installation

1. Clone this repository or download the source code.
2. Ensure you have a modern web browser that supports the File System Access API.
3. Run a web server in the project directory. For example, you can use the following command to serve the files in the current directory:
   ```
   python3 -m http.server
   ```
   or
   ```
   npx http-server
   ```

## Usage

1. Click "Select Folder" to choose your music directory.
2. The application will scan for audio files and add them to the database.
3. Use the upvote/downvote buttons to adjust the score of songs.
4. The playlist will automatically fill with songs based on their scores.

## Configuration

You can adjust the following parameters in the `config.js` file:

- `MIN_SCORE`: Minimum score for a song (default: -1)
- `DEFAULT_SCORE`: Default score for new songs (default: 2)
- `MAX_SCORE`: Maximum score for a song (default: 15)
- `MAX_PLAYLIST_SIZE`: Maximum number of songs in the playlist (default: 20)

## Technical Details

- The application uses the File System Access API to read music files from the user's local system.
- Song scores and metadata are stored in a SQLite database using sql.js.
- The weighted shuffle algorithm uses exponential weighting to give even more weight to higher-scored songs.
- The Media Session API is used to integrate with system-wide media buttons.

## Browser Compatibility

This application requires a modern web browser with support for:

- File System Access API
- ES6+ JavaScript features
- Media Session API

It has been tested on Chromium-based browsers and does not work on Firefox

## Note

This is a client-side only application. All data is stored locally in your browser and on your file system. No data is sent to any server.
