/* Rhythm Rush (rhythm.html): the songs a level can be made for, shared by
 * the game and the recording studio (piano-studio.js, on rhythm.html for
 * players and on admin.html for Caleb's official levels), so they never drift.
 *   vid: the official upload on YouTube (played by YouTube's own player). NoCopyrightSounds
 *   unless ncs: false (then it's the label's own upload, credited without the NCS line)
 * firestore.rules lists the same video ids: a level for any other video is refused.
 * (The file keeps its old name: it started as Piano Rush's campaign.) */
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
  { song: "My Heart", by: "Different Heaven & EH!DE", vid: "jK2aIUmmdP4" },
  { song: "MOTION (feat. Juicy J)", by: "CORTIS", vid: "h7ITAdTxdxM", ncs: false }
];
