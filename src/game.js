import * as THREE from 'three';
import { World } from './world.js';
import { Actor } from './actor.js';
import { BotController } from './bot.js';
import { LocalInput, isTouch } from './input.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { MODES, SIM_DT, ZOMBIE, BOT_NAMES, SAFE, WEAPONS } from './config.js';
import { sfx } from './audio.js';

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/*
 * Vòng lặp trận đấu. Mỗi tick: controller -> lệnh -> actor.update + combat.handle.
 * Khi làm chơi mạng: server chạy cùng vòng tick này, client gửi lệnh từ LocalInput,
 * người chơi khác được điều khiển bởi một RemoteController nhận lệnh qua WebSocket.
 */
export class Game {
  constructor(container, opts, hooks = {}) {
    this.opts = opts;
    this.hooks = hooks;
    this.mode = opts.mode === 'tdm' ? 'tdm' : 'zombie';

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0xbfe4f7);
    scene.fog = new THREE.Fog(0xbfe4f7, 70, 160);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcdb88a, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(25, 45, 15);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 120;
    sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    scene.add(this.camera);
    this.viewmodel = this.createViewmodel();

    this.world = new World(scene);
    this.zones = this.createZones();
    this.effects = new Effects(scene, this.camera);
    this.combat = new Combat(this);
    this.hud = new Hud(this);
    this.input = new LocalInput(r.domElement, { sens: opts.sens, onPause: () => this.requestPause() });

    this.actors = [];
    this.grenades = [];
    this.player = this.addActor({ name: opts.name || 'Bạn', isLocal: true });
    this.player.controller = this.input;
    const names = shuffle(BOT_NAMES.slice());
    for (let i = 0; i < opts.bots; i++) {
      const name = names[i % names.length] + (i >= names.length ? ` ${i}` : '');
      const b = this.addActor({ name, isBot: true });
      b.controller = new BotController(b, this, opts.difficulty);
    }

    this.score = [0, 0];
    this.round = 0;
    this.phase = 'play';
    this.timer = 0;
    this.paused = false;
    this.disposed = false;
    this.acc = 0;
    this.spec = null;
    this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3();
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
    this.startRound();
  }

  addActor(o) {
    const a = new Actor(this, { id: this.actors.length, ...o });
    this.actors.push(a);
    return a;
  }

  start() {
    this.last = performance.now();
    const loop = (t) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      if (!this.paused) {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= SIM_DT && steps < 6) { this.tick(SIM_DT); this.acc -= SIM_DT; steps++; }
        if (steps === 6) this.acc = 0;
      }
      this.render(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  requestPause() {
    if (this.paused || this.disposed) return;
    this.paused = true;
    this.input.clearHeld();
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.hooks.onPause) this.hooks.onPause();
  }

  resume() {
    this.paused = false;
    this.input.clearHeld();
    this.input.lock();
    this.last = performance.now();
  }

  // ---------- luật chơi ----------
  placeAt(a, pos) {
    a.pos.copy(pos);
    a.vel.set(0, 0, 0);
    a.yaw = Math.atan2(pos.x, pos.z); // quay về giữa bản đồ
    a.pitch = 0;
    if (a.isLocal) { this.input.yaw = a.yaw; this.input.pitch = -0.05; }
    else a.controller.reset();
  }

  // vùng an toàn đầu vòng: zombie = 1 vùng chung giữa map, đấu đội = mỗi đội 1 vùng
  createZones() {
    const defs = this.mode === 'zombie'
      ? [{ key: 'all', x: 0, z: 0, r: 10 }]
      : [{ key: 'blue', x: 15, z: 33, r: 6 }, { key: 'red', x: -15, z: -33, r: 6 }];
    return defs.map((z) => {
      const color = z.key === 'red' ? 0xff6a5a : z.key === 'blue' ? 0x5aa8ff : 0x5fe08a;
      const g = new THREE.Group();
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(z.r, z.r, 2.4, 48, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      wall.position.y = 1.2;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(z.r - 0.25, z.r, 64),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      g.add(wall, ring);
      g.position.set(z.x, 0, z.z);
      g.visible = false;
      this.scene.add(g);
      return { ...z, mesh: g };
    });
  }

  zoneFor(a) {
    return this.zones.find((z) => z.key === 'all' || z.key === a.team);
  }

  zoneSpawn(z) {
    const p = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * (z.r - 1.2);
      p.set(z.x + Math.cos(ang) * rr, 0.5, z.z + Math.sin(ang) * rr);
      if (!this.world.pointBlocked(p, 0.8)) break;
    }
    p.y = 0;
    return p;
  }

  teamSpawn(team) {
    if (team === 'blue') return this.world.randomSpawn((s) => s.z > 22);
    if (team === 'red') return this.world.randomSpawn((s) => s.z < -22);
    return this.world.randomSpawn();
  }

  startRound() {
    this.round++;
    for (const n of this.grenades) this.scene.remove(n.mesh);
    this.grenades = [];
    this.spec = null;
    this.phase = 'safe';
    this.timer = SAFE.time;
    if (this.mode === 'zombie') {
      for (const a of this.actors) a.becomeHuman('human');
    } else {
      if (this.round > 1) this.score = [0, 0];
      this.actors.forEach((a, i) => {
        a.becomeHuman(i % 2 === 0 ? 'blue' : 'red');
        a.kills = a.deaths = 0;
      });
    }
    for (const a of this.actors) this.placeAt(a, this.zoneSpawn(this.zoneFor(a)));
    for (const z of this.zones) z.mesh.visible = true;
    this.hud.banner(this.mode === 'zombie' ? `VÒNG ${this.round}` : 'ĐẤU ĐỘI', `Vùng an toàn · chuẩn bị ${SAFE.time} giây`, 3);
    sfx.round();
  }

  respawn(a) {
    if (this.mode !== 'tdm' || this.phase !== 'play') return;
    a.becomeHuman(a.team);
    a.spawnProt = 2;
    this.placeAt(a, this.teamSpawn(a.team));
  }

  infect(t, att) {
    t.becomeZombie(1);
    this.hud.feed(att, t, 'lây nhiễm');
    sfx.infect(this.distToCam(t.pos));
    if (t.isLocal) this.hud.banner('BẠN ĐÃ BỊ NHIỄM!', 'Hãy lây nhiễm tất cả con người', 2.5);
  }

  endRound(winner) {
    this.phase = 'end';
    this.timer = 6;
    if (this.mode === 'zombie') {
      this.score[winner === 'human' ? 0 : 1]++;
      const won = winner === this.player.team || (winner === 'human' && this.player.kind === 'human');
      this.hud.banner(winner === 'human' ? 'CON NGƯỜI CHIẾN THẮNG' : 'ĐỘT BIẾN CHIẾN THẮNG', won ? 'Bạn thắng vòng này!' : 'Bạn thua vòng này', 5);
    } else {
      const [b, r] = this.score;
      const title = b === r ? 'HÒA' : b > r ? 'ĐỘI XANH THẮNG' : 'ĐỘI ĐỎ THẮNG';
      const mine = this.player.team === 'blue' ? b > r : r > b;
      this.hud.banner(title, b === r ? '' : mine ? 'Đội bạn chiến thắng!' : 'Đội bạn thất bại', 5);
    }
    sfx.round();
  }

  updateMode(dt) {
    this.timer -= dt;
    if (this.phase === 'end') {
      if (this.timer <= 0) this.startRound();
      return;
    }
    if (this.phase === 'safe') {
      if (this.timer > 0) return;
      for (const z of this.zones) z.mesh.visible = false;
      if (this.mode === 'zombie') {
        this.phase = 'prep';
        this.timer = MODES.zombie.prep;
        this.hud.banner('RỜI VÙNG AN TOÀN', `Đột biến sẽ xuất hiện sau ${MODES.zombie.prep} giây`, 2.5);
      } else {
        this.phase = 'play';
        this.timer = MODES.tdm.roundTime;
        this.hud.banner('BẮT ĐẦU!', `Đội nào đạt ${MODES.tdm.killTarget} điểm trước sẽ thắng`, 2.5);
      }
      sfx.round();
      return;
    }
    if (this.mode === 'zombie') {
      if (this.phase === 'prep') {
        if (this.timer > 0) return;
        const pool = shuffle(this.actors.slice());
        const k = Math.max(1, Math.round(this.actors.length / 8));
        for (let i = 0; i < k; i++) {
          pool[i].becomeZombie(ZOMBIE.motherMul);
          this.hud.feed(null, pool[i], 'Đột biến mẹ:');
        }
        this.phase = 'play';
        this.timer = MODES.zombie.roundTime;
        const me = this.player.kind === 'zombie';
        this.hud.banner('ĐỘT BIẾN ĐÃ XUẤT HIỆN!', me ? 'Bạn là Đột biến mẹ — lây nhiễm tất cả!' : 'Sống sót đến hết giờ', 3);
        sfx.infect(0);
        return;
      }
      let humans = 0, zombies = 0;
      for (const a of this.actors) {
        if (a.kind === 'human' && a.alive) humans++;
        else if (a.kind === 'zombie' && !a.eliminated) zombies++;
      }
      if (humans === 0) this.endRound('zombie');
      else if (zombies === 0 || this.timer <= 0) this.endRound('human');
    } else {
      const T = MODES.tdm.killTarget;
      if (this.timer <= 0 || this.score[0] >= T || this.score[1] >= T) this.endRound();
    }
  }

  // ---------- mô phỏng ----------
  tick(dt) {
    for (const a of this.actors) {
      const cmd = a.controller.sample(dt);
      const safe = this.phase === 'safe';
      if (safe || (a.isLocal && this.phase === 'end')) { cmd.fire = false; cmd.throw = false; }
      if (a.isLocal) {
        this.input.lastSlot = a.slot;
        if (cmd.fire || cmd.throw) cmd.aimDir = this.computeAimDir();
      }
      a.update(cmd, dt);
      if (safe) this.keepInZone(a);
      this.combat.handle(a, cmd, dt);
    }
    this.combat.updateGrenades(dt);
    this.updateMode(dt);
  }

  keepInZone(a) {
    const z = this.zoneFor(a);
    const dx = a.pos.x - z.x, dz = a.pos.z - z.z;
    const d = Math.hypot(dx, dz), max = z.r - 0.5;
    if (d > max) { a.pos.x = z.x + (dx / d) * max; a.pos.z = z.z + (dz / d) * max; }
  }

  hasLOS(a, b) {
    const o = a.eyePos(this._v1);
    const d = this._v2.set(b.pos.x, b.pos.y + 1.1, b.pos.z).sub(o);
    const len = d.length();
    d.divideScalar(len);
    return !this.world.raycast(o, d, len);
  }

  // hướng từ mắt nhân vật tới điểm mà tâm ngắm trên màn hình đang chỉ vào
  computeAimDir() {
    const cam = this.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const hit = this.combat.raycastAll(cam.position, fwd, 200, this.player);
    const eye = this.player.eyePos(this._v3);
    const dir = hit.point.clone().sub(eye);
    if (dir.length() < 1.2 || dir.dot(fwd) <= 0) return fwd;
    return dir.normalize();
  }

  distToCam(p) { return this.camera.position.distanceTo(p); }

  // ---------- hiển thị ----------
  createViewmodel() {
    const g = new THREE.Group();
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const gun = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.62), lam(0x2e2e2e));
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), lam(0x3a3a3a));
    mag.position.set(0, -0.12, -0.05);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), lam(0x7d8450));
    hand.position.set(0.02, -0.06, 0.25);
    gun.add(body, mag, hand);
    const knife = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.36), lam(0xd8dde2));
    blade.position.z = -0.2;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.22), lam(0xf1c8a0));
    knife.add(blade, grip);
    const nade = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), lam(0x3d5a2a));
    const sniper = new THREE.Group();
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.95), lam(0x3b3227));
    sBody.position.z = -0.15;
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 12).rotateX(Math.PI / 2), lam(0x1b1b1b));
    scope.position.set(0, 0.1, -0.05);
    const sHand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), lam(0x7d8450));
    sHand.position.set(0.02, -0.06, 0.3);
    sniper.add(sBody, scope, sHand);
    g.add(gun, knife, nade, sniper);
    g.position.set(0.26, -0.24, -0.55);
    g.visible = false;
    this.camera.add(g);
    return { g, gun, knife, nade, sniper };
  }

  updateViewmodel(on) {
    const p = this.player, vm = this.viewmodel;
    vm.g.visible = on && p.kind === 'human';
    if (!vm.g.visible) return;
    vm.gun.visible = p.slot === 'rifle';
    vm.sniper.visible = p.slot === 'sniper';
    vm.knife.visible = p.slot === 'knife';
    vm.nade.visible = p.slot === 'grenade';
    const a = Math.sin(p.attackAnim * Math.PI);
    const bob = Math.sin(p.walkPhase * 2) * 0.012 * Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 4);
    const aimX = p.aiming ? 0 : 0.26, aimY = p.aiming ? -0.17 : -0.24;
    vm.g.position.set(aimX, aimY + bob - (p.reloadTimer > 0 ? 0.15 : 0), -0.55 + (p.hasGun ? a * 0.05 : -a * 0.25));
    vm.g.rotation.set(p.slot === 'knife' ? -a * 0.8 : a * 0.06, p.slot === 'knife' ? a * 0.6 : 0, 0);
  }

  toggleScope(on) {
    if (this._scoped === on) return;
    this._scoped = on;
    document.getElementById('scope').classList.toggle('show', on);
    document.getElementById('crosshair').classList.toggle('hidden', on);
  }

  updateCamera(dt) {
    const p = this.player;
    const live = p.alive && !p.downed;
    // ngắm súng ngắm: luôn chuyển sang nhìn qua ống ngắm x4
    const scoped = live && p.aiming && p.slot === 'sniper';
    const fp = live && (this.input.firstPerson || scoped);
    this.updateViewmodel(fp && !scoped);
    this.toggleScope(scoped);
    const baseFov = 70;
    this.input.zoomMul = scoped ? 1.2 / WEAPONS.sniper.zoom : p.aiming ? 0.7 : 1;
    if (fp) {
      // góc nhìn thứ nhất: camera đặt ở mắt nhân vật
      p.hideMesh = true;
      const eye = p.eyePos(this._v1);
      eye.y += 0.05;
      this.camera.position.copy(eye);
      const yaw = this.input.yaw, pitch = this.input.pitch, cp = Math.cos(pitch);
      this.camera.lookAt(eye.x - Math.sin(yaw) * cp, eye.y + Math.sin(pitch), eye.z - Math.cos(yaw) * cp);
      const fov = scoped ? baseFov / WEAPONS.sniper.zoom : p.aiming ? 50 : 78;
      if (scoped && this.camera.fov !== fov) {
        this.camera.fov = fov; // vào ống ngắm ngay, không trễ
        this.camera.updateProjectionMatrix();
      } else if (Math.abs(this.camera.fov - fov) > 0.1) {
        this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 12);
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    let t = p, yaw = this.input.yaw, pitch = this.input.pitch;
    if (!p.alive) {
      if (!this.spec || !this.spec.alive || this.spec === p) {
        const list = this.actors.filter((a) => a.alive && a !== p);
        const mates = list.filter((a) => a.team === p.team);
        const pick = mates.length ? mates : list;
        this.spec = pick[(Math.random() * pick.length) | 0] || null;
      }
      if (this.spec) { t = this.spec; yaw = t.yaw; pitch = t.pitch * 0.5 - 0.15; }
    }
    const aiming = t === p && p.aiming;
    const pivot = this._v1.set(t.pos.x, t.pos.y + (t.downed ? 1.0 : t.prone ? 0.8 : 1.6), t.pos.z);
    const cp = Math.cos(pitch);
    const fwd = this._v2.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    const dist = aiming ? 1.6 : 3.4, side = aiming ? 0.55 : 0.8;
    const want = this._v3.copy(pivot).addScaledVector(fwd, -dist);
    want.x += Math.cos(yaw) * side;
    want.z -= Math.sin(yaw) * side;
    want.y += 0.25;
    const off = want.clone().sub(pivot);
    const len = off.length();
    off.divideScalar(len);
    const hit = this.world.raycast(pivot, off, len);
    const d = hit ? Math.max(0.3, hit.t - 0.25) : len;
    const pos = pivot.clone().addScaledVector(off, d);
    // camera sát tường: ẩn nhân vật để không che màn hình
    p.hideMesh = t === p && d < 1.2;
    if (t === p) this.camera.position.copy(pos);
    else this.camera.position.lerp(pos, Math.min(1, dt * 8));
    this.camera.lookAt(pos.addScaledVector(fwd, 10));
    const fov = aiming ? 48 : 70;
    if (Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }
  }

  render(dt) {
    this.updateCamera(dt);
    for (const a of this.actors) a.syncMesh(dt);
    this.effects.update(dt);
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._onResize);
    this.input.dispose();
    this.effects.clear();
    for (const a of this.actors) a.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
