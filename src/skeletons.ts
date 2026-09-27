export type Anchor = { x: number; y: number };

export type Connection = {
  a: number;
  b: number;
  curvature: number;
  bendSide?: 1 | -1;
};

export type Skeleton = {
  anchors: Anchor[];
  connections: Connection[];
  spacing: number;
  viewBox?: { w: number; h: number };
};

export type SkeletonFactory = () => Skeleton;

function bonsai(): Skeleton {
  const W = 600;
  const H = 600;

  const anchors: Anchor[] = [];
  const push = (x: number, y: number) => anchors.push({ x, y }) - 1;

  const potTopY = 470;
  const potBottomY = 545;
  const potTopHalf = 95;
  const potBottomHalf = 70;
  const potCx = 300;

  const P_TL = push(potCx - potTopHalf, potTopY);
  const P_TR = push(potCx + potTopHalf, potTopY);
  const P_BL = push(potCx - potBottomHalf, potBottomY);
  const P_BR = push(potCx + potBottomHalf, potBottomY);

  const RIM_L = push(potCx - potTopHalf - 12, potTopY - 10);
  const RIM_R = push(potCx + potTopHalf + 12, potTopY - 10);

  const trunkBase = push(potCx - 6, potTopY - 8);
  const trunk1 = push(potCx - 18, 420);
  const trunk2 = push(potCx + 10, 370);
  const trunk3 = push(potCx - 6, 320);
  const trunkTop = push(potCx + 18, 275);

  const bL1a = push(potCx - 30, 385);
  const bL1b = push(potCx - 120, 355);
  const bL1tip = push(potCx - 175, 335);

  const bR1a = push(potCx + 40, 345);
  const bR1b = push(potCx + 145, 320);
  const bR1tip = push(potCx + 210, 305);

  const bL2a = push(potCx - 20, 305);
  const bL2b = push(potCx - 95, 270);
  const bL2tip = push(potCx - 155, 255);

  const bR2a = push(potCx + 30, 265);
  const bR2b = push(potCx + 115, 235);
  const bR2tip = push(potCx + 175, 220);

  const crownA = push(potCx + 10, 240);
  const crownB = push(potCx - 25, 210);
  const crownTip = push(potCx + 5, 180);

  const foliageClusters: Array<{ cx: number; cy: number; rx: number; ry: number }> = [
    { cx: potCx - 175, cy: 325, rx: 55, ry: 32 },
    { cx: potCx - 155, cy: 245, rx: 50, ry: 28 },
    { cx: potCx + 210, cy: 295, rx: 60, ry: 34 },
    { cx: potCx + 175, cy: 210, rx: 52, ry: 30 },
    { cx: potCx + 10, cy: 170, rx: 70, ry: 38 },
  ];

  const foliageAnchorIds: number[][] = foliageClusters.map((c) => {
    const ids: number[] = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const wob = 1 + 0.12 * Math.sin(3 * t + c.cx);
      const x = c.cx + Math.cos(t) * c.rx * wob;
      const y = c.cy + Math.sin(t) * c.ry * wob;
      ids.push(push(x, y));
    }
    return ids;
  });

  const connections: Connection[] = [];

  connections.push({ a: P_TL, b: P_TR, curvature: -0.06, bendSide: -1 });
  connections.push({ a: P_BL, b: P_BR, curvature: 0.05, bendSide: 1 });
  connections.push({ a: P_TL, b: P_BL, curvature: 0.04, bendSide: -1 });
  connections.push({ a: P_TR, b: P_BR, curvature: 0.04, bendSide: 1 });
  connections.push({ a: RIM_L, b: P_TL, curvature: 0.12, bendSide: -1 });
  connections.push({ a: RIM_R, b: P_TR, curvature: 0.12, bendSide: 1 });
  connections.push({ a: RIM_L, b: RIM_R, curvature: -0.05, bendSide: -1 });

  connections.push({ a: trunkBase, b: trunk1, curvature: 0.35, bendSide: -1 });
  connections.push({ a: trunk1, b: trunk2, curvature: 0.4, bendSide: 1 });
  connections.push({ a: trunk2, b: trunk3, curvature: 0.35, bendSide: -1 });
  connections.push({ a: trunk3, b: trunkTop, curvature: 0.3, bendSide: 1 });

  connections.push({ a: bL1a, b: bL1b, curvature: 0.25, bendSide: -1 });
  connections.push({ a: bL1b, b: bL1tip, curvature: 0.2, bendSide: -1 });

  connections.push({ a: bR1a, b: bR1b, curvature: 0.22, bendSide: 1 });
  connections.push({ a: bR1b, b: bR1tip, curvature: 0.18, bendSide: 1 });

  connections.push({ a: bL2a, b: bL2b, curvature: 0.22, bendSide: -1 });
  connections.push({ a: bL2b, b: bL2tip, curvature: 0.18, bendSide: -1 });

  connections.push({ a: bR2a, b: bR2b, curvature: 0.2, bendSide: 1 });
  connections.push({ a: bR2b, b: bR2tip, curvature: 0.18, bendSide: 1 });

  connections.push({ a: trunkTop, b: crownA, curvature: 0.15, bendSide: 1 });
  connections.push({ a: crownA, b: crownB, curvature: 0.2, bendSide: -1 });
  connections.push({ a: crownB, b: crownTip, curvature: 0.15, bendSide: 1 });

  foliageAnchorIds.forEach((ring) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      connections.push({ a, b, curvature: 0.08, bendSide: 1 });
    }
  });

  return {
    anchors,
    connections,
    spacing: 16,
    viewBox: { w: W, h: H },
  };
}

export const skeletons: Record<string, SkeletonFactory> = {
  bonsai,
};
