/* taka-san dinner simulator: everything anyone says, and the songs.
 *
 * House voice: lowercase-leaning, plain ASCII, no em dashes, no curly quotes.
 * The company is "Sankyu Frontline" (SFSG = Sankyu Frontline Singapore); the
 * people are the real team's first names, with Caleb's say-so.
 *
 * Every answer is [what you say, favour, insight, what taka-san says back].
 * favour is the score that matters (0 to 100, you start on 50); insight is
 * what you learn about HQ (bonus points, and the best ending needs some).
 */
window.TAKA_DATA = (function () {
  "use strict";

  // who's at the table: id, name, role, rank (0 = most senior)
  var PEOPLE = [
    { id: "taka", name: "Taka-san", role: "MD, over from HQ", rank: 0 },
    { id: "jasmine", name: "Jasmine", role: "director", rank: 1 },
    { id: "kimhuat", name: "Kim Huat", role: "director, engineering", rank: 1 },
    { id: "hiroto", name: "Hiroto", role: "assistant manager", rank: 2 },
    { id: "benson", name: "Benson", role: "strategy", rank: 3 },
    { id: "clarissa", name: "Clarissa", role: "marketing", rank: 3 },
    { id: "xinle", name: "Xin Le", role: "strategy / HR", rank: 4 },
    { id: "xinyu", name: "Xinyu", role: "strategy", rank: 4 },
    { id: "serene", name: "Serene", role: "R&D", rank: 4 },
    { id: "caleb", name: "Caleb", role: "BD & sales (you)", rank: 5 },
  ];

  // in the car: taka-san has been thinking on the plane
  var DRIVE = [
    { q: "caleb-kun. what is the difference between a road and a journey?",
      a: [["a road is where you drive. a journey is who is in the car.", 6, 0, "hm. yes. good answer. keep driving."],
          ["the journey has more traffic.", 2, 0, "ha. singapore joke. ok."],
          ["the road has a speed limit.", -2, 0, "...you are very practical."]] },
    { q: "if a site office is empty, is it still an office?",
      a: [["it's waiting for the next project. so yes, it's an office with potential.", 6, 1, "an office with potential. i will use this in tokyo."],
          ["it's a container at that point, taka-san.", 1, 0, "a very expensive container."],
          ["i try not to think about empty site offices.", -2, 0, "then who will think about them?"]] },
    { q: "the traffic light is red. do you think it knows we are late?",
      a: [["it knows. it just has other people to look after too.", 5, 0, "like a good manager. very wise light."],
          ["we're not late yet, taka-san.", 2, 0, "yet. you said yet."],
          ["lights don't know anything.", -3, 0, "so serious, caleb-kun."]] },
    { q: "what is more important. the product, or the promise?",
      a: [["the promise. the product is how we keep it.", 7, 1, "...i am going to write that down."],
          ["the product. customers can't sit in a promise.", 3, 0, "ha. also true. contractors are very literal."],
          ["whichever one the customer asks about first.", 0, 0, "hm. a salesman answer."]] },
    { q: "why do people in singapore queue for food they have never tried?",
      a: [["if other people are queueing, it must be good. it's trust, really.", 5, 1, "trust. yes. this is also how sales works."],
          ["kiasu. we're scared of missing out.", 4, 0, "kiasu! i know this word now. very useful."],
          ["i don't queue. i just eat at the office.", -2, 0, "caleb-kun. you must eat properly."]] },
    { q: "a three storey unit. is it a building, or three small dreams stacked up?",
      a: [["on a tight site it's the only dream that fits.", 6, 2, "ha. that is why the contractors keep asking for it."],
          ["it's a building. with a very good staircase.", 3, 0, "the staircase is important. yes."],
          ["it's a lot of paperwork.", 0, 0, "...also true."]] },
    { q: "when you are old, what do you want people to remember about your work?",
      a: [["that it was done properly, and people liked working with me.", 6, 0, "good. that is enough for anybody."],
          ["that i hit my targets.", 1, 0, "targets change every year, caleb-kun."],
          ["i'd rather not be remembered for work.", -1, 0, "hm. honest. a little sad."]] },
    { q: "if you could ask the whole company one question, what would you ask?",
      a: [["what do our customers need that we don't make yet?", 6, 2, "this is the right question. HQ also asks it."],
          ["who took my stapler?", 3, 0, "ha! every office has this mystery."],
          ["when is the next bonus?", -3, 0, "...everyone asks this one."]] },
    { q: "do you think a car remembers every road it has driven?",
      a: [["maybe in the tyres. every road leaves a little bit.", 5, 0, "poetry. from a sales department."],
          ["the GPS does.", 1, 0, "the GPS is very sad, then. it remembers everything."],
          ["i hope it forgets the one to jurong.", 3, 0, "ha! everyone hates that road."]] },
  ];

  // at the table, in order. "opener" first, then the rest as the night goes
  // (beer >= 3 unlocks the candid ones). kind "ask" = your turn to ask him.
  var DINNER = [
    { kind: "you", who: "caleb", q: "taka-san has sat down. what do you say first?",
      a: [["so taka-san, about export sales this quarter...", -3, 1, "...caleb-kun. we have not even ordered."],
          ["how was the trip? is singapore different from your last visit?", 5, 0, "busier. and hotter. but the food is still the best."],
          ["have you had any good local food this time?", 6, 0, "chilli crab! jasmine took me. very messy. very good."]] },
    { q: "caleb-kun, how is indonesia going?",
      a: [["a few promising partners. jakarta is slow but the projects are big.", 5, 3, "slow but big. like a whale. keep going."],
          ["busy! i'm juggling a lot of meetings.", 2, 0, "busy is not the same as good, caleb-kun."],
          ["honestly it's hard. nobody replies.", -2, 1, "in the beginning nobody replies. that is normal."]] },
    { q: "why do the contractors here keep asking for three storey units?",
      a: [["land is tight. sites are small, so everybody builds up. they expect stacking.", 6, 4, "i see. in japan the sites are wider. this helps me."],
          ["singaporeans like a view.", 1, 0, "ha. a site office with a view."],
          ["no idea, they just do.", -4, 0, "you should know this one, caleb-kun."]] },
    { q: "what are customers saying about our products, compared to the others?",
      a: [["they like the quality. price and lead time are where we lose deals.", 6, 5, "price and lead time. yes. i will tell HQ."],
          ["everyone loves us.", -2, 0, "...everyone? really?"],
          ["they want everything cheaper and faster.", 2, 2, "everyone wants this. but thank you."]] },
    { kind: "ask", q: "your turn. what do you ask taka-san?",
      a: [["what's the biggest growth opportunity for SFSG in the next few years?", 5, 5, "ASEAN. and you are sitting in the middle of it."],
          ["is there anything the other overseas offices do well that we could learn from?", 6, 8, "australia is very good at following up. vietnam is very fast. we can learn from both."],
          ["do you like singapore more than tokyo?", 2, 0, "the food here. the trains in tokyo. the weather, neither."]] },
    { q: "if you were president of sankyu frontline tomorrow, what would you change?",
      a: [["everything.", -12, 0, "...everything. i see. more beer, please."],
          ["i'd keep the quality, and shape more of the range around what this market asks for.", 10, 3, "a careful answer. also a correct one."],
          ["i'd give everyone a four day week.", 0, 0, "ha. HR would faint."]] },
    { kind: "ask", q: "your turn again. what do you ask?",
      a: [["when you first joined the company, what surprised you most?", 9, 6, "the founder answered every letter by hand. every one. i still think about that."],
          ["what do you look for in someone to send overseas?", 6, 5, "someone who listens more than they talk. and eats everything."],
          ["how much do you earn?", -10, 0, "caleb-kun!"]] },
    { beer: 3, q: "caleb-kun. be honest. what do the young people think of the company?",
      a: [["they believe in the product. they want to see where it's going.", 8, 3, "good. then i must tell them where it is going."],
          ["some of them are thinking of leaving.", 0, 2, "hm. thank you for telling me. who? no. don't answer."],
          ["the free drinks at the office are really good.", 2, 0, "ha. this is not what i asked."]] },
    { beer: 3, q: "what are our customers not telling us?",
      a: [["that they'd buy more if we moved faster on custom layouts.", 8, 6, "yes. this, i think, is true everywhere."],
          ["that they'd like a discount.", 1, 1, "they tell us this every day, caleb-kun."],
          ["i don't want to get anyone in trouble.", -2, 0, "nobody is in trouble. it is dinner."]] },
    { beer: 4, q: "last one. what do you want to be doing in five years?",
      a: [["running a bigger market for the company. maybe one you haven't opened yet.", 8, 2, "ambitious. good. i will remember this."],
          ["still eating dinners like this one.", 5, 0, "ha! then work hard, and there will be many."],
          ["not sure yet.", 0, 0, "that is ok. at your age i was also not sure."]] },
  ];

  // lines from the table when things happen
  var LINES = {
    emptyGlass: ["...", "(taka-san looks at his empty glass)", "(taka-san taps his glass, very gently)"],
    poured: ["arigato.", "ah, thank you, caleb-kun.", "just a little. ok, a little more."],
    full: ["(he waves you off. it's still full.)"],
    ownGlass: "(you poured your own glass. taka-san noticed. so did everyone.)",
    newDishFirst: "(taka-san tries it first. he nods at you.)",
    newDishStolen: "(the new dish went round to someone else before taka-san tried it)",
    bill: "(you asked for the bill. hiroto quietly waves the waitress away. that's the boss's job.)",
    silence: "(awkward silence)",
    karaokeIntro: "taka-san has already picked a song. of course he has.",
  };

  // the karaoke. taka-san always sings the same one, and that's all anyone
  // needs to know about it: the game never shows or plays any of it, you just
  // keep the tambourine going. your songs are all old enough to be public
  // domain (pre-1929). blank: the word you fill in; opts: the decoys.
  var TAKA_SONG = "Can You Feel the Love Tonight";
  var SONGS = [
    { title: "Daisy Bell", year: 1892, bpm: 104, lines: [
      ["daisy, daisy, give me your {answer} do", ["answer", "number", "letter"]],
      ["i'm half {crazy} all for the love of you", ["crazy", "lazy", "hungry"]],
      ["it won't be a stylish {marriage}", ["marriage", "garage", "message"]],
      ["i can't afford a {carriage}", ["carriage", "cabbage", "parking"]],
      ["but you'll look sweet upon the {seat}", ["seat", "street", "sheet"]],
      ["of a {bicycle} built for two", ["bicycle", "motorbike", "tricycle"]],
    ] },
    { title: "Take Me Out to the Ball Game", year: 1908, bpm: 112, lines: [
      ["take me out to the {ball} game", ["ball", "board", "big"]],
      ["take me out with the {crowd}", ["crowd", "cloud", "cows"]],
      ["buy me some peanuts and cracker {jack}", ["jack", "snacks", "crabs"]],
      ["i don't care if i never get {back}", ["back", "black", "fat"]],
      ["let me root, root, root for the {home} team", ["home", "whole", "old"]],
      ["for it's one, two, three {strikes}, you're out", ["strikes", "trips", "tries"]],
    ] },
    { title: "My Bonnie Lies Over the Ocean", year: 1881, bpm: 96, lines: [
      ["my bonnie lies over the {ocean}", ["ocean", "office", "oven"]],
      ["my bonnie lies over the {sea}", ["sea", "tea", "tree"]],
      ["my bonnie lies over the ocean", null],
      ["oh bring back my {bonnie} to me", ["bonnie", "bento", "bottle"]],
      ["bring back, bring {back}", ["back", "beer", "black"]],
      ["oh bring back my bonnie to {me}", ["me", "tea", "sea"]],
    ] },
  ];

  var DISHES = [
    { id: "hargow", name: "har gow" }, { id: "siumai", name: "siu mai" }, { id: "charsiu", name: "char siu" },
    { id: "rice", name: "fried rice" }, { id: "kailan", name: "kai lan" }, { id: "bun", name: "custard buns" },
  ];

  return { PEOPLE: PEOPLE, DRIVE: DRIVE, DINNER: DINNER, LINES: LINES, TAKA_SONG: TAKA_SONG, SONGS: SONGS, DISHES: DISHES };
})();
