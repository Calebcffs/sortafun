/* Sushi Goes Round: static data. Pure, no DOM, loads in node too (balance bot).
 * Recipes, ingredients, customer types, the 15 career days, belt geometry. */
(function () {
  "use strict";
  var root = typeof window !== "undefined" ? window : globalThis;
  var SG = root.SG = root.SG || {};

  // ---------- ingredients (price is for a lot of 10) ----------
  var INGS = [
    { id: "R", name: "rice",   lot: 10, price: 30,  col: "#fffaf0", key: "1" },
    { id: "N", name: "nori",   lot: 10, price: 40,  col: "#1f3a2a", key: "2" },
    { id: "E", name: "roe",    lot: 10, price: 90,  col: "#ff7a1a", key: "3" },
    { id: "S", name: "salmon", lot: 10, price: 100, col: "#ff8f7a", key: "4" },
    { id: "P", name: "shrimp", lot: 10, price: 100, col: "#ffb38a", key: "5" },
    { id: "U", name: "unagi",  lot: 10, price: 130, col: "#8a4b22", key: "6" },
  ];
  var ING = {};
  INGS.forEach(function (g) { ING[g.id] = g; });

  var SAKE = { id: "sake", name: "sake", lot: 2, price: 40 };
  var RUSH_FEE = 50;
  var DELIVERY_SECS = 7;
  var STOCK_CAP = 40;
  var MAT_MAX = 4;

  // ---------- recipes ----------
  // tier decides the plate colour: 0 white, 1 red, 2 blue, 3 gold
  var RECIPES = [
    { id: "onigiri",  name: "Onigiri",         need: "RRN",  price: 35,  tier: 0 },
    { id: "cali",     name: "California Roll", need: "RNE",  price: 55,  tier: 0 },
    { id: "gunkan",   name: "Gunkan Maki",     need: "RNEE", price: 75,  tier: 1 },
    { id: "salmon",   name: "Salmon Roll",     need: "RNSS", price: 80,  tier: 1 },
    { id: "shrimp",   name: "Shrimp Sushi",    need: "RPP",  price: 70,  tier: 1 },
    { id: "combo",    name: "Combo Sushi",     need: "RRSE", price: 85,  tier: 1 },
    { id: "unagi",    name: "Unagi Roll",      need: "RNUU", price: 100, tier: 2 },
    { id: "dragon",   name: "Dragon Roll",     need: "RNUE", price: 95,  tier: 2 },
    { id: "rainbow",  name: "Rainbow Roll",    need: "RNSP", price: 95,  tier: 2 },
    { id: "emperor",  name: "Emperor Roll",    need: "RRPU", price: 110, tier: 3 },
  ];
  var REC = {};
  RECIPES.forEach(function (r, i) { r.idx = i; r.key = sortKey(r.need); REC[r.id] = r; });
  function sortKey(s) { return s.split("").sort().join(""); }
  var BY_KEY = {};
  RECIPES.forEach(function (r) { BY_KEY[r.key] = r; });
  // which recipe is on the mat (array of ingredient ids), among the allowed ids; null if none
  function matchRecipe(mat, allowed) {
    var r = BY_KEY[sortKey(mat.join(""))];
    if (!r) return null;
    if (allowed && allowed.indexOf(r.id) < 0) return null;
    return r;
  }
  function cost(r) {
    var c = 0;
    r.need.split("").forEach(function (g) { c += ING[g].price / ING[g].lot; });
    return c;
  }

  // ---------- customers ----------
  // pat: patience multiplier. tip: tip multiplier. price: dish price multiplier.
  var TYPES = {
    normal:  { id: "normal",  pat: 1.0,  tip: 1.0, price: 1.0,  rep: 20 },
    granny:  { id: "granny",  pat: 1.45, tip: 1.1, price: 1.0,  rep: 20 },
    kid:     { id: "kid",     pat: 0.75, tip: 0.8, price: 1.0,  rep: 15, dishes: [1, 1], cheap: true },
    salary:  { id: "salary",  pat: 0.62, tip: 1.5, price: 1.0,  rep: 20 },
    foodie:  { id: "foodie",  pat: 1.1,  tip: 1.1, price: 1.0,  rep: 20, dishes: [2, 3] },
    tourist: { id: "tourist", pat: 1.0,  tip: 1.0, price: 1.35, rep: 20 },
    critic:  { id: "critic",  pat: 0.95, tip: 2.2, price: 1.2,  rep: 35, dishes: [3, 3] },
  };

  // ---------- belt + room geometry (shared by sim and art) ----------
  var BELT = { x0: 80, len: 800, r: 36, y: 300, slots: 14, entryU: 30 };
  BELT.L = 2 * BELT.len + 2 * Math.PI * BELT.r;
  BELT.spacing = BELT.L / BELT.slots;
  var SEAT_X = [167.5, 292.5, 417.5, 542.5, 667.5, 792.5];
  // belt position u -> {x, y, top (on the visible lane), a (heading)}
  function beltXY(u) {
    var L = BELT.L, len = BELT.len, r = BELT.r, arc = Math.PI * r;
    u = ((u % L) + L) % L;
    if (u < len) return { x: BELT.x0 + u, y: BELT.y, top: true, a: 0 };
    u -= len;
    if (u < arc) { var a = -Math.PI / 2 + u / r; return { x: BELT.x0 + len + Math.cos(a) * r, y: BELT.y + r + Math.sin(a) * r, top: false, arc: true, a: a + Math.PI / 2 }; }
    u -= arc;
    if (u < len) return { x: BELT.x0 + len - u, y: BELT.y + 2 * r, top: false, a: Math.PI };
    u -= len;
    var a2 = Math.PI / 2 + u / r;
    return { x: BELT.x0 + Math.cos(a2) * r, y: BELT.y + r + Math.sin(a2) * r, top: false, arc: true, a: a2 + Math.PI / 2 };
  }

  // click targets in the 960x600 scene (art draws them there, game hit-tests them)
  var UI = {
    mat:   { x: 140, y: 488, w: 190, h: 128 },
    bowl:  function (i) { return { x: 285 + i * 98, y: 488, r: 41 }; },
    book:  { x: 892, y: 352, r: 28 },
    phone: { x: 892, y: 414, r: 28 },
    sake:  { x: 892, y: 486, r: 28 },
    bin:   { x: 892, y: 552, r: 26 },
    chute: { x: 52,  y: 300 },
    door:  { x: 24, y: 214 },
    cat:   { x: 905, y: 238 },
  };

  // ---------- the career: 15 days ----------
  // dur: seconds open. gap: average seconds between customers. speed: belt px/s.
  // pat: seconds per star. mix: customer type weights. goal: revenue to pass.
  // menu: how many recipes are on (RECIPES order). multi: chance of a 2 dish order.
  var DAYS = [
    { title: "Trial by Rice",     seats: 3, dur: 75,  gap: 12,  speed: 60, pat: 11,  menu: 2,  multi: 0,    max: 1, goal: 190, mix: { normal: 1 },
      note: "new chef. do not burn the rice. do not cry in front of the customers. -H",
      tip: "read the bubble over each customer, check the recipe book, click the ingredients, then click the mat. when they leave, click their empty plates to clear the seat." },
    { title: "Roe Your Boat",     seats: 3, dur: 85,  gap: 10.5, speed: 62, pat: 10.5, menu: 3, multi: 0.1,  max: 2, goal: 390, mix: { normal: 3, granny: 1 },
      note: "the roe truck is slow. phone early, not when the shelf is empty. -H",
      tip: "supplies run out. click the phone to order more. rush delivery costs 50 yen but is instant." },
    { title: "Something Fishy",   seats: 4, dur: 90,  gap: 9.5,  speed: 64, pat: 10,  menu: 4,  multi: 0.15, max: 2, goal: 570, mix: { normal: 3, granny: 1, kid: 1 },
      note: "salmon came in. someone told the kids. -H",
      tip: "an impatient customer? click the sake, then click them. they get a full set of stars back, and merry people tip well." },
    { title: "Shrimp o'Clock",    seats: 4, dur: 95,  gap: 9,    speed: 66, pat: 9.5, menu: 5,  multi: 0.25, max: 2, goal: 780, mix: { normal: 3, granny: 1, kid: 1, salary: 1 },
      note: "shrimp is on. the salaryman crowd is on their lunch break. be quick. -H",
      tip: "salarymen are in a hurry but tip very well." },
    { title: "Friday Night",      seats: 5, dur: 100, gap: 8,    speed: 68, pat: 9,   menu: 6,  multi: 0.3,  max: 2, goal: 1300, mix: { normal: 3, granny: 1, kid: 1, salary: 2 }, rush: 40,
      note: "friday. it gets loud around eight. the cat will let you know. -H",
      tip: "when the gong sounds, rush hour: customers arrive twice as fast for a while." },
    { title: "The Eel Deal",      seats: 5, dur: 105, gap: 7.8,  speed: 70, pat: 9,   menu: 7,  multi: 0.35, max: 2, goal: 1700, mix: { normal: 3, granny: 1, kid: 1, salary: 2, foodie: 1 }, rush: 45,
      note: "unagi is expensive. so is rent. make it count. -H",
      tip: "foodies order two or three dishes. they wait a little longer for it." },
    { title: "Dragon Week",       seats: 5, dur: 110, gap: 7.4,  speed: 72, pat: 8.8, menu: 8,  multi: 0.35, max: 3, goal: 2050, mix: { normal: 3, granny: 1, kid: 1, salary: 2, foodie: 2 }, rush: 50,
      note: "dragon rolls are the special. the tourists saw it on the internet. -H",
      tip: "" },
    { title: "The Regulars",      seats: 6, dur: 115, gap: 7.0,  speed: 74, pat: 8.6, menu: 8,  multi: 0.4,  max: 3, goal: 2250, mix: { normal: 3, granny: 2, kid: 1, salary: 2, foodie: 2 }, rush: 55,
      note: "six seats now. i hired a carpenter. do not look at his invoice. -H",
      tip: "" },
    { title: "Tourist Season",    seats: 6, dur: 120, gap: 6.6,  speed: 76, pat: 8.4, menu: 9,  multi: 0.4,  max: 3, goal: 2550, mix: { normal: 3, granny: 1, kid: 1, salary: 2, foodie: 2, tourist: 3 }, rush: 55,
      note: "rainbow rolls are in. the tourists pay more, and photograph everything. -H",
      tip: "tourists pay extra for every plate." },
    { title: "Critic's Choice",   seats: 6, dur: 125, gap: 6.4,  speed: 76, pat: 8.2, menu: 9,  multi: 0.45, max: 3, goal: 2700, mix: { normal: 3, granny: 1, kid: 1, salary: 2, foodie: 2, tourist: 2 }, rush: 60, crits: [50],
      note: "a food critic is coming. i do not know which one. they all look like that. -H",
      tip: "the critic orders three dishes, tips huge, and ruins your reputation if they storm out." },
    { title: "Rainbow Connection", seats: 6, dur: 125, gap: 6.2, speed: 78, pat: 8,   menu: 10, multi: 0.45, max: 3, goal: 2800, mix: { normal: 3, granny: 1, kid: 1, salary: 2, foodie: 2, tourist: 2 }, rush: 55,
      note: "the emperor roll goes on the menu. we have never made one. good luck. -H",
      tip: "" },
    { title: "Full House",        seats: 6, dur: 130, gap: 5.8,  speed: 80, pat: 7.8, menu: 10, multi: 0.5,  max: 3, goal: 2850, mix: { normal: 3, granny: 1, kid: 1, salary: 3, foodie: 2, tourist: 2 }, rush: 40, crits: [90],
      note: "full house all night. do not stop. -H",
      tip: "" },
    { title: "Sold Out",          seats: 6, dur: 130, gap: 5.6,  speed: 82, pat: 7.6, menu: 10, multi: 0.5,  max: 3, goal: 2900, mix: { normal: 3, granny: 1, kid: 1, salary: 3, foodie: 3, tourist: 2 }, rush: 60,
      note: "i overbooked. do not tell the customers. -H",
      tip: "" },
    { title: "Rainy Monday",      seats: 6, dur: 135, gap: 5.4,  speed: 84, pat: 7.4, menu: 10, multi: 0.55, max: 3, goal: 2950, mix: { normal: 3, granny: 1, kid: 1, salary: 3, foodie: 3, tourist: 2 }, rush: 45, crits: [75], slowTruck: 1.6,
      note: "it is raining. the truck will be late. stock up now. -H",
      tip: "rain: deliveries take longer today." },
    { title: "Grand Finale",      seats: 6, dur: 150, gap: 5.2,  speed: 86, pat: 7.2, menu: 10, multi: 0.6,  max: 3, goal: 3100, mix: { normal: 3, granny: 1, kid: 1, salary: 3, foodie: 3, tourist: 3 }, rush: 55, crits: [45, 105],
      note: "two critics tonight, and the owner of the whole chain is eating at the end of the belt. -H",
      tip: "" },
  ];

  // ---------- helpers for the other modes ----------
  // Endless Service ramps with time t (seconds open); returns the scenario overrides
  function endlessParams(t) {
    var m = Math.min(10, 2 + Math.floor(t / 40));
    var seats = Math.min(6, 3 + Math.floor(t / 45));
    var k = Math.min(1, t / 900);
    return {
      seats: seats, menu: m,
      gap: Math.max(2.9, 11.5 - 8.6 * k * (0.9 + 0.1 * Math.min(1, t / 300))),
      speed: Math.min(95, 60 + t / 10),
      pat: Math.max(5.2, 11 - 5.8 * k),
      multi: Math.min(0.6, 0.05 + t / 700),
      max: t > 200 ? 3 : t > 60 ? 2 : 1,
      mix: mixFor(m),
    };
  }
  function mixFor(menu) {
    var mix = { normal: 3 };
    if (menu >= 3) mix.granny = 1;
    if (menu >= 4) mix.kid = 1;
    if (menu >= 5) mix.salary = 2;
    if (menu >= 7) mix.foodie = 2;
    if (menu >= 9) mix.tourist = 2;
    return mix;
  }

  SG.data = {
    INGS: INGS, ING: ING, SAKE: SAKE, RUSH_FEE: RUSH_FEE, DELIVERY_SECS: DELIVERY_SECS, STOCK_CAP: STOCK_CAP, MAT_MAX: MAT_MAX,
    RECIPES: RECIPES, REC: REC, matchRecipe: matchRecipe, sortKey: sortKey, cost: cost,
    TYPES: TYPES, BELT: BELT, SEAT_X: SEAT_X, beltXY: beltXY, UI: UI,
    DAYS: DAYS, endlessParams: endlessParams, mixFor: mixFor,
    PLATE_LAPS: 2,
  };
})();
