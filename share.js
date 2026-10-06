/* sortafun share: a "share result" button for the daily games.
 *
 *   SortafunShare.after(el, function () { return "text to share"; })
 *     puts the button straight after el (once; calling again just updates
 *     what it shares). Phones get the system share sheet, everything else
 *     copies the text and says so.
 *
 * Share text NEVER gives the answer away: coloured squares, counts against
 * par, points and ranks only. It ends with the game's link, so every share
 * is a way in for someone new. No trademarked game names in it.
 */
(function () {
  "use strict";
  function style() {
    if (document.getElementById("sf-share-style")) return;
    var s = document.createElement("style");
    s.id = "sf-share-style";
    s.textContent = ".sf-share{margin:10px auto 0;text-align:center}" +
      ".sf-share button{font:400 17px var(--chunky,'Lilita One',sans-serif);color:#fff;background:linear-gradient(#4dabf7,#1c7ed6);" +
      "border:3px solid #1d1b2e;border-radius:999px;padding:5px 18px 4px;box-shadow:0 3px 0 #1d1b2e;cursor:pointer}" +
      ".sf-share button:hover{background:linear-gradient(#ffe36e,#ffb300);color:#1d1b2e}" +
      ".sf-share small{display:block;margin-top:4px;font-size:12px;color:#555;min-height:15px}" +
      "html.panic .sf-share{display:none}";
    document.head.appendChild(s);
  }
  var phone = function () { return window.matchMedia && matchMedia("(pointer: coarse)").matches; };

  // the old way: a hidden textarea + execCommand (works where the clipboard API says no)
  function copyOld(text) {
    return new Promise(function (ok, no) {
      var t = document.createElement("textarea");
      t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy") ? ok() : no(); } catch (e) { no(e); }
      t.remove();
    });
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return copyOld(text); });
    }
    return copyOld(text);
  }

  function share(text, note) {
    if (window.SortafunSFX) SortafunSFX.play("pop");
    if (phone() && navigator.share) {
      return navigator.share({ text: text }).catch(function (e) {
        if (e && e.name === "AbortError") return; // they closed the sheet
        return copy(text).then(function () { note("copied! paste it anywhere"); });
      });
    }
    return copy(text).then(function () { note("copied! paste it to your friends"); },
      function () { note("couldn't copy, select it: " + text); });
  }

  function after(el, getText) {
    if (!el || !el.parentNode) return null;
    style();
    var box = el._sfShare;
    if (!box || !box.isConnected) {
      box = document.createElement("div");
      box.className = "sf-share";
      box.innerHTML = '<button type="button">share result</button><small></small>';
      el.parentNode.insertBefore(box, el.nextSibling);
      el._sfShare = box;
      var btn = box.querySelector("button"), small = box.querySelector("small"), t = 0;
      btn.addEventListener("click", function () {
        btn.blur(); // space / enter drive some games: the button mustn't keep focus
        share(box._get(), function (msg) {
          small.textContent = msg;
          clearTimeout(t); t = setTimeout(function () { small.textContent = ""; }, 3500);
        });
      });
    }
    box._get = getText;
    return box;
  }

  window.SortafunShare = { after: after, share: share, copy: copy };
})();
