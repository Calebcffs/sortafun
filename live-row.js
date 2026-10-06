/* sortafun live row: one leaderboard row per player per day that climbs until
 * Singapore midnight, its name changeable by its owner until then. Daily sudoku
 * uses it (word hive has the same thing inline in anagram.html, where it started).
 *
 *   var live = SortafunLiveRow({
 *     game: "sudoku",                       // a live game in firestore.rules isLiveGame
 *     box: element,                         // where "live on today's board as ..." goes
 *     score: function () { return total; }, // what to post (only ever goes up)
 *     what: "solve",                        // "every solve adds to it"
 *   });
 *   live.load(day)     today's row from localStorage (sortafun-<game>-live-<day>)
 *   live.push()        write the current total (queued, one write in flight)
 *   live.adopt(save)   take { lb, k, name } from a codephrase save
 *   live.id()          the row id (for keepBoard's mine)
 *   live.code          the day's codephrase (saved with the rest)
 *
 * The row id and its secret (hive_keys/<id>, see firestore.rules ownsRow) are
 * made before the first write and kept, so a reload or another device with the
 * codephrase writes the same row; a rename bumps the secret in the same batch.
 */
(function () {
  "use strict";
  var ID_RE = /^[A-Za-z0-9]{20}$/, KEY_RE = /^[A-Za-z0-9]{24}$/;

  window.SortafunLiveRow = function (opts) {
    var game = opts.game, box = opts.box;
    var day = null, id = null, key = null, name = null, sent = null, made = false;
    var busy = false, again = false;
    var api = { code: null };
    var LB = function () { return window.SortafunLB; };

    function storeKey() { return "sortafun-" + game + "-live-" + day; }
    function save() {
      try { localStorage.setItem(storeKey(), JSON.stringify({ lb: id, k: key, name: name, sent: sent, made: made, code: api.code })); } catch (e) {}
    }
    api.load = function (d) {
      day = d; id = key = name = sent = null; made = false; api.code = null;
      var s = null;
      try { s = JSON.parse(localStorage.getItem(storeKey())); } catch (e) {}
      if (s) {
        if (typeof s.lb === "string" && ID_RE.test(s.lb)) { id = s.lb; made = !!s.made; }
        if (typeof s.k === "string" && KEY_RE.test(s.k)) key = s.k;
        if (typeof s.name === "string" && s.name) name = s.name.slice(0, 20);
        if (typeof s.sent === "string" && s.sent) sent = s.sent.slice(0, 20);
        if (typeof s.code === "string") api.code = s.code;
      }
      box.hidden = true; box.innerHTML = "";
      if (made) show("");
    };
    api.save = save;
    api.id = function () { return id; };
    api.state = function () { return { day: day, id: id, key: key, name: name, sent: sent, made: made }; };
    // a codephrase save carries the row: carry on with it, under its name
    api.adopt = function (d) {
      if (d && typeof d.lb === "string" && ID_RE.test(d.lb)) {
        id = d.lb; made = true;
        key = typeof d.k === "string" && KEY_RE.test(d.k) ? d.k : null;
      }
      if (d && typeof d.name === "string" && d.name.trim()) name = sent = d.name.trim().slice(0, 20);
      save();
    };
    // what goes into the codephrase save
    api.saveExtra = function () { return { lb: id, name: sent || name, k: key }; };

    // ---- writing ----
    api.push = function () {
      var L = LB();
      if (!L || !L.liveSet || !day || !(opts.score() > 0)) return;
      if (L.dayStr() !== day) { closed(); return; }
      if (!name) {
        var saved = null;
        try { saved = (localStorage.getItem("sortafun-name") || "").trim(); } catch (e) {}
        if (!saved) { askName(); return; }
        name = saved.slice(0, 20);
      }
      if (!id) { id = L.newLiveId(); key = L.newLiveId(24); save(); }
      if (busy) { again = true; return; }
      // rows made before renames existed have no secret: their name stays
      if (made && name !== sent && !key) { name = sent; save(); show("this entry was made before names could change, so its name stays today.", true); }
      var mode = !made ? "create" : name !== sent ? "rename" : "score", nm = name, d0 = day;
      busy = true;
      var o = { game: game, name: nm, score: opts.score(), day: d0, key: key, mode: mode };
      L.liveSet(id, o).catch(function (e) {
        // a first write whose answer got lost already made the row and its secret: update it plainly
        if (mode !== "create") throw e;
        o.mode = "score";
        return L.liveSet(id, o);
      }).then(function () {
        if (day !== d0) return; // the day rolled while it was in flight
        made = true; sent = nm;
        save();
        show("");
        if (opts.onSaved) opts.onSaved();
      }, function (e) {
        console.warn("[live] board update failed", e);
        if (day !== d0) return;
        if (L.dayStr() !== day) { closed(); return; }
        var refused = /permission/i.test(String(e && (e.code || e.message)));
        if (mode === "rename" && refused) { name = sent; save(); show("the board didn't take the new name. your words still count.", true); return; }
        show(refused ? "the board didn't take that update. it tries again next time." : "couldn't reach the board. it tries again next time.");
      }).then(function () {
        busy = false;
        if (again) { again = false; api.push(); }
      });
    };

    // ---- the box ----
    function clear() { box.hidden = false; box.innerHTML = ""; return box; }
    function nameInput(inputId, value, label, onGo) {
      var b = clear();
      var inp = document.createElement("input");
      inp.id = inputId; inp.maxLength = 20; inp.placeholder = "your name"; inp.autocomplete = "off"; inp.spellcheck = false; inp.value = value || "";
      var go = document.createElement("button");
      go.type = "button"; go.textContent = label;
      b.appendChild(inp); b.appendChild(document.createTextNode(" ")); b.appendChild(go);
      inp.addEventListener("keydown", function (e) {
        e.stopPropagation(); // typing a name isn't playing the game
        if (e.key === "Enter") { e.preventDefault(); go.click(); }
        if (e.key === "Escape" && made) { e.preventDefault(); show("", true); }
      });
      go.addEventListener("click", function () {
        var v = inp.value.trim().slice(0, 20);
        if (!v) { inp.focus(); return; }
        onGo(v);
      });
      return b;
    }
    function askName() {
      if (box.querySelector("input")) return;
      var b = nameInput(game + "-lname", "", "go on the board", function (v) {
        name = v;
        try { localStorage.setItem("sortafun-name", v); } catch (e) {}
        save();
        show("", true);
        api.push();
      });
      b.insertBefore(document.createTextNode("you're going on today's leaderboard. your name (you can change it until midnight): "), b.firstChild);
    }
    function renameBox() {
      var b = nameInput(game + "-lrename", name, "save name", function (v) {
        var changed = v !== name;
        if (changed) {
          name = v;
          try { localStorage.setItem("sortafun-name", v); } catch (e) {}
          save();
        }
        show("", true);
        if (changed) api.push();
      });
      var cancel = document.createElement("button");
      cancel.type = "button"; cancel.textContent = "cancel";
      cancel.addEventListener("click", function () { show("", true); });
      b.appendChild(document.createTextNode(" ")); b.appendChild(cancel);
      b.insertBefore(document.createTextNode("new name for today's board: "), b.firstChild);
      var inp = b.querySelector("input"); inp.focus(); inp.select();
    }
    // force: redraw even while a name box is open (a write landing mustn't wipe what you're typing)
    function show(err, force) {
      if (!force && box.querySelector("input")) return;
      var b = clear();
      b.appendChild(document.createTextNode("live on today's board as "));
      var nm = document.createElement("b"); nm.textContent = name; b.appendChild(nm);
      if (made && name !== sent) b.appendChild(document.createTextNode(" (saving...)"));
      b.appendChild(document.createTextNode(". every " + (opts.what || "word") + " adds to it until midnight (singapore time). "));
      if (made) {
        var ch = document.createElement("button");
        ch.type = "button"; ch.className = "lchange"; ch.textContent = "change name";
        ch.addEventListener("click", renameBox);
        b.appendChild(ch);
      }
      if (err) { var e = document.createElement("div"); e.className = "lberr"; e.textContent = err; b.appendChild(e); }
    }
    function closed() {
      var b = clear();
      b.appendChild(document.createTextNode("midnight: that day's board is closed. today's puzzles are new."));
    }
    api.show = show;
    return api;
  };

  // codephrases like fluffy-antelope (the same lists as word hive's)
  var ADJ = "fluffy sleepy grumpy cheeky tiny giant shiny dusty mellow zesty jolly sneaky lucky brave calm clever crispy dizzy fancy fuzzy gentle golden happy humble icy jazzy kind lively lumpy merry misty nimble noisy odd peppy plucky proud quiet rusty salty shy silly slow smooth snappy soft spicy sunny swift tidy velvet warm wild witty woolly young bouncy breezy bubbly chilly cosy crunchy curly dapper eager frosty giddy glossy gritty hasty hungry jumpy leafy mighty minty mossy muddy nutty perky pickled plush rowdy scruffy shaggy sparkly speedy sticky stormy sturdy sweet tangy thorny toasty twisty wobbly wonky zippy amber ancient bashful blazing bright chunky clumsy cuddly daring drowsy elegant feisty funky glad groovy hollow hushed itchy keen lofty loyal magic nifty noble polite quirky royal sassy spooky stubborn tender vivid wiggly".split(" ");
  var NOUN = "antelope badger beetle bison camel cobra condor coyote crane dolphin donkey eagle falcon ferret finch gecko gibbon goose gopher heron hornet iguana jackal koala lemur lizard llama lobster magpie marmot meerkat moose newt ocelot osprey otter owl panda parrot pelican penguin pigeon possum puffin quail rabbit raccoon raven salmon seal sloth sparrow squid stork swan tapir toad turtle viper walrus weasel whale wombat yak zebra acorn anchor basket bucket button candle carpet cheese cookie feather fiddle garden hammer jigsaw kettle ladder lantern marble muffin noodle orchard pebble pickle pillow pretzel pudding puzzle quilt radish ribbon saddle scarf sandal spoon sprout teapot thimble toast tulip turnip umbrella walnut wagon whistle windmill yogurt biscuit blanket bongo cactus canyon comet cricket dragon galaxy meadow rocket".split(" ");
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  window.SortafunLiveRow.CODE_RE = /^[a-z]{3,12}-[a-z]{3,12}$/;
  // a codephrase nobody has used yet: getFn(code) resolves to the save or null
  window.SortafunLiveRow.makeCode = function (getFn) {
    return (function tryMake(n) {
      var c = pick(ADJ) + "-" + pick(NOUN);
      return getFn(c).then(function (d) { return d && n < 8 ? tryMake(n + 1) : c; });
    })(0);
  };
})();
