// Story missions for Solmar Bay: five jobs for fixer Mara Voss, from a first car theft
// to the big score. All original characters, places and story. No Rockstar content.
import * as THREE from '../vendor/three.module.min.js';
import { MISSION_REWARDS } from './config.js';

export const STORY_INTRO =
  'Solmar Bay, 2026. Danny Cole is out and owes fixer Mara Voss one last job. ' +
  'Steal cars, outrun the bay police, and earn your way out — one job at a time.';

export const MISSION_DEFS = [
  {
    id: 'm1',
    title: 'First Wheels',
    briefing: "Mara: \u201CI need wheels, Danny. Lift the red Comet GT parked down by the pier and bring it to my garage.\u201D",
    reward: MISSION_REWARDS[0],
    steps: [
      { type: 'enterCar', carId: 'comet', label: 'Steal the red Comet GT at the pier' },
      { type: 'deliver', carId: 'comet', pos: { x: -60, z: 72 }, r: 7, label: 'Deliver the Comet to Mara\u2019s garage' },
    ],
  },
  {
    id: 'm2',
    title: 'Payday Run',
    briefing: "Mara: \u201CPayday. Three drops across town, ninety seconds. Don\u2019t keep the buyers waiting.\u201D",
    reward: MISSION_REWARDS[1],
    steps: [
      {
        type: 'checkpoints',
        points: [
          { x: 48, z: 48 },
          { x: -72, z: -48 },
          { x: 96, z: -96 },
        ],
        time: 90,
        r: 6,
        label: 'Hit the checkpoints before time runs out',
      },
    ],
  },
  {
    id: 'm3',
    title: 'Hot Pursuit',
    briefing: "Mara: \u201CYou tripped every camera in the bay. Lose the heat \u2014 get to my garage and lay low.\u201D",
    reward: MISSION_REWARDS[2],
    steps: [
      { type: 'loseWanted', pos: { x: -60, z: 72 }, r: 9, label: 'Lose the cops \u2014 hide out at Mara\u2019s garage' },
    ],
  },
  {
    id: 'm4',
    title: 'Street Heat',
    briefing: "Mara: \u201CThe Vipers took the plaza. Clear them out, and the bay is ours.\u201D",
    reward: MISSION_REWARDS[3],
    steps: [
      { type: 'eliminate', count: 4, pos: { x: -72, z: -72 }, label: 'Take out the gunmen at the plaza' },
    ],
  },
  {
    id: 'm5',
    title: 'The Big Score',
    briefing: "Mara: \u201COne last score. The gold sedan at the pier belongs to a man who can\u2019t report it stolen. Bring it to the yacht.\u201D",
    reward: MISSION_REWARDS[4],
    steps: [
      { type: 'enterCar', carId: 'gold', label: 'Steal the gold sedan at the pier' },
      { type: 'deliver', carId: 'gold', pos: { x: 24, z: -126 }, r: 8, label: 'Deliver the sedan to the yacht at the pier' },
    ],
  },
];

export class MissionManager {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.index = -1;
    this.step = 0;
    this.checkpoint = 0;
    this.timer = 0;
    this.active = false;
    this.done = false;
    this.beacon = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    );
    cyl.position.y = 15;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.25, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23a }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    this.beacon.add(cyl);
    this.beacon.add(ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.spin = 0;
  }

  currentDef() {
    return this.index >= 0 && this.index < MISSION_DEFS.length ? MISSION_DEFS[this.index] : null;
  }

  currentStep() {
    const def = this.currentDef();
    return def ? def.steps[this.step] : null;
  }

  start(index) {
    this.index = index;
    this.step = 0;
    this.checkpoint = 0;
    this.timer = 0;
    this.active = true;
    this.done = false;
    const def = MISSION_DEFS[index];
    if (index === 0) this.hooks.spawnCar('comet', 'sport', 0xc23a2a, 12, -118);
    if (index === 2) this.hooks.setWanted(2);
    if (index === 3) this.hooks.spawnHostiles(4, -72, -72);
    if (index === 4) this.hooks.spawnCar('gold', 'sedan', 0xd8a03a, 38, -118);
    this.hooks.onToast(`${def.title} — ${def.briefing}`);
    this.hooks.onObjective(this.objectiveText());
    this.updateBeacon();
  }

  restart() {
    const def = this.currentDef();
    if (!def) return;
    this.step = 0;
    this.checkpoint = 0;
    this.timer = 0;
    this.hooks.onToast(`${def.title} — try again.`);
    this.hooks.onObjective(this.objectiveText());
    this.updateBeacon();
  }

  objectiveText() {
    const def = this.currentDef();
    if (!def || !this.active) return 'Free roam — press M for the next job';
    const step = this.currentStep();
    if (!step) return def.title;
    if (step.type === 'checkpoints') {
      return `${def.title}: ${step.label} (${this.checkpoint + 1}/${step.points.length})`;
    }
    if (step.type === 'eliminate') {
      return `${def.title}: ${step.label} (${this.hooks.hostileKills()}/${step.count})`;
    }
    return `${def.title}: ${step.label}`;
  }

  timerText() {
    const step = this.currentStep();
    if (step && step.type === 'checkpoints' && this.timer > 0) {
      return `${Math.ceil(this.timer)}s`;
    }
    return '';
  }

  markerPos() {
    const step = this.currentStep();
    if (!step || !this.active) return null;
    if (step.type === 'deliver' || step.type === 'loseWanted') return step.pos;
    if (step.type === 'checkpoints') return step.points[this.checkpoint];
    if (step.type === 'eliminate') return step.pos;
    if (step.type === 'enterCar') {
      const car = this.hooks.getCar(step.carId);
      return car ? { x: car.pos.x, z: car.pos.z } : null;
    }
    return null;
  }

  updateBeacon() {
    const pos = this.markerPos();
    if (!pos) {
      this.beacon.visible = false;
      return;
    }
    this.beacon.visible = true;
    this.beacon.position.set(pos.x, 0, pos.z);
  }

  completeStep() {
    const def = this.currentDef();
    this.step += 1;
    if (this.step >= def.steps.length) {
      this.completeMission();
      return;
    }
    this.hooks.onObjective(this.objectiveText());
    this.updateBeacon();
  }

  completeMission() {
    const def = this.currentDef();
    this.active = false;
    this.beacon.visible = false;
    this.hooks.onReward(def.reward);
    this.hooks.onToast(`Job done: ${def.title} — +$${def.reward}`);
    this.hooks.onObjective('Job done — press M for the next job');
    this.hooks.onMissionComplete(this.index);
    if (this.index >= MISSION_DEFS.length - 1) {
      this.done = true;
      this.hooks.onStoryComplete();
    }
  }

  /** api: { playerPos, playerCar, wanted, inHideout } */
  update(dt, api) {
    this.spin += dt;
    if (this.beacon.visible) {
      this.beacon.rotation.y = this.spin * 0.8;
      this.beacon.children[1].position.y = 0.4 + Math.sin(this.spin * 2) * 0.25;
    }
    if (!this.active) return;
    const step = this.currentStep();
    if (!step) return;
    const p = api.playerPos;
    if (step.type === 'enterCar') {
      if (api.playerCar && api.playerCar.missionId === step.carId) {
        if (this.index === 4) this.hooks.setWanted(3);
        this.completeStep();
      }
    } else if (step.type === 'deliver') {
      if (api.playerCar && api.playerCar.missionId === step.carId) {
        const d = Math.hypot(p.x - step.pos.x, p.z - step.pos.z);
        if (d < step.r) this.completeStep();
      }
    } else if (step.type === 'checkpoints') {
      if (this.timer <= 0) this.timer = step.time;
      this.timer -= dt;
      const pt = step.points[this.checkpoint];
      const d = Math.hypot(p.x - pt.x, p.z - pt.z);
      if (d < step.r) {
        this.checkpoint += 1;
        this.hooks.onToast(`Checkpoint ${this.checkpoint}/${step.points.length}`);
        if (this.checkpoint >= step.points.length) {
          this.completeStep();
        } else {
          this.updateBeacon();
        }
      } else if (this.timer <= 0) {
        this.hooks.onToast('Out of time — the buyers walked away.');
        this.restart();
      }
    } else if (step.type === 'loseWanted') {
      if (api.wanted === 0) this.completeStep();
    } else if (step.type === 'eliminate') {
      if (this.hooks.hostileKills() >= step.count) this.completeStep();
    }
    this.updateBeacon();
  }
}
