import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/residentialLots.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { planResidentialLots, lotPolygonsConflict, residentialRoadObstacles, lotFootprints } = context.exports;
const pt = (x, y) => ({ x, y, z: 0 });
const nap = (id, x, y, lines = 16) => ({ id, name: id, point: pt(x, y), lines });
const straight = [
  { points: [pt(-300, 5), pt(300, 5)], side: 1, halfWidth: 5 },
  { points: [pt(-300, -5), pt(300, -5)], side: -1, halfWidth: 5 },
];
function polygonArea(poly) {
  const o = poly[0];
  return Math.abs(poly.reduce((s,p,i) => { const q=poly[(i+1)%poly.length]; return s+(p.x-o.x)*(q.y-o.y)-(q.x-o.x)*(p.y-o.y); },0))/2;
}
function polygonCentroid(poly) {
  const o=poly[0]; let area=0,x=0,y=0;
  for(let i=0;i<poly.length;i++) { const p=poly[i],q=poly[(i+1)%poly.length]; const k=(p.x-o.x)*(q.y-o.y)-(q.x-o.x)*(p.y-o.y);area+=k;x+=(p.x+q.x-2*o.x)*k;y+=(p.y+q.y-2*o.y)*k; }
  return pt(o.x+x/(3*area),o.y+y/(3*area));
}
function inPolygon(poly,p) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) { const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside; }
  return inside;
}
function properCross(a,b,c,d) {
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  return cross(a,b,c)*cross(a,b,d)<-1e-6&&cross(c,d,a)*cross(c,d,b)<-1e-6;
}
const evidence = [];
function validate(name,targets,curbs,allowUnresolved=false) {
  const result=planResidentialLots(targets,curbs),obstacles=residentialRoadObstacles(curbs);
  for(const group of result.placements) {
    assert.equal(group.cells.length,group.target.lines===16?16:10);
    const parts=group.parts||[group];
    assert.equal(parts.reduce((n,p)=>n+p.cells.length,0),group.cells.length);
    for(const p of parts) {
      assert.ok(obstacles.every(o=>!lotPolygonsConflict(p.polygon,o)),`${name}: road collision`);
      assert.ok(curbs.some(c=>railOnCurb(p.frontage,c)),`${name}: floating frontage`);
      const distance=Math.min(...p.frontage.slice(1).map((b,i)=>{
        const a=p.frontage[i],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
        const t=Math.max(0,Math.min(1,((group.target.point.x-a.x)*dx+(group.target.point.y-a.y)*dy)/l2));
        return Math.hypot(group.target.point.x-a.x-t*dx,group.target.point.y-a.y-t*dy);
      }));
      assert.ok(distance<=(group.parts?55:35)+1e-6,`${name}: misplaced part`);
      assert.equal(p.rowColumns.reduce((a,b)=>a+b,0),p.cells.length);
      assert.equal(p.rowColumns.length,p.rails.length-1);
      const edges=p.dividers.flatMap(d=>d.slice(1).map((q,i)=>[d[i],q]));
      assert.ok(edges.every((d,i)=>edges.slice(i+1).every(e=>!properCross(d[0],d[1],e[0],e[1]))),'crossed dividers');
      assert.ok(Math.abs(p.cells.reduce((a,c)=>a+polygonArea(c.polygon),0)-polygonArea(p.polygon))<1e-3,'cells must cover the footprint');
      const areas=p.cells.map(c=>polygonArea(c.polygon));
      assert.ok(Math.max(...areas)/Math.min(...areas)<1.001,'unequal cell areas');
      for(const cell of p.cells) {
        assert.ok(inPolygon(cell.polygon,cell.center),'RES outside cell');
        const centroid=polygonCentroid(cell.polygon);
        if(inPolygon(cell.polygon,centroid))assert.ok(Math.hypot(centroid.x-cell.center.x,centroid.y-cell.center.y)<1e-4,'RES not centered');
        assert.ok(cellAspect(cell)<=2.50001);
        assert.ok(cell.frontage>=10-1e-6&&cell.depth>=6.5-1e-6&&cell.depth/cell.frontage<=2+1e-6);
        const len=Math.hypot(cell.direction.x,cell.direction.y),ux=cell.direction.x/len,uy=cell.direction.y/len;
        const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>pt(cell.center.x+(ux*x*1.6-uy*y*.7)*cell.textHeight,cell.center.y+(uy*x*1.6+ux*y*.7)*cell.textHeight));
        assert.ok(corners.every(p=>inPolygon(cell.polygon,p)),'entire text box must fit');
      }
    }
  }
  const footprints=result.placements.flatMap(lotFootprints);
  for(let i=0;i<footprints.length;i++)for(let j=i+1;j<footprints.length;j++)assert.ok(!lotPolygonsConflict(footprints[i],footprints[j],2),`${name}: overlap`);
  assert.equal(result.placements.length+result.unresolved.length,targets.length,'no NAP may disappear');
  if(!allowUnresolved)assert.equal(result.unresolved.length,0,`${name}: all NAPs should fit`);
  const groupAreas=result.placements.map(p=>lotFootprints(p).reduce((a,poly)=>a+polygonArea(poly),0)/p.cells.length);
  if(groupAreas.length)assert.ok(Math.max(...groupAreas)/Math.min(...groupAreas)<1.25,'inconsistent site scale');
  evidence.push({name,targets,curbs,...result});return result;
}
test('detects a thin road crossing between sample points, containment and touching', () => {
  const square = [pt(0, 0), pt(100, 0), pt(100, 30), pt(0, 30)];
  assert.ok(lotPolygonsConflict(square, [pt(23, -20), pt(24, -20), pt(24, 40), pt(23, 40)]));
  assert.ok(lotPolygonsConflict(square, [pt(10, 10), pt(11, 10), pt(11, 11), pt(10, 11)]));
  assert.ok(lotPolygonsConflict(square, [pt(100, 0), pt(120, 0), pt(120, 30), pt(100, 30)]));
});
test('straight frontage preserves 16 and 10 full-size cells', () => {
  const result = validate('Straight road', [nap('16-line', -100, 10), nap('8-line', 100, 10, 8)], straight);
  assert.equal(result.placements.length, 2);
});
test('close NAPs receive balanced adaptive groups without overlap', () => {
  const targets = [nap('A', -10, 9), nap('B', 5, 9), nap('C', 18, 9, 8)];
  const result = validate('Three close NAPs', targets, straight);
  assert.equal(result.placements.length, 3);
  const reordered = planResidentialLots([...targets].reverse(), straight);
  const geometry = r => JSON.stringify(r.placements.map(p => ({ id: p.target.id, polygon: p.polygon })).sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal(geometry(result), geometry(reordered), 'Input order must not change the layout');
});
test('intersection footprints cannot cross the perpendicular road', () => {
  const curbs = [...straight,
    { points: [pt(-5, -200), pt(-5, 200)], side: 1, halfWidth: 5 },
    { points: [pt(5, -200), pt(5, 200)], side: -1, halfWidth: 5 },
  ];
  const result = validate('Road intersection', [nap('Junction', 15, 10, 8)], curbs);
  assert.equal(result.placements.length, 1);
});
test('curved frontage has coherent rows and no narrow or folded cells', () => {
  const curbs = [95, 105].map(radius => ({
    points: Array.from({ length: 51 }, (_, i) => pt(radius * Math.cos(i * Math.PI / 100), radius * Math.sin(i * Math.PI / 100))),
    side: radius === 95 ? 1 : -1, halfWidth: 5,
  }));
  const result = validate('Curved road', [nap('Curve', 78, 78)], curbs);
  assert.equal(result.placements.length, 1);
});

test('complete carriageways protect road interiors missing from trimmed curbs', () => {
  const target=nap('Hidden crossing',0,10);
  const crossing=[pt(-8,5.001),pt(8,5.001),pt(8,150),pt(-8,150)];
  const withoutMask=planResidentialLots([target],[straight[0]]);
  assert.ok(withoutMask.placements.some(p=>lotFootprints(p).some(poly=>lotPolygonsConflict(poly,crossing))),
    'the fixture must expose the missing road interior');
  const protectedPlan=planResidentialLots([target],[straight[0]],[crossing,...residentialRoadObstacles([straight[0]])]);
  assert.equal(protectedPlan.unresolved.length,0);
  assert.ok(protectedPlan.placements.every(p=>lotFootprints(p).every(poly=>!lotPolygonsConflict(poly,crossing))));

  const roadContext={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/roadNetwork.ts',import.meta.url),'utf8'),
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,roadContext);
  const road=(id,points)=>({id,name:'Road',generic:true,category:'residential',halfWidth:5,points});
  const network=roadContext.exports.buildRoadNetwork([
    road('across',[pt(-100,0),pt(0,0),pt(100,0)]),road('branch',[pt(0,0),pt(0,100)]),
  ]);
  for(const sample of [pt(0,0),pt(3,3),pt(-3,3),pt(0,20),pt(20,0)])
    assert.ok(network.carriageways.some(poly=>inPolygon(poly,sample)),'junction interior must remain occupied after curb trimming');
});
test('curved road with limited frontage preserves identical cell sizes', () => {
  const curbs = [55, 65].map(radius => ({
    points: Array.from({ length: 41 }, (_, i) => pt(radius * Math.cos(i * 1.55 / 40), radius * Math.sin(i * 1.55 / 40))),
    side: radius === 55 ? 1 : -1, halfWidth: 5,
  }));
  const result = planResidentialLots([nap('Limited curve', 48, 48)], curbs);
  assert.equal(result.placements.length, 1);
  const p = result.placements[0];
  assert.equal(p.front.length,p.rowColumns[0]+1);
  assert.ok(residentialRoadObstacles(curbs).every(o => !lotPolygonsConflict(p.polygon, o)));
  const areas = p.cells.map(c => polygonArea(c.polygon));
  assert.ok(Math.max(...areas)/Math.min(...areas)<1.001);
});
test('tight rounded road end keeps curved rails and equal lot areas', () => {
  const radius = 15;
  const points = [pt(-80, radius), pt(0, radius),
    ...Array.from({ length: 21 }, (_, i) => pt(radius * Math.sin((i + 1) * Math.PI / 21), radius * Math.cos((i + 1) * Math.PI / 21))), pt(-80, -radius)];
  const curbs = [{ points, side: 1, halfWidth: 5 }];
  const result = validate('Tight rounded end', [nap('Rounded end', radius, 0)], curbs);
  const p = result.placements[0];
  assert.ok(p.frontage.length > 15, 'curve vertices must be retained');
  assert.ok(p.backRail.length > 15, 'back rail must curve with the road');
  assert.ok(polygonArea(p.polygon) > 100);
  assert.equal(result.warnings.length, 0);
  assert.ok(p.rowColumns[0]<p.rowColumns[1], 'outer curve row should accommodate more lots than the inner row');
});
test('projected coordinate magnitudes retain collision protection', () => {
  const move = p => pt(p.x + 500000, p.y + 800000);
  const curbs = straight.map(c => ({ ...c, points: c.points.map(move) }));
  const targets = [nap('UTM-A', 499990, 800009), nap('UTM-B', 500005, 800009)];
  assert.equal(validate('Projected coordinates', targets, curbs).placements.length, 2);
});
test('an impossible concave frontage is reported without unsafe geometry', () => {
  const curbs = [{ points: [pt(-25, 5), pt(0, 5), pt(15, 20), pt(15, 45)], side: 1, halfWidth: 5 }];
  const result = validate('Insufficient frontage', [nap('Tight bend', 10, 10)], curbs,true);
  assert.equal(result.placements.length+result.unresolved.length,1);
});
test('missing road context retains the NAP for review without inventing lots', () => {
  const result = validate('No road context', [nap('Missing roads', 0, 0)], [],true);
  assert.equal(result.placements.length,0);
  assert.equal(result.unresolved.length,1);
  assert.ok(result.warnings[0].includes('Missing roads'));
});
test('crowded site never silently drops a target or accepts colliding groups', () => {
  const curbs = straight.map(c => ({ ...c, points: [pt(-65, c.points[0].y), pt(65, c.points[1].y)] }));
  const result = validate('Crowded site', Array.from({ length: 6 }, (_, i) => nap(`Crowded-${i}`, i, 10)), curbs);
  assert.equal(result.placements.length, 6);
});
function railOnCurb(rail, curb) {
  const on = p => curb.points.slice(1).some((b,i) => {
    const a=curb.points[i], dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
    if(!l2)return false;
    const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l2;
    return t>=-1e-7&&t<=1+1e-7&&Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<1e-6;
  });
  return rail.every(on)&&rail.slice(1).every((p,i)=>on(pt((p.x+rail[i].x)/2,(p.y+rail[i].y)/2)));
}
test('crowded NAPs never produce translated groups detached from their road', () => {
  const curbs=straight.map(c=>({...c,points:[pt(-65,c.points[0].y),pt(65,c.points[1].y)]}));
  const targets=Array.from({length:6},(_,i)=>nap(`Anchor-${i}`,i,10));
  const result=planResidentialLots(targets,curbs);
  assert.equal(result.placements.length,targets.length);
  assert.equal(result.warnings.length,0,'this feasible crowded site must be packed without review conflicts');
  for(let i=0;i<result.placements.length;i++)for(let j=i+1;j<result.placements.length;j++)
    assert.ok(!lotPolygonsConflict(result.placements[i].polygon,result.placements[j].polygon,2),'anchored groups must not overlap');
  for(const p of result.placements) {
    assert.ok(curbs.some(c=>railOnCurb(p.frontage,c)),`${p.target.name}: frontage must stay on its road`);
    const nearest=p.frontage.slice(1).reduce((best,b,i)=>{
      const a=p.frontage[i],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
      const t=Math.max(0,Math.min(1,((p.target.point.x-a.x)*dx+(p.target.point.y-a.y)*dy)/l2));
      return Math.min(best,Math.hypot(p.target.point.x-a.x-t*dx,p.target.point.y-a.y-t*dy));
    },Infinity);
    assert.ok(nearest<=35,`${p.target.name}: group must stay near its owning NAP`);
  }
});
test('a remote road cannot take ownership of a NAP without local road context', () => {
  const curbs=straight.map(c=>({...c,points:c.points.map(p=>pt(p.x,p.y+500))}));
  const result=planResidentialLots([nap('Local NAP',0,0)],curbs);
  assert.equal(result.placements.length,0);
  assert.equal(result.unresolved.length,1);
  assert.equal(result.unresolved[0].id,'Local NAP');
});
test('nearby NAPs stay on their own street rather than shifting to a parallel street', () => {
  const curbs=[...straight,...straight.map(c=>({...c,points:c.points.map(p=>pt(p.x,p.y+90))}))];
  const result=validate('Local street ownership',[nap('A',-10,10),nap('B',0,10),nap('C',10,10)],curbs);
  for(const p of result.placements)assert.ok(straight.some(c=>railOnCurb(p.frontage,c)),'do not reassign to a different street');
});
test('an infeasible short curb never exports overlapping review geometry', () => {
  const curb={points:[pt(-12.5,5),pt(12.5,5)],side:1,halfWidth:5};
  const result=validate('Impossible short curb',[nap('A',0,10),nap('B',2,10)],[curb],true);
  assert.ok(result.unresolved.length>0);
  assert.equal(result.warnings.length,result.unresolved.length);
});
test('a NAP uses separate clear strips on both sides of a junction', () => {
  const curbs=[
    {points:[pt(-70,5),pt(-5,5)],side:1,halfWidth:5},
    {points:[pt(5,5),pt(70,5)],side:1,halfWidth:5},
    {points:[pt(-70,23),pt(-5,23)],side:-1,halfWidth:5},
    {points:[pt(5,23),pt(70,23)],side:-1,halfWidth:5},
  ];
  const roads=[
    [pt(-130,-5),pt(130,-5),pt(130,4.999),pt(-130,4.999)],
    [pt(-130,23.001),pt(130,23.001),pt(130,33),pt(-130,33)],
    [pt(-4.999,-50),pt(4.999,-50),pt(4.999,80),pt(-4.999,80)],
  ];
  const result=planResidentialLots([nap('Split at junction',-8,10)],curbs,roads);
  assert.equal(result.unresolved.length,0);
  assert.equal(result.placements.length,1);
  const p=result.placements[0];
  assert.equal(p.cells.length,16);
  assert.ok(p.parts?.length>=2,'utilize both separate land strips');
  for(const part of p.parts) {
    assert.ok(curbs.some(c=>railOnCurb(part.frontage,c)));
    assert.ok(roads.every(r=>!lotPolygonsConflict(part.polygon,r)));
  }
  for(let i=0;i<p.parts.length;i++)for(let j=i+1;j<p.parts.length;j++)assert.ok(!lotPolygonsConflict(p.parts[i].polygon,p.parts[j].polygon));
  evidence.push({name:'Split junction strips',targets:[nap('Split at junction',-8,10)],curbs,...result});
});
test('narrow rotated island fills the space and touches both road boundaries', () => {
  const rotate = p => pt(p.x*Math.cos(.55)-p.y*Math.sin(.55),p.x*Math.sin(.55)+p.y*Math.cos(.55));
  const curbs = [-5,5,29,39].map((y,i)=>({points:[pt(-200,y),pt(200,y)].map(rotate),side:[-1,1,-1,1][i],halfWidth:5}));
  const target = { ...nap('Island',0,0), point:rotate(pt(0,9)) };
  const result = validate('Narrow road island',[target],curbs), p=result.placements[0];
  assert.ok(railOnCurb(p.frontage,curbs[1]),'front must stay on the first land-facing curb');
  assert.ok(railOnCurb(p.backRail,curbs[2]),'back must reach the facing curb');
  assert.equal(result.warnings.length,0);
});
test('tapered island retains the vertices of both boundaries', () => {
  const curbs = [
    {points:[pt(-150,5),pt(150,5)],side:1,halfWidth:5},
    {points:[pt(150,40),pt(30,32),pt(-30,25),pt(-150,22)],side:1,halfWidth:5},
  ];
  const result=validate('Tapered island',[nap('Taper',0,9)],curbs),p=result.placements[0];
  assert.ok(railOnCurb(p.frontage,curbs[0]));
  assert.ok(railOnCurb(p.backRail,curbs[1]),'back must trace every bend in the second curb');
  // A different span may be chosen for the common site scale; every resulting edge must still trace the curb.
  assert.ok(p.backRail.slice(1).every((b,i)=>railOnCurb([p.backRail[i],b],curbs[1])));
});
test('curved island follows both facing curbs without a rectangular fallback', () => {
  const curbs=[90,100,124,134].map((r,i)=>({
    points:Array.from({length:i===2?47:61},(_,j)=>{const a=j*1.7/(i===2?46:60);return pt(r*Math.cos(a),r*Math.sin(a));}),
    side:[1,-1,1,-1][i],halfWidth:5,
  }));
  const result=validate('Curved road island',[nap('Curve island',104*Math.cos(.8),104*Math.sin(.8))],curbs),p=result.placements[0];
  assert.ok(railOnCurb(p.frontage,curbs[1]));
  assert.ok(railOnCurb(p.backRail,curbs[2]));
  assert.ok(p.frontage.length>20&&p.backRail.length>20);
  for(let i=1;i<p.middleRail.length-1;i++) {
    const a=p.middleRail[i-1],b=p.middleRail[i],c=p.middleRail[i+1];
    const ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y,den=Math.hypot(ux,uy)*Math.hypot(vx,vy);
    if(den>1e-8)assert.ok((ux*vx+uy*vy)/den>Math.cos(20*Math.PI/180),'middle rail must not develop sawtooth bends');
  }

  assert.equal(result.warnings.length,0);
});
function cellAspect(cell) {
  const d=cell.direction,l=Math.hypot(d.x,d.y),u=pt(d.x/l,d.y/l),v=pt(-u.y,u.x);
  const range = axis => {const a=cell.polygon.map(p=>(p.x-cell.center.x)*axis.x+(p.y-cell.center.y)*axis.y);return Math.max(...a)-Math.min(...a);};
  const w=range(u),h=range(v);return Math.max(w/h,h/w);
}
test('acute triangular island avoids needle-shaped lots near its apex', () => {
  const curbs=[
    {points:[pt(-140,5),pt(160,5)],side:1,halfWidth:5},
    {points:[pt(-140,7),pt(160,75)],side:-1,halfWidth:5},
  ];
  const result=validate('Acute triangular island',[nap('Apex',-65,9)],curbs);
  assert.ok(result.placements[0].cells.every(c=>cellAspect(c)<=4), 'avoid tall thin cells at the wedge tip');
  const p=result.placements[0];
  assert.ok(p.cells.every(c=>c.frontage>=12),'right-hand cells should have useful frontage');
  let start=0;
  for(const cols of p.rowColumns) {
    const widths=p.cells.slice(start,start+cols).map(c=>c.frontage);
    start+=cols;
    assert.ok(Math.max(...widths)/Math.min(...widths)<=1.5,'right-hand lots must not become narrow compared with the left');
  }

});
test('unequal corner boundaries keep ordered dividers and useful cell proportions', () => {
  const curbs=[
    {points:[pt(-130,-65),pt(-30,0),pt(0,10),pt(160,10)],side:-1,halfWidth:5},
    {points:[pt(-95,-85),pt(-10,-26),pt(30,-18),pt(80,-18),pt(160,-18)],side:1,halfWidth:5},
  ];
  const result=validate('Unequal corner island',[nap('Corner',10,6)],curbs);
  assert.ok(result.placements[0].cells.every(c=>cellAspect(c)<=4));
});
test('neighboring two-row and four-row groups use comparable lot sizes', () => {
  const curbs=[
    {points:[pt(-240,5),pt(-20,5)],side:1,halfWidth:5},
    {points:[pt(0,5),pt(55,5)],side:1,halfWidth:5},
  ];
  const result=validate('Neighboring row layouts',[nap('Long group',-130,9),nap('Compact group',28,9)],curbs);
  const areas=result.placements.map(p=>polygonArea(p.polygon)/p.cells.length);
  assert.ok(Math.max(...areas)/Math.min(...areas)<1.25,'row count must not make one group miniature');
  const long=result.placements.find(p=>p.target.id==='Long group'),compact=result.placements.find(p=>p.target.id==='Compact group');
  assert.deepEqual(Array.from(long.rowColumns),[8,8]);
  assert.deepEqual(Array.from(compact.rowColumns),[4,4,4,4]);
  assert.ok(compact.backRail[0].y-compact.frontage[0].y>1.8*(long.backRail[0].y-long.frontage[0].y),'four rows need a deeper footprint');
  const heights=result.placements.flatMap(p=>p.cells.map(c=>c.textHeight));
  assert.ok(Math.max(...heights)/Math.min(...heights)<1.1,'neighboring groups should use comparable RES text sizes');
  assert.ok(railOnCurb(long.frontage,curbs[0]));
  assert.ok(railOnCurb(compact.frontage,curbs[1]));
});
test('S-bends and reversed curb direction retain valid balanced cells', () => {
  const points = Array.from({length: 61},(_,i) => pt(i*4-120,12*Math.sin((i*4-120)/55)));
  const forward = validate('S bend', [nap('S',0,16)], [{points,side:1,halfWidth:4}]);
  const reverse = validate('Reversed S bend', [nap('S',0,16)], [{points:[...points].reverse(),side:-1,halfWidth:4}]);
  const area = r => polygonArea(r.placements[0].polygon);
  assert.ok(Math.abs(area(forward)-area(reverse))<1e-5);
  assert.ok(forward.placements[0].frontage.length>10);
});
test('available frontage changes lot dimensions while preserving equal area within a group', () => {
  const target = nap('Adaptive',0,9);
  const long = planResidentialLots([target],straight).placements[0];
  const short = planResidentialLots([target],[{points:[pt(-30,5),pt(30,5)],side:1,halfWidth:5}]).placements[0];
  assert.ok(Math.abs(polygonArea(short.cells[0].polygon)/polygonArea(long.cells[0].polygon)-1)<0.1,'row arrangement should adapt without shrinking the lots');
  assert.ok(short.rails.length>long.rails.length,'short frontage should use a deeper arrangement');
  validate('Adaptive short road',[target],[{points:[pt(-30,5),pt(30,5)],side:1,halfWidth:5}]);
});
test('DXF renderer keeps lot counts and surfaces missing road context', () => {
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const url = new URL(`../src/${name === 'main' ? 'main.tsx' : name + '.ts'}`, import.meta.url);
    let source = readFileSync(url, 'utf8');
    if (name === 'main') {
      source = source.replace(/createRoot\(document\.getElementById\("root"\)!\)\.render\(<App \/>\);/, '');
      source += '\nexport { buildProposedNapResLotBoxesEntities, createDxf };';
    }
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
    const box = { exports: {}, require: path => ['roadNetwork', 'poleLayout', 'gridPaging', 'residentialLots'].includes(path.slice(2)) ? load(path.slice(2)) : {}, Date, console };
    vm.runInNewContext(code, box);
    modules.set(name, box.exports);
    return box.exports;
  }
  const app = load('main');
  const targets = [{ id: 'A', name: 'A', coordinates: { lon: -100, lat: 10 }, napLines: 16 }, { id: 'B', name: 'B', coordinates: { lon: 100, lat: 10 }, napLines: 8 }];
  const geometry = app.buildProposedNapResLotBoxesEntities([], [], straight, p => pt(p.lon, p.lat), p => p, false, 'STANDARD', targets);
  assert.equal(geometry.warnings.length, 0);
  const labels = geometry.entities.filter(e => /\r?\n1\r?\nRES(?:\r?\n|$)/.test(e));
  for (const label of labels) {
    const values = label.split(/\r?\n/);
    const code = n => values[values.indexOf(String(n)) + 1];
    assert.equal(code(0), 'TEXT');
    assert.equal(code(72), '1');
    assert.equal(code(73), '2');
    assert.equal(code(10), code(11));
    assert.equal(code(20), code(21));
  }

  assert.equal(geometry.entities.filter(e => /\r?\n1\r?\nRES(?:\r?\n|$)/.test(e)).length, 26);
  const missing = app.createDxf([], { lon: 125, lat: 7 }, 'missing-roads', undefined, 'mercator', 'STANDARD', 'globe', undefined, undefined, [{ ...targets[0], coordinates: { lon: 125, lat: 7 } }]);
  assert.equal(missing.lotWarnings.length, 1);
  assert.ok(missing.dxf.includes('EOF'));
  // Exercise the real road-network builder, projections and DXF assembly together.
  const survey = [-.0015, -.0005, .0005, .0015].map((offset, i) => ({ id: `pole-${i}`, name: `DLPC ${i}`, description: '', properties: {}, layer: 'DLPC', geometry: { type: 'Point', coordinates: { lon: 125 + offset, lat: 7.0001 } } }));
  survey.push({ id: 'road', name: 'Test Road', description: '', properties: { highway: 'residential' }, layer: 'ROAD_CENTERLINES', geometry: { type: 'LineString', coordinates: [{ lon: 124.997, lat: 7 }, { lon: 125.003, lat: 7 }] } });
  const generated = app.createDxf(survey, { lon: 125, lat: 7 }, 'straight-road', undefined, 'mercator', 'STANDARD', 'globe', undefined, undefined, [{ ...targets[0], coordinates: { lon: 125, lat: 7.0001 } }]);
  assert.equal(generated.lotWarnings.length, 0);
  assert.equal((generated.dxf.match(/\r?\n1\r?\nRES(?:\r?\n|$)/g) || []).length, 16);
  const curve = evidence.find(e => e.name === 'Tight rounded end');
  const curveTargets = curve.targets.map(t => ({id:t.id,name:t.name,coordinates:{lon:t.point.x,lat:t.point.y},napLines:t.lines}));
  const curveGeometry = app.buildProposedNapResLotBoxesEntities([], [], curve.curbs, p => pt(p.lon,p.lat), p => p, false, 'STANDARD', curveTargets);
  const curveLabels = curveGeometry.entities.filter(e => /\r?\n1\r?\nRES(?:\r?\n|$)/.test(e));
  assert.equal(curveLabels.length,16);
  curveLabels.forEach((label,i) => {
    const values=label.split(/\r?\n/), pairs=new Map();
    for(let j=0;j<values.length;j+=2)pairs.set(Number(values[j]),values[j+1]);
    const expected=curve.placements[0].cells[i].center;
    assert.ok(Math.hypot(Number(pairs.get(10))-expected.x,Number(pairs.get(20))-expected.y)<1e-6,'DXF label must use the curved cell centroid');
    assert.equal(pairs.get(72),'1'); assert.equal(pairs.get(73),'2');
    assert.ok(Math.abs(Number(pairs.get(40))-curve.placements[0].cells[i].textHeight)<1e-7,'DXF must use the fitted text height');
  });
  const dir = fileURLToPath(new URL('../exports/lot-layout-review/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(dir + '/integration.dxf', generated.dxf);
  writeFileSync(dir + '/tight-bend-entities.dxf.txt', curveGeometry.entities.join('\n'));
  const taper = evidence.find(e=>e.name==='Neighboring row layouts');
  const compact=taper.placements.find(p=>p.target.id==='Compact group');
  const taperGeometry=app.buildProposedNapResLotBoxesEntities([],[],taper.curbs,p=>pt(p.lon,p.lat),p=>p,false,'STANDARD',
    taper.targets.filter(t=>t.id==='Compact group').map(t=>({id:t.id,name:t.name,coordinates:{lon:t.point.x,lat:t.point.y},napLines:t.lines})));
  assert.equal(taperGeometry.entities.filter(e=>/\n1\nRES(?:\n|$)/.test(e)).length,16);
  // Every internal rail must be included, including the two extra rails in a four-row layout.
  const landmarkPolylines=taperGeometry.entities.filter(e=>e.startsWith('0\nPOLYLINE')&&/\n8\nlandmk\n/.test(e));
  assert.equal(landmarkPolylines.length,compact.rails.length+compact.dividers.length);


});
test('save inspectable geometry fixtures', () => {
  const dir = fileURLToPath(new URL('../exports/lot-layout-review/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(dir + '/fixtures.json', JSON.stringify(evidence, null, 2));
});
