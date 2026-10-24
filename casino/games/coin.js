// casino/games/coin.js - double or nothing: the reference game (see casino/PLAN.md).
// Call heads or tails, 1.96x on a win (2% house edge). The smallest example of
// the contract: bet() takes the stake, pay() gives back stake + winnings.
const ART = `<svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#13402a"/><circle cx="80" cy="50" r="30" fill="#f4c542" stroke="#1d1b2e" stroke-width="4"/><circle cx="80" cy="50" r="21" fill="none" stroke="#b8860b" stroke-width="3"/><text x="80" y="60" font-family="Lilita One, sans-serif" font-size="26" text-anchor="middle" fill="#7a5600">S</text></svg>`;

let api = null, root = null, busy = false, timer = 0;
const PAY = 1.96;

export default {
  id: "coin",
  name: "Double or Nothing",
  blurb: "call the coin. right pays 1.96x.",
  art: ART,
  mount(el, a) {
    api = a; root = el; busy = false;
    el.innerHTML = `<div class="coin-wrap"><div class="coin-face" id="coin-face">S</div><div class="coin-msg" id="coin-msg">heads or tails?</div></div><div class="cz-controls" id="coin-ctl"></div>`;
    const ctl = el.querySelector("#coin-ctl");
    const bet = api.betBox(ctl);
    const row = document.createElement("div"); row.className = "cz-actions";
    row.innerHTML = `<button class="cz-go" data-c="H" type="button">HEADS</button><button class="cz-go alt" data-c="T" type="button">TAILS</button>`;
    ctl.appendChild(row);
    row.addEventListener("click", (e) => {
      const c = e.target.dataset && e.target.dataset.c;
      if (!c || busy) return;
      const amt = bet.get();
      if (!api.bet(amt, "called " + (c === "H" ? "heads" : "tails"))) { api.toast(api.locked() ? "you've cashed out for today" : "not enough cash for that", "bad"); return; }
      busy = true; api.sfx("flip");
      const face = el.querySelector("#coin-face"), msg = el.querySelector("#coin-msg");
      face.classList.remove("spin"); void face.offsetWidth; face.classList.add("spin");
      msg.textContent = "...";
      // settle NOW (leaving mid-flip must never lose a paid bet); the flip is only the show
      const land = api.rng() < 0.5 ? "H" : "T", win = land === c;
      if (win) api.pay(amt * PAY, "coin came up " + (land === "H" ? "heads" : "tails"), { reveal: 900 });
      timer = setTimeout(() => {
        busy = false;
        face.textContent = land;
        if (win) { msg.textContent = "you win " + api.fmt(amt * PAY); api.sfx("coin"); }
        else { msg.textContent = (land === "H" ? "heads" : "tails") + ". you lose " + api.fmt(amt); api.sfx("bad"); }
      }, 900);
    });
  },
  unmount() { clearTimeout(timer); root = null; },
};
