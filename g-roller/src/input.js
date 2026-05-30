// Tracks what the player is pressing. Works with keyboard and touch/mouse so
// the game is playable on a laptop or a phone.

export class Input {
  constructor(canvas) {
    // steer: -1 = full left, +1 = full right, 0 = centered
    this.steer = 0;
    // jumpHeld: true while the jump key/touch is down (jump uses "hold for height")
    this.jumpHeld = false;
    // jumpPresses: increments on every fresh press. The player buffers off this
    // so even a tap shorter than one frame can't be missed.
    this.jumpPresses = 0;
    // startPresses: only Space / W / tap (NOT ArrowUp), so the arrow keys are
    // free to enter the cheat code on the start screen without starting the game.
    this.startPresses = 0;

    this._left = false;
    this._right = false;

    window.addEventListener("keydown", (e) => this._onKey(e, true));
    window.addEventListener("keyup", (e) => this._onKey(e, false));

    // Touch zones: LEFT third steers left, RIGHT third steers right, CENTER
    // third jumps. Multi-touch (tracked per pointer id) so you can steer AND
    // jump at the same time — and steering taps no longer trigger a jump.
    this._touch = new Map(); // pointerId -> "left" | "right" | "jump"
    const zoneOf = (x) => {
      const w = window.innerWidth;
      return x < w / 3 ? "left" : x > (2 * w) / 3 ? "right" : "jump";
    };
    const recomputeTouch = () => {
      let l = false, r = false, j = false;
      for (const z of this._touch.values()) {
        if (z === "left") l = true; else if (z === "right") r = true; else j = true;
      }
      this._left = l; this._right = r; this.jumpHeld = j;
      this._recompute();
    };
    canvas.addEventListener("pointerdown", (e) => {
      const zone = zoneOf(e.clientX);
      if (zone === "jump" && !this.jumpHeld) { this.jumpPresses++; this.startPresses++; }
      this._touch.set(e.pointerId, zone);
      recomputeTouch();
    });
    const lift = (e) => { this._touch.delete(e.pointerId); recomputeTouch(); };
    window.addEventListener("pointerup", lift);
    window.addEventListener("pointercancel", lift);
  }

  _onKey(e, down) {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        this._left = down; break;
      case "ArrowRight":
      case "KeyD":
        this._right = down; break;
      case "Space":
      case "KeyW":
        // Space / W jump AND start the game.
        if (down && !this.jumpHeld) { this.jumpPresses++; this.startPresses++; }
        this.jumpHeld = down;
        e.preventDefault(); // stop Space from scrolling the page
        break;
      case "ArrowUp":
        // ArrowUp jumps in-game, but does NOT start the game — that frees it for
        // the cheat code on the start screen.
        if (down && !this.jumpHeld) this.jumpPresses++;
        this.jumpHeld = down;
        e.preventDefault();
        break;
      default:
        return;
    }
    this._recompute();
  }

  _recompute() {
    this.steer = (this._right ? 1 : 0) - (this._left ? 1 : 0);
  }
}
