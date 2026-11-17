// Procedural Solmar Bay: street grid, blocks with varied buildings, sidewalks, lamps,
// props, a bay with a pier, day sun with shadows. All original geometry and textures.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, PALETTE } from './config.js';

/** Push a circle (x, z, radius) out of every building AABB it overlaps. Returns true on hit. */
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      const pushL = pos.x - (c.minX - radius);
      const pushR = c.maxX + radius - pos.x;
      const pushB = pos.z - (c.minZ - radius);
      const pushF = c.maxZ + radius - pos.z;
      const m = Math.min(pushL, pushR, pushB, pushF);
      if (m === pushL) pos.x = c.minX - radius;
      else if (m === pushR) pos.x = c.maxX + radius;
      else if (m === pushB) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
  return hit;
}

function facadeTexture(rng, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#d4d8dc';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.10)';
  for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 128, 2);
  for (let y = 10; y < 246; y += 26) {
    for (let x = 10; x < 118; x += 18) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#2a323c';
      g.fillRect(x, y, 9, 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 64, 8);
  g.fillStyle = '#e8c84a';
  g.fillRect(4, 2, 40, 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const BUILDING_COLORS = [0xc9a06a, 0x8fa8bf, 0xb0705a, 0x9a8f7a, 0x7a8a9a, 0xc47f6a, 0xa8a0b8, 0x6a8a7a];
const SHOP_COLORS = [0xd84a4a, 0x3a86d8, 0x3aa86a, 0xd8a03a, 0x8a5ad8, 0xd86a9a];

export function buildCity(scene, rng) {
  const colliders = [];
  const buildingMeshes = [];
  const group = new THREE.Group();
  scene.add(group);

  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 200, 460);

  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6b5d4f, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.position.set(130, 190, 70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -170;
  sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170;
  sun.shadow.camera.bottom = -170;
  sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // Ground: asphalt everywhere, then sidewalk plates per block.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.ground, WORLD.ground),
    new THREE.MeshLambertMaterial({ color: PALETTE.asphalt }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // The bay: water south of the city, sand strip, and a wooden pier.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.ground, 18),
    new THREE.MeshLambertMaterial({ color: 0xd8c48a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, WORLD.waterZ + 9);
  sand.receiveShadow = true;
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.ground, 70),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.35, WORLD.waterZ - 26);
  group.add(water);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.5, 34),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
  );
  pier.position.set(24, 0.25, WORLD.waterZ - 8);
  pier.castShadow = true;
  pier.receiveShadow = true;
  group.add(pier);
  colliders.push({ minX: 18, maxX: 30, minZ: WORLD.waterZ - 25, maxZ: WORLD.waterZ + 9 });

  // Dashed centre lines along every street.
  const dashTex = dashTexture();
  for (const s of WORLD.streets) {
    for (const horizontal of [true, false]) {
      const tex = dashTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(40, 1);
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(300, 0.5),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      line.rotation.x = -Math.PI / 2;
      if (!horizontal) line.rotation.z = Math.PI / 2;
      line.position.set(horizontal ? 0 : s, 0.03, horizontal ? s : 0);
      group.add(line);
    }
  }

  // Buildings, parks and parking lots, one per block.
  const facades = [facadeTexture(rng, 0.25), facadeTexture(rng, 0.45), facadeTexture(rng, 0.15)];
  const parkBlocks = new Set(['-72,-72', '72,24']);
  const lotBlocks = new Set(['24,-72']);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8a3a });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1.8, 0);
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });

  for (const bx of WORLD.blockCenters) {
    for (const bz of WORLD.blockCenters) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(34, 0.3, 34), sidewalkMat);
      plate.position.set(bx, 0.15, bz);
      plate.receiveShadow = true;
      group.add(plate);
      const key = `${bx},${bz}`;
      if (parkBlocks.has(key)) {
        const grass = new THREE.Mesh(
          new THREE.BoxGeometry(30, 0.4, 30),
          new THREE.MeshLambertMaterial({ color: 0x4a8a3f }),
        );
        grass.position.set(bx, 0.2, bz);
        grass.receiveShadow = true;
        group.add(grass);
        for (let t = 0; t < 7; t += 1) {
          const tx = bx + rng.range(-11, 11);
          const tz = bz + rng.range(-11, 11);
          const trunk = new THREE.Mesh(trunkGeo, trunkMat);
          trunk.position.set(tx, 1.4, tz);
          trunk.castShadow = true;
          group.add(trunk);
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          leaf.position.set(tx, 3.6, tz);
          leaf.castShadow = true;
          group.add(leaf);
        }
        continue;
      }
      if (lotBlocks.has(key)) {
        for (let i = 0; i < 5; i += 1) {
          const cx = bx - 8 + (i % 3) * 8;
          const cz = bz - 6 + Math.floor(i / 3) * 10;
          const crate = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 1.4, 1.6),
            new THREE.MeshLambertMaterial({ color: 0x9a7a3a }),
          );
          crate.position.set(cx, 0.9, cz);
          crate.castShadow = true;
          group.add(crate);
          colliders.push({ minX: cx - 1.1, maxX: cx + 1.1, minZ: cz - 0.8, maxZ: cz + 0.8 });
        }
        continue;
      }
      const count = rng.int(1, 3);
      for (let b = 0; b < count; b += 1) {
        const w = rng.range(8, 15);
        const d = rng.range(8, 15);
        const h = rng.chance(0.12) ? rng.range(42, 64) : rng.range(9, 30);
        const ox = count === 1 ? 0 : (b % 2 === 0 ? -6 : 6);
        const oz = count === 1 ? 0 : (b < 2 ? -6 : 6);
        const x = bx + ox;
        const z = bz + oz;
        const tex = rng.pick(facades).clone();
        tex.needsUpdate = true;
        // One texture tile per ~14 units, so windows stay square on any height.
        tex.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 14)));
        const mat = new THREE.MeshLambertMaterial({
          map: tex,
          color: rng.pick(BUILDING_COLORS),
        });
        const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        building.position.set(x, h / 2 + 0.3, z);
        building.castShadow = true;
        building.receiveShadow = true;
        group.add(building);
        buildingMeshes.push(building);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        // Shopfront band at street level for low buildings.
        if (h < 20 && rng.chance(0.7)) {
          const shop = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.4, 2.4, 0.4),
            new THREE.MeshLambertMaterial({ color: rng.pick(SHOP_COLORS) }),
          );
          shop.position.set(x, 1.5, z + d / 2 + 0.2);
          group.add(shop);
        }
        // Rooftop box.
        if (rng.chance(0.6)) {
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(rng.range(2, 4), 1.2, rng.range(2, 4)),
            new THREE.MeshLambertMaterial({ color: 0x555a60 }),
          );
          roof.position.set(x + rng.range(-2, 2), h + 0.9, z + rng.range(-2, 2));
          group.add(roof);
        }
      }
    }
  }

  // Distant skyline silhouettes beyond the playable city.
  const skyMat = new THREE.MeshLambertMaterial({ color: 0x5a6a7a });
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const r = rng.range(185, 230);
    const w = rng.range(14, 26);
    const h = rng.range(50, 110);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skyMat);
    tower.position.set(Math.cos(angle) * r, h / 2, Math.sin(angle) * r);
    group.add(tower);
  }

  // Street lamps at a spread of intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0.9 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 6);
  const headGeo = new THREE.BoxGeometry(0.9, 0.18, 0.35);
  let lampCount = 0;
  for (const sx of WORLD.streets) {
    for (const sz of WORLD.streets) {
      if ((sx + sz) % 96 !== 0) continue;
      if (lampCount >= 16) break;
      lampCount += 1;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(sx + 8.5, 3, sz + 8.5);
      pole.castShadow = true;
      group.add(pole);
      const head = new THREE.Mesh(headGeo, lampMat);
      head.position.set(sx + 8.2, 6.05, sz + 8.5);
      group.add(head);
    }
  }

  // Fire hydrants and crates scattered near corners.
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xc23a2a });
  const hydGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.9, 8);
  for (let i = 0; i < 12; i += 1) {
    const sx = rng.pick(WORLD.streets);
    const sz = rng.pick(WORLD.streets);
    const hyd = new THREE.Mesh(hydGeo, hydMat);
    hyd.position.set(sx + rng.pick([-8.6, 8.6]), 0.45, sz + rng.pick([-8.6, 8.6]));
    hyd.castShadow = true;
    group.add(hyd);
  }

  return { colliders, buildingMeshes, group };
}

/** A random point on a street (used for spawns). */
export function streetPoint(rng, near, radius = 120) {
  for (let tries = 0; tries < 20; tries += 1) {
    const horizontal = rng.chance(0.5);
    const line = rng.pick(WORLD.streets);
    const along = rng.range(-110, 110);
    const p = horizontal ? { x: along, z: line } : { x: line, z: along };
    if (!near || Math.hypot(p.x - near.x, p.z - near.z) < radius) return p;
  }
  return { x: 0, z: 0 };
}
