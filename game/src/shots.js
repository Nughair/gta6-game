// Staged screenshot scenes behind ?shot=title|drive|chase|mission. Each one puts the real
// game into a fixed, readable state (title orbit, driving, police chase, shootout) and
// tells the loop how many frames to paint before window.__shotReady. Solmar Bay.
import * as THREE from '../vendor/three.module.min.js';

export function stageShot(name, game) {
  if (name === 'title') {
    game.showTitle();
    game.shotReadyAfter = 40;
    return;
  }
  game.hud.hideScreens();
  game.state = 'playing';
  game.cash = 1250;
  game.fixedCam = null;
  if (name === 'drive') {
    // Mission 2 in progress: Danny driving the green sport car up the main street
    // toward checkpoint 1. Straight run, so the car stays composed in frame.
    const car = game.parked.find((c) => c.kind === 'sport' && c.color === 0x3a9a4a) || game.parked[0];
    game.player.pos.set(car.pos.x, 0, car.pos.z);
    game.enterCar(car);
    game.police.clear();
    car.pos.set(0, 0, -30);
    car.heading = 0;
    car.speed = 24;
    game.camPos.set(-8, 6, -42);
    game.camLook.set(0, 1.4, -18);
    game.missions.start(1);
    game.shotReadyAfter = 20;
    return;
  }
  if (name === 'chase') {
    // Three stars: Danny fleeing north up the main street, two police cars closing
    // in behind him. A fixed cinematic camera looks up the street at the chase.
    const car = game.parked.find((c) => c.kind === 'sport') || game.parked[0];
    game.player.pos.set(car.pos.x, 0, car.pos.z);
    game.enterCar(car);
    car.pos.set(0, 0, 0);
    car.heading = 0;
    car.speed = 20;
    // Camera ahead of the chase, looking back down the street at Danny with the
    // police closing in behind him.
    game.fixedCam = {
      pos: new THREE.Vector3(5, 6, 55),
      look: new THREE.Vector3(0, 1, 0),
    };
    game.police.stars = 3;
    game.police.lastCrimeAt = game.elapsed;
    game.police.spawnCar(game.player.pos);
    game.police.spawnCar(game.player.pos);
    game.police.cars[0].pos.set(-3, 0, -18);
    game.police.cars[0].heading = 0;
    game.police.cars[0].speed = 23;
    game.police.cars[1].pos.set(4, 0, -25);
    game.police.cars[1].heading = 0;
    game.police.cars[1].speed = 23;
    game.cash = 3400;
    game.hud.setObjective('Hot Pursuit: Lose the cops — hide out at Mara’s garage');
    game.hud.toast('The bay police are on you — lose them!', 8);
    game.shotReadyAfter = 15;
    return;
  }
  if (name === 'mission') {
    // Mission 4 shootout: Danny on foot at the plaza, gunmen ahead, crosshair live.
    game.player.reset(-58, -58);
    game.player.camYaw = -2.36;
    game.player.camPitch = 0.28;
    game.camPos.set(-52, 5, -52);
    game.camLook.set(-72, 1.4, -72);
    game.missions.start(3);
    game.cash = 2700;
    game.shotReadyAfter = 50;
    return;
  }
  // Unknown name: fall back to the title.
  game.showTitle();
  game.shotReadyAfter = 40;
}
