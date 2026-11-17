// Pedestrians: sidewalk walkers who flee from danger, plus armed hostiles for the
// shootout mission. Solmar Bay — all original low-poly figures.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD } from './config.js';

const SHIRTS = [0xd84a4a, 0x3a86d8, 0x3aa86a, 0xd8a03a, 0x8a5ad8, 0xe8e8e8, 0x22262a, 0xd86a9a];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];
const PANTS = [0x2a3a5a, 0x3a3a3a, 0x5a4a3a, 0x4a5a6a];

export function makePedMesh(rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKINS) });
  const pants = new THREE.MeshLambertMaterial({ color: rng.pick(PANTS) });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), pants);
  legL.position.set(-0.11, 0.25, 0);
  const legR = legL.clone();
  legR.position.set(0.11, 0.25, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.6, 0.3), shirt);
  torso.position.set(0, 0.8, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.set(0, 1.28, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), shirt);
  armL.position.set(-0.33, 0.8, 0);
  const armR = armL.clone();
  armR.position.set(0.33, 0.8, 0);
  for (const m of [legL, legR, torso, head, armL, armR]) {
    m.castShadow = true;
    group.add(m);
  }
  group.userData = { legL, legR, armL, armR };
  return group;
}

export class Peds {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.list = [];
  }

  spawn(x, z, hostile = false) {
    const mesh = makePedMesh(this.rng);
    mesh.position.set(x, 0, z);
    // Snap the walking behaviour onto the nearest sidewalk, keeping the given
    // position (hostiles and near-player spawns must stay where they were put).
    let bestD = Infinity;
    let bestLine = WORLD.streets[0];
    let bestAxis = 'x';
    for (const s of WORLD.streets) {
      const dz = Math.abs(z - s);
      if (dz < bestD) {
        bestD = dz;
        bestLine = s;
        bestAxis = 'x';
      }
      const dx = Math.abs(x - s);
      if (dx < bestD) {
        bestD = dx;
        bestLine = s;
        bestAxis = 'z';
      }
    }
    const offset = bestAxis === 'x'
      ? THREE.MathUtils.clamp(z - bestLine, -9, 9) || 9
      : THREE.MathUtils.clamp(x - bestLine, -9, 9) || 9;
    const ped = {
      mesh,
      pos: mesh.position,
      heading: this.rng.range(0, Math.PI * 2),
      speed: hostile ? 0 : this.rng.range(1.2, 1.9),
      state: hostile ? 'hostile' : 'walk',
      hp: 100,
      hostile,
      phase: this.rng.range(0, 6),
      axis: bestAxis,
      street: bestLine,
      dir: this.rng.pick([-1, 1]),
      offset,
      fleeTimer: 0,
      shootTimer: this.rng.range(0.5, 1.5),
      fadeTimer: 0,
      dead: false,
    };
    ped.mesh.position.copy(ped.pos);
    this.scene.add(mesh);
    this.list.push(ped);
    return ped;
  }

  spawnNear(playerPos, count) {
    let n = 0;
    for (const ped of this.list) {
      if (!ped.dead) n += 1;
    }
    while (n < count) {
      const p = this.streetPointNear(playerPos);
      this.spawn(p.x, p.z);
      n += 1;
    }
  }

  streetPointNear(near) {
    const line = this.rng.pick(WORLD.streets);
    const along = THREE.MathUtils.clamp(near.x + this.rng.range(-60, 60), -115, 115);
    if (this.rng.chance(0.5)) return { x: along, z: line + this.rng.pick([-9, 9]) };
    return { x: line + this.rng.pick([-9, 9]), z: THREE.MathUtils.clamp(near.z + this.rng.range(-60, 60), -115, 115) };
  }

  nearestCrossing(v) {
    let best = WORLD.streets[0];
    let bestD = Infinity;
    for (const s of WORLD.streets) {
      const d = Math.abs(v - s);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** danger: {x, z} the peds flee from, or null. ctx: { playerPos, onPedShoot }. */
  update(dt, danger, ctx) {
    for (const ped of this.list) {
      if (ped.dead) {
        ped.fadeTimer -= dt;
        if (ped.fadeTimer <= 0) {
          this.scene.remove(ped.mesh);
          this.list.splice(this.list.indexOf(ped), 1);
        }
        continue;
      }
      if (ped.state === 'hostile') {
        const dx = ctx.playerPos.x - ped.pos.x;
        const dz = ctx.playerPos.z - ped.pos.z;
        const d = Math.hypot(dx, dz);
        ped.heading = Math.atan2(dx, dz);
        if (d > 6) {
          ped.speed = 3.2;
          ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
          ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
        } else {
          ped.speed = 0;
        }
        ped.shootTimer -= dt;
        if (d < 30 && ped.shootTimer <= 0) {
          ped.shootTimer = this.rng.range(1.2, 2.2);
          ctx.onPedShoot(ped);
        }
      } else if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        ped.pos.x += Math.sin(ped.heading) * 4.5 * dt;
        ped.pos.z += Math.cos(ped.heading) * 4.5 * dt;
        ped.pos.x = THREE.MathUtils.clamp(ped.pos.x, -125, 125);
        ped.pos.z = THREE.MathUtils.clamp(ped.pos.z, -125, 125);
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      } else {
        // Walk along the sidewalk; turn at intersections sometimes.
        ped.speed = 1.5;
        const along = ped.axis === 'x' ? ped.pos.x : ped.pos.z;
        const crossing = this.nearestCrossing(along);
        if (Math.abs(along - crossing) < 1 && this.rng.chance(0.012)) {
          ped.axis = ped.axis === 'x' ? 'z' : 'x';
          ped.street = crossing;
          ped.dir = this.rng.pick([-1, 1]);
          ped.offset = this.rng.pick([-9, 9]);
        }
        ped.heading = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : ped.dir > 0 ? 0 : Math.PI;
        ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
        if (ped.axis === 'x') {
          ped.pos.z += (ped.street + ped.offset - ped.pos.z) * Math.min(1, dt * 4);
          if (Math.abs(ped.pos.x) > 118) ped.dir *= -1;
        } else {
          ped.pos.x += (ped.street + ped.offset - ped.pos.x) * Math.min(1, dt * 4);
          if (Math.abs(ped.pos.z) > 118) ped.dir *= -1;
        }
      }
      // Flee trigger.
      if (danger && ped.state === 'walk') {
        const d = Math.hypot(ped.pos.x - danger.x, ped.pos.z - danger.z);
        if (d < 14) {
          ped.state = 'flee';
          ped.fleeTimer = 2.5;
          ped.heading = Math.atan2(ped.pos.x - danger.x, ped.pos.z - danger.z);
        }
      }
      // Walk cycle.
      ped.phase += dt * (ped.state === 'flee' ? 14 : 8) * Math.max(0.4, ped.speed / 1.5);
      const swing = Math.sin(ped.phase) * 0.55;
      const u = ped.mesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
      ped.mesh.position.copy(ped.pos);
      ped.mesh.rotation.y = ped.heading;
    }
  }

  kill(ped) {
    if (ped.dead) return;
    ped.dead = true;
    ped.state = 'dead';
    ped.fadeTimer = 6;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.25;
  }
}
