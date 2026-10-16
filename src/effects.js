import * as THREE from 'three';

const tracerGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, depthWrite: false });
const boomGeo = new THREE.SphereGeometry(1, 16, 12);
const proj = new THREE.Vector3();

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,230,1)');
  grd.addColorStop(0.35, 'rgba(255,190,80,.9)');
  grd.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.items = [];
    this.nums = [];
    this.layer = document.getElementById('dmg-layer');
    this.flashMat = new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ptMats = {};
  }

  add(obj, life, update, dispose) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, update, dispose });
  }

  tracer(a, b) {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.position.copy(a);
    m.lookAt(b);
    m.scale.z = a.distanceTo(b);
    this.add(m, 0.05);
  }

  flash(p) {
    const s = new THREE.Sprite(this.flashMat);
    s.position.copy(p);
    const k = 0.5 + Math.random() * 0.3;
    s.scale.set(k, k, 1);
    this.add(s, 0.05);
  }

  burst(p, color, n) {
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      vel.push((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = (this.ptMats[color] ||= new THREE.PointsMaterial({ color, size: 0.09 }));
    const pts = new THREE.Points(geo, mat);
    this.add(pts, 0.35, (it, dt) => {
      for (let i = 0; i < n; i++) {
        vel[i * 3 + 1] -= 12 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
    }, () => geo.dispose());
  }

  explosion(p, r) {
    const fire = new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.95, depthWrite: false });
    const m = new THREE.Mesh(boomGeo, fire);
    m.position.copy(p);
    this.add(m, 0.45, (it) => {
      const k = 1 - it.life / it.max;
      m.scale.setScalar(0.4 + k * r * 0.75);
      fire.opacity = 0.95 * (1 - k);
    }, () => fire.dispose());
    const smokeMat = new THREE.MeshLambertMaterial({ color: 0x777777, transparent: true, opacity: 0.6, depthWrite: false });
    const s = new THREE.Mesh(boomGeo, smokeMat);
    s.position.copy(p);
    this.add(s, 1.4, (it, dt) => {
      const k = 1 - it.life / it.max;
      s.scale.setScalar(1 + k * r * 0.6);
      s.position.y += dt * 1.2;
      smokeMat.opacity = 0.6 * (1 - k);
    }, () => smokeMat.dispose());
  }

  number(p, amount, head) {
    const el = document.createElement('div');
    el.className = 'dmg' + (head ? ' head' : '');
    el.textContent = amount;
    this.layer.appendChild(el);
    this.nums.push({ el, pos: p.clone(), life: 0.8, vx: (Math.random() - 0.5) * 0.8 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.update) it.update(it, dt);
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.dispose) it.dispose();
        this.items.splice(i, 1);
      }
    }
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life -= dt;
      n.pos.y += dt * 1.3;
      n.pos.x += n.vx * dt;
      if (n.life <= 0) { n.el.remove(); this.nums.splice(i, 1); continue; }
      proj.copy(n.pos).project(this.camera);
      if (proj.z > 1) { n.el.style.opacity = 0; continue; }
      const x = (proj.x * 0.5 + 0.5) * w, y = (-proj.y * 0.5 + 0.5) * h;
      n.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      n.el.style.opacity = Math.min(1, n.life * 3);
    }
  }

  clear() {
    for (const it of this.items) { this.scene.remove(it.obj); if (it.dispose) it.dispose(); }
    this.items = [];
    for (const n of this.nums) n.el.remove();
    this.nums = [];
  }
}
