import * as THREE from 'three';
import { PHYS, HUMAN, ZOMBIE, WEAPONS, TEAM_CLOTH } from './config.js?v=20261016174818';
import { createCharacter } from './character.js?v=20261016174818';

const lerp = THREE.MathUtils.lerp;

// Lệnh điều khiển mỗi tick. Người chơi, bot và (sau này) người chơi mạng đều tạo ra cùng cấu trúc này.
export function blankCmd(yaw = 0, pitch = 0) {
  return { move: { x: 0, z: 0 }, yaw, pitch, jump: false, fire: false, aim: false,
    reload: false, slot: null, throw: false, prone: false, aimDir: null };
}

export class Actor {
  constructor(game, { id, name, isBot = false, isLocal = false }) {
    Object.assign(this, { game, id, name, isBot, isLocal });
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.onGround = true; this.aiming = false;
    this.team = 'human'; this.kind = null; this.hp = 100; this.maxHp = 100;
    this.alive = true; this.downed = false; this.eliminated = false;
    this.downTimer = 0; this.respawnTimer = 0; this.spawnProt = 0;
    this.slot = 'rifle'; this.grenades = 0;
    this.mag = { rifle: 0, sniper: 0 }; this.res = { rifle: 0, sniper: 0 };
    this.prone = false; this.firePrev = false;
    this.reloadTimer = 0; this.cooldown = 0; this.attackAnim = 0;
    this.kills = 0; this.deaths = 0;
    this.walkPhase = Math.random() * 6;
    this.parts = null; this.appKey = '';
    this.controller = null;

    const c = (this.tagCanvas = document.createElement('canvas'));
    c.width = 256; c.height = 72;
    this.tagTex = new THREE.CanvasTexture(c);
    this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, transparent: true, depthWrite: false }));
    this.tag.scale.set(1.7, 0.48, 1);
    this.tag.position.y = 2.3;
    this.tagKey = '';
  }

  setAppearance(kind, cloth) {
    const key = kind + cloth;
    if (key === this.appKey) return;
    if (this.parts) this.game.scene.remove(this.parts.root);
    this.parts = createCharacter({ zombie: kind === 'zombie', cloth });
    this.parts.root.add(this.tag);
    this.game.scene.add(this.parts.root);
    this.kind = kind;
    this.appKey = key;
    this.tagKey = '';
  }

  becomeHuman(team) {
    this.setAppearance('human', TEAM_CLOTH[team]);
    this.team = team;
    this.maxHp = this.hp = HUMAN.hp;
    this.alive = true; this.downed = false; this.eliminated = false;
    this.vel.set(0, 0, 0); this.knock.set(0, 0, 0);
    this.prone = false;
    this.resetLoadout();
  }

  becomeZombie(hpMul = 1) {
    this.setAppearance('zombie', 0);
    this.team = 'zombie';
    this.maxHp = this.hp = ZOMBIE.hp * hpMul;
    this.alive = true; this.downed = false; this.eliminated = false;
    this.slot = 'claw'; this.reloadTimer = 0; this.prone = false;
  }

  resetLoadout() {
    this.slot = 'rifle';
    for (const g of ['rifle', 'sniper']) {
      this.mag[g] = WEAPONS[g].mag;
      this.res[g] = WEAPONS[g].reserve;
    }
    this.grenades = WEAPONS.grenade.count;
    this.reloadTimer = 0; this.cooldown = 0;
  }

  // súng đang cầm (dao/lựu đạn thì tính theo súng máy)
  get gun() { return this.slot === 'sniper' ? 'sniper' : 'rifle'; }
  get ammo() { return this.mag[this.gun]; }
  set ammo(v) { this.mag[this.gun] = v; }
  get reserve() { return this.res[this.gun]; }
  set reserve(v) { this.res[this.gun] = v; }
  get hasGun() { return this.slot === 'rifle' || this.slot === 'sniper'; }

  eyePos(out) {
    if (!this.prone) return out.set(this.pos.x, this.pos.y + PHYS.eye, this.pos.z);
    // nằm: mắt thấp và lệch về phía trước (đầu nằm trước tâm)
    return out.set(this.pos.x - Math.sin(this.yaw) * 0.6, this.pos.y + PHYS.proneEye, this.pos.z - Math.cos(this.yaw) * 0.6);
  }

  lookDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  muzzlePos(out) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    if (this.prone) return out.set(this.pos.x - s * 1.4 + c * 0.2, this.pos.y + 0.35, this.pos.z - c * 1.4 - s * 0.2);
    return out.set(this.pos.x - s * 0.75 + c * 0.38, this.pos.y + 1.12 + Math.sin(this.pitch) * 0.6, this.pos.z - c * 0.75 - s * 0.38);
  }

  update(cmd, dt) {
    const world = this.game.world;
    if (this.spawnProt > 0) this.spawnProt -= dt;
    if (!this.alive) {
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.game.respawn(this);
      }
      return;
    }
    let mx = 0, mz = 0;
    if (this.downed) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.downed = false;
        this.hp = this.maxHp * ZOMBIE.reviveHp;
      }
    } else {
      this.yaw = cmd.yaw;
      this.pitch = cmd.pitch;
      this.aiming = cmd.aim && this.kind === 'human' && this.hasGun;
      if (cmd.prone && this.kind === 'human' && this.onGround) this.prone = !this.prone;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      // forward = (-sin, -cos), right = (cos, -sin)
      mx = -s * cmd.move.z + c * cmd.move.x;
      mz = -c * cmd.move.z - s * cmd.move.x;
      if (cmd.jump && this.prone) {
        this.prone = false; // nhảy khi đang nằm = đứng dậy
      } else if (cmd.jump && this.onGround) {
        this.vel.y = PHYS.jumpVel * (this.kind === 'zombie' ? 1.1 : 1);
        this.onGround = false;
      }
    }
    let speed = this.kind === 'zombie' ? ZOMBIE.speed : HUMAN.speed;
    if (this.prone) speed *= HUMAN.proneMul;
    else if (this.aiming) speed *= this.slot === 'sniper' ? 0.4 : 0.55;
    else if (this.slot === 'knife') speed *= 1.1;
    const k = Math.min(1, dt * (this.onGround ? 14 : 3));
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;
    this.vel.y -= PHYS.gravity * dt;

    this.pos.addScaledVector(this.vel, dt).addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-6 * dt));

    world.resolve(this.pos, PHYS.radius, this.prone ? PHYS.proneHeight : PHYS.height);
    const gh = world.groundHeightAt(this.pos.x, this.pos.z, PHYS.radius, this.pos.y);
    if (this.pos.y <= gh) {
      this.pos.y = gh; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && this.vel.y <= 0 && this.pos.y - gh < 0.4) {
      this.pos.y = gh; this.vel.y = 0;
    } else {
      this.onGround = false;
    }
  }

  drawTag(ally) {
    const ctx = this.tagCanvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 72);
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(this.name, 128, 30);
    ctx.fillStyle = ally ? '#ffffff' : '#ffd6cf';
    ctx.fillText(this.name, 128, 30);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(48, 42, 160, 12);
    if (this.downed) {
      ctx.fillStyle = '#ffcc33';
      ctx.fillRect(50, 44, 156 * Math.max(0, this.downTimer / ZOMBIE.reviveTime), 8);
    } else {
      ctx.fillStyle = ally ? '#5fd16a' : '#ff5a4a';
      ctx.fillRect(50, 44, 156 * Math.max(0, this.hp / this.maxHp), 8);
    }
    this.tagTex.needsUpdate = true;
  }

  syncMesh(dt) {
    const P = this.parts;
    if (!P) return;
    P.root.visible = !this.eliminated && !this.hideMesh;
    P.root.position.copy(this.pos);
    P.root.rotation.y = this.yaw;

    const ally = this.game.player.team === this.team;
    this.tag.visible = !this.isLocal && this.alive;
    const key = `${Math.ceil(this.hp)}|${ally}|${this.downed ? Math.ceil(this.downTimer * 4) : ''}`;
    if (key !== this.tagKey) { this.tagKey = key; this.drawTag(ally); }

    const kk = Math.min(1, dt * 10);
    if (this.downed || !this.alive) {
      P.body.rotation.x = lerp(P.body.rotation.x, -Math.PI / 2, kk);
      P.body.position.y = lerp(P.body.position.y, 0.22, kk);
      P.body.position.z = lerp(P.body.position.z, 0, kk);
      P.legL.rotation.x = P.legR.rotation.x = 0;
      return;
    }
    const prone = this.prone;
    P.body.rotation.x = lerp(P.body.rotation.x, prone ? -Math.PI / 2 : 0, kk);
    P.body.position.y = lerp(P.body.position.y, prone ? 0.2 : 0, kk);
    // khi nằm, dời thân ra sau để thân nằm quanh vị trí nhân vật (khớp hitbox)
    P.body.position.z = lerp(P.body.position.z, prone ? 0.75 : 0, kk);

    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += sp * dt * (prone ? 4 : 1.7);
    const sw = Math.sin(this.walkPhase) * 0.8 * Math.min(1, sp / 4);
    if (prone) { P.legL.rotation.x = sw * 0.4; P.legR.rotation.x = -sw * 0.4; }
    else if (!this.onGround) { P.legL.rotation.x = 0.5; P.legR.rotation.x = -0.3; }
    else { P.legL.rotation.x = sw; P.legR.rotation.x = -sw; }
    P.head.rotation.x = (prone ? 1.35 : 0) + this.pitch * 0.4;

    const a = Math.sin(this.attackAnim * Math.PI);
    const pitch = this.pitch;
    // tay chĩa về phía trước: đứng = PI/2, nằm = PI (vì thân đã xoay ngang)
    const fwd = prone ? Math.PI : Math.PI / 2;
    if (this.kind === 'zombie') {
      const base = 1.35 + Math.sin(this.walkPhase * 0.5) * 0.1;
      P.armL.rotation.set(base, -0.15, 0);
      P.armR.rotation.set(base + a * 1.0, 0.15 - a * 0.9, 0);
    } else if (this.hasGun) {
      P.armR.rotation.set(fwd + pitch + this.attackAnim * 0.12, 0.25, 0);
      P.armL.rotation.set(fwd + pitch, -0.6, 0);
    } else if (this.slot === 'knife') {
      P.armR.rotation.set((prone ? fwd : 0.6) + a * 1.6, 0.2 - a * 0.8, 0);
      P.armL.rotation.set(prone ? fwd : 0.2 + sw * 0.5, 0, 0);
    } else {
      P.armR.rotation.set((prone ? fwd : 2.8) - a * 2.5, 0, 0);
      P.armL.rotation.set(prone ? fwd : 0.5, 0, 0);
    }
    const human = this.kind === 'human';
    P.gun.visible = human && this.slot === 'rifle';
    P.sniper.visible = human && this.slot === 'sniper';
    P.knife.visible = human && this.slot === 'knife';
    P.nade.visible = human && this.slot === 'grenade';
  }

  dispose() {
    if (this.parts) this.game.scene.remove(this.parts.root);
    this.tagTex.dispose();
    this.tag.material.dispose();
  }
}
