import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/gridPaging.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
const {computeGridPagingBoxes,buildGridPagingBoxEntities}=context.exports;
const p=(x,y)=>({x,y,z:0});
const inside=(p,b)=>p.x>=b.minX-1e-9&&p.x<=b.maxX+1e-9&&p.y>=b.minY-1e-9&&p.y<=b.maxY+1e-9;
test('branches and disconnected clusters keep every point, with deterministic pages',()=>{
 const points=[...Array.from({length:60},(_,i)=>p(i*23,Math.sin(i*.3)*130)),...Array.from({length:25},(_,i)=>p(350,i*29)),p(4000,4000)];
 const boxes=computeGridPagingBoxes(points);
 assert.ok(points.every(p=>boxes.some(b=>inside(p,b))));
 assert.equal(JSON.stringify(boxes),JSON.stringify(computeGridPagingBoxes(points.slice().reverse())));
 for(const b of boxes) {assert.ok(Math.abs(b.maxX-b.minX-199.61142092)<1e-8);assert.ok(Math.abs(b.maxY-b.minY-199.24265231)<1e-8);}
 assert.ok(boxes.length<25);
});
test('whole residential groups fit inside at least one page with clearance',()=>{
 const groups=Array.from({length:8},(_,i)=>[p(i*110,20),p(i*110+116,20),p(i*110+116,52),p(i*110,52)]);
 const points=groups.flat(); const boxes=computeGridPagingBoxes(points,undefined,undefined,groups);
 assert.ok(groups.every(g=>boxes.some(b=>g.every(p=>inside(p,{minX:b.minX+7.99,maxX:b.maxX-7.99,minY:b.minY+7.99,maxY:b.maxY-7.99})))));
});
test('sparse diagonal routes have continuous coverage between their endpoints',()=>{
 const path=[p(0,0),p(1100,975),p(2000,-500)];
 const boxes=computeGridPagingBoxes(path,undefined,undefined,[],[path]);
 for(let i=1;i<path.length;i++) for(let j=0;j<=10000;j++) {
  const t=j/10000,a=path[i-1],b=path[i];
  assert.ok(boxes.some(box=>inside(p(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t),box)));
 }
});
test('raw coordinate scaling preserves paging and manual number placeholders',()=>{
 const points=[p(0,0),p(300,150),p(500,-50)];const scale=1/111320;
 const metric=computeGridPagingBoxes(points);const raw=computeGridPagingBoxes(points.map(p=>({x:p.x*scale,y:p.y*scale,z:0})),199.61142092*scale,199.24265231*scale);
 assert.equal(raw.length,metric.length);
 const result=buildGridPagingBoxEntities([p(0,0)],[p(0,0),p(300,100)],false,(c,v)=>c+'\n'+v,()=> 'AA',String,String);
 assert.ok(result.entities.some(e=>e.includes('1\n#')));
 assert.ok(result.points.some(p=>p.x>=300));
});
