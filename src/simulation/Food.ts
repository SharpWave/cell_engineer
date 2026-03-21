import Matter from 'matter-js';

export type FoodShape = 'circle' | 'triangle';

export interface FoodParticle {
  body: Matter.Body;
  shape: FoodShape;
  color: string;
  energyValue: number;
  stuck: boolean;
  stuckTime: number;         // timestamp when it stuck
  stuckConstraint: Matter.Constraint | null;
  absorbed: boolean;
}

const FOOD_COLORS = ['#00e5ff', '#ff4081', '#76ff03', '#ffea00'];
const FOOD_COLLISION_CATEGORY = 0x0004;

export function createFoodParticle(
  world: Matter.World,
  x: number,
  y: number,
): FoodParticle {
  const shape: FoodShape = Math.random() > 0.5 ? 'circle' : 'triangle';
  const radius = 5 + Math.random() * 5;
  const color = FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)];

  let body: Matter.Body;
  if (shape === 'circle') {
    body = Matter.Bodies.circle(x, y, radius, {
      label: 'food',
      frictionAir: 0.002,
      restitution: 0.8,
      collisionFilter: { category: FOOD_COLLISION_CATEGORY, mask: 0xFFFF },
    });
  } else {
    body = Matter.Bodies.polygon(x, y, 3, radius, {
      label: 'food',
      frictionAir: 0.002,
      restitution: 0.6,
      collisionFilter: { category: FOOD_COLLISION_CATEGORY, mask: 0xFFFF },
      chamfer: { radius: 2 },
    });
  }

  // Give it a noticeable random drift
  Matter.Body.setVelocity(body, {
    x: (Math.random() - 0.5) * 4,
    y: (Math.random() - 0.5) * 4,
  });

  Matter.Composite.add(world, body);

  return {
    body,
    shape,
    color,
    energyValue: 1,
    stuck: false,
    stuckTime: 0,
    stuckConstraint: null,
    absorbed: false,
  };
}

export function stickFoodToBody(
  world: Matter.World,
  food: FoodParticle,
  membraneBody: Matter.Body,
  now: number,
): void {
  if (food.stuck) return;

  food.stuck = true;
  food.stuckTime = now;

  const constraint = Matter.Constraint.create({
    bodyA: food.body,
    bodyB: membraneBody,
    stiffness: 0.8,
    damping: 0.3,
    length: 0,
    render: { visible: false },
  });

  food.stuckConstraint = constraint;
  Matter.Composite.add(world, constraint);
}

/** Give free-floating food a small random nudge to keep things lively */
export function nudgeFood(food: FoodParticle): void {
  if (food.stuck || food.absorbed) return;
  const v = food.body.velocity;
  const speed = Math.sqrt(v.x * v.x + v.y * v.y);
  if (speed < 1.5) {
    Matter.Body.applyForce(food.body, food.body.position, {
      x: (Math.random() - 0.5) * 0.0005,
      y: (Math.random() - 0.5) * 0.0005,
    });
  }
}

export function removeFood(world: Matter.World, food: FoodParticle): void {
  food.absorbed = true;
  if (food.stuckConstraint) {
    Matter.Composite.remove(world, food.stuckConstraint);
  }
  Matter.Composite.remove(world, food.body);
}
