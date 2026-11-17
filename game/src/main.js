// Solmar Bay — an original open-world crime game. Bootstrap, game loop, state machine,
// car enter/exit, shooting, wanted wiring, missions wiring, save/load, camera.
// All original code; the city, characters and story are invented, nothing from GTA.
import * as THREE from '../vendor/three.module.min.js';
import { PLAYER_CFG } from './config.js';
import { makeRng } from './random.js';
import { buildCity } from './city.js';
import { makeCar, stepPlayerCar, Traffic } from './cars.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Combat, Particles } from './combat.js';
import { MissionManager, MISSION_DEFS, STORY_INTRO } from './missions.js';
import { HUD } from './hud.js';
import { Player } from './player.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const SPAWN = { x: 4, z: 12 };

export class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.seed = Number(params.get('seed') || 1);
    this.shotName = params.get('shot') || null;
    this.shotMode = this.shotName !== null;
    this.rng = makeRng(this.seed);
    this.elapsed = 0;
    this.state = 'title';
    this.cash = 0;
    this.missionIndex = 0;
    this.hostileKills = 0;
    this.framesSinceStage = 0;
    this.shotReadyAfter = 0;
    this.titleAngle = 0;

    const canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 800);
    this.camera.position.set(0, 40, 90);
    this.camPos = new THREE.Vector3(0, 40, 90);
    this.camLook = new THREE.Vector3(0, 10, 0);
    this.tmpPos = new THREE.Vector3();
    this.tmpLook = new THREE.Vector3();

    this.input = new Input(canvas);
    window.__game = this;
    this.sound = new SoundBank();
    this.hud = new HUD();
    this.city = buildCity(this.scene, this.rng);
    this.player = new Player(this.scene);
    this.traffic = new Traffic(this.scene, this.rng, this.city.colliders);
    this.peds = new Peds(this.scene, this.rng);
    this.police = new Police(this.scene, this.rng, this.city.colliders);
    this.combat = new Combat(this.scene);
    this.particles = new Particles(this.scene);
    this.playerCar = null;
    this.missionCars = new Map();
    this.parked = [];
    this.targets = [];
    this.missions = new MissionManager(this.scene, this.missionHooks());
    this.shooting = false;
    this.lastShotCrimeAt = -100;

    this.spawnParkedCars();
    this.traffic.spawnNear(this.player.pos, 8);
    this.peds.spawnNear(this.player.pos, 14);

    // Raycast targets for shooting.
    for (const b of this.city.buildingMeshes) {
      b.userData.targetRef = { kind: 'building' };
      this.targets.push({ mesh: b });
    }

    this.bindUI();
    window.addEventListener('resize', () => this.onResize());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.state === 'playing' && !this.playerCar) this.shoot();
      if (this.state === 'playing') this.input.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'playing' && !this.shotMode) this.pause();
    });
    if (this.shotMode) {
      stageShot(this.shotName, this);
    } else {
      this.showTitle();
    }
    this.hud.setCash(0);
    this.hud.setStars(0);
    this.hud.setHealth(PLAYER_CFG.maxHealth);
    this.last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      if (this.shotMode) {
        this.framesSinceStage += 1;
        if (this.framesSinceStage >= this.shotReadyAfter && !window.__shotReady) {
          window.__shotReady = true;
        }
      }
    };
    requestAnimationFrame(loop);
  }

  missionHooks() {
    return {
      spawnCar: (id, kind, color, x, z) => {
        const car = makeCar(kind, color, x, z, 0);
        car.missionId = id;
        car.id = `mission-${id}`;
        this.scene.add(car.mesh);
        car.mesh.userData.targetRef = { kind: 'car', ref: car };
        this.targets.push({ mesh: car.mesh });
        this.missionCars.set(id, car);
        this.parked.push(car);
        return car;
      },
      getCar: (id) => this.missionCars.get(id) || null,
      spawnHostiles: (n, x, z) => {
        for (let i = 0; i < n; i += 1) {
          const ped = this.peds.spawn(x + this.rng.range(-8, 8), z + this.rng.range(-8, 8), true);
          ped.mesh.userData.targetRef = { kind: 'ped', ref: ped };
          this.targets.push({ mesh: ped.mesh });
        }
      },
      setWanted: (n) => {
        this.police.stars = n;
        this.police.lastCrimeAt = this.elapsed;
      },
      hostileKills: () => this.hostileKills,
      onToast: (t) => this.hud.toast(t, 6),
      onObjective: (t) => this.hud.setObjective(t),
      onReward: (amount) => {
        this.cash += amount;
        this.sound.cash();
        this.saveGame();
      },
      onMissionComplete: (index) => {
        this.missionIndex = index + 1;
        this.sound.sting();
        this.saveGame();
      },
      onStoryComplete: () => {
        this.state = 'complete';
        this.input.unlock();
        this.hud.setEnd(
          'STORY COMPLETE',
          `Danny owns Solmar Bay now. Final cash: $${this.cash.toLocaleString('en-US')}. Free roam continues — press Keep Playing.`,
          'Keep Playing',
        );
        this.hud.showScreen('end-screen');
        this.sound.sting();
      },
    };
  }

  spawnParkedCars() {
    const spots = [
      { kind: 'sedan', color: 0x2a6ac2, x: 10, z: -40 },
      { kind: 'sport', color: 0x3a9a4a, x: -10, z: 30 },
      { kind: 'van', color: 0xd8d8d8, x: 58, z: -10 },
      { kind: 'sedan', color: 0x22262a, x: -58, z: 10 },
      { kind: 'taxi', color: 0xe8c832, x: 10, z: 88 },
      { kind: 'sport', color: 0xd8a03a, x: -106, z: -58 },
    ];
    for (const s of spots) {
      const car = makeCar(s.kind, s.color, s.x, s.z, this.rng.range(0, Math.PI * 2));
      car.id = `parked-${this.parked.length}`;
      this.scene.add(car.mesh);
      car.mesh.userData.targetRef = { kind: 'car', ref: car };
      this.targets.push({ mesh: car.mesh });
      this.parked.push(car);
    }
  }

  bindUI() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    on('start-button', () => {
      this.sound.ensure();
      this.sound.click();
      this.newGame();
    });
    on('continue-button', () => {
      this.sound.ensure();
      this.sound.click();
      this.continueGame();
    });
    on('resume-button', () => {
      this.sound.click();
      this.resume();
    });
    on('restart-button', () => {
      this.sound.click();
      this.newGame();
    });
    on('quit-button', () => {
      this.sound.click();
      this.saveGame();
      this.showTitle();
    });
    on('end-button', () => {
      this.sound.click();
      if (this.state === 'complete') {
        this.hud.hideScreens();
        this.state = 'playing';
        this.input.lock();
      } else {
        this.respawn();
      }
    });
  }

  showTitle() {
    this.state = 'title';
    this.input.unlock();
    this.sound.engine(false);
    this.sound.siren(false);
    const save = loadSave();
    this.hud.setTitleButtons(!!save);
    document.getElementById('story-text').textContent = STORY_INTRO;
    this.hud.showScreen('title-screen');
  }

  newGame() {
    clearSave();
    this.cash = 0;
    this.missionIndex = 0;
    this.hostileKills = 0;
    this.police.clear();
    this.player.reset(SPAWN.x, SPAWN.z);
    this.exitCar(true);
    this.hud.hideScreens();
    this.state = 'playing';
    this.input.lock();
    this.hud.setObjective('Follow the story — your first job is waiting');
    this.hud.toast('Mara Voss has a job for you. Press M to start it.', 6);
    this.hud.setCash(0);
    this.hud.setStars(0);
    this.hud.setHealth(PLAYER_CFG.maxHealth);
  }

  continueGame() {
    const save = loadSave();
    if (!save) return this.newGame();
    this.cash = save.cash || 0;
    this.missionIndex = save.missionIndex || 0;
    this.hostileKills = 0;
    this.police.clear();
    this.player.reset(save.x ?? SPAWN.x, save.z ?? SPAWN.z);
    this.player.health = save.health ?? PLAYER_CFG.maxHealth;
    this.exitCar(true);
    this.hud.hideScreens();
    this.state = 'playing';
    this.input.lock();
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health);
    this.hud.setObjective(this.missionIndex < MISSION_DEFS.length ? 'Press M for the next job' : 'Free roam — story complete');
    this.hud.toast('Welcome back to Solmar Bay.', 4);
  }

  saveGame() {
    writeSave({
      cash: this.cash,
      missionIndex: this.missionIndex,
      x: Math.round(this.player.pos.x),
      z: Math.round(this.player.pos.z),
      health: Math.round(this.player.health),
    });
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.unlock();
    this.sound.engine(false);
    this.sound.siren(false);
    this.hud.showScreen('pause-screen');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.hideScreens();
    this.input.lock();
  }

  respawn() {
    this.cash = Math.max(0, this.cash - 200);
    this.police.clear();
    this.player.reset(SPAWN.x, SPAWN.z);
    this.exitCar(true);
    this.hud.hideScreens();
    this.state = 'playing';
    this.hud.setHealth(PLAYER_CFG.maxHealth);
    this.hud.setCash(this.cash);
    this.hud.setStars(0);
    this.hud.toast('You made it out — $200 lighter. Press M for the next job.', 5);
    this.input.lock();
  }

  nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    const all = [...this.parked, ...this.traffic.cars];
    for (const car of all) {
      const d = Math.hypot(car.pos.x - this.player.pos.x, car.pos.z - this.player.pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  enterCar(car) {
    this.playerCar = car;
    const i = this.parked.indexOf(car);
    if (i >= 0) this.parked.splice(i, 1);
    if (car.isTraffic) this.traffic.remove(car);
    car.isPlayer = true;
    // Stealing a car in front of witnesses draws the law.
    const witnessed = this.peds.list.some(
      (p) => !p.dead && Math.hypot(p.pos.x - this.player.pos.x, p.pos.z - this.player.pos.z) < 30,
    ) || this.police.cars.length > 0;
    if (witnessed) {
      this.police.addCrime(1, this.elapsed);
      this.hud.toast('Car stolen — someone saw you! Wanted level up.', 4);
    } else {
      this.hud.toast('Car stolen. Drive safe.', 3);
    }
    this.sound.engine(true, 0);
    this.player.mesh.visible = false;
  }

  exitCar(silent) {
    if (!this.playerCar) return;
    const car = this.playerCar;
    car.isPlayer = false;
    car.speed = 0;
    this.player.pos.set(car.pos.x - Math.sin(car.heading) * 3, 0, car.pos.z - Math.cos(car.heading) * 3);
    this.player.mesh.position.copy(this.player.pos);
    this.player.mesh.visible = true;
    this.playerCar = null;
    if (!this.parked.includes(car)) this.parked.push(car);
    if (!silent) this.sound.engine(false, 0);
  }

  shoot() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    const origin = this.player.pos.clone();
    origin.y = 1.5;
    // Converge the shot at 25 units along the crosshair ray: the gun fires from the
    // player's shoulder toward what the crosshair is on, instead of parallel to a
    // camera that looks down at the player (which would ground the shot).
    const aimPoint = ray.ray.origin.clone().add(ray.ray.direction.clone().multiplyScalar(25));
    const dir = aimPoint.sub(origin).normalize();
    const result = this.combat.shoot(origin, dir, this.targets);
    this.sound.gunshot();
    const witnessed = this.peds.list.some(
      (p) => !p.dead && Math.hypot(p.pos.x - this.player.pos.x, p.pos.z - this.player.pos.z) < 35,
    ) || this.police.cars.length > 0;
    // Gunfire in public draws the law, but at most one star per few seconds:
    // a single shootout must not jump straight to five stars.
    if (witnessed && this.elapsed - this.lastShotCrimeAt > 10) {
      this.lastShotCrimeAt = this.elapsed;
      this.police.addCrime(1, this.elapsed);
    }
    if (!result || !result.target) {
      if (result) this.particles.burst(result.point, 6, 0xffc860, 4, 0.35, 1.5);
      return;
    }
    const t = result.target;
    if (t.kind === 'ped') {
      const ped = t.ref;
      ped.hp -= 50;
      this.particles.burst(result.point, 10, 0xd83a2a, 5, 0.5, 2);
      if (ped.hp <= 0 && !ped.dead) {
        this.peds.kill(ped);
        this.police.addCrime(1, this.elapsed);
        if (ped.hostile) this.hostileKills += 1;
      }
    } else if (t.kind === 'police') {
      const car = t.ref;
      car.hp -= 25;
      this.particles.burst(result.point, 8, 0xffc860, 5, 0.4, 2);
      if (car.hp <= 0) {
        this.particles.burst(car.pos.clone().setY(1), 30, 0x555555, 8, 1.2, 4);
        this.police.removeCar(car);
        this.hud.toast('Police car disabled!', 3);
      }
    } else {
      this.particles.burst(result.point, 6, 0xffc860, 4, 0.35, 1.5);
    }
  }

  /** Hostile ped shoots at the player. */
  pedShoot(ped) {
    const from = ped.pos.clone();
    from.y = 1.3;
    const to = this.player.pos.clone();
    to.y = 1.2;
    const dir = to.clone().sub(from).normalize();
    dir.x += (Math.random() - 0.5) * 0.16;
    dir.z += (Math.random() - 0.5) * 0.16;
    dir.normalize();
    const end = from.clone().add(dir.clone().multiplyScalar(60));
    this.combat.trace(from, end);
    this.sound.gunshot();
    // Did the shot connect with the player?
    const ray = new THREE.Ray(from, dir);
    const target = this.player.pos.clone();
    target.y = 1.2;
    if (ray.distanceToPoint(target) < 1.1) {
      const died = this.player.damage(this.rng.range(4, 9), this.elapsed);
      this.particles.burst(target, 6, 0xd83a2a, 4, 0.4, 1.5);
      if (died) this.wasted();
    }
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.input.unlock();
    this.sound.engine(false);
    this.sound.siren(false);
    this.sound.bust();
    this.hud.setEnd('WASTED', 'Danny got taken out on the streets of Solmar Bay.', 'Try Again');
    this.hud.showScreen('end-screen');
  }

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.input.unlock();
    this.sound.engine(false);
    this.sound.siren(false);
    this.sound.bust();
    this.hud.setEnd('BUSTED', 'The bay police caught Danny. $200 bail to walk free.', 'Try Again');
    this.hud.showScreen('end-screen');
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  update(dt) {
    this.elapsed += dt;
    this.combat.update(dt);
    this.particles.update(dt);
    this.hud.update(dt);
    if (this.state === 'title') {
      this.titleAngle += dt * 0.05;
      this.camPos.set(Math.cos(this.titleAngle) * 95, 42, Math.sin(this.titleAngle) * 95);
      this.camLook.set(0, 12, 0);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      this.traffic.update(dt, null, this.player.pos);
      this.peds.update(dt, null, { playerPos: this.player.pos, onPedShoot: () => {} });
      return;
    }
    if (this.state !== 'playing') return;

    // Pause keys.
    if (this.input.pressed('KeyP')) {
      this.pause();
      this.input.endFrame();
      return;
    }
    // Next mission.
    if (this.input.pressed('KeyM') && !this.missions.active && this.missionIndex < MISSION_DEFS.length) {
      this.missions.start(this.missionIndex);
    }
    // Enter / exit car.
    if (this.input.pressed('KeyE')) {
      if (this.playerCar) {
        this.exitCar(false);
      } else {
        const car = this.nearestCar(4.5);
        if (car) this.enterCar(car);
      }
    }

    // Player movement.
    if (this.playerCar) {
      const controls = {
        forward: this.input.down('KeyW') || this.input.down('ArrowUp'),
        back: this.input.down('KeyS') || this.input.down('ArrowDown'),
        left: this.input.down('KeyA') || this.input.down('ArrowLeft'),
        right: this.input.down('KeyD') || this.input.down('ArrowRight'),
        brake: this.input.down('Space'),
      };
      const others = [...this.traffic.cars, ...this.police.cars, ...this.parked];
      const hitWall = stepPlayerCar(this.playerCar, controls, dt, this.city.colliders, others);
      if (hitWall && Math.abs(this.playerCar.speed) > 8) {
        this.sound.thud();
        this.particles.burst(this.playerCar.pos.clone().setY(0.8), 10, 0xcccccc, 5, 0.5, 2);
      }
      // Running over pedestrians.
      for (const ped of this.peds.list) {
        if (ped.dead) continue;
        const d = Math.hypot(ped.pos.x - this.playerCar.pos.x, ped.pos.z - this.playerCar.pos.z);
        if (d < 2.4 && Math.abs(this.playerCar.speed) > 5) {
          this.peds.kill(ped);
          this.police.addCrime(1, this.elapsed);
          if (ped.hostile) this.hostileKills += 1;
          this.hud.toast('Pedestrian hit!', 3);
          this.sound.thud();
        }
      }
    } else {
      this.player.step(dt, this.input, this.city.colliders);
    }

    // Health regen after a quiet spell.
    if (this.elapsed - this.player.lastDamageAt > 12 && this.player.health > 0) {
      this.player.heal(3 * dt);
    }

    // Traffic, pedestrians, police.
    this.traffic.spawnNear(this.player.pos, 8);
    this.traffic.update(dt, this.playerCar, this.player.pos);
    const danger = this.playerCar && Math.abs(this.playerCar.speed) > 8
      ? { x: this.playerCar.pos.x, z: this.playerCar.pos.z }
      : null;
    this.peds.spawnNear(this.player.pos, 14);
    this.peds.update(dt, danger, { playerPos: this.player.pos, onPedShoot: (ped) => this.pedShoot(ped) });
    const effPos = this.playerCar ? this.playerCar.pos : this.player.pos;
    const inHideout = this.missions.currentStep() && this.missions.currentStep().type === 'loseWanted'
      ? Math.hypot(effPos.x + 60, effPos.z - 72) < 12
      : false;
    const busted = this.police.update(dt, {
      playerPos: effPos,
      playerCar: this.playerCar,
      onFoot: !this.playerCar,
      now: this.elapsed,
      hideout: inHideout,
      onRam: (dmg) => {
        if (dmg > 0 && this.player.damage(dmg, this.elapsed)) this.wasted();
      },
    });
    if (busted === 'busted') {
      this.busted();
      this.input.endFrame();
      return;
    }

    // Missions.
    this.missions.update(dt, {
      playerPos: effPos,
      playerCar: this.playerCar,
      wanted: this.police.stars,
      inHideout,
    });

    // Camera.
    if (this.fixedCam) {
      this.camera.position.copy(this.fixedCam.pos);
      this.camera.lookAt(this.fixedCam.look);
    } else {
      if (this.playerCar) {
        const car = this.playerCar;
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        this.tmpPos.set(car.pos.x - fx * 11, 4.6, car.pos.z - fz * 11);
        this.tmpLook.set(car.pos.x + fx * 7, 1.4, car.pos.z + fz * 7);
        const k = 1 - Math.exp(-5 * dt);
        this.camPos.lerp(this.tmpPos, k);
        this.camLook.lerp(this.tmpLook, 1 - Math.exp(-8 * dt));
      } else {
        this.player.cameraTargets(this.tmpPos, this.tmpLook);
        const k = 1 - Math.exp(-10 * dt);
        this.camPos.lerp(this.tmpPos, k);
        this.camLook.lerp(this.tmpLook, k);
      }
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
    }

    // HUD + audio.
    this.hud.setHealth(this.player.health);
    this.hud.setCash(this.cash);
    this.hud.setStars(this.police.stars);
    this.hud.setObjective(this.missions.active ? this.missions.objectiveText() : this.hud.objectiveEl.textContent);
    this.hud.setTimer(this.missions.timerText());
    this.hud.setSpeed(this.playerCar ? this.playerCar.speed * 3.6 : 0, !!this.playerCar);
    this.hud.setCrosshair(!this.playerCar);
    const mmState = {
      player: this.player.pos,
      heading: this.playerCar ? this.playerCar.heading : this.player.camYaw,
      objective: this.missions.markerPos(),
      missionCar: null,
      cars: [...this.traffic.cars, ...this.parked].map((c) => ({ x: c.pos.x, z: c.pos.z })),
      police: this.police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
    };
    for (const [, car] of this.missionCars) {
      if (!car.isPlayer && this.missions.active) mmState.missionCar = { x: car.pos.x, z: car.pos.z };
    }
    this.hud.drawMinimap(mmState);
    this.sound.engine(!!this.playerCar, this.playerCar ? Math.abs(this.playerCar.speed) / 34 : 0);
    this.sound.siren(this.police.stars > 0 && this.police.cars.length > 0);
    this.input.endFrame();
  }
}

new Game();
