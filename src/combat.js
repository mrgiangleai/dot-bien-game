import * as THREE from 'three';
import { WEAPONS, ZOMBIE, PHYS, MODES } from './config.js';
import { sfx } from './audio.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
// vùng trúng: thân dưới, thân trên, đầu
// f = lệch về phía trước theo hướng nhân vật (dùng khi nằm)
const SPHERES = [{ f: 0, y: 0.45, r: 0.36, head: false }, { f: 0, y: 0.95, r: 0.4, head: false }, { f: 0, y: 1.42, r: 0.36, head: true }];
const PRONE_SPHERES = [{ f: 0.6, y: 0.3, r: 0.3, head: true }, { f: 0, y: 0.25, r: 0.36, head: false }, { f: -0.6, y: 0.2, r: 0.3, head: false }];

function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t < 0 ? null : t;
}

// Toàn bộ luật chiến đấu: bắn, chém, cào, lựu đạn, sát thương, lây nhiễm.
export class Combat {
  constructor(game) {
    this.g = game;
    this.nadeGeo = new THREE.SphereGeometry(0.13, 10, 8);
    this.nadeMat = new THREE.MeshLambertMaterial({ color: 0x3d5a2a });
  }

  handle(a, cmd, dt) {
    const pressed = cmd.fire && !a.firePrev;
    a.firePrev = cmd.fire;
    if (a.cooldown > 0) a.cooldown -= dt;
    if (a.attackAnim > 0) a.attackAnim = Math.max(0, a.attackAnim - dt * 4);
    if (!a.alive || a.downed) return;
    if (a.kind === 'zombie') {
      if (cmd.fire && a.cooldown <= 0) this.claw(a);
      return;
    }
    if (a.reloadTimer > 0) {
      a.reloadTimer -= dt;
      if (a.reloadTimer <= 0) this.finishReload(a);
    }
    if (cmd.slot && cmd.slot !== a.slot) this.switchSlot(a, cmd.slot);
    if (cmd.throw && a.grenades > 0) { this.throwGrenade(a, cmd); return; }
    if (cmd.reload) this.startReload(a);
    if (!cmd.fire || a.cooldown > 0) return;
    if (a.hasGun) {
      if (a.reloadTimer > 0) return;
      if (a.ammo <= 0) { this.startReload(a); return; }
      if (WEAPONS[a.slot].semi && !pressed) return; // súng ngắm: mỗi lần bấm 1 phát
      this.fireGun(a, cmd);
    } else if (a.slot === 'knife') this.knife(a);
    else if (a.slot === 'grenade') {
      if (a.grenades > 0) this.throwGrenade(a, cmd);
      else this.switchSlot(a, 'rifle');
    }
  }

  switchSlot(a, s) {
    if (s === 'grenade' && a.grenades <= 0) return;
    a.slot = s;
    a.reloadTimer = 0;
    a.cooldown = Math.max(a.cooldown, 0.25);
  }

  startReload(a) {
    if (!a.hasGun) return;
    const w = WEAPONS[a.slot];
    if (a.reloadTimer > 0 || a.ammo >= w.mag || a.reserve <= 0) return;
    a.reloadTimer = w.reload;
    if (a.isLocal) sfx.reload();
  }

  finishReload(a) {
    if (!a.hasGun) { a.reloadTimer = 0; return; }
    const n = Math.min(WEAPONS[a.slot].mag - a.ammo, a.reserve);
    a.ammo += n; a.reserve -= n; a.reloadTimer = 0;
  }

  raycastAll(o, d, maxT, shooter) {
    const wh = this.g.world.raycast(o, d, maxT);
    const best = { t: wh ? wh.t : maxT, normal: wh ? wh.normal : null, actor: null, head: false, point: new THREE.Vector3() };
    for (const a of this.g.actors) {
      if (a === shooter || !a.alive || a.downed || a.team === shooter.team) continue;
      const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      for (const s of a.prone ? PRONE_SPHERES : SPHERES) {
        const t = raySphere(o, d, a.pos.x + fx * s.f, a.pos.y + s.y, a.pos.z + fz * s.f, s.r);
        if (t !== null && t < best.t) { best.t = t; best.actor = a; best.head = s.head; }
      }
    }
    best.point.copy(o).addScaledVector(d, best.t);
    return best;
  }

  fireGun(a, cmd) {
    const w = WEAPONS[a.slot], g = this.g;
    a.ammo--;
    a.cooldown = w.rate;
    a.attackAnim = 0.5;
    const o = a.eyePos(v1);
    const d = cmd.aimDir ? v2.copy(cmd.aimDir) : a.lookDir(v2);
    const moving = Math.hypot(a.vel.x, a.vel.z) > 1;
    const sp = (a.aiming ? w.aimSpread : w.spread) * (moving ? 1.6 : 1) * (a.onGround ? 1 : 2.5) * (a.prone ? 0.6 : 1);
    d.x += (Math.random() - 0.5) * 2 * sp;
    d.y += (Math.random() - 0.5) * 2 * sp;
    d.z += (Math.random() - 0.5) * 2 * sp;
    d.normalize();
    const hit = this.raycastAll(o, d, w.range, a);
    const m = a.muzzlePos(v3);
    g.effects.tracer(m, hit.point);
    g.effects.flash(m);
    if (hit.actor) {
      const dmg = w.damage * (hit.head ? w.headMul : 1) * (0.9 + Math.random() * 0.2);
      g.effects.burst(hit.point, hit.actor.kind === 'zombie' ? 0x6fbf3a : 0xd23a3a, 6);
      this.damage(hit.actor, dmg, a, a.slot, hit.head, hit.point, d);
    } else if (hit.normal) {
      g.effects.burst(hit.point, 0xf0e2c0, 4);
    }
    if (a.slot === 'sniper') sfx.sniper(g.distToCam(m), a.isLocal);
    else sfx.shot(g.distToCam(m), a.isLocal);
    if (a.isLocal) {
      const kick = a.slot === 'sniper' ? 0.03 : a.aiming ? 0.003 : 0.007;
      g.input.pitch = Math.min(1.25, g.input.pitch + kick * (a.prone ? 0.5 : 1));
      g.input.yaw += (Math.random() - 0.5) * 0.006;
    }
  }

  meleeTarget(a, range, cone, includeDowned) {
    let best = null, bd = Infinity;
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    for (const o of this.g.actors) {
      if (o === a || o.team === a.team || !o.alive) continue;
      if (o.downed && !includeDowned) continue;
      const dx = o.pos.x - a.pos.x, dz = o.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + PHYS.radius || Math.abs(o.pos.y - a.pos.y) > 1.6) continue;
      if (dist > 0.6 && (dx * fx + dz * fz) / dist < Math.cos(cone)) continue;
      const score = dist - (o.downed ? 1 : 0); // ưu tiên kết liễu
      if (score < bd) { bd = score; best = o; }
    }
    return best;
  }

  claw(a) {
    a.cooldown = ZOMBIE.rate;
    a.attackAnim = 1;
    sfx.claw(this.g.distToCam(a.pos));
    const t = this.meleeTarget(a, ZOMBIE.range, 0.9, false);
    if (!t) return;
    const p = v4.set(t.pos.x, t.pos.y + 1.1, t.pos.z);
    this.g.effects.burst(p, 0xd23a3a, 8);
    this.damage(t, ZOMBIE.damage, a, 'claw', false, p, null);
  }

  knife(a) {
    const w = WEAPONS.knife;
    a.cooldown = w.rate;
    a.attackAnim = 1;
    sfx.knife(this.g.distToCam(a.pos));
    const t = this.meleeTarget(a, w.range, 1.0, true);
    if (!t) return;
    const p = v4.set(t.pos.x, t.pos.y + (t.downed ? 0.3 : 1.0), t.pos.z);
    this.g.effects.burst(p, 0x6fbf3a, 10);
    if (t.downed) this.eliminate(t, a);
    else this.damage(t, w.damage, a, 'knife', false, p, v3.subVectors(t.pos, a.pos));
  }

  damage(t, amount, att, weapon, head, point, dir) {
    const g = this.g;
    if (!t.alive || t.downed || t.spawnProt > 0 || g.phase === 'safe') return;
    if (att && t.team === att.team) return;
    amount = Math.max(1, Math.round(amount));
    t.hp -= amount;
    if (att && att.isLocal) {
      g.effects.number(point, amount, head);
      g.hud.hitmarker(head);
      sfx.hit(head);
    }
    if (t.isLocal) g.hud.hurt();
    if (dir && t.kind === 'zombie') {
      const f = weapon === 'rifle' ? 1.3 : weapon === 'sniper' ? 5 : weapon === 'knife' ? 7 : 0;
      t.knock.addScaledVector(v1.set(dir.x, 0, dir.z).normalize(), f);
    }
    if (t.hp > 0) return;

    if (g.mode === 'zombie') {
      if (t.kind === 'zombie') {
        t.hp = 0;
        t.downed = true;
        t.downTimer = ZOMBIE.reviveTime;
        t.deaths++;
        if (att) att.kills++;
        g.hud.feed(att, t, 'hạ gục');
        if (t.isLocal) g.hud.banner('BẠN BỊ HẠ GỤC', 'Sẽ hồi sinh nếu không bị kết liễu bằng dao', 2.5);
      } else {
        if (att) att.kills++;
        t.deaths++;
        g.infect(t, att);
      }
    } else {
      t.hp = 0;
      t.alive = false;
      t.respawnTimer = g.deadmatch ? 0 : MODES.tdm.respawn;
      t.deaths++;
      if (att) {
        att.kills++;
        if (!g.deadmatch) g.score[att.team === 'blue' ? 0 : 1]++;
      }
      if (t.isLocal && g.deadmatch) g.hud.banner('BẠN ĐÃ BỊ HẠ', 'Không hồi sinh · đang xem đồng đội', 2.5);
      g.hud.feed(att, t, weapon === 'knife' ? 'chém' : weapon === 'grenade' ? 'nổ tung' : 'hạ');
    }
  }

  eliminate(t, att) {
    t.downed = false;
    t.alive = false;
    t.eliminated = true;
    if (att) att.kills++;
    this.g.hud.feed(att, t, 'kết liễu');
    sfx.infect(this.g.distToCam(t.pos));
    if (t.isLocal) this.g.hud.banner('BẠN ĐÃ BỊ KẾT LIỄU', 'Chờ vòng sau', 3);
  }

  throwGrenade(a, cmd) {
    const w = WEAPONS.grenade, g = this.g;
    a.grenades--;
    a.cooldown = 0.7;
    a.attackAnim = 1;
    const d = cmd.aimDir ? cmd.aimDir.clone() : a.lookDir(new THREE.Vector3());
    const pos = a.eyePos(new THREE.Vector3()).addScaledVector(d, 0.5);
    const vel = d.clone().multiplyScalar(w.throwSpeed);
    vel.y += 3.5;
    vel.x += a.vel.x * 0.5;
    vel.z += a.vel.z * 0.5;
    const mesh = new THREE.Mesh(this.nadeGeo, this.nadeMat);
    mesh.castShadow = true;
    mesh.position.copy(pos);
    g.scene.add(mesh);
    g.grenades.push({ pos, vel, fuse: w.fuse, owner: a, team: a.team, mesh });
    if (a.slot === 'grenade') a.slot = 'rifle';
  }

  updateGrenades(dt) {
    const g = this.g, world = g.world;
    for (let i = g.grenades.length - 1; i >= 0; i--) {
      const n = g.grenades[i];
      n.fuse -= dt;
      n.vel.y -= PHYS.gravity * dt;
      for (const ax of ['x', 'y', 'z']) {
        const old = n.pos[ax];
        n.pos[ax] += n.vel[ax] * dt;
        if (world.pointBlocked(n.pos, 0.12)) {
          n.pos[ax] = old;
          n.vel[ax] *= -0.4;
          if (ax === 'y') { n.vel.x *= 0.7; n.vel.z *= 0.7; }
        }
      }
      if (n.pos.y < 0.13) {
        n.pos.y = 0.13;
        if (n.vel.y < 0) n.vel.y *= -0.4;
        n.vel.x *= 0.75; n.vel.z *= 0.75;
      }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += dt * 8;
      if (n.fuse <= 0) {
        this.explode(n);
        g.scene.remove(n.mesh);
        g.grenades.splice(i, 1);
      }
    }
  }

  explode(n) {
    const w = WEAPONS.grenade, g = this.g;
    g.effects.explosion(n.pos, w.radius);
    sfx.explode(g.distToCam(n.pos));
    for (const a of g.actors) {
      if (!a.alive || a.downed || a.team === n.team) continue;
      const c = v1.set(a.pos.x, a.pos.y + 0.9, a.pos.z);
      const dist = c.distanceTo(n.pos);
      if (dist > w.radius) continue;
      const dir = v2.subVectors(c, n.pos).normalize();
      if (g.world.raycast(n.pos, dir, dist)) continue;
      const f = 1 - dist / w.radius;
      dir.y = 0;
      a.knock.addScaledVector(dir.normalize(), 14 * f);
      a.vel.y = Math.max(a.vel.y, 5 * f);
      a.onGround = false;
      this.damage(a, w.damage * f, n.owner, 'grenade', false, c.clone(), null);
    }
  }
}
