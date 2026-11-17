// Wanted system: stars rise with crimes, police cars spawn and pursue, bust and
// wasted states, wanted decays when the player stays out of sight. Solmar Bay.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, WANTED_CFG, CAR_CFG } from './config.js';
import { makeCar } from './cars.js';
import { collideCircle } from './city.js';

export class Police {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.stars = 0;
    this.lastCrimeAt = -1000;
    this.decayTimer = 0;
    this.bustTimer = 0;
    this.cars = [];
    this.elapsed = 0;
  }

  addCrime(n, now) {
    if (n <= 0) return;
    this.stars = Math.min(WANTED_CFG.max, this.stars + n);
    this.lastCrimeAt = now;
    this.decayTimer = 0;
  }

  wantedCount() {
    if (this.stars <= 0) return 0;
    return Math.min(1 + Math.floor(this.stars / 2), 4);
  }

  spawnCar(playerPos) {
    const angle = this.rng.range(0, Math.PI * 2);
    const x = THREE.MathUtils.clamp(playerPos.x + Math.cos(angle) * 70, -115, 115);
    const z = THREE.MathUtils.clamp(playerPos.z + Math.sin(angle) * 70, -115, 115);
    const car = makeCar('police', 0xe8e8e8, x, z, Math.atan2(playerPos.x - x, playerPos.z - z));
    car.isPolice = true;
    car.speed = 10;
    this.scene.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  /**
   * ctx: { playerPos, playerCar, onFoot, dt, now, onBusted, onRam }
   * Returns 'busted' when the bust timer completes, else null.
   */
  update(dt, ctx) {
    this.elapsed += dt;
    const want = this.wantedCount();
    while (this.cars.length < want) this.spawnCar(ctx.playerPos);
    while (this.cars.length > want) this.removeCar(this.cars[this.cars.length - 1]);

    let nearest = Infinity;
    for (const car of this.cars) {
      const dx = ctx.playerPos.x - car.pos.x;
      const dz = ctx.playerPos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      nearest = Math.min(nearest, d);
      // Steer toward the player, with a limited turn rate.
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = THREE.MathUtils.clamp(diff, -2.4 * dt, 2.4 * dt);
      car.heading += turn;
      const targetSpeed = d > 40 ? 27 : 24;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      if (collideCircle(car.pos, CAR_CFG.radius, this.colliders)) {
        car.speed *= 0.6;
        car.heading += 0.9 * dt * (this.rng.chance(0.5) ? 1 : -1);
      }
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      for (const wheel of car.mesh.userData.wheels) {
        wheel.rotation.x += car.speed * dt * 2.4;
      }
      // Flash the light bar.
      const bar = car.mesh.userData.lightBar;
      if (bar) {
        const phase = Math.floor(this.elapsed * 6) % 2 === 0;
        bar.red.material.emissiveIntensity = phase ? 2.2 : 0.15;
        bar.blue.material.emissiveIntensity = phase ? 0.15 : 2.2;
      }
      // Ram the player.
      if (d < 3.6) {
        if (ctx.onFoot) {
          this.bustTimer += dt;
          ctx.onRam(8 * dt);
        } else if (ctx.playerCar) {
          ctx.playerCar.speed *= 1 - 0.9 * dt;
          ctx.onRam(0);
        }
      }
    }
    if (this.cars.length === 0 || nearest > WANTED_CFG.bustRange + 2) {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
    if (this.bustTimer >= WANTED_CFG.bustSeconds) {
      this.bustTimer = 0;
      return 'busted';
    }
    // Wanted decay: quiet for a while and no police close by. Hiding out at the
    // garage (mission 3) clears the heat four times faster.
    if (this.stars > 0 && this.elapsed - this.lastCrimeAt > WANTED_CFG.decayDelay && nearest > 45) {
      this.decayTimer += dt * (ctx.hideout ? 4 : 1);
      if (this.decayTimer >= WANTED_CFG.decayInterval) {
        this.decayTimer = 0;
        this.stars -= 1;
      }
    }
    return null;
  }

  clear() {
    for (const car of [...this.cars]) this.removeCar(car);
    this.stars = 0;
    this.bustTimer = 0;
  }
}
