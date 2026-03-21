import Matter from 'matter-js';
import { Cell } from '../creature/Cell';
import { FoodParticle, createFoodParticle, stickFoodToBody, removeFood, nudgeFood } from './Food';
import { EnergyState, addEnergy, updateWaste, updateParticles } from './Energy';
import { growCell } from '../creature/Cell';
import { LightCycle, getLightLevel } from './LightCycle';

const MAX_FOOD = 40;
const SPAWN_INTERVAL_BRIGHT = 600;  // ms at peak light
const SPAWN_INTERVAL_DARK = 2000;   // ms in darkness
const ABSORB_DELAY = 1000;

export interface Environment {
  food: FoodParticle[];
  lastSpawnTime: number;
  worldWidth: number;
  worldHeight: number;
}

export function createEnvironment(width: number, height: number): Environment {
  return {
    food: [],
    lastSpawnTime: 0,
    worldWidth: width,
    worldHeight: height,
  };
}

export function setupCollisions(
  engine: Matter.Engine,
  cell: Cell,
  env: Environment,
  world: Matter.World,
): void {
  Matter.Events.on(engine, 'collisionStart', (event) => {
    const now = performance.now();
    for (const pair of event.pairs) {
      let foodBody: Matter.Body | null = null;
      let membraneBody: Matter.Body | null = null;

      if (pair.bodyA.label === 'food' && pair.bodyB.label === 'cell_membrane') {
        foodBody = pair.bodyA;
        membraneBody = pair.bodyB;
      } else if (pair.bodyB.label === 'food' && pair.bodyA.label === 'cell_membrane') {
        foodBody = pair.bodyB;
        membraneBody = pair.bodyA;
      }

      if (foodBody && membraneBody) {
        const particle = env.food.find(f => f.body === foodBody && !f.stuck && !f.absorbed);
        if (particle) {
          stickFoodToBody(world, particle, membraneBody, now);
        }
      }
    }
  });
}

export function updateEnvironment(
  env: Environment,
  world: Matter.World,
  cell: Cell,
  energy: EnergyState,
  now: number,
  delta: number,
  lightCycle: LightCycle,
): void {
  const light = getLightLevel(lightCycle, now);

  // Spawn interval scales with light: brighter = more food
  const spawnInterval = SPAWN_INTERVAL_DARK + (SPAWN_INTERVAL_BRIGHT - SPAWN_INTERVAL_DARK) * light;

  if (now - env.lastSpawnTime > spawnInterval && env.food.length < MAX_FOOD) {
    const margin = 60;
    const x = margin + Math.random() * (env.worldWidth - margin * 2);
    const y = margin + Math.random() * (env.worldHeight - margin * 2);
    env.food.push(createFoodParticle(world, x, y));
    env.lastSpawnTime = now;
  }

  // Nudge slow food
  for (const f of env.food) {
    nudgeFood(f);
  }

  // Check stuck food for absorption
  for (let i = env.food.length - 1; i >= 0; i--) {
    const f = env.food[i];
    if (f.absorbed) {
      env.food.splice(i, 1);
      continue;
    }
    if (f.stuck && now - f.stuckTime > ABSORB_DELAY) {
      addEnergy(energy, f.energyValue);
      growCell(cell, 0.02);
      removeFood(world, f);
      env.food.splice(i, 1);
    }
  }

  // Update waste accumulation and internal particles
  updateWaste(energy, delta);
  // Use cell base radius for particle containment
  updateParticles(energy, cell.properties.baseRadius * cell.properties.growthScale, delta);
}
