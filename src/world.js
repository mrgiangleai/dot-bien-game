import * as THREE from 'three';
import { MAP_HALF, PHYS } from './config.js?v=20261016174818';

const AXES = ['x', 'y', 'z'];

// Bản đồ: hộp va chạm AABB + raycast. Không phụ thuộc DOM nên có thể chạy trên server sau này.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.boxes = [];
    this.spawns = [];
    this.pool = { x: -22, z: -15, w: 44, d: 30 };
    this.mats = {};
    this.group = new THREE.Group();
    scene.add(this.group);
    this.build();
  }

  mat(c) {
    return this.mats[c] ||= new THREE.MeshLambertMaterial({ color: c });
  }

  addBox(cx, cz, w, d, h, color, y0 = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    m.position.set(cx, y0 + h / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minY: y0, maxY: y0 + h, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return m;
  }

  addPlane(cx, cz, w, d, color, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, y, cz);
    m.receiveShadow = true;
    this.group.add(m);
  }

  build() {
    const H = MAP_HALF;
    this.addPlane(0, 0, H * 2 + 40, H * 2 + 40, 0xe9d6ab, 0);
    // hồ bơi xanh ở giữa
    const p = this.pool;
    this.addPlane(0, 0, p.w, p.d, 0x79bde9, 0.01);
    for (const z of [-5, 5]) this.addPlane(0, z, p.w, 0.25, 0xffffff, 0.02);
    this.addPlane(0, 0, 0.25, p.d, 0xffffff, 0.02);
    // gờ thấp quanh hồ (bước lên được)
    this.addBox(0, -15.5, 44, 1, 0.35, 0xf3ead8);
    this.addBox(0, 15.5, 44, 1, 0.35, 0xf3ead8);

    // tường bao
    const wc = 0xdcc6a0;
    this.addBox(0, -H, H * 2 + 1.5, 1.5, 5, wc);
    this.addBox(0, H, H * 2 + 1.5, 1.5, 5, wc);
    this.addBox(-H, 0, 1.5, H * 2, 5, wc);
    this.addBox(H, 0, 1.5, H * 2, 5, wc);

    // khối che chắn
    const blocks = [[-30, -30, 7, 4], [30, -30, 7, 4], [-30, 30, 7, 4], [30, 30, 7, 4],
      [0, -31, 10, 3], [0, 31, 10, 3], [-33, 0, 3, 10], [33, 0, 3, 10],
      [-18, -24, 4, 3], [18, 24, 4, 3], [18, -24, 4, 3], [-18, 24, 4, 3]];
    for (const [x, z, w, d] of blocks) this.addBox(x, z, w, d, 3.2, 0xd2b98f);

    // cầu thang leo lên các khối cao (mỗi bậc 0.4m < stepUp nên bước lên được)
    const stairs = [[-28, -28, 1], [28, -28, 1], [-28, 28, -1], [28, 28, -1], [3.5, -29.5, 1], [-3.5, 29.5, -1]];
    for (const [x, face, away] of stairs) this.addStairs(x, face, away, 3.2);

    // bục cao (nhảy lên được)
    this.addBox(-30, -12, 6, 6, 1.1, 0xc9ae82);
    this.addBox(30, 12, 6, 6, 1.1, 0xc9ae82);

    // thùng gỗ
    const crates = [[-10, -6], [10, 6], [6, -8], [-6, 8], [-15, 9], [15, -9], [24, -2], [-24, 2]];
    for (const [x, z] of crates) this.addBox(x, z, 1.3, 1.3, 1.1, 0xb0793f);
    this.addBox(0, 0, 2.4, 2.4, 2.2, 0xa56d36);
    // thùng phuy
    const barrelGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.15, 14);
    const barrels = [[-12, -10], [12, 10], [-3, -11], [3, 11], [-26, -20], [26, 20], [8, 1.5], [-8, -1.5]];
    for (const [x, z] of barrels) {
      const m = new THREE.Mesh(barrelGeo, this.mat(0x8a5a2e));
      m.position.set(x, 0.575, z);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      this.boxes.push({ minX: x - 0.45, maxX: x + 0.45, minY: 0, maxY: 1.15, minZ: z - 0.45, maxZ: z + 0.45 });
    }
    // ống trượt vàng trang trí
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 12, 16), this.mat(0xf2b632));
    pipe.rotation.z = Math.PI / 2 - 0.15;
    pipe.rotation.y = 0.4;
    pipe.position.set(4, 4.6, -36);
    pipe.castShadow = true;
    this.group.add(pipe);

    // điểm hồi sinh hợp lệ
    for (let x = -34; x <= 34; x += 5) {
      for (let z = -34; z <= 34; z += 5) {
        if (!this.pointBlocked(new THREE.Vector3(x, 0.5, z), 1.2)) this.spawns.push(new THREE.Vector3(x, 0, z));
      }
    }
  }

  // bậc thấp nhất ở xa khối, bậc cao nhất sát mặt khối (trục z)
  addStairs(x, faceZ, away, height, width = 2, rise = 0.4, run = 0.6) {
    const n = Math.round(height / rise);
    for (let i = 0; i < n; i++) {
      const z = faceZ + away * (n * run - (i + 0.5) * run);
      this.addBox(x, z, width, run, (i + 1) * rise, i % 2 ? 0xc4a678 : 0xceb184);
      this.boxes[this.boxes.length - 1].stair = true;
    }
  }

  randomSpawn(filter) {
    const list = filter ? this.spawns.filter(filter) : this.spawns;
    const s = list[(Math.random() * list.length) | 0] || this.spawns[0];
    return s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
  }

  pointBlocked(p, r = 0) {
    for (const b of this.boxes) {
      if (p.x > b.minX - r && p.x < b.maxX + r && p.y > b.minY - r && p.y < b.maxY + r &&
          p.z > b.minZ - r && p.z < b.maxZ + r) return true;
    }
    return false;
  }

  groundHeightAt(x, z, r, y) {
    const k = r * 0.7;
    let h = 0;
    for (const b of this.boxes) {
      if (x + k > b.minX && x - k < b.maxX && z + k > b.minZ && z - k < b.maxZ &&
          b.maxY <= y + PHYS.stepUp + 0.001 && b.maxY > h) h = b.maxY;
    }
    return h;
  }

  // đẩy hình tròn (nhân vật) ra khỏi các hộp
  resolve(pos, r, height) {
    for (const b of this.boxes) {
      if (b.maxY <= pos.y + PHYS.stepUp || b.minY >= pos.y + height) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        const opts = [[pos.x - b.minX + r, -1, 0], [b.maxX - pos.x + r, 1, 0], [pos.z - b.minZ + r, 0, -1], [b.maxZ - pos.z + r, 0, 1]];
        opts.sort((a, c) => a[0] - c[0]);
        pos.x += opts[0][1] * opts[0][0];
        pos.z += opts[0][2] * opts[0][0];
      }
    }
    const lim = MAP_HALF - 0.75 - r;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
  }

  // trả về {t, normal} gần nhất hoặc null
  raycast(o, d, maxT) {
    let best = null;
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t >= 0 && t <= maxT) best = { t, normal: new THREE.Vector3(0, 1, 0) };
    }
    for (const b of this.boxes) {
      const h = rayBox(o, d, b);
      if (h && h.t <= maxT && (!best || h.t < best.t)) best = h;
    }
    return best;
  }
}

function rayBox(o, d, b) {
  let tmin = -Infinity, tmax = Infinity, axis = 0, sign = 0;
  for (let i = 0; i < 3; i++) {
    const A = AXES[i];
    const mn = i === 0 ? b.minX : i === 1 ? b.minY : b.minZ;
    const mx = i === 0 ? b.maxX : i === 1 ? b.maxY : b.maxZ;
    const oa = o[A], da = d[A];
    if (Math.abs(da) < 1e-9) {
      if (oa < mn || oa > mx) return null;
      continue;
    }
    let t1 = (mn - oa) / da, t2 = (mx - oa) / da, s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const normal = new THREE.Vector3();
  normal[AXES[axis]] = sign;
  return { t: Math.max(0, tmin), normal };
}
