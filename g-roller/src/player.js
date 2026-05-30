import * as THREE from "three";
import { CONFIG } from "./config.js";

const ONE = new THREE.Vector3(1, 1, 1);

// Effects without a dedicated mesh get an orbiting glyph around the ball so you
// can always see what you've got running. (flight=wings, doublejump=board,
// shield=bubble are shown separately.)
const ORBIT_KEYS = ["magnet", "slow", "reverse", "surge", "morph", "trip"];
const ORBIT_EMOJI = { magnet: "🧲", slow: "🐢", reverse: "🔄", surge: "⚡", morph: "🌀", trip: "🌈" };

// A gold checker-grid skin for the ball so you can read its spin under the light.
function ballTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffce3a";
  ctx.fillRect(0, 0, 256, 256);
  const n = 8, t = 256 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if ((x + y) % 2 === 0) { ctx.fillStyle = "#ff9f1c"; ctx.fillRect(x * t, y * t, t, t); }
  }
  ctx.strokeStyle = "rgba(40,28,8,0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * t); ctx.lineTo(256, i * t); ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// The rolling ball. Owns its own kinematic physics: we move it by hand each
// frame (no physics engine) to match the Unity PlayerController feel, plus
// riding moving platforms and bumping into obstacles.
export class Player {
  constructor(scene) {
    this.radius = CONFIG.playerRadius;

    const group = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 32, 24),
      new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.4, metalness: 0.15 })
    );
    ball.castShadow = true;
    this._ball = ball;
    group.add(ball);

    // A shield bubble that we toggle on when the shield powerup is active.
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 1.5, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.28, emissive: 0x35e0ff, emissiveIntensity: 0.5 })
    );
    this.shieldMesh.visible = false;
    group.add(this.shieldMesh);

    // Effect indicators that ride on the ball. They live on the (non-rolling)
    // group so they stay upright while only the ball spins underneath.
    this._wings = this._makeWings();
    this._board = this._makeBoard();
    this._orbit = new THREE.Group();
    group.add(this._wings, this._board, this._orbit);
    this._orbitSprites = {};
    this._emojiTex = {};
    this._vt = 0;

    this.mesh = group;
    scene.add(group);

    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.jumpCount = 0;
    this.lastGroundedY = 0;
    this._ridePlat = null;
    this._seenPresses = 0;
    this._coyote = 0;     // grace time left to still jump after leaving a ledge
    this._jumpBuffer = 0; // time left on a remembered jump press
    this.airJumps = 0;
    this._t = 0;
  }

  reset() {
    this.mesh.position.set(0, this.radius, 0);
    this._ball.rotation.set(0, 0, 0);
    this._ball.scale.set(1, 1, 1);
    this._wings.visible = false;
    this._board.visible = false;
    for (const k of Object.keys(this._orbitSprites)) {
      this._orbit.remove(this._orbitSprites[k]);
      delete this._orbitSprites[k];
    }
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.jumpCount = -1; // first landing bumps it to 0, matching the original
    this.lastGroundedY = 0;
    this._ridePlat = null;
    this._coyote = 0;
    this._jumpBuffer = 0;
    this.airJumps = 0;
  }

  get position() { return this.mesh.position; }

  // ctx = { forwardSpeed, steerMult, invuln, shield }
  // Returns { died, landed, hit, pos }.
  update(dt, input, ctx, field) {
    const p = this.mesh.position;
    const v = this.vel;
    this.shieldMesh.visible = ctx.shield;

    // Ride a moving platform's VERTICAL motion (so you go up/down with it), but
    // NOT its horizontal motion — a sideways-sliding board slides out from under
    // you, so you have to actively steer to stay on it or you'll roll off the edge.
    if (this._ridePlat && this._ridePlat.mesh.parent) {
      p.y += this._ridePlat.dy;
    }

    // --- Jump: ground jump, optional mid-air jump (double-jump), or flight ---
    this._t += dt;

    // Buffer a fresh press for a short window so a jump pressed just before/at
    // landing still fires the moment we touch down.
    if (input.jumpPresses !== this._seenPresses) {
      this._seenPresses = input.jumpPresses;
      this._jumpBuffer = CONFIG.jumpBufferTime;
    }
    this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);

    // Coyote time: count "grounded" as true for a moment after leaving a ledge.
    const canGroundJump = this.grounded || this._coyote > 0;

    let jumped = false;
    if (ctx.flight && input.jumpHeld) {
      v.y = CONFIG.flightLift; this.grounded = false; // hold jump to soar
    } else if (this._jumpBuffer > 0 && canGroundJump) {
      v.y = CONFIG.jumpSpeed; this.grounded = false; this.airJumps = 0;
      this._coyote = 0; this._jumpBuffer = 0; jumped = true;
    } else if (this._jumpBuffer > 0 && this.airJumps < ctx.maxAirJumps) {
      v.y = CONFIG.jumpSpeed; this.airJumps++; this._jumpBuffer = 0; jumped = true; // double jump
    } else if (!input.jumpHeld && v.y > 0 && !this.grounded) {
      v.y /= CONFIG.quickDescentDivisor; // release early to drop fast
    }

    // Steering (steerMult flips for the "reverse" powerdown). When morphed, the
    // ball rolls weird — loosen control and add a wobble that fights your line.
    let steer = -input.steer * ctx.steerMult;
    if (ctx.morph) steer = steer * 0.65 + Math.sin(this._t * 9) * (CONFIG.morphWobble / CONFIG.sideSpeed);
    v.x = steer * CONFIG.sideSpeed;
    v.z = ctx.forwardSpeed;
    v.y -= CONFIG.gravity * dt;

    const prevBottom = p.y - this.radius;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;

    // --- Land on platforms (flat, ramp, or curved; pass through from below) ---
    let landed = null;
    const prevRide = this._ridePlat;
    this.grounded = false;
    this._ridePlat = null;
    if (v.y <= 0) {
      const newBottom = p.y - this.radius;
      let bestTop = -Infinity, best = null;
      for (const plat of field.platforms) {
        if (Math.abs(p.z - plat.pos.z) > plat.hz + 4) continue;
        if (Math.abs(p.x - plat.pos.x) > plat.hx + this.radius * 0.5) continue;
        if (Math.abs(p.z - plat.pos.z) > plat.hz + this.radius * 0.5) continue;
        const top = this._topAt(plat, p.x, p.z);
        // Only stand on a surface we were above (pass-through from below), unless
        // we were already riding it — that lets us hug a ramp as it climbs.
        if (prevBottom < top - 0.6 && plat !== prevRide) continue;
        if (newBottom <= top + 0.05 && top > bestTop) { bestTop = top; best = plat; }
      }
      if (best) {
        if (best.type === "bouncy") {
          v.y = CONFIG.jumpSpeed * 1.55; this.airJumps = 0; // bouncy launch re-arms double jump
        } else {
          p.y = bestTop + this.radius; v.y = 0; this.grounded = true; this._ridePlat = best; this.airJumps = 0;
          // Curved board: drift toward the middle (concave) or off the sides (convex).
          if (best.curve) p.x += -CONFIG.curveForce * best.curve * (p.x - best.pos.x) * dt;
        }
        this.lastGroundedY = bestTop;
        if (!prevRide) this.jumpCount += 1; // count fresh landings only, not every grounded frame
        landed = best.type;
      }
    }
    // Launch off the top of an up-ramp: keep some of the climb as a hop.
    if (!this.grounded && prevRide && prevRide.slopeZ > 0 && prevRide !== this._ridePlat && v.y <= 0) {
      v.y = Math.max(v.y, prevRide.slopeZ * v.z * CONFIG.rampLaunch);
    }

    // --- Obstacle collision ---
    let hit = null;
    if (!ctx.invuln) {
      for (const plat of field.platforms) {
        if (!plat.obstacles.length) continue;
        if (Math.abs(p.z - plat.pos.z) > plat.hz + 4) continue;
        for (const o of plat.obstacles) {
          const ox = plat.pos.x + o.lx, oy = plat.pos.y + o.ly, oz = plat.pos.z + o.lz;
          if (Math.abs(p.x - ox) <= o.hx + this.radius &&
              Math.abs(p.z - oz) <= o.hz + this.radius &&
              Math.abs(p.y - oy) <= o.hy + this.radius) {
            hit = { platform: plat, obstacle: o };
            break;
          }
        }
        if (hit) break;
      }
    }

    // Morph powerdown: squash-and-stretch the ball so it visibly rolls weird.
    if (ctx.morph) {
      const s = 1 + Math.sin(this._t * 12) * 0.35;
      this._ball.scale.set(s, 2 - s, 1 / s);
    } else if (this._ball.scale.x !== 1) {
      this._ball.scale.lerp(ONE, Math.min(1, dt * 6));
    }

    this._roll(dt);

    // Refresh coyote time from this frame's grounded state (read next frame).
    if (this.grounded) this._coyote = CONFIG.coyoteTime;
    else this._coyote = Math.max(0, this._coyote - dt);

    // Die only once we're below the lowest floor still drawn nearby — so there's
    // truly nothing left to land on (not just below the last pad we stood on).
    const floor = field.lowestTopNear(p.z);
    const died = !this.grounded && p.y < floor - CONFIG.fallMargin;
    return { died, landed, hit, jumped, pos: p };
  }

  // Surface height of a platform under the player: flat, sloped (ramp, varies
  // with z) or curved (varies with x across the board's width).
  _topAt(plat, x, z) {
    let top = plat.topY;
    if (plat.slopeZ) top += plat.slopeZ * (z - plat.pos.z);
    if (plat.curve) top += plat.curve * (x - plat.pos.x) * (x - plat.pos.x);
    return top;
  }

  _roll(dt) {
    // Spin only the ball, so the wings / board / orbiting glyphs stay upright.
    this._ball.rotation.x += (this.vel.z * dt) / this.radius;
    this._ball.rotation.z += (this.vel.x * dt) / this.radius;
  }

  // --- On-ball effect indicators -------------------------------------------

  // Called every frame with the live effects state so you can read what's
  // active straight off the ball. `e` is the game's effects object (seconds
  // remaining per timed effect, or a bool for shield).
  updateVisuals(e, dt) {
    this._vt += dt;
    const t = this._vt;
    // Fast blink in the final 5 seconds so you know an effect's about to end.
    const blink = (rem) => (rem > 0 && rem < 5 ? 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 16)) : 1);

    // Flight -> flapping wings.
    this._wings.visible = e.flight > 0;
    if (e.flight > 0) {
      const flap = Math.sin(t * 11) * 0.5;
      this._wings.userData.r.rotation.z = -0.15 + flap;
      this._wings.userData.l.rotation.z = 0.15 - flap;
      const o = 0.85 * blink(e.flight);
      this._wings.userData.r.material.opacity = o;
      this._wings.userData.l.material.opacity = o;
    }

    // Double jump -> a translucent board hovers under you in mid-air, ready to
    // kick off of, and vanishes once you've spent the air jump.
    const showBoard = e.doublejump > 0 && !this.grounded && this.airJumps < 1;
    this._board.visible = showBoard;
    if (showBoard) {
      this._board.rotation.y += dt * 1.6;
      this._board.material.opacity = 0.45 * blink(e.doublejump);
    }

    this._updateOrbit(e, t, blink);
  }

  // Orbiting glyphs around the ball for the effects without a dedicated mesh.
  _updateOrbit(e, t, blink) {
    const active = ORBIT_KEYS.filter((k) => e[k] > 0);
    for (const k of Object.keys(this._orbitSprites)) {
      if (!active.includes(k)) { this._orbit.remove(this._orbitSprites[k]); delete this._orbitSprites[k]; }
    }
    active.forEach((k, i) => {
      let s = this._orbitSprites[k];
      if (!s) { s = this._emojiSprite(ORBIT_EMOJI[k]); this._orbit.add(s); this._orbitSprites[k] = s; }
      const ang = t * 1.3 + (i / active.length) * Math.PI * 2;
      const rr = this.radius * 2.4;
      s.position.set(Math.cos(ang) * rr, this.radius * 1.5, Math.sin(ang) * rr);
      s.material.opacity = blink(e[k]);
    });
  }

  _makeWings() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(2.3, 0.6); shape.lineTo(1.9, -0.5); shape.lineTo(0.2, -0.3); shape.lineTo(0, 0);
    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffe89a, emissive: 0xffb000, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.85, side: THREE.DoubleSide, roughness: 0.4,
    });
    const r = new THREE.Mesh(geo, mat);
    r.position.set(this.radius * 0.5, this.radius * 0.4, 0);
    const l = new THREE.Mesh(geo, mat.clone());
    l.position.set(-this.radius * 0.5, this.radius * 0.4, 0);
    l.scale.x = -1;
    g.add(r, l);
    g.userData = { r, l };
    g.visible = false;
    return g;
  }

  _makeBoard() {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.2, 2.6),
      new THREE.MeshStandardMaterial({
        color: 0xc6ff3a, emissive: 0x88ff00, emissiveIntensity: 0.5,
        transparent: true, opacity: 0.45, roughness: 0.5,
      })
    );
    m.position.set(0, -this.radius - 0.45, 0);
    m.visible = false;
    return m;
  }

  _emojiSprite(emoji) {
    let tex = this._emojiTex[emoji];
    if (!tex) {
      const c = document.createElement("canvas"); c.width = c.height = 48;
      const ctx = c.getContext("2d");
      ctx.font = "34px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(emoji, 24, 27);
      tex = new THREE.CanvasTexture(c);
      this._emojiTex[emoji] = tex;
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    s.scale.set(1.1, 1.1, 1);
    return s;
  }
}
