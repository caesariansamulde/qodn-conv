// Reproduce a local survey through the application's actual classifiers and road builder.
// Input/cache/derived geometry stays local; an existing CAD curb context is required.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';

const dir = path.resolve(process.argv[2] || 'exports/min188-review');
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  let source = fs.readFileSync(`src/${name === 'main' ? 'main.tsx' : name + '.ts'}`, 'utf8');
  if (name === 'main') {
    source = source.replace(/createRoot\(document\.getElementById\("root"\)!\)\.render\(<App \/>\);/, '');
    source += '\nexport { classifyPlacemark, calculateCenter, collectCoordinates, utmZone, lonLatToUtm, utmToLonLat, lonLatToWgs84Mercator, createDxf, renderResidentialLotPlan, dxfHandle };';
  }
  const physics = createHash('sha256').update(source.split('/** A small, bounded conflict repair')[0]).digest('hex');
  if (name === 'residentialLots')
    source = source.replace('candidates(target,contexts,roads,undefined,area,density(target));', '(trace(target,area),cachedCatalogue(target,area,()=>candidates(target,contexts,roads,undefined,area,density(target))));');
  const context = { exports: {}, Date, console, URLSearchParams,
    cachedCatalogue: (target, area, build) => {
      if (!process.argv.includes('--cache-catalogues')) return build();
      const key = createHash('sha256').update(physics).update(JSON.stringify([target,area,process.argv.find(a=>a.startsWith('--target='))])).update(fs.readFileSync(path.join(dir,'cad-context.json'))).update(fs.readFileSync(path.join(dir,'input.json'))).digest('hex');
      const cacheDir = path.join(dir,'catalogue-cache'); fs.mkdirSync(cacheDir,{recursive:true});
      const cacheFile = path.join(cacheDir,key+'.json');
      if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile,'utf8')).map(p=>({...p,target}));
      const result=build();fs.writeFileSync(cacheFile,JSON.stringify(result));return result;
    },
    trace: (target, area) => { if(process.argv.includes('--trace')) fs.appendFileSync(path.join(dir, 'trace.log'), JSON.stringify({ time: Date.now(), name: target.name, cells: target.lotCount || (target.lines === 16 ? 16 : 10), area }) + '\n'); },
    require: spec => ['roadNetwork', 'poleLayout', 'gridPaging', 'residentialLots'].includes(spec.slice(2)) ? load(spec.slice(2)) : {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context);
  modules.set(name, context.exports);
  return context.exports;
}
const app = load('main'), lots = load('residentialLots');
const input = JSON.parse(fs.readFileSync(path.join(dir, 'input.json'), 'utf8'));
const survey = app.filterPoleSurveyPlacemarks(input.survey).map(p => app.classifyPlacemark(p, 'globe'));
const hld = app.extractHldProposedNapsFromPlacemarks(input.hld);
console.log(JSON.stringify({ survey: survey.length, poles: survey.filter(p => p.geometry.type === 'Point').length, naps: hld.length }));
const center = app.calculateCenter(app.collectCoordinates(survey)), zone = app.utmZone(center.lon);
const project = p => app.lonLatToUtm(p, zone);
const cadFile = path.join(dir, 'cad-context.json');
const cad = JSON.parse(fs.readFileSync(cadFile, 'utf8'));
const network = { curbPieces: cad.curbs, carriageways: cad.carriageways };
const filter = process.argv.find(a => a.startsWith('--target='))?.slice(9);
const targets = hld.filter(n => !filter || n.name.includes(filter)).map(n => ({ id: n.id, name: n.name, point: project(n.coordinates), lines: n.napLines }));
const geometryName = filter ? `geometry-${filter}.json` : 'geometry.json';
const started = Date.now();
const result = process.argv.includes('--render-only') ? JSON.parse(fs.readFileSync(path.join(dir, 'geometry.json'), 'utf8')) : lots.planResidentialLots(targets, network.curbPieces, network.carriageways);
const collisions = [];
for (let i = 0; i < result.placements.length; i++) for (let j = i + 1; j < result.placements.length; j++)
  if (lots.lotFootprints(result.placements[i]).some(a => lots.lotFootprints(result.placements[j]).some(b => lots.lotPolygonsConflict(a,b)))) collisions.push([result.placements[i].target.name, result.placements[j].target.name]);
const data = { center, zone, targets, poles: survey.filter(p => p.geometry.type === 'Point').map(p => project(p.geometry.coordinates)), labels: cad?.labels || [], curbs: network.curbPieces, carriageways: network.carriageways || [], ...result };
fs.writeFileSync(path.join(dir, geometryName), JSON.stringify(data));
const empty = app.createDxf([], center, 'residential-lot-review').dxf;
const output = app.renderResidentialLotPlan(result, p => app.lonLatToWgs84Mercator(app.utmToLonLat(p, zone, center.lat >= 0)));
const dxf=empty.replace(/(0\nSECTION\n2\nENTITIES\n)[\s\S]*?(0\nENDSEC)/, (_, start, end) => start + output.entities.join('\n') + '\n' + end)
  .replace(/(9\n\$HANDSEED\n5\n)[^\n]+/,(_,prefix)=>prefix+app.dxfHandle());
fs.writeFileSync(path.join(dir, 'new-lot-entities.dxf'),dxf);
console.log(JSON.stringify({ curbs: network.curbPieces.length, placed: result.placements.length, cells: result.placements.reduce((s,p) => s+p.cells.length,0), splitGroups: result.placements.filter(p=>p.parts).length, collisions, warnings: result.warnings, seconds: (Date.now() - started) / 1000 }, null, 2));
