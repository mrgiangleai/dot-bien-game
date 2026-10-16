import * as THREE from 'three';

const mats = {};
const mat = (c) => (mats[c] ||= new THREE.MeshLambertMaterial({ color: c }));

const legGeo = new THREE.BoxGeometry(0.24, 0.52, 0.26).translate(0, -0.26, 0);
const armGeo = new THREE.BoxGeometry(0.18, 0.46, 0.2).translate(0, -0.23, 0);
const handGeo = new THREE.SphereGeometry(0.11, 8, 6);
const torsoGeo = new THREE.BoxGeometry(0.62, 0.56, 0.4);
const headGeo = new THREE.SphereGeometry(0.36, 16, 12);
const helmetGeo = new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const eyeGeo = new THREE.BoxGeometry(0.07, 0.1, 0.04);
const spikeGeo = new THREE.ConeGeometry(0.09, 0.32, 6);
const gunGeo = new THREE.BoxGeometry(0.1, 0.8, 0.15);
const knifeGeo = new THREE.BoxGeometry(0.04, 0.42, 0.09);
const nadeGeo = new THREE.SphereGeometry(0.12, 10, 8);

// Nhân vật chibi dựng từ khối cơ bản, mặt hướng -Z.
export function createCharacter({ zombie = false, cloth = 0x7d8450 }) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skin = zombie ? 0x8fbf55 : 0xf1c8a0;
  const shirt = zombie ? 0x5f7d34 : cloth;
  const pants = zombie ? 0x4a5f2a : 0x6b5a3a;

  const legL = new THREE.Mesh(legGeo, mat(pants)); legL.position.set(-0.14, 0.52, 0);
  const legR = new THREE.Mesh(legGeo, mat(pants)); legR.position.set(0.14, 0.52, 0);
  const torso = new THREE.Mesh(torsoGeo, mat(shirt)); torso.position.y = 0.8;
  body.add(legL, legR, torso);

  const head = new THREE.Group();
  head.position.y = 1.38;
  head.add(new THREE.Mesh(headGeo, mat(skin)));
  const eyeMat = mat(zombie ? 0xff3a2a : 0x222222);
  for (const x of [-0.12, 0.12]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(x, 0.0, -0.34);
    head.add(e);
  }
  if (zombie) {
    // gai trên đầu và lưng như đột biến trong ảnh
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(spikeGeo, mat(0x9b6a3a));
      const a = (i / 6 - 0.5) * 2.2;
      s.position.set(Math.sin(a) * 0.3, 0.3 + Math.cos(a) * 0.05, Math.cos(a) * 0.1 + 0.05);
      s.rotation.z = -a * 0.6;
      head.add(s);
    }
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(spikeGeo, mat(0x9b6a3a));
      s.position.set((i - 2) * 0.12, 0.85 + (i % 2) * 0.12, 0.22);
      s.rotation.x = 1.0;
      body.add(s);
    }
  } else {
    const helmet = new THREE.Mesh(helmetGeo, mat(shirt));
    helmet.position.y = 0.04;
    head.add(helmet);
  }
  body.add(head);

  const makeArm = (x) => {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.position.set(x, 1.04, 0);
    g.add(new THREE.Mesh(armGeo, mat(shirt)));
    const h = new THREE.Mesh(handGeo, mat(skin));
    h.position.y = -0.5;
    g.add(h);
    body.add(g);
    return g;
  };
  const armL = makeArm(-0.41);
  const armR = makeArm(0.41);

  const gun = new THREE.Mesh(gunGeo, mat(0x2e2e2e));
  gun.position.set(0, -0.62, -0.07);
  armR.add(gun);
  const knife = new THREE.Mesh(knifeGeo, mat(0xd8dde2));
  knife.position.set(0, -0.72, 0);
  armR.add(knife);
  const nade = new THREE.Mesh(nadeGeo, mat(0x3d5a2a));
  nade.position.set(0, -0.6, 0);
  armR.add(nade);
  gun.visible = knife.visible = nade.visible = false;

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { root, body, head, legL, legR, armL, armR, gun, knife, nade };
}
