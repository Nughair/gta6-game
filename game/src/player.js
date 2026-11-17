// The player on foot: Danny Cole. WASD movement relative to the camera, mouse look,
// sprint, building collision, walk animation. Solmar Bay.
import * as THREE from '../vendor/three.module.min.js';
import { PLAYER_CFG } from './config.js';
import { collideCircle } from './city.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(4, 0, 12);
    this.yaw = 0;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.health = PLAYER_CFG.maxHealth;
    this.walkPhase = 0;
    this.moving = false;
    this.lastDamageAt = -100;
    this.mesh = this.buildMesh();
    scene.add(this.mesh);
  }

  buildMesh() {
    const group = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.17), jeans);
    legL.position.set(-0.11, 0.26, 0);
    const legR = legL.clone();
    legR.position.set(0.11, 0.26, 0);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.62, 0.32), jacket);
    torso.position.set(0, 0.83, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
    head.position.set(0, 1.32, 0);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.52, 0.13), jacket);
    armL.position.set(-0.34, 0.83, 0);
    const armR = armL.clone();
    armR.position.set(0.34, 0.83, 0);
    for (const m of [legL, legR, torso, head, armL, armR]) {
      m.castShadow = true;
      group.add(m);
    }
    group.userData = { legL, legR, armL, armR };
    return group;
  }

  reset(x, z) {
    this.pos.set(x, 0, z);
    this.yaw = 0;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.health = PLAYER_CFG.maxHealth;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = 0;
  }

  damage(n, now) {
    this.health -= n;
    this.lastDamageAt = now;
    return this.health <= 0;
  }

  heal(n) {
    this.health = Math.min(PLAYER_CFG.maxHealth, this.health + n);
  }

  /** On-foot step. Returns distance moved. */
  step(dt, input, colliders) {
    const look = input.takeLook();
    this.camYaw -= look.dx * 0.0028;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + look.dy * 0.0022, -0.15, 1.1);
    let fx = 0;
    let fz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) fz += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) fz -= 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) fx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz);
    this.moving = len > 0;
    if (len > 0) {
      fx /= len;
      fz /= len;
      const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
      const speed = sprint ? PLAYER_CFG.sprintSpeed : PLAYER_CFG.walkSpeed;
      // Camera-relative: forward is where the camera looks.
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const mx = sin * fz + cos * fx;
      const mz = cos * fz - sin * fx;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.yaw = Math.atan2(mx, mz);
      collideCircle(this.pos, PLAYER_CFG.radius, colliders);
      this.walkPhase += dt * speed * 1.9;
    }
    const u = this.mesh.userData;
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    return this.moving;
  }

  /** Third-person camera position for on-foot mode. Returns { pos, lookAt }. */
  cameraTargets(outPos, outLook) {
    const dist = 7;
    const height = 2.6 + this.camPitch * 3.2;
    const cx = this.pos.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = this.pos.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    outPos.set(cx, height, cz);
    // Look at a point ahead of the player, not at the player: the crosshair then
    // sits on what the player is aiming at, and shots fly flat toward it.
    outLook.set(
      this.pos.x + Math.sin(this.camYaw) * 10,
      1.4,
      this.pos.z + Math.cos(this.camYaw) * 10,
    );
  }
}
