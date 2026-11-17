// Drivable cars: mesh builders, arcade driving physics for the player, and AI traffic
// that follows the street grid. Solmar Bay — all original models built from boxes.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, CAR_CFG } from './config.js';
import { collideCircle } from './city.js';

const BODY_COLORS = [0xc23a2a, 0x2a6ac2, 0x3a9a4a, 0xd8a03a, 0x8a5ad8, 0xd8d8d8, 0x22262a, 0x4a9a9a];
const GLASS = new THREE.MeshLambertMaterial({ color: 0x18222c });
const TYRE = new THREE.MeshLambertMaterial({ color: 0x14161a });
const LIGHT_FRONT = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xfff2a8, emissiveIntensity: 0.8 });
const LIGHT_REAR = new THREE.MeshLambertMaterial({ color: 0xc22a1a, emissive: 0x881606, emissiveIntensity: 0.8 });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Build a car model. kind: sedan | sport | taxi | van | police. Returns { group, wheels, lightBar }. */
export function makeCarMesh(kind, color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const low = kind === 'sport';
  const long = kind === 'van';
  const bodyLen = long ? 5.0 : low ? 4.4 : 4.2;
  const bodyH = low ? 0.5 : 0.62;
  const bodyY = low ? 0.5 : 0.58;
  group.add(box(1.9, bodyH, bodyLen, bodyMat, 0, bodyY, 0));
  const cabinLen = long ? 3.4 : low ? 1.6 : 2.1;
  const cabin = box(1.65, 0.5, cabinLen, GLASS, 0, bodyY + bodyH / 2 + 0.24, long ? 0.3 : -0.15);
  group.add(cabin);
  if (kind === 'taxi') {
    group.add(box(0.7, 0.22, 0.5, new THREE.MeshLambertMaterial({ color: 0x222222 }), 0, bodyY + bodyH / 2 + 0.6, -0.15));
  }
  if (kind === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xd81a1a, emissive: 0xff2020, emissiveIntensity: 1 }),
    );
    red.position.set(-0.35, 0, 0);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x1a3ad8, emissive: 0x2040ff, emissiveIntensity: 1 }),
    );
    blue.position.set(0.35, 0, 0);
    bar.add(red);
    bar.add(blue);
    bar.position.set(0, bodyY + bodyH / 2 + 0.55, -0.15);
    group.add(bar);
    group.userData.lightBar = { red, blue };
  }
  // Headlights and taillights.
  for (const side of [-1, 1]) {
    group.add(box(0.34, 0.14, 0.08, LIGHT_FRONT, side * 0.62, bodyY, bodyLen / 2));
    group.add(box(0.34, 0.14, 0.08, LIGHT_REAR, side * 0.62, bodyY, -bodyLen / 2));
  }
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, TYRE);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 0.95, 0.38, sz * (bodyLen / 2 - 0.75));
      group.add(wheel);
      wheels.push(wheel);
    }
  }
  group.userData.wheels = wheels;
  return group;
}

export function makeCar(kind, color, x, z, heading) {
  const mesh = makeCarMesh(kind, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    kind,
    color,
    mesh,
    pos: mesh.position,
    heading,
    speed: 0,
    steer: 0,
    hp: 100,
    isPlayer: false,
    isPolice: kind === 'police',
    isTraffic: false,
    id: 0,
  };
}

/** Arcade driving step for the player car. controls: {forward, back, left, right, brake}. */
export function stepPlayerCar(car, controls, dt, colliders, others) {
  const cfg = CAR_CFG;
  const maxSpeed = car.kind === 'sport' ? 34 : car.kind === 'van' ? 22 : cfg.maxSpeed;
  if (controls.forward) car.speed += cfg.accel * dt;
  if (controls.back) {
    car.speed -= car.speed > 0.5 ? cfg.brake * dt : cfg.reverseAccel * dt;
  }
  if (controls.brake) car.speed -= Math.sign(car.speed) * cfg.brake * 1.4 * dt;
  if (!controls.forward && !controls.back) {
    car.speed -= Math.sign(car.speed) * 6 * dt;
    if (Math.abs(car.speed) < 0.2) car.speed = 0;
  }
  car.speed = Math.max(-cfg.maxReverse, Math.min(maxSpeed, car.speed));
  const steerTarget = (controls.left ? 1 : 0) - (controls.right ? 1 : 0);
  const steerSpeed = Math.min(1, Math.abs(car.speed) / 6);
  car.steer += (steerTarget * cfg.steerMax * steerSpeed - car.steer) * Math.min(1, dt * 10);
  car.heading += car.steer * (car.speed / 2.6) * dt * (car.speed < 0 ? -1 : 1) * 0.55;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  car.pos.x += fx * car.speed * dt;
  car.pos.z += fz * car.speed * dt;
  const hitWall = collideCircle(car.pos, cfg.radius, colliders);
  if (hitWall) {
    car.speed *= 0.45;
  }
  // Car-to-car bumps.
  for (const other of others) {
    if (other === car) continue;
    const dx = car.pos.x - other.pos.x;
    const dz = car.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    const min = cfg.radius + 2.0;
    if (d < min && d > 0.001) {
      const push = (min - d) / 2;
      car.pos.x += (dx / d) * push;
      car.pos.z += (dz / d) * push;
      other.pos.x -= (dx / d) * push;
      other.pos.z -= (dz / d) * push;
      car.speed *= 0.7;
      if (other.isTraffic) other.speed *= 0.5;
    }
  }
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  for (const wheel of car.mesh.userData.wheels) {
    wheel.rotation.x += car.speed * dt * 2.4;
  }
  return hitWall;
}

// ---- Traffic ----

export class Traffic {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.cars = [];
    this.nextId = 1;
  }

  spawn(x, z, heading) {
    const kind = this.rng.pick(['sedan', 'sedan', 'taxi', 'van', 'sport']);
    const color = kind === 'taxi' ? 0xe8c832 : this.rng.pick(BODY_COLORS);
    const car = makeCar(kind, color, x, z, heading);
    car.isTraffic = true;
    car.speed = this.rng.range(7, 11);
    car.id = this.nextId;
    this.nextId += 1;
    car.street = this.nearestStreet(x, z);
    car.axis = Math.abs(x - car.street.x) < Math.abs(z - car.street.z) ? 'z' : 'x';
    car.dir = this.rng.pick([-1, 1]);
    this.scene.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  nearestStreet(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const s of WORLD.streets) {
      const d = Math.min(Math.abs(x - s), Math.abs(z - s));
      if (d < bestD) {
        bestD = d;
        best = Math.abs(x - s) < Math.abs(z - s) ? { x: s, z } : { x, z: s };
      }
    }
    return best;
  }

  spawnNear(playerPos, count) {
    while (this.cars.length < count) {
      const horizontal = this.rng.chance(0.5);
      const line = this.rng.pick(WORLD.streets);
      const along = this.rng.range(-110, 110);
      const x = horizontal ? along : line;
      const z = horizontal ? line : along;
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < 25) continue;
      const heading = horizontal ? (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : this.rng.chance(0.5) ? 0 : Math.PI;
      this.spawn(x, z, heading);
    }
  }

  /** Is there a car ahead of `car` within `dist`? */
  carAhead(car, others, dist) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const o of others) {
      if (o === car) continue;
      const dx = o.pos.x - car.pos.x;
      const dz = o.pos.z - car.pos.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < dist && side < 3) return true;
    }
    return false;
  }

  update(dt, playerCar, playerPos) {
    const all = [...this.cars];
    if (playerCar) all.push(playerCar);
    for (const car of this.cars) {
      // Move forward.
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      let target = car.speed;
      if (this.carAhead(car, all, 10)) target = 0;
      car.speed += (target - car.speed) * Math.min(1, dt * 3);
      car.pos.x += fx * car.speed * dt;
      car.pos.z += fz * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing street.
      const nearX = this.nearestCrossing(car.pos.x);
      const nearZ = this.nearestCrossing(car.pos.z);
      if (Math.abs(car.pos.x - nearX) < 1.2 && Math.abs(car.pos.z - nearZ) < 1.2 && !car.justTurned) {
        const roll = this.rng.next();
        if (roll < 0.22) {
          const turn = this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
          car.heading += turn;
          car.justTurned = true;
        }
      } else if (Math.abs(car.pos.x - nearX) > 4 || Math.abs(car.pos.z - nearZ) > 4) {
        car.justTurned = false;
      }
      // Keep inside the city; wrap to the far side.
      if (Math.abs(car.pos.x) > 130 || Math.abs(car.pos.z) > 130) {
        car.pos.x = THREE.MathUtils.clamp(car.pos.x, -120, 120);
        car.pos.z = THREE.MathUtils.clamp(car.pos.z, -120, 120);
        car.heading += Math.PI;
      }
      collideCircle(car.pos, CAR_CFG.radius, this.colliders);
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      for (const wheel of car.mesh.userData.wheels) {
        wheel.rotation.x += car.speed * dt * 2.4;
      }
      // Recycle cars that drifted far from the player.
      if (playerPos && Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z) > 150) {
        this.scene.remove(car.mesh);
        this.cars.splice(this.cars.indexOf(car), 1);
      }
    }
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

  remove(car) {
    this.scene.remove(car.mesh);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }
}
