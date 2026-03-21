import Matter from 'matter-js';

const WALL_THICKNESS = 50;

export interface PhysicsWorld {
  engine: Matter.Engine;
  world: Matter.World;
  width: number;
  height: number;
}

export function createPhysicsWorld(width: number, height: number): PhysicsWorld {
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: 0, scale: 0 },
  });

  const walls = [
    // top
    Matter.Bodies.rectangle(width / 2, -WALL_THICKNESS / 2, width + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true, label: 'wall' }),
    // bottom
    Matter.Bodies.rectangle(width / 2, height + WALL_THICKNESS / 2, width + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true, label: 'wall' }),
    // left
    Matter.Bodies.rectangle(-WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, height + WALL_THICKNESS * 2, { isStatic: true, label: 'wall' }),
    // right
    Matter.Bodies.rectangle(width + WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, height + WALL_THICKNESS * 2, { isStatic: true, label: 'wall' }),
  ];

  Matter.Composite.add(engine.world, walls);

  return { engine, world: engine.world, width, height };
}

export function stepPhysics(physics: PhysicsWorld, delta: number): void {
  Matter.Engine.update(physics.engine, delta);
}
