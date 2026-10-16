/* Piano Rush campaign notes, one entry per NCS track (keyed by YouTube video id).
 * Made by hand in record mode (piano.html?record): the "save file" button downloads
 * piano-<video id>.json, and its { offset, notes } go in here.
 *   offset: ms added to every note (lines the taps up with the music)
 *   notes:  [[ms into the video, lane 0-3], ...]
 * A level with no entry shows "no notes yet". */
window.PIANO_CHARTS = {
};
