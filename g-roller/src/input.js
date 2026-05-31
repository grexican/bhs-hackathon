// Tracks what the player is pressing. Works with keyboard (laptop) and an
// on-screen thumbstick + jump button (touch devices).
//
//   Keyboard:  A/D or Left/Right = steer · W/Space = jump · Up/Down = speed
//   Touch:     left thumbstick = steer (X) + speed (Y) · right button = jump

export class Input {
  constructor(canvas) {
    this.steer = 0;     // -1 = full left, +1 = full right
    this.throttle = 0;  // +1 = speed up, -1 = slow down
    this.jumpHeld = false;
    this.jumpPresses = 0; // increments on each fresh press (the player buffers off this)
    this.startPresses = 0; // jump only (NOT arrows) so arrows are free for the cheat code

    this._left = false;
    this._right = false;
    this._up = false;
    this._down = false;

    window.addEventListener("keydown", (e) => this._onKey(e, true));
    window.addEventListener("keyup", (e) => this._onKey(e, false));

    this._bindThumbstick();
    this._bindJumpButton();
  }

  _onKey(e, down) {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA": this._left = down; break;
      case "ArrowRight":
      case "KeyD": this._right = down; break;
      case "ArrowUp": this._up = down; e.preventDefault(); break;   // speed up
      case "ArrowDown": this._down = down; e.preventDefault(); break; // slow down
      case "Space":
      case "KeyW":
        if (down && !this.jumpHeld) { this.jumpPresses++; this.startPresses++; }
        this.jumpHeld = down;
        e.preventDefault(); // stop Space from scrolling the page
        break;
      default: return;
    }
    this._recompute();
  }

  _recompute() {
    this.steer = (this._right ? 1 : 0) - (this._left ? 1 : 0);
    this.throttle = (this._up ? 1 : 0) - (this._down ? 1 : 0);
  }

  // Left thumbstick: drag left/right for analog steering. Horizontal only — the
  // vertical axis is intentionally ignored so steering never affects speed/zoom.
  _bindThumbstick() {
    const stick = document.getElementById("stick");
    const thumb = document.getElementById("stick-thumb");
    if (!stick || !thumb) return;
    let active = null;

    const move = (e) => {
      if (e.pointerId !== active) return;
      const r = stick.getBoundingClientRect();
      const max = r.width / 2;
      let dx = e.clientX - (r.left + max);
      let dy = e.clientY - (r.top + max);
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      thumb.style.transform = `translate(${dx}px, ${dy}px)`; // thumb still slides visually
      this.steer = Math.max(-1, Math.min(1, dx / max));
    };
    const end = (e) => {
      if (e.pointerId !== active) return;
      active = null;
      thumb.style.transform = "translate(0,0)";
      this.steer = 0;
    };
    stick.addEventListener("pointerdown", (e) => { active = e.pointerId; e.preventDefault(); move(e); });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  // Right jump button: press and hold (hold for height), like Space.
  _bindJumpButton() {
    const btn = document.getElementById("jump-btn");
    if (!btn) return;
    const down = (e) => {
      e.preventDefault();
      if (!this.jumpHeld) { this.jumpPresses++; this.startPresses++; }
      this.jumpHeld = true;
    };
    const up = () => { this.jumpHeld = false; };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
  }
}
