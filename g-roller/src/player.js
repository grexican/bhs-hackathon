import * as THREE from "three";
import { CONFIG } from "./config.js";

const ONE = new THREE.Vector3(1, 1, 1);

// The rolling ball. Owns its own kinematic physics: we move it by hand each
// frame (no physics engine) to match the Unity PlayerController feel, plus
// riding moving platforms and bumping into obstacles.
export class Player {
  constructor(scene) {
    this.radius = CONFIG.playerRadius;

    const group = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xffd34e, roughness: 0.25, metalness: 0.25, emissive: 0xffae00, emissiveIntensity: 0.15 })
    );
    ball.castShadow = true;
    this._ball = ball;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 0.42, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0x1a1e2b, roughness: 0.5 })
    );
    cap.position.set(0, this.radius * 0.8, 0);
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(this.radius * 0.98, this.radius * 0.12, 10, 28),
      new THREE.MeshStandardMaterial({ color: 0x1a1e2b, roughness: 0.5 })
    );
    stripe.rotation.x = Math.PI / 2;
    group.add(ball, cap, stripe);

    // A shield bubble that we toggle on when the shield powerup is active.
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 1.5, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.28, emissive: 0x35e0ff, emissiveIntensity: 0.5 })
    );
    this.shieldMesh.visible = false;
    group.add(this.shieldMesh);

    this.mesh = group;
    scene.add(group);

    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.jumpCount = 0;
    this.lastGroundedY = 0;
    this._ridePlat = null;
    this._prevJump = false;
    this.airJumps = 0;
    this._t = 0;
  }

  reset() {
    this.mesh.position.set(0, this.radius, 0);
    this.mesh.rotation.set(0, 0, 0);
    this._ball.scale.set(1, 1, 1);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.jumpCount = -1; // first landing bumps it to 0, matching the original
    this.lastGroundedY = 0;
    this._ridePlat = null;
    this._prevJump = false;
    this.airJumps = 0;
  }

  get position() { return this.mesh.position; }

  // ctx = { forwardSpeed, steerMult, invuln, shield }
  // Returns { died, landed, hit, pos }.
  update(dt, input, ctx, field) {
    const p = this.mesh.position;
    const v = this.vel;
    this.shieldMesh.visible = ctx.shield;

    // Ride a moving platform: carry over the delta it moved last/this frame.
    if (this._ridePlat && this._ridePlat.mesh.parent) {
      p.x += this._ridePlat.dx;
      p.y += this._ridePlat.dy;
    }

    // --- Jump: ground jump, optional mid-air jump (double-jump), or flight ---
    this._t += dt;
    const pressed = input.jumpHeld && !this._prevJump;
    this._prevJump = input.jumpHeld;

    if (ctx.flight && input.jumpHeld) {
      v.y = CONFIG.flightLift; this.grounded = false; // hold jump to soar
    } else if (this.grounded && pressed) {
      v.y = CONFIG.jumpSpeed; this.grounded = false; this.airJumps = 0;
    } else if (!this.grounded && pressed && this.airJumps < ctx.maxAirJumps) {
      v.y = CONFIG.jumpSpeed; this.airJumps++;
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

    // --- Land on platforms (only from above; pass through from below) ---
    let landed = null;
    this.grounded = false;
    this._ridePlat = null;
    if (v.y <= 0) {
      const newBottom = p.y - this.radius;
      for (const plat of field.platforms) {
        if (Math.abs(p.z - plat.pos.z) > plat.hz + 4) continue;
        const withinX = Math.abs(p.x - plat.pos.x) <= plat.hx + this.radius * 0.5;
        const withinZ = Math.abs(p.z - plat.pos.z) <= plat.hz + this.radius * 0.5;
        if (!withinX || !withinZ) continue;

        const top = plat.topY;
        if (prevBottom >= top - 0.05 && newBottom <= top) {
          if (plat.type === "bouncy") {
            v.y = CONFIG.jumpSpeed * 1.55; this.airJumps = 0; // bouncy launch re-arms double jump
          } else {
            p.y = top + this.radius; v.y = 0; this.grounded = true; this._ridePlat = plat; this.airJumps = 0;
          }
          this.lastGroundedY = top;
          this.jumpCount += 1;
          landed = plat.type;
          break;
        }
      }
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

    const died = !this.grounded && p.y < this.lastGroundedY - CONFIG.fallMargin;
    return { died, landed, hit, pos: p };
  }

  _roll(dt) {
    this.mesh.rotation.x += (this.vel.z * dt) / this.radius;
    this.mesh.rotation.z += (this.vel.x * dt) / this.radius;
  }
}
