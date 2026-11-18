export interface GridPoint {
  x: number;
  y: number;
  z: number;
}

export interface GridBoxBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const GRID_WIDTH_METERS = 199.61142092;
const GRID_HEIGHT_METERS = 199.24265231;

/** Fixed-size pages on an optimized common lattice; no uncovered point is discarded. */
export function computeGridPagingBoxes(
  polePoints: GridPoint[], W = GRID_WIDTH_METERS, H = GRID_HEIGHT_METERS,
  groups: GridPoint[][] = [], paths: GridPoint[][] = [],
): GridBoxBounds[] {
  if (!polePoints.length) return [];
  const points = polePoints.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!points.length || W <= 0 || H <= 0) return [];
  const margin = 8 * W / GRID_WIDTH_METERS;
  const bound = (ps: GridPoint[]): GridBoxBounds => ({minX: Math.min(...ps.map(p=>p.x)), maxX: Math.max(...ps.map(p=>p.x)), minY: Math.min(...ps.map(p=>p.y)), maxY: Math.max(...ps.map(p=>p.y))});
  const fits = (a: GridBoxBounds,b: GridBoxBounds,pad=0) => a.minX >= b.minX+pad && a.maxX <= b.maxX-pad && a.minY >= b.minY+pad && a.maxY <= b.maxY-pad;
  const groupBounds = groups.filter(g=>g.length).map(bound).filter(g=>g.maxX-g.minX <= W-2*margin && g.maxY-g.minY <= H-2*margin);
  const extent = bound(points);
  const originX = (extent.minX+extent.maxX-W)/2, originY = (extent.minY+extent.maxY-H)/2;
  const offsets: [number,number][] = [];
  for(let x=0;x<8;x++) for(let y=0;y<8;y++) offsets.push([originX+x*W/8,originY+y*H/8]);
  // Additional phases center actual lot groups instead of relying only on coarse search.
  for(const g of groupBounds.slice().sort((a,b)=>a.minX-b.minX||a.minY-b.minY).slice(0,64)) offsets.push([(g.minX+g.maxX-W)/2,(g.minY+g.maxY-H)/2]);
  let best: GridBoxBounds[] = [], bestScore = Infinity;
  for(const [ox,oy] of offsets) {
    const cells = new Map<string,GridBoxBounds>();
    let edgeCost = 0;
    for(const p of points) {
      const ix=Math.floor((p.x-ox)/W), iy=Math.floor((p.y-oy)/H);
      const minX=ox+ix*W,minY=oy+iy*H;
      cells.set(ix+','+iy,{minX,minY,maxX:minX+W,maxY:minY+H});
      const clearance=Math.min(p.x-minX,minX+W-p.x,p.y-minY,minY+H-p.y);
      edgeCost += Math.max(0,1-clearance/margin);
    }
    // Walk exact lattice crossings so even sparse/diagonal routes have continuous page coverage.
    for(const path of paths) for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y;
      const ts=[0,1];
      for(const [start,delta,origin,size] of [[a.x,dx,ox,W],[a.y,dy,oy,H]]) {
        if(Math.abs(delta)<1e-12) continue;
        const lo=Math.min(start,start+delta),hi=Math.max(start,start+delta);
        for(let k=Math.floor((lo-origin)/size)+1;k<=Math.floor((hi-origin)/size);k++) {
          const t=(origin+k*size-start)/delta;
          if(t>0&&t<1) ts.push(t);
        }
      }
      ts.sort((a,b)=>a-b);
      for(let j=1;j<ts.length;j++) {
        const t=(ts[j-1]+ts[j])/2,ix=Math.floor((a.x+dx*t-ox)/W),iy=Math.floor((a.y+dy*t-oy)/H);
        const minX=ox+ix*W,minY=oy+iy*H;
        cells.set(ix+','+iy,{minX,minY,maxX:minX+W,maxY:minY+H});
      }
    }
    const pages=[...cells.values()];
    const split=groupBounds.filter(g=>!pages.some(p=>fits(g,p,margin)));
    // Supplemental detail pages keep a whole lot group readable when no common seam works.
    for(const g of split) {
      if(pages.some(p=>fits(g,p,margin))) continue;
      const minX=(g.minX+g.maxX-W)/2,minY=(g.minY+g.maxY-H)/2;
      pages.push({minX,minY,maxX:minX+W,maxY:minY+H});
    }
    const score=pages.length*100 + split.length*40 + edgeCost/points.length*20;
    if(score<bestScore) {bestScore=score;best=pages;}
  }
  // Geographic order only; page labels remain manual placeholders.
  return best.sort((a,b)=>b.minY-a.minY||a.minX-b.minX);
}

export function buildGridPagingBoxEntities(
  polePointsOutput: GridPoint[],
  obstaclePointsOutput: GridPoint[],
  usesRawCoordinates: boolean,
  dxfPair: (code: number, value: string | number) => string,
  dxfHandle: () => string,
  cadCoord: (value: number) => string,
  cadSize: (value: number) => string,
  groups: GridPoint[][] = [],
  paths: GridPoint[][] = [],
): { entities: string[]; points: GridPoint[] } {
  if (!polePointsOutput.length) {
    return { entities: [], points: [] };
  }

  const unitScale = usesRawCoordinates ? 1 / 111320 : 1.0;
  const W = GRID_WIDTH_METERS * unitScale;
  const H = GRID_HEIGHT_METERS * unitScale;

  const boxes = computeGridPagingBoxes([...polePointsOutput, ...obstaclePointsOutput], W, H, groups, paths);
  const entities: string[] = [];
  const points: GridPoint[] = [];

  const textHeight = 33.49242625 * unitScale;
  const textBoxWidth = 97.05089599 * unitScale;

  for (const box of boxes) {
    const { minX, maxX, minY, maxY } = box;

    // 1. Emit GRID LWPOLYLINE with the exact 6-vertex closed profile from sample LLD drawings
    const ySplit0 = minY + 150.78631386 * unitScale;
    const ySplit1 = minY + 151.60858476 * unitScale;

    entities.push(
      [
        dxfPair(0, "LWPOLYLINE"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "GRID"),
        dxfPair(6, "Continuous"),
        dxfPair(370, 25),
        dxfPair(100, "AcDbPolyline"),
        dxfPair(90, 6),
        dxfPair(70, 0),
        dxfPair(43, "0.0"),
        dxfPair(10, cadCoord(maxX)),
        dxfPair(20, cadCoord(ySplit0)),
        dxfPair(10, cadCoord(maxX)),
        dxfPair(20, cadCoord(minY)),
        dxfPair(10, cadCoord(minX)),
        dxfPair(20, cadCoord(minY)),
        dxfPair(10, cadCoord(minX)),
        dxfPair(20, cadCoord(maxY)),
        dxfPair(10, cadCoord(maxX)),
        dxfPair(20, cadCoord(maxY)),
        dxfPair(10, cadCoord(maxX)),
        dxfPair(20, cadCoord(ySplit1)),
      ].join("\n"),
    );

    points.push(
      { x: minX, y: minY, z: 0 },
      { x: maxX, y: minY, z: 0 },
      { x: maxX, y: maxY, z: 0 },
      { x: minX, y: maxY, z: 0 },
    );

    // 2. Choose the cleanest of the 4 standard corners inside the GRID box for the "#" page number MTEXT
    // Attachment 71=2 is Top-Center, so the glyph extends downward from yAnchor by textHeight (~33.5m)
    const cornerCandidates = [
      {
        name: "BL",
        anchorX: minX + 21.53 * unitScale,
        anchorY: minY + 45.16 * unitScale,
        centerX: minX + 21.53 * unitScale,
        centerY: minY + 28.4 * unitScale,
        bias: 8 * unitScale, // Default preferred corner in sample DWGs
      },
      {
        name: "BR",
        anchorX: maxX - 28.5 * unitScale,
        anchorY: minY + 45.16 * unitScale,
        centerX: maxX - 28.5 * unitScale,
        centerY: minY + 28.4 * unitScale,
        bias: 2 * unitScale,
      },
      {
        name: "TL",
        anchorX: minX + 21.53 * unitScale,
        anchorY: maxY - 6.91 * unitScale,
        centerX: minX + 21.53 * unitScale,
        centerY: maxY - 23.6 * unitScale,
        bias: 1 * unitScale,
      },
      {
        name: "TR",
        anchorX: maxX - 28.5 * unitScale,
        anchorY: maxY - 6.91 * unitScale,
        centerX: maxX - 28.5 * unitScale,
        centerY: maxY - 23.6 * unitScale,
        bias: 0,
      },
    ];

    const boxObstacles = obstaclePointsOutput.filter(
      (pt) => pt.x >= minX - 10 * unitScale && pt.x <= maxX + 10 * unitScale && pt.y >= minY - 10 * unitScale && pt.y <= maxY + 10 * unitScale,
    );

    let bestCorner = cornerCandidates[0];
    let bestClearanceScore = -Infinity;

    for (const c of cornerCandidates) {
      let minDist = 80 * unitScale;
      for (const obs of boxObstacles) {
        const d = Math.hypot(obs.x - c.centerX, obs.y - c.centerY);
        if (d < minDist) minDist = d;
      }
      const score = minDist + c.bias;
      if (score > bestClearanceScore) {
        bestClearanceScore = score;
        bestCorner = c;
      }
    }

    entities.push(
      [
        dxfPair(0, "MTEXT"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "t-block"),
        dxfPair(100, "AcDbMText"),
        dxfPair(10, cadCoord(bestCorner.anchorX)),
        dxfPair(20, cadCoord(bestCorner.anchorY)),
        dxfPair(30, "0.0"),
        dxfPair(40, cadSize(textHeight)),
        dxfPair(41, cadSize(textBoxWidth)),
        dxfPair(46, "0.0"),
        dxfPair(71, 2),
        dxfPair(72, 5),
        dxfPair(1, "#"),
        dxfPair(7, "样式 1"),
        dxfPair(73, 1),
        dxfPair(44, "1.0"),
      ].join("\n"),
    );
  }

  return { entities, points };
}
