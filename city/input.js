// Keyboard, touch and gamepad input for Birdie, boiled down to one state
// object the game reads every frame:
//
//   pitch  -1..1   +1 = pull up / climb / flare (DOWN / S), -1 = fly fast (UP / W)
//                  (on the ground: -1 walks forward, +1 takes off)
//   turn   -1..1   +1 = right
//   poop   true on the frame SPACE was pressed (also nest / egg / feed)
//   dive   held: tuck the wings and dive (SHIFT)
//   call   true on the frame C was pressed (chirp)
//
// "invert" swaps up/down for people who expect plane-style controls the
// other way round.

export class Input {
  constructor(target) {
    this.keys = new Set();
    this.pressed = new Set();
    this.invert = false;
    this.touch = { active: false, id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
    this.touchButtons = { poop: false, dive: false };
    this.enabled = true;
    this.drag = { active: false, x: 0, y: 0, dx: 0, dy: 0 };
    const block = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"]);
    this.onKeyDown = (e) => {
      if (!this.enabled) return;
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (block.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    };
    this.onKeyUp = (e) => { this.keys.delete(e.code); };
    this.onBlur = () => { this.keys.clear(); };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);

    // City Sandbox on foot: the mouse is captured (pointer lock) and moves the
    // camera; left button fires, right button aims
    this.mouse = { dx: 0, dy: 0, left: false, right: false };
    this.wantLock = false;
    this.locked = false;
    document.addEventListener("pointerlockchange", () => { this.locked = document.pointerLockElement === target; if (!this.locked) { this.mouse.left = this.mouse.right = false; } });
    target.addEventListener("contextmenu", (e) => { if (this.wantLock) e.preventDefault(); });
    // mouse drag on the game canvas looks around
    this.onDown = (e) => {
      if (this.wantLock) {
        if (!this.locked) { try { const r = target.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => target.requestPointerLock()); } catch (err) { target.requestPointerLock(); } return; }
        if (e.button === 0) { this.mouse.left = true; this.pressed.add("Mouse0"); }
        if (e.button === 2) { this.mouse.right = true; this.pressed.add("Mouse2"); }
        return;
      }
      if (e.button === 0) { this.drag.active = true; this.drag.x = e.clientX; this.drag.y = e.clientY; }
    };
    this.onMove = (e) => {
      if (this.locked) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; return; }
      if (!this.drag.active) return;
      this.drag.dx += e.clientX - this.drag.x; this.drag.dy += e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    };
    this.onUp = (e) => { this.drag.active = false; if (e && e.button === 0) this.mouse.left = false; if (e && e.button === 2) this.mouse.right = false; };
    target.addEventListener("mousedown", this.onDown);
    window.addEventListener("mousemove", this.onMove);
    window.addEventListener("mouseup", this.onUp);
    this.wheel = 0;
    this.onWheel = (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); };
    target.addEventListener("wheel", this.onWheel, { passive: false });
    this.target = target;
  }

  // a virtual joystick on the left half of the screen, for phones
  attachTouch(stickZone, stickKnob) {
    const t = this.touch;
    stickZone.addEventListener("touchstart", (e) => {
      const touch = e.changedTouches[0];
      t.active = true; t.id = touch.identifier; t.x0 = touch.clientX; t.y0 = touch.clientY; t.dx = 0; t.dy = 0;
      e.preventDefault();
    }, { passive: false });
    stickZone.addEventListener("touchmove", (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier !== t.id) continue;
        t.dx = Math.max(-1, Math.min(1, (touch.clientX - t.x0) / 55));
        t.dy = Math.max(-1, Math.min(1, (touch.clientY - t.y0) / 55));
        if (stickKnob) stickKnob.style.transform = `translate(${t.dx * 40}px, ${t.dy * 40}px)`;
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const touch of e.changedTouches) if (touch.identifier === t.id) { t.active = false; t.dx = t.dy = 0; if (stickKnob) stickKnob.style.transform = ""; }
    };
    stickZone.addEventListener("touchend", end);
    stickZone.addEventListener("touchcancel", end);
  }

  // a finger dragged on the game (not on the stick or buttons) turns the camera
  attachTouchLook(el) {
    let id = null, x = 0, y = 0;
    el.addEventListener("touchstart", (e) => {
      if (id !== null) return;
      const t = e.changedTouches[0];
      id = t.identifier; x = t.clientX; y = t.clientY;
      this.drag.active = true;
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) { this.drag.dx += (t.clientX - x) * 1.6; this.drag.dy += (t.clientY - y) * 1.6; x = t.clientX; y = t.clientY; }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === id) { id = null; this.drag.active = false; } };
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
  }

  bindButton(el, name) {
    const on = (e) => { this.touchButtons[name] = true; this.pressed.add("Touch:" + name); if (name === "poop") this.pressed.add("TouchPoop"); if (name === "call") this.pressed.add("TouchCall"); e.preventDefault(); };
    const off = (e) => { this.touchButtons[name] = false; e.preventDefault(); };
    el.addEventListener("touchstart", on, { passive: false });
    el.addEventListener("touchend", off, { passive: false });
    el.addEventListener("mousedown", on);
    el.addEventListener("mouseup", off);
    el.addEventListener("mouseleave", off);
  }

  // read everything into one state; clears the "pressed this frame" set
  read() {
    const k = this.keys;
    let up = k.has("ArrowUp") || k.has("KeyW") ? 1 : 0;
    let down = k.has("ArrowDown") || k.has("KeyS") ? 1 : 0;
    let left = k.has("ArrowLeft") || k.has("KeyA") ? 1 : 0;
    let right = k.has("ArrowRight") || k.has("KeyD") ? 1 : 0;
    let pitch = down - up;
    let turn = right - left;
    // touch stick: drag down = climb (like pulling back), drag up = dive
    if (this.touch.active) {
      pitch = this.touch.dy;
      turn = this.touch.dx;
    }
    // gamepad left stick
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let padPoop = false, padDive = false, padCall = false;
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (Math.abs(ax) > 0.15) turn = ax;
      if (Math.abs(ay) > 0.15) pitch = ay;
      if (p.buttons[0] && p.buttons[0].pressed) { if (!this._padA) padPoop = true; this._padA = true; } else this._padA = false;
      if (p.buttons[1] && p.buttons[1].pressed) { if (!this._padB) padCall = true; this._padB = true; } else this._padB = false;
      if ((p.buttons[7] && p.buttons[7].pressed) || (p.buttons[5] && p.buttons[5].pressed)) padDive = true;
    }
    if (this.invert) pitch = -pitch;
    const state = {
      pitch: Math.max(-1, Math.min(1, pitch)),
      turn: Math.max(-1, Math.min(1, turn)),
      poop: this.pressed.has("Space") || this.pressed.has("TouchPoop") || padPoop,
      dive: k.has("ShiftLeft") || k.has("ShiftRight") || this.touchButtons.dive || padDive,
      call: this.pressed.has("KeyC") || this.pressed.has("TouchCall") || padCall,
      camera: this.pressed.has("KeyV"),
      pause: this.pressed.has("Escape") || this.pressed.has("KeyP"),
      mute: this.pressed.has("KeyM"),
      map: this.pressed.has("KeyN"),
      lookX: this.drag.dx, lookY: this.drag.dy, dragging: this.drag.active,
      zoom: this.wheel,
    };
    // everything City Sandbox's human side needs: raw keys, this frame's
    // presses, the mouse, and touch buttons
    const pressed = new Set(this.pressed);
    state.down = (c) => k.has(c) || !!this.touchButtons[c];
    state.hit = (c) => pressed.has(c);
    state.mouse = { dx: this.mouse.dx, dy: this.mouse.dy, left: this.mouse.left || !!this.touchButtons.fire, right: this.mouse.right || !!this.touchButtons.aim };
    state.stick = this.touch.active ? { x: this.touch.dx, y: this.touch.dy } : null;
    state.locked = this.locked;
    this.mouse.dx = 0; this.mouse.dy = 0;
    this.drag.dx = 0; this.drag.dy = 0; this.wheel = 0;
    this.pressed.clear();
    return state;
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mousemove", this.onMove);
    window.removeEventListener("mouseup", this.onUp);
  }
}
