import * as THREE from 'three';
import { DIFFICULTY, ZOMBIE } from './config.js?v=20261016174818';
import { blankCmd } from './actor.js?v=20261016174818';

const TAU = Math.PI * 2;
const STEER = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.4, -2.4];
const tmpO = new THREE.Vector3(), tmpD = new THREE.Vector3();

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

// AI bot: chỉ tạo ra lệnh điều khiển giống hệt người chơi, không gian lận vị trí.
export class BotController {
  constructor(actor, game, difficulty) {
    this.a = actor;
    this.g = game;
    this.d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.yaw = 0; this.pitch = 0;
    this.target = null; this.visible = false; this.finish = null;
    this.seen = 0; this.think = Math.random() * 0.3;
    this.strafe = 1; this.strafeT = 0;
    this.wander = Math.random() * TAU; this.wanderT = 0;
    this.burstT = 0; this.firing = false;
    this.err = new THREE.Vector3();
    this.lastPos = new THREE.Vector3(); this.stuckCheck = 0; this.unstuckT = 0;
  }

  reset() { this.yaw = this.a.yaw; this.target = null; this.seen = 0; }

  sample(dt) {
    const a = this.a;
    const cmd = blankCmd(this.yaw, this.pitch);
    if (!a.alive || a.downed) return cmd;
    this.think -= dt;
    if (this.think <= 0) { this.think = 0.2 + Math.random() * 0.15; this.decide(); }
    let moveDir = a.kind === 'zombie' ? this.zombieLogic(cmd, dt) : this.humanLogic(cmd, dt);

    // chống kẹt
    this.stuckCheck -= dt;
    if (this.stuckCheck <= 0) {
      if (moveDir !== null && a.pos.distanceTo(this.lastPos) < 0.5 && this.unstuckT <= 0) {
        this.unstuckT = 0.8 + Math.random() * 0.6;
        this.wander = Math.random() * TAU;
        cmd.jump = true;
      }
      this.lastPos.copy(a.pos);
      this.stuckCheck = 0.7;
    }
    if (this.unstuckT > 0) { this.unstuckT -= dt; moveDir = this.wander; }

    if (moveDir !== null) {
      const dir = this.steer(moveDir);
      if (a.kind === 'zombie' && !cmd.fire) this.turnTo(dir, dt, 9);
      cmd.move.x = -Math.sin(dir - this.yaw);
      cmd.move.z = Math.cos(dir - this.yaw);
    }
    cmd.yaw = this.yaw;
    cmd.pitch = this.pitch;
    return cmd;
  }

  decide() {
    const a = this.a, g = this.g;
    let best = null, bestScore = Infinity, bestVis = false;
    for (const o of g.actors) {
      if (o === a || !o.alive || o.downed || o.team === a.team) continue;
      const dist = a.pos.distanceTo(o.pos);
      const vis = dist < 70 && g.hasLOS(a, o);
      const score = dist * (vis ? 1 : 1.8);
      if (score < bestScore) { bestScore = score; best = o; bestVis = vis; }
    }
    if (best !== this.target) this.seen = 0;
    this.target = best;
    this.visible = bestVis;
    // sai số ngắm thay đổi theo thời gian
    const s = this.d.aimError;
    this.err.set((Math.random() - 0.5) * 2 * s, (Math.random() - 0.5) * 2 * s, (Math.random() - 0.5) * 2 * s);

    this.finish = null;
    if (a.kind === 'human' && g.mode === 'zombie') {
      let bd = 14;
      for (const o of g.actors) {
        if (!o.downed) continue;
        const dd = a.pos.distanceTo(o.pos);
        if (dd < bd) { bd = dd; this.finish = o; }
      }
    }
  }

  turnTo(yaw, dt, rate) {
    const df = angDiff(this.yaw, yaw);
    const m = rate * dt;
    this.yaw += Math.max(-m, Math.min(m, df));
    return Math.abs(df);
  }

  aimAt(p, dt) {
    const a = this.a;
    const dx = p.x - a.pos.x, dz = p.z - a.pos.z;
    const dy = p.y - (a.pos.y + 1.5);
    const err = this.turnTo(yawTo(dx, dz), dt, this.d.turn);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * this.d.turn);
    return err;
  }

  humanLogic(cmd, dt) {
    const a = this.a, g = this.g, t = this.target;
    let moveDir = null;
    const dist = t ? a.pos.distanceTo(t.pos) : Infinity;
    const has = (gun) => a.mag[gun] > 0 || a.res[gun] > 0;
    // xa thì dùng súng ngắm, gần thì súng máy, hết đạn thì dao
    let wantSlot = has('sniper') && (dist > 32 || !has('rifle')) ? 'sniper' : has('rifle') ? 'rifle' : 'knife';
    const threatNear = t && this.visible && dist < 9;

    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 0.6 + Math.random() * 1.2; }

    if (this.finish && this.finish.downed && !threatNear) {
      // đi kết liễu đột biến bằng dao
      const f = this.finish;
      wantSlot = 'knife';
      const fd = Math.hypot(f.pos.x - a.pos.x, f.pos.z - a.pos.z);
      this.aimAt(tmpO.set(f.pos.x, f.pos.y + 0.3, f.pos.z), dt);
      if (fd < 1.6) cmd.fire = a.slot === 'knife';
      else moveDir = yawTo(f.pos.x - a.pos.x, f.pos.z - a.pos.z);
    } else if (t && this.visible) {
      this.seen += dt;
      const lead = Math.min(0.25, dist / 120);
      const p = tmpO.set(t.pos.x + t.vel.x * lead, t.pos.y + 1.0 + t.vel.y * lead, t.pos.z + t.vel.z * lead)
        .addScaledVector(this.err, dist / 10);
      const err = this.aimAt(p, dt);
      if (wantSlot === 'knife') {
        moveDir = yawTo(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
        cmd.fire = dist < 2;
      } else {
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.firing = !this.firing;
          this.burstT = (this.firing ? this.d.burst : this.d.pause) * (0.6 + Math.random() * 0.8);
        }
        cmd.fire = this.seen > this.d.reaction && err < 0.2 && this.firing;
        cmd.aim = wantSlot === 'sniper' || (dist > 25 && this.d.turn > 6);
        const toT = yawTo(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
        if (t.kind === 'zombie') {
          moveDir = dist < 12 ? toT + Math.PI + this.strafe * 0.5 : toT + this.strafe * Math.PI / 2;
        } else if (dist > 24) moveDir = toT + this.strafe * 0.4;
        else if (dist < 8) moveDir = toT + Math.PI + this.strafe * 0.5;
        else moveDir = toT + this.strafe * Math.PI / 2;
        if (a.grenades > 0 && dist > 8 && dist < 22 && Math.random() < dt * 0.06) {
          this.pitch += 0.25;
          cmd.throw = true;
        }
      }
    } else {
      this.pitch *= 0.9;
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wander = Math.random() * TAU; this.wanderT = 2 + Math.random() * 3; }
      // đấu đội: đi săn; zombie: người lang thang chậm, tránh xa đột biến
      if (t && g.mode === 'tdm') moveDir = yawTo(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
      else if (t && dist < 15) moveDir = yawTo(a.pos.x - t.pos.x, a.pos.z - t.pos.z);
      else if (Math.random() < 0.7 || g.phase === 'prep') moveDir = this.wander;
      if (moveDir !== null) this.turnTo(moveDir, dt, 4);
      if (a.hasGun && a.ammo < (a.slot === 'sniper' ? 5 : 15)) cmd.reload = true;
    }
    if (a.hasGun && a.ammo === 0) cmd.reload = true;
    if (a.slot !== wantSlot) cmd.slot = wantSlot;
    return moveDir;
  }

  zombieLogic(cmd, dt) {
    const a = this.a, t = this.target;
    if (!t) {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wander = Math.random() * TAU; this.wanderT = 2 + Math.random() * 2; }
      return this.wander;
    }
    const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    const toT = yawTo(dx, dz);
    if (dist < ZOMBIE.range + 0.4) {
      const err = this.aimAt(tmpO.set(t.pos.x, t.pos.y + 1, t.pos.z), dt * 2);
      cmd.fire = err < 0.6;
    }
    if (t.pos.y > a.pos.y + 0.6 && dist < 4) cmd.jump = true;
    return dist > 1.0 ? toT : null;
  }

  // tránh vật cản bằng cách dò tia theo nhiều hướng
  steer(dir) {
    const a = this.a, w = this.g.world;
    tmpO.set(a.pos.x, a.pos.y + 0.6, a.pos.z);
    for (const off of STEER) {
      const y = dir + off;
      tmpD.set(-Math.sin(y), 0, -Math.cos(y));
      if (!w.raycast(tmpO, tmpD, 1.8)) return y;
    }
    return dir;
  }
}
