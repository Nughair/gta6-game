// Combat: hitscan shooting with tracer lines and muzzle flash, plus a tiny particle
// system for sparks, smoke and skid puffs. Solmar Bay.
import * as THREE from '../vendor/three.module.min.js';

export class Particles {
  constructor(scene, max = 240) {
    this.scene = scene;
    this.max = max;
    this.points = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    const mat = new THREE.PointsMaterial({ color: 0xffc860, size: 0.35, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.list = [];
  }

  burst(pos, count, color, speed = 6, life = 0.5, up = 2) {
    for (let i = 0; i < count; i += 1) {
      if (this.list.length >= this.max) break;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.list.push({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: Math.cos(a) * s,
        vy: Math.random() * up,
        vz: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.7),
        maxLife: life,
      });
    }
    this.mesh.material.color.setHex(color);
  }

  update(dt) {
    const attr = this.mesh.geometry.getAttribute('position');
    for (let i = this.list.length - 1; i >= 0; i -= 1) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.vy -= 9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) p.y = 0.05;
    }
    for (let i = 0; i < this.max; i += 1) {
      const p = this.list[i];
      if (p) {
        attr.setXYZ(i, p.x, p.y, p.z);
      } else {
        attr.setXYZ(i, 0, -100, 0);
      }
    }
    attr.needsUpdate = true;
  }
}

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 140;
    this.tracers = [];
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 6; i += 1) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, tracerMat.clone());
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.flash = new THREE.PointLight(0xffc860, 0, 14);
    scene.add(this.flash);
    this.flashLife = 0;
    this.cooldown = 0;
  }

  /** Fire one hitscan shot. targets: [{mesh, kind, ref}] — kind 'ped' | 'police' | 'building'. */
  shoot(origin, dir, targets) {
    if (this.cooldown > 0) return null;
    this.cooldown = 0.18;
    this.raycaster.set(origin, dir);
    const meshes = targets.map((t) => t.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    let end = origin.clone().add(dir.clone().multiplyScalar(120));
    let hitTarget = null;
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      let obj = hit.object;
      while (obj && obj.userData.targetRef === undefined) obj = obj.parent;
      if (obj) hitTarget = obj.userData.targetRef;
    }
    // Tracer.
    const tracer = this.tracers.find((t) => t.life <= 0) || this.tracers[0];
    const attr = tracer.line.geometry.getAttribute('position');
    attr.setXYZ(0, origin.x, origin.y, origin.z);
    attr.setXYZ(1, end.x, end.y, end.z);
    attr.needsUpdate = true;
    tracer.line.visible = true;
    tracer.life = 0.09;
    tracer.line.material.opacity = 0.9;
    // Muzzle flash at the gun.
    this.flash.position.copy(origin);
    this.flash.intensity = 26;
    this.flashLife = 0.06;
    return { point: end, target: hitTarget };
  }

  /** Draw a tracer line without raycasting (for example an NPC's shot). */
  trace(from, to) {
    const tracer = this.tracers.find((t) => t.life <= 0) || this.tracers[0];
    const attr = tracer.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    tracer.line.visible = true;
    tracer.life = 0.09;
    tracer.line.material.opacity = 0.9;
    this.flash.position.copy(from);
    this.flash.intensity = 18;
    this.flashLife = 0.05;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flash.intensity = 0;
    }
  }
}
