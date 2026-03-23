import Matter from 'matter-js';

export type FoodShape = 'circle' | 'triangle';
export type FoodResourceType = 'carb' | 'protein' | 'waste';

export interface FoodParticle {
  body: Matter.Body;
  shape: FoodShape;
  color: string;
  resourceType: FoodResourceType;
  resourceValue: number;
  stuck: boolean;
  stuckTime: number;
  stuckConstraint: Matter.Constraint | null;
  absorbed: boolean;
  /** Stationary food doesn't drift — cells must navigate to it */
  stationary: boolean;
  /** When sliding along a membrane edge toward a particle endpoint */
  slidingToward: { cellId: number; targetBody: Matter.Body } | null;
}

const CARB_COLORS = ['#44ff66', '#22ff44', '#66ff88'];
const PROTEIN_COLORS = ['#4a8aff', '#00b0ff', '#7c4dff'];
const WASTE_COLORS = ['#7a5c3a', '#6b4e2e', '#8a6a42'];
const FOOD_COLLISION_CATEGORY = 0x0004;

export function createFoodParticle(
  world: Matter.World,
  x: number,
  y: number,
  resourceType: FoodResourceType = 'carb',
  stationary: boolean = false,
  radius?: number,
  resourceValue: number = 1,
): FoodParticle {
  // Merged particles (explicit radius) are always circles
  const shape: FoodShape = radius !== undefined ? 'circle'
    : (Math.random() > 0.5 ? 'circle' : 'triangle');
  if (radius === undefined) radius = 5 + Math.random() * 5;
  const colors = resourceType === 'carb' ? CARB_COLORS
    : resourceType === 'protein' ? PROTEIN_COLORS
    : WASTE_COLORS;
  const color = colors[Math.floor(Math.random() * colors.length)];

  const isWaste = resourceType === 'waste';
  const frictionAir = stationary ? 0.8 : (isWaste ? 0.01 : 0.002);
  const mass = stationary ? 50 : undefined;

  let body: Matter.Body;
  if (shape === 'circle') {
    body = Matter.Bodies.circle(x, y, radius, {
      label: 'food',
      frictionAir,
      restitution: 0.8,
      collisionFilter: { category: FOOD_COLLISION_CATEGORY, mask: 0xFFFF },
    });
  } else {
    body = Matter.Bodies.polygon(x, y, 3, radius, {
      label: 'food',
      frictionAir,
      restitution: 0.6,
      collisionFilter: { category: FOOD_COLLISION_CATEGORY, mask: 0xFFFF },
      chamfer: { radius: 2 },
    });
  }

  if (mass !== undefined) {
    Matter.Body.setMass(body, mass);
  } else if (isWaste) {
    Matter.Body.setMass(body, body.mass * 10);
  }

  // Floating food drifts; stationary food stays put
  if (!stationary) {
    Matter.Body.setVelocity(body, {
      x: (Math.random() - 0.5) * 4,
      y: (Math.random() - 0.5) * 4,
    });
  }

  Matter.Composite.add(world, body);

  return {
    body,
    shape,
    color,
    resourceType,
    resourceValue,
    stuck: false,
    stuckTime: 0,
    stuckConstraint: null,
    absorbed: false,
    stationary,
    slidingToward: null,
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
    stiffness: 0.2,
    damping: 0.3,
    length: 0,
    render: { visible: false },
  });

  food.stuckConstraint = constraint;
  Matter.Composite.add(world, constraint);
}

/** Give free-floating food a small random nudge to keep things lively */
export function nudgeFood(food: FoodParticle): void {
  if (food.stuck || food.absorbed || food.stationary) return;
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
