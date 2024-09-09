#!/usr/bin/env python3

import os
import random
import sqlite3
import subprocess
from datetime import datetime

# Configuration
CONFIG_DIR = os.path.expanduser('~/.config/cmus')
DB_PATH = os.path.join(CONFIG_DIR, 'weighted_shuffle.db')
TMP_DIR = '/dev/shm'
DB_TMP_PATH = os.path.join(TMP_DIR, 'weighted_shuffle_tmp.db')
LOG_PATH = os.path.join(TMP_DIR, 'weighted_shuffle.log')
MIN_SCORE = -1
DEFAULT_SCORE = 2
MAX_SCORE = 15
DISABLE_WEIGHTED_SHUFFLE_THRESHOLD = 0.3 # % of the time to let cmus handle the next song
MAX_QUEUE_SIZE = 20

####################
# Database
####################

def sql(query, params=()):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        conn.commit()

sql("""CREATE TABLE IF NOT EXISTS song_scores (
        path TEXT PRIMARY KEY,
        score INTEGER,
        last_played TIMESTAMP
    )""")

def sql_fetch(query, params=()) -> list[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = lambda cursor, row: {col[0]: row[i] for i, col in enumerate(cursor.description)}
        cursor = conn.cursor()
        cursor.execute(query, params)
        return cursor.fetchall()

####################
# Temporal Database
####################

def sql_tmp(query, params=()):
    with sqlite3.connect(DB_TMP_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        conn.commit()

sql_tmp("""CREATE TABLE IF NOT EXISTS flag_stack (
        flag_id INTEGER PRIMARY KEY,
        flag TEXT,
        timestamp TIMESTAMP
    )""")

sql_tmp("""CREATE TABLE IF NOT EXISTS queue_history (
        path TEXT,
        timestamp TIMESTAMP
    )""")

sql_tmp("""CREATE TABLE IF NOT EXISTS state_changes (
        state_id INTEGER PRIMARY KEY,
        path TEXT,
        status TEXT,
        position INTEGER,
        duration INTEGER,
        timestamp TIMESTAMP
    )""")

def sql_fetch_tmp(query, params=()) -> list[dict]:
    with sqlite3.connect(DB_TMP_PATH) as conn:
        conn.row_factory = lambda cursor, row: {col[0]: row[i] for i, col in enumerate(cursor.description)}
        cursor = conn.cursor()
        cursor.execute(query, params)
        return cursor.fetchall()

####################
# Helper Functions
####################

def log(message):
    with open(LOG_PATH, 'a') as log_file:
        log_file.write(f"{datetime.now()} - {message}\n")

def get_score(path):
    results = sql_fetch("SELECT score, last_played FROM song_scores WHERE path=?", (path,))
    if len(results) > 0:
        song = results[0]
        return song['score']
    log(f"New song: {path}")
    sql("INSERT INTO song_scores (path, score, last_played) VALUES (?, ?, ?)", (path, DEFAULT_SCORE, datetime.now()))
    return DEFAULT_SCORE

def update_score(path, increment):
    score = get_score(path)
    new_score = score + increment if MIN_SCORE <= score + increment <= MAX_SCORE else score
    now = datetime.now()
    sql("UPDATE song_scores SET score=?, last_played=? WHERE path=?", (new_score, now, path))
    log(f"Updated score for {path}: {score} -> {new_score}")
    return new_score

def get_weighted_shuffled_song():
    songs = sql_fetch("SELECT path, score, last_played FROM song_scores ORDER BY score DESC")
    
    total_computed_score = sum(2**song['score'] for song in songs)
    r = random.uniform(0, total_computed_score)
    for song in songs:
        r -= 2**song['score']
        if r <= 0:
            log(f"Picked song: {song['path']}")
            return song
    # If we reach this point, something went wrong and just pick a random song
    random_song = random.choice(songs)
    log(f"Something went wrong, picking a random song: {random_song}")
    return random_song

def get_cmus_current_state():
    output = subprocess.check_output(['cmus-remote', '-Q']).decode('utf-8')
    lines = output.strip().split('\n')
    status = {}
    for line in lines:
        if line.startswith(('status', 'file', 'position', 'duration')):
            key, value = line.split(' ', 1)
            status[key] = value.strip()
    return status

def get_playing_chance(score):
    songs = sql_fetch("SELECT path, score FROM song_scores")
    total_computed_score = sum(2**song['score'] for song in songs)
    return (2**score) / total_computed_score

def add_to_queue(song_path):
    # Check if song is already in the queue
    queue = subprocess.check_output(['cmus-remote', '-C', 'save -q -']).decode('utf-8').strip().split('\n')
    if len(queue) >= MAX_QUEUE_SIZE:
        log(f"Queue is full, skipping adding {song_path}")
        return
    tries = 0
    while song_path in queue and tries < 10:
        song_path = get_weighted_shuffled_song()['path']
        tries += 1
    # Add song to queue
    subprocess.run(['cmus-remote', '-q', song_path], check=True)
    log(f"Added to queue: {song_path}")

####################
# Main Functions
####################

def handle_state_change(new_state):
    path = new_state['file']
    status = new_state['status']
    position = int(new_state['position'])
    duration = int(new_state['duration'])

    # Get latest state changes
    state_changes = sql_fetch_tmp("""
        SELECT state_id, path, status, position, duration, timestamp
        FROM state_changes
        ORDER BY timestamp DESC
        LIMIT 1
        """)

    # Analyze state changes
    last_state = state_changes[0] if len(state_changes) > 0 else {'path': None}

    # If same song, exit
    if last_state['path'] == path:
        return

    # Insert the new status change into the state_changes table
    sql_tmp("""INSERT INTO state_changes (path, status, position, duration, timestamp)
        VALUES (?, ?, ?, ?, ?)""", (path, status, position, duration, datetime.now()))

    ignore_flags = sql_fetch_tmp("SELECT * FROM flag_stack WHERE flag='ignore' ORDER BY timestamp DESC LIMIT 1")
    if len(ignore_flags) > 0:
        sql_tmp("DELETE FROM flag_stack WHERE flag_id=?", (ignore_flags[0]['flag_id'],))
        return

    # If the song has changed, add the previous song to the queue history
    sql_tmp("INSERT INTO queue_history (path, timestamp) VALUES (?, ?)", 
        (last_state['path'], datetime.now()))

    if random.random() < DISABLE_WEIGHTED_SHUFFLE_THRESHOLD:
        # Pick a song randomly from library
        library = subprocess.check_output(['cmus-remote', '-C', 'save -l -']).decode('utf-8').strip().split('\n')
        new_song_path = random.choice(library)
    else:
        new_song_path = get_weighted_shuffled_song()['path']

    add_to_queue(new_song_path)

    # Did last song finished playing?
    # if last_state['status'] == 'playing':
    #     seconds_elapsed = (datetime.now() - datetime.fromisoformat(last_state['timestamp'])).total_seconds()
    #     estimated_position = last_state['position'] + seconds_elapsed
    #     if estimated_position > (last_state['duration'] * PLAY_COMPLETION_THRESHOLD):
    #         # The song was played until the end
    #         log(f"Song finished: {last_state['path']}")
    #         log(f"Duration: {last_state['duration']}, Position: {last_state['position']}, Estimated Position: {estimated_position}")
    #         last_state['status'] = 'finished'
    #         sql_tmp("UPDATE state_changes SET status='finished' WHERE state_id=?", (last_state['state_id'],))
    #        
    #             sync_queue()
    #             sql_tmp("INSERT INTO flag_stack (flag, timestamp) VALUES (?, ?)", ('ignore', datetime.now()))
    #             subprocess.run(['cmus-remote', '-n'], check=True)
    #             sql_tmp("DELETE FROM state_changes WHERE state_id=?", (new_state['state_id'],))
    #             log("Updated CMUS queue")

    get_score(path) # Ensure song is in the database

def handle_previous():
    # Get the previous song from the queue history
    result = sql_fetch_tmp("SELECT path FROM queue_history ORDER BY timestamp DESC LIMIT 1")
    if len(result) == 0:
        log("No previous song in queue history")
        subprocess.run(['cmus-remote', '-r'], check=True)
        return

    previous_song = result[0]['path']

    # Get the currently playing song
    current_song = get_cmus_current_state()['file']

    # Remove the previous song from the queue history
    sql_tmp("DELETE FROM queue_history ORDER BY timestamp DESC LIMIT 1")

    # Prepend the currently playing song to the cmus queue
    subprocess.run(['cmus-remote', '-C', f"add -Q {current_song}"], check=True)
    log(f"Prepended to queue: {current_song}")

    # Play the previous song
    subprocess.run(['cmus-remote', '-C', f"player-play {previous_song}"], check=True)

def main():
    try:
        import sys
        command = sys.argv[1]
        if command == 'previous':
            sql_tmp("INSERT INTO flag_stack (flag, timestamp) VALUES (?, ?)", ('ignore', datetime.now()))
            handle_previous()
            return

        elif command == 'score':
            score_increment = int(sys.argv[2])
            song_path = get_cmus_current_state()['file']
            score = update_score(song_path, score_increment)

            # Send notification

            play_probability = get_playing_chance(score) * 100
            # subprocess.run(['notify-send', f"Upvoted - {score} score - {play_probability:.2f}% chance", '-h', 'string:x-canonical-private-synchronous:weighted_shuffle'])
            # use gdbus to send notification
            notifications = sql_fetch_tmp("SELECT * FROM flag_stack WHERE flag='notification_id' ORDER BY timestamp DESC LIMIT 1")
            if len(notifications) > 0:
                notification_id = notifications[0]['flag_id']
            else:
                notification_id = 0

            output = subprocess.check_output(['gdbus', 'call', '--session', '--dest', 'org.freedesktop.Notifications', '--object-path', '/org/freedesktop/Notifications', '--method', 'org.freedesktop.Notifications.Notify',
                'weighted_shuffle',         # App_name
                f"{notification_id}",       # Notification_id
                'audio-headphones',         # Icon
                f"Upvoted - {score} score", # Title
                f"{play_probability:.2f}% chance of playing", # Body
                '[]', '{}', '5000'])
            
            new_notification_id = int(output.decode('utf-8').split(' ')[1].split(',')[0])
            if notification_id != new_notification_id:
                sql_tmp("DELETE FROM flag_stack WHERE flag_id=?", (notification_id,))
                sql_tmp("DELETE FROM flag_stack WHERE flag_id=?", (new_notification_id,))
                sql_tmp("INSERT INTO flag_stack (flag_id, flag, timestamp) VALUES (?, ?, ?)", (new_notification_id, "notification_id", datetime.now()))

        else:
            cmus_state = get_cmus_current_state()
            handle_state_change(cmus_state)
            log("------------------------")

    except Exception as e:
        import traceback
        log(traceback.format_exc())
        raise e

if __name__ == "__main__":
    main()