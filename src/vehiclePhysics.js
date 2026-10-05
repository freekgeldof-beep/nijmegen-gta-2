import { VEHICLE_TYPES } from './vehicleTypes.js';

export const CAR_PHYS = { maxSpeed: 44, maxReverse: -12, accel: 13, brakeDecel: 20, friction: 4.5, turnSpeed: 2.6 };

// Shared by solo play and the authoritative online simulation.
export function driveVehicle(world, car, input, obstacles, dt) {
  const vt = VEHICLE_TYPES[car.vtype] || VEHICLE_TYPES.car;
  const oldSpeed = car.speed;
  const accel = CAR_PHYS.accel * vt.accelMul;
  if (input.up && !input.down) car.speed += accel * dt;
  else if (input.down && !input.up) {
    if (car.speed > 0) car.speed = Math.max(0, car.speed - CAR_PHYS.brakeDecel * dt);
    else car.speed -= accel * dt;
  } else if (car.speed > 0) car.speed = Math.max(0, car.speed - CAR_PHYS.friction * dt);
  else if (car.speed < 0) car.speed = Math.min(0, car.speed + CAR_PHYS.friction * dt);
  car.speed = Math.max(CAR_PHYS.maxReverse * vt.speedMul, Math.min(CAR_PHYS.maxSpeed * vt.speedMul, car.speed));
  car.braking = !!input.down && oldSpeed > 0.3;

  const radius = Math.hypot(car.w, car.h) / 2;
  const nearby = [];
  for (const other of obstacles) {
    if (other === car || other.alive === false || other.dead) continue;
    const w = other.onFoot ? .6 : other.w, h = other.onFoot ? .6 : other.h;
    const reach = radius + Math.hypot(w, h) / 2 + Math.abs(car.speed * dt) + .5;
    const dx = other.x - car.x, dy = other.y - car.y;
    if (dx * dx + dy * dy <= reach * reach) nearby.push({ other, w, h, radius: reach - Math.abs(car.speed * dt) - .5 });
  }
  let hit = null;
  function blocked(x, y, angle) {
    if (world.collidesBuildingsOrRing(x, y, angle, car.w, car.h, car.x, car.y)) return true;
    const corners = world.carCorners(x, y, angle, car.w, car.h);
    for (const entry of nearby) {
      const dx = entry.other.x - x, dy = entry.other.y - y;
      if (dx * dx + dy * dy > entry.radius * entry.radius) continue;
      if (world.polysIntersect(corners, world.carCorners(entry.other.x, entry.other.y, entry.other.onFoot ? 0 : entry.other.angle, entry.w, entry.h))) {
        hit = entry.other; return true;
      }
    }
    return false;
  }
  const oldX = car.x, oldY = car.y;
  const steer = Number(!!input.right) - Number(!!input.left);
  const turnRate = CAR_PHYS.turnSpeed * (vt.turnMul || 1) * Math.min(1, Math.abs(car.speed) / 3);
  const turn = Math.abs(car.speed) > .05 ? steer * turnRate * Math.sign(car.speed) * dt : 0;
  if (turn && !blocked(car.x, car.y, car.angle + turn)) car.angle += turn;
  const movement = car.speed * dt;
  const steps = Math.max(1, Math.ceil(Math.abs(movement) / .45));
  let impact = 0;
  for (let i = 0; i < steps; i++) {
    const dx = Math.cos(car.angle) * movement / steps;
    const dy = Math.sin(car.angle) * movement / steps;
    if (!blocked(car.x + dx, car.y + dy, car.angle)) { car.x += dx; car.y += dy; }
    else {
      impact = Math.abs(car.speed);
      if (!blocked(car.x + dx, car.y, car.angle)) { car.x += dx; car.speed *= .45; }
      else if (!blocked(car.x, car.y + dy, car.angle)) { car.y += dy; car.speed *= .45; }
      else car.speed = 0;
      break;
    }
  }
  return { distance: Math.hypot(car.x - oldX, car.y - oldY), impact, hit };
}
