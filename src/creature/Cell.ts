import Matter from 'matter-js';
import { CellProperties, defaultCellProperties } from './CellProperties';
import { CellModule, SignalCascade, createModule, createCascade } from './Module';

const MEMBRANE_POINTS = 16;
const COLLISION_CATEGORY = 0x0002;

export interface Cell {
  properties: CellProperties;
  membraneParticles: Matter.Body[];
  constraints: Matter.Constraint[];
  center: Matter.Body;
  modules: CellModule[];
  cascades: SignalCascade[];
}

export function createCell(
  world: Matter.World,
  x: number,
  y: number,
  props?: Partial<CellProperties>,
): Cell {
  const properties: CellProperties = { ...defaultCellProperties(), ...props };
  const r = properties.baseRadius;
  const particleRadius = 6;

  const membraneParticles: Matter.Body[] = [];
  for (let i = 0; i < MEMBRANE_POINTS; i++) {
    const angle = (i / MEMBRANE_POINTS) * Math.PI * 2;
    const px = x + Math.cos(angle) * r * 1.2;
    const py = y + Math.sin(angle) * r * 0.85;

    const particle = Matter.Bodies.circle(px, py, particleRadius, {
      label: 'cell_membrane',
      collisionFilter: { category: COLLISION_CATEGORY, mask: 0xFFFF },
      frictionAir: 0.04,
      restitution: 0.3,
    });
    membraneParticles.push(particle);
  }

  const center = Matter.Bodies.circle(x, y, 3, {
    label: 'cell_center',
    collisionFilter: { category: COLLISION_CATEGORY, mask: 0x0000 },
    frictionAir: 0.06,
  });

  const constraints: Matter.Constraint[] = [];

  for (let i = 0; i < MEMBRANE_POINTS; i++) {
    const next = (i + 1) % MEMBRANE_POINTS;
    constraints.push(
      Matter.Constraint.create({
        bodyA: membraneParticles[i],
        bodyB: membraneParticles[next],
        stiffness: properties.stiffness,
        damping: 0.1,
        render: { visible: false },
      }),
    );
  }

  for (let i = 0; i < MEMBRANE_POINTS / 2; i++) {
    const opposite = i + MEMBRANE_POINTS / 2;
    constraints.push(
      Matter.Constraint.create({
        bodyA: membraneParticles[i],
        bodyB: membraneParticles[opposite],
        stiffness: properties.stiffness * 0.3,
        damping: 0.1,
        render: { visible: false },
      }),
    );
  }

  for (let i = 0; i < MEMBRANE_POINTS; i++) {
    constraints.push(
      Matter.Constraint.create({
        bodyA: center,
        bodyB: membraneParticles[i],
        stiffness: properties.stiffness * 0.5,
        damping: 0.1,
        render: { visible: false },
      }),
    );
  }

  Matter.Composite.add(world, [...membraneParticles, center, ...constraints]);

  // Pre-built endocytosis system: adhesion sensor + endocytosis effector + cascade
  const adhesionSensor = createModule('adhesion_sensor', 0);
  const endocytosis = createModule('endocytosis', 1);
  const startCascade = createCascade(adhesionSensor.id, endocytosis.id);

  return {
    properties,
    membraneParticles,
    constraints,
    center,
    modules: [adhesionSensor, endocytosis],
    cascades: [startCascade],
  };
}

export function getCellCenter(cell: Cell): { x: number; y: number } {
  return { x: cell.center.position.x, y: cell.center.position.y };
}

export function growCell(cell: Cell, amount: number): void {
  cell.properties.growthScale += amount;
  for (const constraint of cell.constraints) {
    if (constraint.length !== undefined && constraint.length > 0) {
      constraint.length *= (1 + amount * 0.15);
    }
  }
}

export function getMembranePoints(cell: Cell): { x: number; y: number }[] {
  return cell.membraneParticles.map(p => ({
    x: p.position.x,
    y: p.position.y,
  }));
}
