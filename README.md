
# Weighted Shuffle for cmus

This script adds weighted shuffle functionality to cmus (C* Music Player). It prioritizes songs based on a score that you assign to them on the fly.

## How It Works

The script attaches to cmus via the `status_display_program` option to keep track of the songs played, and each time a track transition occurs a new song is picked by weighted shuffle (weight is calculated as `2 ** score`) and added to the queue. When shuffling, songs with higher scores have an exponentially higher probability of being played.

The script provides special commands to increase or decrease the score of the current song and to play the previous song:

- `~/.config/cmus/weighted_shuffle.py score 1` to increase current song score
- `~/.config/cmus/weighted_shuffle.py score -1` to decrease current song score
- `~/.config/cmus/weighted_shuffle.py previous` to play the previously played song, because cmus built-in way to do it ignores the queue and plays whatever was played before using the queue.



## Installation

1. Ensure the script is executable and in your cmus config directory:
   ```
   chmod +x ~/.config/cmus/weighted_shuffle.py
   ```

2. Add these lines to your cmus config file (`~/.config/cmus/rc`), or run them in cmus by typing them in the cmus shell (type `:` to open it):
   ```
   set status_display_program=~/.config/cmus/weighted_shuffle.py
   bind -f common ] shell ~/.config/cmus/weighted_shuffle.py score 1
   bind -f common [ shell ~/.config/cmus/weighted_shuffle.py score -1
   bind -f common p shell ~/.config/cmus/weighted_shuffle.py previous
   ```

3. In cmus, use the following commands:
   - `]`: Increase the score of the current song
   - `[`: Decrease the score of the current song
   - `p`: Go to the previous song (using the script's queue history)

The script will automatically manage the queue based on song scores and your listening history.

## Note

This script adds functionality to cmus without changing its default behavior. It provides an alternative `previous` command (`p`) that takes into account the history of songs played in the queue, which the default cmus behavior doesn't track.
