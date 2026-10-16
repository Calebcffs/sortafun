/* Piano Rush campaign: the ten songs, shared by the game (piano.html) and the
 * recording studio on admin.html (piano-studio.js), so the two never drift.
 *   vid: the official NoCopyrightSounds upload on YouTube (played by YouTube's own player)
 *
 * The notes are tapped in by hand in the studio and published to Firestore
 * (piano_charts/<vid>, readable by anyone, writable only by the admin account).
 * PIANO_CHARTS below is the fallback the game uses if Firestore can't be
 * reached: { "<vid>": { offset: ms, notes: [[ms into the video, lane 0-3], ...] } }. */
window.PIANO_LEVELS = [
  { song: "Feel Good", by: "Syn Cole", vid: "q1ULJ92aldE" },
  { song: "Sky High", by: "Elektronomia", vid: "TW9d8vYrVFQ" },
  { song: "Heroes Tonight (feat. Johnning)", by: "Janji", vid: "3nQNiWdeH2Q" },
  { song: "Shine", by: "Spektrem", vid: "n4tK7LYFxI0" },
  { song: "On & On (feat. Daniel Levi)", by: "Cartoon", vid: "K4DyBUG242c" },
  { song: "Symbolism", by: "Electro-Light", vid: "__CRWE-L45k" },
  { song: "Mortals (feat. Laura Brehm)", by: "Warriyo", vid: "yJg-Y5byMMw" },
  { song: "Invincible", by: "DEAF KEV", vid: "J2X5mJ3HDYE" },
  { song: "Blank", by: "Disfigure", vid: "p7ZsBPK656s" },
  { song: "My Heart", by: "Different Heaven & EH!DE", vid: "jK2aIUmmdP4" }
];
window.PIANO_CHARTS = {
};
