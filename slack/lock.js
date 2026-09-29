/* sfsg slacking simulator: the password screen (work in progress, staff only).
 *
 * The office photo textures are only in slack/vault.js, encrypted
 * (AES-256-GCM, key from the password via PBKDF2-SHA256; see
 * tools/build-vault.mjs). The right password decrypts them here and hands
 * them to SlackBoot() (slack/game.js). Nothing is remembered.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var form = $("lock-form"), input = $("lock-pass"), msg = $("lock-msg");
  var b64 = function (s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

  function unlock(pass) {
    var V = window.SLACK_VAULT, C = window.crypto && window.crypto.subtle;
    if (!V) return Promise.reject(new Error("the office didn't load. refresh and try again."));
    if (!C) return Promise.reject(new Error("this browser can't open it (no web crypto). try another one."));
    return C.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"])
      .then(function (k) { return C.deriveKey({ name: "PBKDF2", salt: b64(V.salt), iterations: V.iter, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["decrypt"]); })
      .then(function (key) { return C.decrypt({ name: "AES-GCM", iv: b64(V.iv) }, key, b64(V.ct)); })
      .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); }, function () { throw new Error("wrong password."); });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = form.querySelector("button");
    btn.disabled = true; msg.textContent = "badging in...";
    unlock(input.value).then(function (content) {
      input.value = "";
      $("lock").hidden = true;
      window.SlackBoot(content);
    }).catch(function (err) {
      msg.textContent = err.message;
      form.classList.remove("no"); void form.offsetWidth; form.classList.add("no");
      if (window.SortafunSFX) SortafunSFX.play("bad");
      input.select();
    }).then(function () { btn.disabled = false; });
  });
  window.SlackUnlock = unlock; // tests
})();
