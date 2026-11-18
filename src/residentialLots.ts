import type { Pt, RoadCurbPiece } from "./roadNetwork";
export type LotTarget = {
    id: string;
    name: string;
    point: Pt;
    lines: 8 | 16;
    lotCount?: number;
};
export type LotCell = { polygon: Pt[]; center: Pt; direction: Pt; textHeight: number; frontage: number; depth: number };
export type LotPlacement = {
    parts?: LotPlacement[];
    cells: LotCell[];
    rails: Pt[][];
    rowColumns: number[];
    dividers: Pt[][];
    target: LotTarget;
    front: Pt[];
    frontage: Pt[];
    middleRail: Pt[];
    backRail: Pt[];
    middle: Pt[];
    back: Pt[];
    polygon: Pt[];
    score: number;
};
const cellCount=(target:LotTarget)=>target.lotCount??(target.lines===16?16:10);
export const lotFootprints=(p:LotPlacement):Pt[][]=>p.parts?p.parts.flatMap(lotFootprints):[p.polygon];
const collisionCache=new WeakMap<LotPlacement,WeakMap<LotPlacement,boolean>>();
const placementsConflict=(a:LotPlacement,b:LotPlacement,gap=2):boolean=>{
    if(gap===2&&collisionCache.get(a)?.has(b))return collisionCache.get(a)!.get(b)!;
    const conflict=a.parts?a.parts.some(p=>placementsConflict(p,b,gap)):
        b.parts?b.parts.some(p=>placementsConflict(a,p,gap)):lotPolygonsConflict(a.polygon,b.polygon,gap);
    if(gap===2) {
        if(!collisionCache.has(a))collisionCache.set(a,new WeakMap());
        if(!collisionCache.has(b))collisionCache.set(b,new WeakMap());
        collisionCache.get(a)!.set(b,conflict);collisionCache.get(b)!.set(a,conflict);
    }
    return conflict;
};
type Box = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};
type Obstacle = {
    polygon: Pt[];
    box: Box;
};
const EPS = 1e-6;
const point = (x: number, y: number): Pt => ({ x, y, z: 0 });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Pt, b: Pt, t: number) => point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const boundsCache=new WeakMap<Pt[],Box>();
const bounds=(pts:Pt[]):Box=>{
    let box=boundsCache.get(pts);
    if(!box){box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};for(const p of pts){box.minX=Math.min(box.minX,p.x);box.minY=Math.min(box.minY,p.y);box.maxX=Math.max(box.maxX,p.x);box.maxY=Math.max(box.maxY,p.y);}boundsCache.set(pts,box);}
    return box;
};
const boxesMeet = (a: Box, b: Box, gap = 0) => a.minX <= b.maxX + gap && a.maxX + gap >= b.minX && a.minY <= b.maxY + gap && a.maxY + gap >= b.minY;
function onSegment(p: Pt, a: Pt, b: Pt): boolean {
    return Math.abs(cross(a, b, p)) < EPS && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}
function segmentsMeet(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    if (Math.max(a.x,b.x)+EPS < Math.min(c.x,d.x) || Math.max(c.x,d.x)+EPS < Math.min(a.x,b.x)
        || Math.max(a.y,b.y)+EPS < Math.min(c.y,d.y) || Math.max(c.y,d.y)+EPS < Math.min(a.y,b.y)) return false;
    const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
    return ((x > EPS && y < -EPS || x < -EPS && y > EPS) && (z > EPS && w < -EPS || z < -EPS && w > EPS)) || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}
function contains(poly: Pt[], p: Pt): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if (onSegment(p, a, b))
            return true;
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)
            inside = !inside;
    }
    return inside;
}
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    return dist(p, lerp(a, b, len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2)) : 0));
}
/** Full boundary/containment checks, including narrow crossings and touching edges. */
export function lotPolygonsConflict(a: Pt[], b: Pt[], gap = 0): boolean {
    if (!a.length || !b.length || !boxesMeet(bounds(a), bounds(b), gap))
        return false;
    for (let i = 0; i < a.length; i++)
        for (let j = 0; j < b.length; j++) {
            const a1 = a[i], a2 = a[(i + 1) % a.length], b1 = b[j], b2 = b[(j + 1) % b.length];
            if (segmentsMeet(a1, a2, b1, b2))
                return true;
            if (gap > 0 && Math.min(segmentDistance(a1, b1, b2), segmentDistance(a2, b1, b2), segmentDistance(b1, a1, a2), segmentDistance(b2, a1, a2)) < gap)
                return true;
        }
    return contains(a, b[0]) || contains(b, a[0]);
}
function simplePolygon(poly: Pt[]): boolean {
    for (let i = 0; i < poly.length; i++)
        for (let j = i + 1; j < poly.length; j++) {
            if (j === i + 1 || i === 0 && j === poly.length - 1)
                continue;
            if (segmentsMeet(poly[i], poly[(i + 1) % poly.length], poly[j], poly[(j + 1) % poly.length]))
                return false;
        }
    return true;
}
/** Road strips indexed once for the entire site, not sampled at a few lot points. */
export function residentialRoadObstacles(curbs: RoadCurbPiece[]): Pt[][] {
    const polygons: Pt[][] = [];
    for (const curb of curbs)
        for (let i = 1; i < curb.points.length; i++) {
            const a = curb.points[i - 1], b = curb.points[i], len = dist(a, b);
            if (len < EPS)
                continue;
            const nx = curb.side * -(b.y - a.y) / len, ny = curb.side * (b.x - a.x) / len;
            const shift = (p: Pt, d: number) => point(p.x + nx * d, p.y + ny * d);
            // Permit coincident frontage; a millimetre numerical tolerance stays inside the road.
            polygons.push([shift(a, -0.001), shift(b, -0.001), shift(b, -curb.halfWidth), shift(a, -curb.halfWidth)]);
        }
    return polygons;
}
/** A carriageway boundary may coincide with frontage, but may never run through
 * the interior of a lot group. Split at every intersection to catch narrow crossings.
 */
function boundaryInsidePolygon(a:Pt,end:Pt,poly:Pt[]):boolean {
    const dx=end.x-a.x,dy=end.y-a.y,ts=[0,1];
    for(let i=0;i<poly.length;i++) {
        const c=poly[i],d=poly[(i+1)%poly.length],vx=d.x-c.x,vy=d.y-c.y,den=dx*vy-dy*vx;
        if(Math.abs(den)<EPS)continue;
        const t=((c.x-a.x)*vy-(c.y-a.y)*vx)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den;
        if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS)ts.push(Math.max(0,Math.min(1,t)));
    }
    ts.sort((x,y)=>x-y);
    for(let i=1;i<ts.length;i++) {
        if(ts[i]-ts[i-1]<EPS)continue;
        const p=lerp(a,end,(ts[i]+ts[i-1])/2);
        if(contains(poly,p)&&poly.every((q,j)=>segmentDistance(p,q,poly[(j+1)%poly.length])>0.025))return true;
    }
    return false;
}
class RoadIndex {
    private cells = new Map<string, Obstacle[]>();
    private boundaries=new Map<string,{a:Pt;b:Pt;box:Box}[]>();
    constructor(polygons: Pt[][],curbs:RoadCurbPiece[]=[]) {
        for(const curb of curbs)for(let i=1;i<curb.points.length;i++) {
            const a=curb.points[i-1],b=curb.points[i],edge={a,b,box:bounds([a,b])};
            this.keys(edge.box).forEach(k=>this.boundaries.set(k,[...(this.boundaries.get(k)||[]),edge]));
        }
        for (const polygon of polygons) {
            const o = { polygon, box: bounds(polygon) };
            this.keys(o.box).forEach(k => this.cells.set(k, [...(this.cells.get(k) || []), o]));
        }
    }
    private keys(b: Box): string[] {
        const out: string[] = [];
        for (let x = Math.floor(b.minX / 64); x <= Math.floor(b.maxX / 64); x++)
            for (let y = Math.floor(b.minY / 64); y <= Math.floor(b.maxY / 64); y++)
                out.push(`${x},${y}`);
        return out;
    }
    conflicts(poly: Pt[]): boolean {
        const box = bounds(poly), seen = new Set<Obstacle>();
        const checked=new Set<object>();
        for(const key of this.keys(box))for(const edge of this.boundaries.get(key)||[]) {
            if(checked.has(edge)||!boxesMeet(box,edge.box))continue;
            checked.add(edge);
            if(boundaryInsidePolygon(edge.a,edge.b,poly))return true;
        }
        for (const key of this.keys(box))
            for (const o of this.cells.get(key) || []) {
                if (seen.has(o))
                    continue;
                seen.add(o);
                if (boxesMeet(box, o.box) && lotPolygonsConflict(poly, o.polygon))
                    return true;
            }
        return false;
    }
}
type CurbContext = {
    curb: RoadCurbPiece;
    cum: number[];
    length: number;
};
function sample(c: CurbContext, s: number): Pt {
    s = Math.max(0, Math.min(c.length, s));
    let i = 1;
    while (i < c.cum.length - 1 && c.cum[i] < s)
        i++;
    return lerp(c.curb.points[i - 1], c.curb.points[i], (s - c.cum[i - 1]) / (c.cum[i] - c.cum[i - 1] || 1));
}
function tangent(c: CurbContext, s: number): Pt {
    const a = sample(c, s - 2), b = sample(c, s + 2), len = dist(a, b) || 1;
    return point((b.x - a.x) / len, (b.y - a.y) / len);
}
function nearest(c: CurbContext, p: Pt): {
    distance: number;
    s: number;
} {
    let best = { distance: Infinity, s: 0 };
    for (let i = 1; i < c.cum.length; i++) {
        const a = c.curb.points[i - 1], b = c.curb.points[i], len = c.cum[i] - c.cum[i - 1];
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len || 1)));
        const distance = dist(p, lerp(a, b, t));
        if (distance < best.distance)
            best = { distance, s: c.cum[i - 1] + t * len };
    }
    return best;
}
/** Use a local origin so area and centroid remain accurate at projected coordinates. */
export function residentialLotArea(poly: Pt[]): number {
    const origin = poly[0];
    return Math.abs(poly.reduce((sum, p, i) => sum + cross(origin, p, poly[(i + 1) % poly.length]), 0)) / 2;
}
function labelCenter(poly: Pt[]): Pt {
    const o = poly[0];
    let area = 0, x = 0, y = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], k = cross(o, p, q);
        area += k; x += (p.x + q.x - 2 * o.x) * k; y += (p.y + q.y - 2 * o.y) * k;
    }
    const center = point(o.x + x / (3 * area), o.y + y / (3 * area));
    if (contains(poly, center)) return center;
    // For an unusually concave cell, choose the most central interior point.
    const box = bounds(poly);
    let best = poly[0], clearance = -1;
    for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) {
        const p = point(box.minX + (box.maxX - box.minX) * i / 20, box.minY + (box.maxY - box.minY) * j / 20);
        if (!contains(poly, p)) continue;
        const d = Math.min(...poly.map((a, k) => segmentDistance(p, a, poly[(k + 1) % poly.length])));
        if (d > clearance) { clearance = d; best = p; }
    }
    return best;
}
function properlyCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    return cross(a,b,c)*cross(a,b,d) < -EPS && cross(c,d,a)*cross(c,d,b) < -EPS;
}
/** Reserve a conservative rotated text box, not just an insertion point inside the lot. */
function fittedTextHeight(poly: Pt[], center: Pt, direction: Pt, limit: number): number {
    const length = dist(direction,point(0,0)) || 1;
    const u = point(direction.x/length,direction.y/length), v = point(-u.y,u.x);
    const fits = (h: number) => {
        const corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) =>
            point(center.x + u.x*x*h*1.6 + v.x*y*h*0.7, center.y + u.y*x*h*1.6 + v.y*y*h*0.7));
        return corners.every(p => contains(poly,p)) && corners.every((p,i) => poly.every((q,j) =>
            !properlyCross(p,corners[(i+1)%4],q,poly[(j+1)%poly.length])));
    };
    if (fits(limit)) return limit;
    let lo=0,hi=limit;
    for (let i=0;i<18;i++) { const h=(lo+hi)/2; if(fits(h))lo=h;else hi=h; }
    return lo;
}
function railTurn(rail:Pt[],i:number):number {
    const a=rail[i-1],b=rail[i],c=rail[i+1],ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y;
    const length=Math.hypot(ux,uy)*Math.hypot(vx,vy);
    return length>1e-8?Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/length))):0;
}
function smoothInternalRails(rails:Pt[][]):boolean {
    const front=rails[0],back=rails.at(-1)!;
    return rails.slice(1,-1).every(rail=>rail.slice(1,-1).every((_,j)=>{
        const i=j+1,limit=Math.max(railTurn(front,i),railTurn(back,i))+10*Math.PI/180;
        return railTurn(rail,i)<=limit;
    }));
}
function compactPolygon(poly: Pt[]): Pt[] {
    return poly.filter((p,i)=>segmentDistance(p,poly[(i+poly.length-1)%poly.length],poly[(i+1)%poly.length])>1e-6);
}
function usableCell(cell: LotCell): boolean {
    if (!simplePolygon(cell.polygon)) return false;
    const length = Math.hypot(cell.direction.x,cell.direction.y);
    if (length < EPS) return false;
    const u=point(cell.direction.x/length,cell.direction.y/length), v=point(-u.y,u.x);
    const extent = (axis: Pt) => {
        const positions=cell.polygon.map(p => (p.x-cell.center.x)*axis.x+(p.y-cell.center.y)*axis.y);
        return Math.max(...positions)-Math.min(...positions);
    };
    const width=extent(u), depth=extent(v), area=residentialLotArea(cell.polygon);
    // Schematic design limits: keep useful frontage and balanced proportions,
    // rather than accepting equal-area slivers or shrinking labels to hide them.
    if (cell.frontage < 10-EPS || cell.depth < 6.5-EPS || cell.depth/cell.frontage>2 || Math.max(width/depth,depth/width)>2.5 || area/(width*depth)<0.45) return false;
    const desired=Math.min(1.7641679,Math.sqrt(area)*0.12);
    cell.textHeight=fittedTextHeight(cell.polygon,cell.center,cell.direction,desired);
    return cell.textHeight >= desired*0.4;
}
function offsetRail(points: Pt[], side: number, depth: number): Pt[] {
    const normals = points.slice(1).map((b, i) => {
        const a = points[i], length = dist(a, b) || 1;
        return point(-(b.y - a.y) * side / length, (b.x - a.x) * side / length);
    });
    return points.map((p, i) => {
        const a = normals[Math.max(0, i - 1)], b = normals[Math.min(i, normals.length - 1)];
        const k = depth / Math.max(0.2, 1 + a.x * b.x + a.y * b.y);
        return point(p.x + (a.x + b.x) * k, p.y + (a.y + b.y) * k);
    });
}
function ribbon(a: Pt[], b: Pt[]): Pt[] { return [...a, ...b.slice().reverse()]; }
function at(rail: Pt[], station: number): Pt {
    const i = Math.min(rail.length - 2, Math.floor(station));
    return lerp(rail[i], rail[i + 1], station - i);
}
function section(rail: Pt[], start: number, end: number): Pt[] {
    return [at(rail, start), ...rail.filter((_, i) => i > start + EPS && i < end - EPS), at(rail, end)];
}
const railLength=(rail:Pt[])=>rail.slice(1).reduce((sum,p,i)=>sum+dist(rail[i],p),0);
function cellBetween(a:Pt[],b:Pt[]):LotCell {
    const poly=compactPolygon(ribbon(a,b)),start=lerp(a[0],b[0],0.5),end=lerp(a.at(-1)!,b.at(-1)!,0.5);
    return {polygon:poly,center:labelCenter(poly),direction:point(end.x-start.x,end.y-start.y),textHeight:0,
        frontage:Math.min(railLength(a),railLength(b)),depth:Math.min(...a.map((p,i)=>dist(p,b[i])))};
}
/** Trim a paired curb ribbon to an exact group area while preserving BOTH curbs. */
function trimRibbonToArea(front:Pt[],back:Pt[],wanted:number,keepStart:boolean):[Pt[],Pt[]]|null {
    const total=residentialLotArea(ribbon(front,back));
    if(total<wanted-0.01)return null;
    if(total<=wanted+0.01)return [front,back];
    const a=keepStart?front:front.slice().reverse(),b=keepStart?back:back.slice().reverse();
    let sum=0,segment=0;
    for(;segment<a.length-1;segment++) {
        const area=residentialLotArea([a[segment],a[segment+1],b[segment+1],b[segment]]);
        if(sum+area>=wanted)break;
        sum+=area;
    }
    if(segment>=a.length-1)return null;
    let lo=0,hi=1;
    for(let i=0;i<30;i++) {
        const t=(lo+hi)/2;
        const area=residentialLotArea([a[segment],lerp(a[segment],a[segment+1],t),lerp(b[segment],b[segment+1],t),b[segment]]);
        if(sum+area<wanted)lo=t;else hi=t;
    }
    const end=segment+(lo+hi)/2,near=section(a,0,end),far=section(b,0,end);
    return keepStart?[near,far]:[near.reverse(),far.reverse()];
}
/** Find equal-area columns across the complete curved strip. */
function divideRow(near: Pt[], far: Pt[], cols: number): { cells: LotCell[]; dividers: Pt[][]; stations: number[] } | null {
    const areas = near.slice(1).map((_, i) => residentialLotArea([near[i], near[i+1], far[i+1], far[i]]));
    const total = areas.reduce((a,b) => a+b, 0);
    if (total / cols < 2) return null;
    const stations = [0];
    let segment = 0, accumulated = 0;
    for (let col = 1; col < cols; col++) {
        const desired = total * col / cols;
        while (segment < areas.length - 1 && accumulated + areas[segment] < desired) accumulated += areas[segment++];
        let lo = 0, hi = 1;
        for (let step = 0; step < 32; step++) {
            const t = (lo + hi) / 2;
            const partial = residentialLotArea([near[segment], lerp(near[segment], near[segment+1], t), lerp(far[segment], far[segment+1], t), far[segment]]);
            if (accumulated + partial < desired) lo = t; else hi = t;
        }
        stations.push(segment + (lo + hi) / 2);
    }
    stations.push(near.length - 1);
    const dividers = stations.map(s => [at(near, s), at(far, s)]);
    const cells = stations.slice(1).map((end, i) => {
        const a = section(near, stations[i], end), b = section(far, stations[i], end);
        return cellBetween(a,b);
    });
    return { cells, dividers, stations };
}
/** Build the same balanced cells for either offset rails or two actual facing curbs. */
function placementBetweenRails(target: LotTarget, frontage: Pt[], backRail: Pt[], side: number, rowCount = 2): LotPlacement | null {
    const count = cellCount(target), cols = count / rowCount;
    if(railLength(frontage)<cols*10-EPS||railLength(backRail)<cols*10-EPS||frontage.some((p,i)=>dist(p,backRail[i])<rowCount*6.5-EPS))return null;
    const polygon = compactPolygon(ribbon(frontage, backRail));
    if (!simplePolygon(polygon)) return null;
    for (let i = 1; i < frontage.length; i++) {
        const a = frontage[i-1], b = frontage[i], c = backRail[i], d = backRail[i-1];
        if (cross(a,b,c) * side <= EPS || cross(a,c,d) * side <= EPS) return null;
    }
    // Choose columns once across the complete strip. Both rows share every divider.
    const columns=divideRow(frontage,backRail,cols);
    if(!columns)return null;
    const positions=[...frontage.map((_,i)=>i),...columns.stations];
    for(let col=0;col<cols;col++)for(let i=1;i<8;i++)
        positions.push(columns.stations[col]+(columns.stations[col+1]-columns.stations[col])*i/8);
    positions.sort((a,b)=>a-b);
    const knots=positions.filter((s,i)=>!i||s-positions[i-1]>EPS);
    const front=knots.map(s=>at(frontage,s)),back=knots.map(s=>at(backRail,s));
    const run=[0];
    for(let i=1;i<front.length;i++)run.push(run[i-1]+(dist(front[i-1],front[i])+dist(back[i-1],back[i]))/2);
    const cuts=columns.stations.map(s=>knots.findIndex(k=>Math.abs(k-s)<EPS));
    const rails:Pt[][]=[front];
    // Build each internal rail at an equal-area fraction of the strip. Smoothing
    // uses physical distance so unequal curb vertex density cannot make sawteeth.
    for(let row=1;row<rowCount;row++) {
        const share=row/rowCount;
        const fractions=front.slice(1).map((_,i)=>{
            const area=residentialLotArea([front[i],front[i+1],back[i+1],back[i]])*share;
            let lo=0,hi=1;
            for(let j=0;j<24;j++) {
                const t=(lo+hi)/2;
                if(residentialLotArea([front[i],front[i+1],lerp(front[i+1],back[i+1],t),lerp(front[i],back[i],t)])<area)lo=t;else hi=t;
            }
            return (lo+hi)/2;
        });
        const window=Math.max(4,run.at(-1)!/cols*0.65),weightedRun=[0];
        for(let i=0;i<fractions.length;i++)weightedRun.push(weightedRun[i]+(run[i+1]-run[i])*fractions[i]);
        const integral=(s:number)=>{
            let lo=0,hi=run.length-1;
            while(hi-lo>1) { const mid=Math.floor((lo+hi)/2); if(run[mid]<=s)lo=mid;else hi=mid; }
            return weightedRun[lo]+(s-run[lo])*fractions[lo];
        };
        const baseline=front.map((_,i)=>{
            const a=Math.max(0,run[i]-window),b=Math.min(run.at(-1)!,run[i]+window);
            return (integral(b)-integral(a))/(b-a);
        });
        const internal=front.map((p,i)=>lerp(p,back[i],baseline[i]));
        for(let col=0;col<cols;col++) {
            const start=cuts[col],end=cuts[col+1],a=front.slice(start,end+1),b=back.slice(start,end+1);
            const desired=residentialLotArea(ribbon(a,b))*share;
            const rail=(delta:number)=>a.map((p,j)=>{
                const i=start+j,f=(knots[i]-knots[start])/(knots[end]-knots[start]);
                return lerp(p,b[j],baseline[i]+delta*Math.sin(Math.PI*f));
            });
            let radius=0.15;
            for(let j=1;j<a.length-1;j++) {
                const f=(knots[start+j]-knots[start])/(knots[end]-knots[start]),w=Math.sin(Math.PI*f);
                radius=Math.min(radius,(baseline[start+j]-0.04)/w,(0.96-baseline[start+j])/w);
            }
            if(radius<EPS)return null;
            const area0=residentialLotArea(ribbon(a,rail(0)));
            const areaLo=residentialLotArea(ribbon(a,rail(-radius))),areaHi=residentialLotArea(ribbon(a,rail(radius)));
            if(areaLo>desired||areaHi<desired)return null;
            const linear=(areaHi-areaLo)/(2*radius),quadratic=(areaHi+areaLo-2*area0)/(2*radius*radius);
            let lo=-radius,hi=radius;
            for(let i=0;i<26;i++) {
                const d=(lo+hi)/2;
                if(area0+linear*d+quadratic*d*d<desired)lo=d;else hi=d;
            }
            rail((lo+hi)/2).forEach((p,j)=>internal[start+j]=p);
        }
        rails.push(internal);
    }
    rails.push(back);
    // Internal rails must remain ordered along every cross-section.
    for(let i=0;i<front.length;i++)for(let row=1;row<rails.length;row++)
        if(dist(front[i],rails[row][i])<=dist(front[i],rails[row-1][i])+EPS)return null;
    const cells:LotCell[]=[];
    for(let row=0;row<rowCount;row++) {
        const rowCells:LotCell[]=[];
        for(let col=0;col<cols;col++) {
            const start=cuts[col],end=cuts[col+1],a=rails[row].slice(start,end+1),b=rails[row+1].slice(start,end+1);
            const cell=cellBetween(a,b);
            if(!usableCell(cell))return null;
            rowCells.push(cell);
        }
        const widths=rowCells.map(c=>c.frontage);
        if(Math.max(...widths)/Math.min(...widths)>1.5)return null;
        cells.push(...rowCells);
    }
    const retained=front.map((_,i)=>i).filter(i=>i===0||i===front.length-1||
        rails.some(r=>segmentDistance(r[i],r[i-1],r[i+1])>1e-6));
    const compactRails=rails.map(r=>retained.map(i=>r[i]));
    for(let row=0;row<rowCount;row++)if(!simplePolygon(ribbon(compactRails[row],compactRails[row+1])))return null;
    if(!smoothInternalRails(compactRails))return null;
    const dividers=cuts.map(i=>rails.map(r=>r[i]));
    const edges=dividers.flatMap(d=>d.slice(1).map((p,i)=>[d[i],p]));
    if(edges.some((d,i)=>edges.slice(i+1).some(e=>properlyCross(d[0],d[1],e[0],e[1]))))return null;
    const textHeight=Math.min(...cells.map(c=>c.textHeight));
    cells.forEach(c=>c.textHeight=textHeight);
    const areas = cells.map(c => residentialLotArea(c.polygon));
    if (Math.max(...areas) / Math.min(...areas) > 1.01) return null;
    return { target, rails:compactRails, rowColumns:Array(rowCount).fill(cols), frontage:compactRails[0], middleRail:compactRails[Math.floor(rowCount/2)], backRail:compactRails[rowCount], polygon, cells,
        front:cuts.map(i=>front[i]),middle:cuts.map(i=>rails[Math.floor(rowCount/2)][i]),back:cuts.map(i=>back[i]),dividers,score:0 };
}
/** On a tight bend the outer row has more usable frontage than the inner row.
 * Try different cell counts per row before moving the entire group off the bend.
 * Each row is ordered independently; shared rail junctions are clean T-junctions.
 */
function staggeredPlacement(target:LotTarget,front:Pt[],back:Pt[],side:number,firstCount:number):LotPlacement|null {
    const count=cellCount(target),secondCount=count-firstCount,polygon=compactPolygon(ribbon(front,back));
    if(railLength(front)<firstCount*10-EPS||railLength(back)<secondCount*10-EPS||front.some((p,i)=>dist(p,back[i])<13-EPS))return null;
    if(!simplePolygon(polygon))return null;
    for(let i=1;i<front.length;i++)if(cross(front[i-1],front[i],back[i])*side<=EPS||cross(front[i-1],back[i],back[i-1])*side<=EPS)return null;
    const desired=residentialLotArea(polygon)*firstCount/count;
    const rail=(t:number)=>front.map((p,i)=>lerp(p,back[i],t));
    let lo=0,hi=1;
    for(let i=0;i<30;i++) { const t=(lo+hi)/2;if(residentialLotArea(ribbon(front,rail(t)))<desired)lo=t;else hi=t; }
    const mid=rail((lo+hi)/2);
    if(!simplePolygon(ribbon(front,mid))||!simplePolygon(ribbon(mid,back)))return null;
    const a=divideRow(front,mid,firstCount),b=divideRow(mid,back,secondCount);
    if(!a||!b)return null;
    for(const row of [a,b]) {
        if(!row.cells.every(usableCell))return null;
        const widths=row.cells.map(c=>c.frontage);
        if(Math.max(...widths)/Math.min(...widths)>1.5)return null;
    }
    const cells=[...a.cells,...b.cells],areas=cells.map(c=>residentialLotArea(c.polygon));
    if(Math.max(...areas)/Math.min(...areas)>1.01)return null;
    const textHeight=Math.min(...cells.map(c=>c.textHeight));cells.forEach(c=>c.textHeight=textHeight);
    const dividers=[...a.dividers,...b.dividers];
    if(dividers.some((d,i)=>dividers.slice(i+1).some(e=>properlyCross(d[0],d[1],e[0],e[1]))))return null;
    return {target,rails:[front,mid,back],rowColumns:[firstCount,secondCount],frontage:front,middleRail:mid,backRail:back,polygon,cells,dividers,
        front:a.dividers.map(d=>d[0]),middle:a.dividers.map(d=>d[1]),back:b.dividers.map(d=>d[1]),score:0};
}
function adaptivePlacement(target:LotTarget,front:Pt[],back:Pt[],side:number):LotPlacement|null {
    const count=cellCount(target),two=placementBetweenRails(target,front,back,side);
    if(two&&proportionPenalty(two)<15)return two;
    const regular=[two,count%4===0?placementBetweenRails(target,front,back,side,4):null,
        placementBetweenRails(target,front,back,side,1)].filter((p):p is LotPlacement=>p!==null);
    if(regular.length)return regular.sort((a,b)=>proportionPenalty(a)-proportionPenalty(b))[0];
    for(const first of [...new Set([Math.floor(count*.375),Math.floor(count*.4375),Math.ceil(count*.5625),Math.ceil(count*.625)])].filter(n=>n>0&&n<count)) {
        const candidate=staggeredPlacement(target,front,back,side,first);
        if(candidate)return candidate;
    }
    return null;
}
function curvedPlacement(target: LotTarget, chain: Pt[], side: number, depth: number): LotPlacement | null {
    if (chain.length < 2) return null;
    return adaptivePlacement(target, chain, offsetRail(chain, side, depth), side);
}
function contextFor(curb: RoadCurbPiece): CurbContext {
    const cum = [0];
    for (let i = 1; i < curb.points.length; i++) cum.push(cum[i-1] + dist(curb.points[i-1],curb.points[i]));
    return { curb, cum, length: cum.at(-1) || 0 };
}
/** Match facing boundaries using local normals instead of stretching unrelated arc lengths.
 * Include vertices from both curbs. Reject ambiguous correspondence at merging road tips.
 */
function corridorPlacement(target: LotTarget, c: CurbContext, start: number, end: number, other: CurbContext, maxDepth: number, preferredArea: number): LotPlacement | null {
    if (c===other) return null;
    const rayHit = (s: number) => {
        const p=sample(c,s),d=tangent(c,s),n=point(-d.y*c.curb.side,d.x*c.curb.side);
        let best: { s: number; back: Pt; depth: number } | undefined;
        for (let i=1;i<other.curb.points.length;i++) {
            const a=other.curb.points[i-1],b=other.curb.points[i],vx=b.x-a.x,vy=b.y-a.y;
            const denominator=n.x*vy-n.y*vx;
            if(Math.abs(denominator)<EPS)continue;
            const t=((a.x-p.x)*vy-(a.y-p.y)*vx)/denominator;
            const u=((a.x-p.x)*n.y-(a.y-p.y)*n.x)/denominator;
            const len=Math.hypot(vx,vy),on=point(-vy*other.curb.side/len,vx*other.curb.side/len);
            if(t<5 || t>maxDepth || u < -EPS || u > 1+EPS || n.x*on.x+n.y*on.y > -0.5)continue;
            if(!best || t<best.depth)best={s:other.cum[i-1]+Math.max(0,Math.min(1,u))*len,back:lerp(a,b,Math.max(0,Math.min(1,u))),depth:t};
        }
        return best;
    };
    const first=rayHit(start),last=rayHit(end);
    if(!first||!last||Math.abs(last.s-first.s)<(end-start)*0.4)return null;
    const direction=Math.sign(last.s-first.s);
    const knots: {s:number;otherS:number;front:Pt;back:Pt;vertex:boolean}[]=[];
    // Densify sections to catch narrow pinches between the ends.
    const stations=[start,end,...c.cum.filter(s=>s>start+EPS&&s<end-EPS)];
    for(let s=start+4;s<end-EPS;s+=4)stations.push(s);
    for(const s of stations) {
        const hit=rayHit(s); if(!hit)return null;
        knots.push({s,otherS:hit.s,front:sample(c,s),back:hit.back,vertex:false});
    }
    for(let i=1;i<other.cum.length-1;i++) {
        const os=other.cum[i];
        if((os-first.s)*direction<=EPS||(last.s-os)*direction<=EPS)continue;
        const back=other.curb.points[i],projection=nearest(c,back);
        if(projection.s<=start+EPS||projection.s>=end-EPS)return null;
        const front=sample(c,projection.s),d=tangent(c,projection.s),n=point(-d.y*c.curb.side,d.x*c.curb.side);
        const across=(back.x-front.x)*n.x+(back.y-front.y)*n.y;
        if(across<5||dist(front,back)>maxDepth)return null;
        knots.push({s:projection.s,otherS:os,front,back,vertex:true});
    }
    knots.sort((a,b)=>a.s-b.s||Number(b.vertex)-Number(a.vertex));
    const ordered=knots.filter((k,i)=>!i||k.s-knots[i-1].s>EPS);
    for(let i=1;i<ordered.length;i++)if((ordered[i].otherS-ordered[i-1].otherS)*direction<=EPS)return null;
    const depths=ordered.map(k=>dist(k.front,k.back));
    if(Math.max(...depths)/Math.min(...depths)>2.5)return null;
    const front=ordered.map(k=>k.front),back=ordered.map(k=>k.back);
    const area=residentialLotArea(ribbon(front,back))/cellCount(target);
    if(area<preferredArea*0.75||area>preferredArea*1.35)return null;
    const trimmed=trimRibbonToArea(front,back,preferredArea*cellCount(target),dist(front[0],target.point)<=dist(front.at(-1)!,target.point));
    return trimmed?adaptivePlacement(target,trimmed[0],trimmed[1],c.curb.side):null;
}
const REFERENCE_LOT_AREA = 14.5 * 15.6;
const placementArea=(p:LotPlacement)=>lotFootprints(p).reduce((sum,poly)=>sum+residentialLotArea(poly),0)/p.cells.length;
const areaPenalty=(p:LotPlacement,area:number)=>Math.abs(Math.log(placementArea(p)/area))*300;
const proportionPenalty=(p:LotPlacement)=>p.cells.reduce((sum,c)=>sum+Math.abs(Math.log(c.frontage/c.depth)),0)/p.cells.length*30;
/** Solve the whole group's depth from its desired per-cell area. Changing row
 * count redistributes this footprint; it cannot reduce the size of each lot.
 */
function depthForArea(chain:Pt[],side:number,wanted:number):number|null {
    const at=(d:number)=>residentialLotArea(ribbon(chain,offsetRail(chain,side,d)));
    const one=at(1),two=at(2),quadratic=(two-2*one)/2,linear=one-quadratic;
    const discriminant=linear*linear+4*quadratic*wanted;
    if(linear<=EPS||discriminant<0)return null;
    const depth=2*wanted/(linear+Math.sqrt(discriminant));
    return depth>0&&depth<=160?depth:null;
}
/** Narrow road islands limit parcel depth. Use their measured spacing to choose
 * a common starting scale instead of forcing a reference footprint into the site.
 */
function siteAreaHint(targets:LotTarget[],contexts:CurbContext[]):number {
    const gaps:number[]=[];
    for(const target of targets) {
        const local=contexts.map(c=>({c,...nearest(c,target.point)})).filter(x=>x.distance<=20).sort((a,b)=>a.distance-b.distance).slice(0,2);
        let gap=Infinity;
        for(const {c,s} of local) {
            const p=sample(c,s),dir=tangent(c,s),n=point(-dir.y*c.curb.side,dir.x*c.curb.side);
            for(const other of contexts) {
                if(other===c)continue;
                for(let i=1;i<other.curb.points.length;i++) {
                    const a=other.curb.points[i-1],b=other.curb.points[i],vx=b.x-a.x,vy=b.y-a.y,len=Math.hypot(vx,vy),den=n.x*vy-n.y*vx;
                    if(len<EPS||Math.abs(den)<EPS)continue;
                    const on=point(-vy*other.curb.side/len,vx*other.curb.side/len);
                    if(n.x*on.x+n.y*on.y>-.5)continue;
                    const t=((a.x-p.x)*vy-(a.y-p.y)*vx)/den,u=((a.x-p.x)*n.y-(a.y-p.y)*n.x)/den;
                    if(t>=13&&t<=60&&u>=0&&u<=1)gap=Math.min(gap,t);
                }
            }
        }
        if(Number.isFinite(gap))gaps.push(gap);
    }
    if(!gaps.length)return REFERENCE_LOT_AREA;
    gaps.sort((a,b)=>a-b);
    const width=gaps[Math.floor(gaps.length/2)];
    return Math.max(100,Math.min(REFERENCE_LOT_AREA,width*width/4));
}
/** Find a common feasible size from the site's candidate catalogues. The initial
 * reference is a preference; road geometry may move the entire site to a different size.
 */
function commonLotArea(catalogues:LotPlacement[][],reference=REFERENCE_LOT_AREA):number {
    const nonempty=catalogues.filter(c=>c.length);
    const options=[reference,...new Set(nonempty.flatMap(c=>c.map(p=>Math.round(placementArea(p)))))];
    let best=reference,bestCoverage=-1,bestCost=Infinity;
    for(const area of options) {
        let coverage=0,cost=Math.abs(Math.log(area/reference))*0.2;
        for(const options of nonempty) {
            const difference=Math.min(...options.map(p=>Math.abs(Math.log(placementArea(p)/area))));
            if(difference<=Math.log(1.1))coverage++;
            cost+=difference*difference;
        }
        if(coverage>bestCoverage||coverage===bestCoverage&&cost<bestCost) {best=area;bestCoverage=coverage;bestCost=cost;}
    }
    return best;
}
function candidates(target: LotTarget, contexts: CurbContext[], roads: RoadIndex, scales = [1, 1.2, 1.4, 1.6, 1.8, 0.84, 0.68, 0.5, 0.4, 0.37, 0.35], preferredArea = REFERENCE_LOT_AREA, frontageWeight = 0): LotPlacement[] {
    const cols=cellCount(target)/2;
    const width=Math.sqrt(preferredArea*14.5/15.6),depth=preferredArea/width*2;
    const out: LotPlacement[] = [];
    const distances=contexts.map(c=>({c,...nearest(c,target.point)})).sort((a,b)=>a.distance-b.distance);
    // HLD points have no street ID. Keep real nearby curbs on both sides of the
    // NAP's neighbourhood, including junction branches and the far edge of a narrow island.
    const radius=target.lotCount?55:35;
    const near=distances.filter(x=>x.distance<=Math.min(radius,40)).slice(0,target.lotCount?12:8);
    for (const { c, s, distance } of near) {
        const dir = tangent(c, s), anchor = sample(c,s), n = point(-dir.y * c.curb.side, dir.x * c.curb.side);
        const wrongSide = (target.point.x-anchor.x+n.x*c.curb.halfWidth)*n.x + (target.point.y-anchor.y+n.y*c.curb.halfWidth)*n.y < 0;
        const nearbyFacing = contexts.filter(other => other !== c && nearest(other,anchor).distance <= depth*2.5 + 140);
        const seen = new Set<string>();
        for (const scale of scales) {
            const span = Math.min(c.length, cols * width * scale);
            const actualScale = span / (cols * width);
            for (const shift of [0, -16, 16, -32, 32, -56, 56, -80, 80, -112, 112]) {
                const start = Math.max(0, Math.min(c.length-span, s+shift-span/2)), end = start + span;
                const anchorGap=Math.max(start-s,s-end,0);
                if(anchorGap>Math.max(32,radius-3))continue;
                const key = `${start.toFixed(3)},${end.toFixed(3)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const chain = [sample(c,start), ...c.curb.points.filter((_,i) => c.cum[i] > start+EPS && c.cum[i] < end-EPS), sample(c,end)];
                if(Math.min(...chain.slice(1).map((p,i)=>segmentDistance(target.point,chain[i],p)))>radius)continue;
                const score = distance*2 + Math.abs((start+end)/2-s)*0.65 + (wrongSide ? 60 : 0) + Math.abs(1-actualScale)*90+anchorGap*6+span*frontageWeight;
                // Try actual facing curbs before a free-depth offset. A narrow island should
                // be filled to both edges rather than leaving a strip of unused land.
                for (const other of nearbyFacing) {
                    const paired = corridorPlacement(target,c,start,end,other,depth*2.5,preferredArea);
                    if (paired && Math.min(...paired.frontage.slice(1).map((p,i)=>segmentDistance(target.point,paired.frontage[i],p)))<=radius && !roads.conflicts(paired.polygon)) {
                        paired.score = score - 35 + areaPenalty(paired,preferredArea)+proportionPenalty(paired);
                        out.push(paired);
                    }
                }
                const d=depthForArea(chain,c.curb.side,preferredArea*(cellCount(target)));
                if(d!==null) {
                    const candidate=curvedPlacement(target,chain,c.curb.side,d);
                    if(candidate&&!roads.conflicts(candidate.polygon)) {
                        candidate.score=score+areaPenalty(candidate,preferredArea)+proportionPenalty(candidate);
                        out.push(candidate);
                    }
                }
            }
        }
    }
    return out.sort((a,b) => a.score-b.score).slice(0, 96);
}
/** A small, bounded conflict repair handles cases where two existing neighbours
 * must both change slot. It never changes the geometry or the curb attachment.
 */
function repairPlacement(item:{target:LotTarget;choices:LotPlacement[]},placed:LotPlacement[],choices:{target:LotTarget;choices:LotPlacement[]}[]):LotPlacement[]|null {
    let budget=100;
    const search=(pending:LotTarget[],current:LotPlacement[],depth:number):LotPlacement[]|null=>{
        if(!pending.length)return current;
        if(depth>3||budget--<=0)return null;
        const target=pending[0],remaining=pending.slice(1),options=choices.find(c=>c.target===target)?.choices||[];
        for(const candidate of options.slice(0,48)) {
            const conflicts=current.filter(p=>placementsConflict(candidate,p));
            if(conflicts.length>2||conflicts.some(p=>pending.includes(p.target)))continue;
            const next=current.filter(p=>!conflicts.includes(p));
            const result=search([...remaining,...conflicts.map(p=>p.target)],[...next,candidate],depth+1);
            if(result)return result;
        }
        return null;
    };
    return search([item.target],placed,0);
}
function allocate(choices:{target:LotTarget;choices:LotPlacement[]}[]):LotPlacement[] {
    const stable=(a:typeof choices[number],b:typeof choices[number])=>a.target.id.localeCompare(b.target.id)||a.target.name.localeCompare(b.target.name)||a.target.point.x-b.target.point.x||a.target.point.y-b.target.point.y;
    const constrained=choices.slice().sort((a,b)=>a.choices.length-b.choices.length||b.target.lines-a.target.lines||stable(a,b));
    const geographic=choices.slice().sort((a,b)=>a.target.point.x-b.target.point.x||a.target.point.y-b.target.point.y||stable(a,b));
    let best:LotPlacement[]=[],bestScore=Infinity;
    for(const order of [constrained,geographic,geographic.slice().reverse()]) {
        let placed:LotPlacement[]=[];
        for(const item of order) {
            const direct=item.choices.find(c=>placed.every(p=>!placementsConflict(c,p)));
            if(direct)placed.push(direct);
            else {
                const repaired=repairPlacement(item,placed,choices);
                if(repaired)placed=repaired;
            }
        }
        const score=placed.reduce((n,p)=>n+p.score,0);
        if(placed.length>best.length||placed.length===best.length&&score<bestScore){best=placed;bestScore=score;}
    }
    if(best.length<choices.length&&choices.every(c=>c.choices.length)) {
        type State={placed:LotPlacement[];left:typeof choices;rank:number};
        let states:State[]=[{placed:[],left:choices,rank:0}],budget=7000;
        for(let depth=0;depth<choices.length&&states.length&&budget>0;depth++) {
            const next:State[]=[];
            for(const state of states) {
                let selected:typeof choices[number]|undefined,available:LotPlacement[]=[];
                for(const item of state.left) {
                    const fits=item.choices.filter(p=>state.placed.every(q=>!placementsConflict(p,q)));
                    if(!selected||fits.length<available.length){selected=item;available=fits;}
                    if(!fits.length)break;
                }
                if(!selected||!available.length)continue;
                const rest=state.left.filter(c=>c!==selected);
                const pool=[...new Set([...available.slice(0,4),...Array.from({length:5},(_,i)=>available[Math.floor((available.length-1)*(i+1)/5)])])];
                for(const candidate of pool) {
                    if(budget--<=0)break;
                    const placed=[...state.placed,candidate];
                    let rank=placed.reduce((s,p)=>s+p.score,0),valid=true;
                    for(const item of rest) {
                        const option=item.choices.find(p=>placed.every(q=>!placementsConflict(p,q)));
                        if(!option){valid=false;break;}
                        rank+=option.score;
                    }
                    if(valid)next.push({placed,left:rest,rank});
                }
            }
            next.sort((a,b)=>a.rank-b.rank);
            states=next.slice(0,24);
            if(states[0]?.placed.length===choices.length)return states[0].placed;
        }
    }
    return best;
}
function splitChoices(target:LotTarget,area:number,catalogue:(target:LotTarget,area:number)=>LotPlacement[],frontageWeight=0):LotPlacement[] {
    const cache=new Map<number,LotPlacement[]>(),out:LotPlacement[]=[];
    const options=(count:number)=>{
        if(!cache.has(count))cache.set(count,catalogue({...target,lotCount:count},area).filter(p=>Math.abs(Math.log(placementArea(p)/area))<=Math.log(1.1)+EPS));
        return cache.get(count)!;
    };
    for(const counts of (cellCount(target)===16?[[8,8],[10,6],[8,4,4],[6,6,4],[6,4,4,2],[4,4,4,4],[4,4,4,2,2]]:[[6,4],[4,4,2]])) {
        let budget=800,found=0;
        const search=(i:number,parts:LotPlacement[])=>{
            if(budget--<=0||found>=8)return;
            if(i===counts.length) {
                const distance=(p:LotPlacement)=>Math.min(...p.frontage.slice(1).map((b,i)=>segmentDistance(target.point,p.frontage[i],b)));
                parts=parts.slice().sort((a,b)=>distance(a)-distance(b));
                if(distance(parts[0])>35)return;
                const cells=parts.flatMap(p=>p.cells),first=parts[0];
                out.push({...first,target,parts,cells,score:parts.reduce((s,p)=>s+(p.score-railLength(p.frontage)*frontageWeight)*p.cells.length,0)/cells.length+parts.reduce((s,p)=>s+railLength(p.frontage)*frontageWeight,0)+20*(parts.length-1)});found++;return;
            }
            for(const p of options(counts[i])) {
                if(parts.some(q=>placementsConflict(p,q)))continue;
                search(i+1,[...parts,p]);
                if(found>=8||budget<=0)break;
            }
        };
        search(0,[]);
    }
    return out.sort((a,b)=>a.score-b.score).slice(0,48);
}
export type ResidentialLotPlan={placements:LotPlacement[];warnings:string[];unresolved:LotTarget[]};
let lastPlan:{signature:string;plan:ResidentialLotPlan}|undefined;
/** Re-exporting or changing text/output coordinates must not repeat the geometric search. */
export function planResidentialLots(targets:LotTarget[],curbs:RoadCurbPiece[],carriageways:Pt[][]=[]):ResidentialLotPlan {
    if(!targets.length)return {placements:[],warnings:[],unresolved:[]};
    const signature=JSON.stringify([targets,curbs,carriageways]);
    if(lastPlan?.signature===signature)return lastPlan.plan;
    const plan=buildResidentialLotPlan(targets,curbs,carriageways);
    lastPlan={signature,plan};return plan;
}
function buildResidentialLotPlan(targets:LotTarget[],curbs:RoadCurbPiece[],carriageways:Pt[][]):ResidentialLotPlan {
    if (!targets.length)
        return { placements: [], warnings: [], unresolved: [] };
    const contexts = curbs.map(curb => contextFor({ ...curb,
        points: curb.points.filter((p,i) => !i || dist(p,curb.points[i-1]) > EPS),
    })).filter(c => c.length > 1);
    const roads = new RoadIndex(carriageways.length?carriageways:residentialRoadObstacles(curbs),curbs);
    const density=(target:LotTarget)=>Math.min(3,targets.filter(t=>t.id!==target.id&&dist(t.point,target.point)<80).length)*1.2;
    const catalogue=(target:LotTarget,area:number)=>
        candidates(target,contexts,roads,undefined,area,density(target));
    const referenceArea=siteAreaHint(targets,contexts);
    let choices=targets.map(target=>({target,choices:catalogue(target,referenceArea)}));
    let sharedArea=commonLotArea(choices.map(c=>c.choices),referenceArea);
    const initialArea=sharedArea;
    const comparable=(p:LotPlacement,area:number)=>Math.abs(Math.log(placementArea(p)/area))<=Math.log(1.1)+EPS;
    if(Math.abs(Math.log(sharedArea/referenceArea))>0.02)
        choices=targets.map(target=>({target,choices:catalogue(target,sharedArea)}));
    choices=choices.map(c=>({...c,choices:c.choices.filter(p=>comparable(p,sharedArea))}));
    const withSplits=(items:typeof choices,area:number)=>{
        let packed=allocate(items),latest=packed;
        const expanded=new Set<LotTarget>();
        while(packed.length<targets.length) {
            const unassigned=targets.filter(t=>!packed.some(p=>p.target===t));
            const missing=targets.filter(t=>!expanded.has(t)&&(!packed.some(p=>p.target===t)||!latest.some(p=>p.target===t)));
            // A large already-placed group may occupy the only clear frontage of
            // an unresolved neighbour. Give those blockers split options too.
            const blockers:LotTarget[]=[];
            for(const target of unassigned) {
                const options=items.find(c=>c.target===target)?.choices||[];
                const ranked=options.map(p=>({p,conflicts:packed.filter(q=>placementsConflict(p,q))}))
                    .sort((a,b)=>a.conflicts.length-b.conflicts.length||a.p.score-b.p.score);
                for(const option of ranked.slice(0,12))for(const p of option.conflicts)
                    if(!expanded.has(p.target)&&!missing.includes(p.target)&&!blockers.includes(p.target)&&blockers.length<3)blockers.push(p.target);
            }
            missing.push(...blockers);
            if(!missing.length)break;
            for(const target of missing) {
                expanded.add(target);
                const item=items.find(c=>c.target===target)!;
                item.choices.push(...splitChoices(target,area,(part,a)=>catalogue(part,a),density(target)));
                item.choices.sort((a,b)=>a.score-b.score);
            }
            latest=allocate(items);
            if(latest.length>packed.length)packed=latest;
        }
        return packed;
    };
    let best=withSplits(choices,sharedArea);
    // Retry the whole site at a common feasible scale, including split layouts.
    // Matching all NAPs safely takes priority over preserving an infeasible reference area.
    if(best.length<targets.length&&contexts.length)for(const factor of [0.95,0.9,0.8,0.75,0.7,0.65]) {
        const area=initialArea*factor;
        const trial=targets.map(target=>({target,choices:catalogue(target,area).filter(p=>comparable(p,area))}));
        const placed=withSplits(trial,area);
        if(placed.length>best.length){best=placed;choices=trial;sharedArea=area;}
        if(best.length===targets.length)break;
    }
    const unresolved=targets.filter(t=>!best.some(p=>p.target===t));
    const warnings=unresolved.map(t=>`${t.name}: no collision-free road-attached layout found; the NAP is retained in the source list and needs manual layout. No conflicting lot geometry was exported.`);
    // Final validation is authoritative for every path, including split layouts.
    for(let i=0;i<best.length;i++) {
        if(lotFootprints(best[i]).some(poly=>roads.conflicts(poly)))throw new Error(`Invalid road crossing for ${best[i].target.name}`);
        for(let j=i+1;j<best.length;j++)if(placementsConflict(best[i],best[j]))throw new Error(`Overlapping lots for ${best[i].target.name} and ${best[j].target.name}`);
    }
    return {placements:best,warnings,unresolved};
}
