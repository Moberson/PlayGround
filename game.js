import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const maps = [
  {name:'THE DEPOT',zone:'INDUSTRIAL / DAY',tag:'01',sky:0xb4bd9b,ground:0x72765d,fog:0x9ca185,accent:0xd9a356,description:'Freight cars. Long sightlines. No safe corners.',theme:'depot'},
  {name:'DUST TOWN',zone:'FRONTIER / GOLDEN HOUR',tag:'02',sky:0xd8a36f,ground:0xa9825e,fog:0xc19670,accent:0x7d6146,description:'Sun-baked streets and tight adobe alleys.',theme:'dust'},
  {name:'NIGHT SHIFT',zone:'URBAN / AFTER DARK',tag:'03',sky:0x252f45,ground:0x393e47,fog:0x303a49,accent:0xe75d4c,description:'Neon cuts through the rain. Watch your six.',theme:'night'},
  {name:'FROSTLINE',zone:'ARCTIC / WHITEOUT',tag:'04',sky:0xb9cbd0,ground:0xa8bec0,fog:0xb2c5c8,accent:0x5ca7a9,description:'Ice, steel, and visibility that comes and goes.',theme:'frost'},
  {name:'OVERGROWN',zone:'JUNGLE / OVERCAST',tag:'05',sky:0x7f9b74,ground:0x52654b,fog:0x708666,accent:0xd6c45c,description:'Ancient stone swallowed by the green.',theme:'jungle'},
  {name:'HIGH RISE',zone:'CITY / SUNSET',tag:'06',sky:0xc98868,ground:0x68665c,fog:0xb87b64,accent:0xd9a356,description:'A rooftop maze above the last light.',theme:'city'}
];
const canvas=document.querySelector('#game-canvas');
const isMobile=/Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile/i.test(navigator.userAgent)||((navigator.maxTouchPoints>0||matchMedia('(pointer: coarse)').matches)&&Math.min(window.screen.width,window.screen.height)<=900);
document.documentElement.classList.toggle('mobile-device',isMobile);
const orientationGate=document.querySelector('#orientation-gate');
function isLandscape(){const w=window.visualViewport?.width||innerWidth,h=window.visualViewport?.height||innerHeight;return w>=h;}
function updateOrientation(){orientationGate.classList.toggle('visible',isMobile&&!isLandscape());}
function viewportSize(){return {width:window.visualViewport?.width||innerWidth,height:window.visualViewport?.height||innerHeight};}
const initialSize=viewportSize();
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,isMobile?1.35:1.8));renderer.setSize(initialSize.width,initialSize.height);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(76,initialSize.width/initialSize.height,.1,180);camera.rotation.order='YXZ';
const clock=new THREE.Clock();
const raycaster=new THREE.Raycaster();raycaster.far=90;
const arena=new THREE.Group();scene.add(arena);
const mapObstacles=[],shootTargets=[],botList=[],decor=[];
const player={pos:new THREE.Vector3(0,1.72,13),vel:new THREE.Vector3(),yaw:0,pitch:0,hp:100,ammo:30,reserve:120,score:0,grounded:true,shootCooldown:0,reloadTimer:0,invuln:0,kills:0};
let selectedMap=0,playing=false,paused=false,gameTime=300,botScore=0,lastShot=0,soundOn=false,frame=0,damageTimer=0,screen=null;
const ui={menu:document.querySelector('#menu-screen'),hud:document.querySelector('#game-hud'),pause:document.querySelector('#pause-screen'),mapList:document.querySelector('#map-list'),topMap:document.querySelector('#top-map'),hudMap:document.querySelector('#hud-map'),mapIndex:document.querySelector('#map-index'),ammo:document.querySelector('#ammo-count'),reserve:document.querySelector('#reserve-count'),health:document.querySelector('#health-count'),healthBar:document.querySelector('#health-bar'),score:document.querySelector('#player-score'),botScore:document.querySelector('#bot-score'),progress:document.querySelector('#score-progress'),clock:document.querySelector('#match-clock'),objective:document.querySelector('#objective-count'),hit:document.querySelector('#hit-marker'),flash:document.querySelector('#damage-flash'),toast:document.querySelector('#toast'),feed:document.querySelector('#kill-feed'),reload:document.querySelector('#reload-indicator'),compass:document.querySelector('#compass-heading')};
const mats={};
function material(color,roughness=.82,metalness=0){const key=`${color}-${roughness}-${metalness}`;return mats[key]||(mats[key]=new THREE.MeshStandardMaterial({color,roughness,metalness}));}
function box(parent,x,y,z,sx,sy,sz,color,opts={}){const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),opts.mat||material(color,opts.roughness??.82,opts.metalness??0));mesh.position.set(x,y,z);mesh.castShadow=opts.cast!==false;mesh.receiveShadow=true;parent.add(mesh);if(opts.cover!==false)mapObstacles.push({x,z,sx,sz,sy,mesh});return mesh;}
function cylinder(parent,x,y,z,r,h,color,segments=12){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r*.88,r,h,segments),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function addProp(parent,x,z,type,color){
  if(type==='barrel'){cylinder(parent,x,.62,z,.43,1.24,color,12);for(let y=.26;y<1.2;y+=.32)cylinder(parent,x,y,z,.444,.045,0x353a34,12);mapObstacles.push({x,z,sx:.9,sz:.9,sy:1.24});}
  if(type==='crate'){const w=1.35+Math.random()*.55,h=1.05+Math.random()*.8,d=1.25+Math.random()*.45;box(parent,x,h/2,z,w,h,d,color);for(let yy=.17;yy<h;yy+=.25)box(parent,x,yy,z-d/2-.012,w*.88,.035,.025,0x343b32,{cover:false});mapObstacles.push({x,z,sx:w+0.12,sz:d+.12,sy:h});}
  if(type==='sandbag'){for(let row=0;row<2;row++)for(let n=0;n<3;n++){let px=x+(n-1)*.52+(row%2)*.24;let m=new THREE.Mesh(new THREE.BoxGeometry(.62,.42,.52),material(color));m.position.set(px,.3+row*.36,z);m.rotation.y=(Math.random()-.5)*.09;m.castShadow=true;m.receiveShadow=true;parent.add(m);}mapObstacles.push({x,z,sx:2,sz:.75,sy:1.1});}
  if(type==='concrete'){box(parent,x,.55,z,2.4,1.1,.55,color);box(parent,x,.17,z,.18,.34,.63,0x5b6258,{cover:false});mapObstacles.push({x,z,sx:2.5,sz:.75,sy:1.2});}
  if(type==='tire'){for(let i=0;i<3;i++){let t=new THREE.Mesh(new THREE.TorusGeometry(.56,.19,8,16),material(0x282e2c));t.rotation.x=Math.PI/2;t.position.set(x+i*.66,.53,z);parent.add(t);}mapObstacles.push({x:x+.65,z,sx:2.4,sz:.65,sy:1});}
}
function building(parent,x,z,w,d,h,color,style='block'){
  const base=box(parent,x,h/2,z,w,h,d,color,{cover:false});base.castShadow=true;
  if(style==='block'){
    box(parent,x,h+.13,z,w+.14,.26,d+.14,0x333a32,{cover:false});
    const floors=Math.floor(h/2.5);
    for(let f=0;f<floors;f++)for(let side of [-1,1]){
      const yy=1.25+f*2.35;box(parent,x+side*w*.28,yy,z-d/2-.012,.78,.9,.03,0x28343a,{cover:false,mat:new THREE.MeshStandardMaterial({color:0x28343a,roughness:.4,metalness:.1,emissive:0x11191c})});
      box(parent,x+side*w*.28,yy-.48,z-d/2-.03,.96,.08,.08,0x786c51,{cover:false});
    }
  } else {
    const roof=new THREE.Mesh(new THREE.ConeGeometry(w*.77,Math.min(h*.32,2.5),4),material(color===0x9c7658?0x685340:0x4c554b));roof.rotation.y=Math.PI/4;roof.position.set(x,h+h*.14,z);roof.scale.set(1,1,d/w);roof.castShadow=true;parent.add(roof);
    box(parent,x,h*.45,z-d/2-.04,w*.23,h*.4,.1,0x312f2a,{cover:false});
  }
  for(let i=0;i<Math.floor(w/2.4);i++){const xx=x-w/2+1.3+i*2.35;box(parent,xx,.58,z-d/2-.06,.82,1.12,.08,0x282c29,{cover:false});box(parent,xx,.12,z-d/2-.11,1,.13,.12,0x675e4d,{cover:false});}
}
function makeMap(index){
  while(arena.children.length){const c=arena.children.pop();if(c.geometry)c.geometry.dispose();}
  mapObstacles.length=0;shootTargets.length=0;botList.length=0;decor.length=0;
  const m=maps[index];scene.background=new THREE.Color(m.sky);scene.fog=new THREE.Fog(m.fog,27,83);
  scene.remove(...scene.children.filter(x=>x.isLight));
  const hemi=new THREE.HemisphereLight(m.sky,0x373c32,2.0);scene.add(hemi);
  const sun=new THREE.DirectionalLight(index===2?0xa9c4ff:0xffe6bc,index===2?2.1:3.1);sun.position.set(-14,28,12);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-38;sun.shadow.camera.right=38;sun.shadow.camera.top=38;sun.shadow.camera.bottom=-38;scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(90,90),material(m.ground,1));ground.rotation.x=-Math.PI/2;ground.position.y=-.12;ground.receiveShadow=true;arena.add(ground);
  // Subtle ground scoring and lane markings make each arena readable.
  const lineMat=new THREE.MeshStandardMaterial({color:index===2?0x677078:0xd1c9a7,roughness:1,transparent:true,opacity:.35});
  for(let i=-3;i<=3;i++){const line=new THREE.Mesh(new THREE.BoxGeometry(.045,.012,70),lineMat);line.position.set(i*4,.006,0);arena.add(line);}
  for(let z=-26;z<=26;z+=8){box(arena,0,.014,z,70,.012,.035,index===2?0x7d8991:0xc6b996,{cover:false});}
  const wallColor=index===1?0x9c7658:index===3?0x899da0:index===4?0x465b42:index===2?0x484b50:index===5?0x666358:0x666a5e;
  // Outer perimeter, low gaps preserve readable routes and prevent wandering off map.
  box(arena,0,2,-32,68,4,1.2,wallColor,{cover:false});box(arena,0,2,32,68,4,1.2,wallColor,{cover:false});box(arena,-34,2,0,1.2,4,64,wallColor,{cover:false});box(arena,34,2,0,1.2,4,64,wallColor,{cover:false});
  if(index===0){
    // Freight depot: three rail lanes, boxcars, loading platforms and a central warehouse.
    for(let z of [-18,0,18]){box(arena,0,.05,z,62,.12,.17,0x433f37,{cover:false});box(arena,0,.05,z+1.7,62,.12,.17,0x433f37,{cover:false});for(let x=-30;x<31;x+=4)box(arena,x,.08,z+.85,.16,.12,2.7,0x635c4b,{cover:false});}
    for(let x of [-19,0,19]){box(arena,x,1.95,-18,12,3.8,5.5,x===0?0x5b675c:0x56635b);box(arena,x,4,-18,12.4,.28,5.8,0x313a34,{cover:false});for(let n=-2;n<=2;n++)box(arena,x+n*2.2,2,-15.2,.09,3.4,.12,0x9b7750,{cover:false});}
    building(arena,0,-29,22,6,8,0x555b51,'block');building(arena,-26,22,9,13,6,0x686958,'block');building(arena,26,-4,9,14,7,0x595c53,'block');
    for(const [x,z,t,c] of [[-12,-8,'crate',0x886944],[12,8,'crate',0x796243],[-24,-2,'barrel',0x596257],[25,19,'barrel',0x786346],[-7,21,'sandbag',0x77705a],[8,-7,'concrete',0x77786a],[21,-21,'crate',0x796344],[-20,10,'tire',0x303331]])addProp(arena,x,z,t,c);
    for(let x=-28;x<=28;x+=7){box(arena,x,5,-27,.22,10,.22,0x383d34,{cover:false});box(arena,x,9.9,-27,3,.12,.12,0xb7a66f,{cover:false});}
  }
  if(index===1){
    // Dust town blocks create a staggered figure-eight of alleys and courtyards.
    building(arena,-24,-23,14,13,7,0x9c7658,'adobe');building(arena,0,-25,17,11,8,0xa78361,'adobe');building(arena,24,-22,13,14,6,0x92704f,'adobe');building(arena,-26,20,13,13,8,0xa17a59,'adobe');building(arena,25,22,14,12,7,0x967250,'adobe');
    building(arena,-20,0,9,12,5,0xb38b66,'adobe');building(arena,20,-2,10,12,6,0x9b7856,'adobe');building(arena,0,24,17,8,5,0xa98462,'adobe');
    for(const [x,z,t,c]of [[-11,-12,'sandbag',0x9c8260],[12,-12,'crate',0x75583f],[-10,13,'barrel',0x805a3b],[11,13,'sandbag',0xa48a68],[0,-4,'concrete',0x867760],[-28,2,'crate',0x8c6844],[28,4,'barrel',0x795b40],[0,13,'tire',0x292a27],[-3,-20,'crate',0x866342]])addProp(arena,x,z,t,c);
    for(let x=-30;x<=30;x+=8){box(arena,x,3,7,.2,6,.2,0x6a5139,{cover:false});box(arena,x,6,7,1.7,.1,.12,0x6a5139,{cover:false});}
    box(arena,0,.38,0,3,.75,3,0x887358,{cover:false});cylinder(arena,0,.9,0,.12,.3,0xcac0a0,10);
  }
  if(index===2){
    // Night-shift loading yard: containers, lit windows, wet asphalt, neon and alley cover.
    const wet=material(0x333a42,.23,.3);const floor=new THREE.Mesh(new THREE.PlaneGeometry(70,70),wet);floor.rotation.x=-Math.PI/2;floor.position.y=-.09;arena.add(floor);
    building(arena,-25,-23,12,13,12,0x343941,'block');building(arena,25,-25,14,12,15,0x383a42,'block');building(arena,-27,20,14,12,14,0x383d42,'block');building(arena,26,21,13,13,11,0x343b42,'block');
    for(const [x,z,color]of [[-9,-22,0x3c5962],[9,-22,0x623f4b],[-9,21,0x515e69],[10,21,0x4b6261]]){box(arena,x,1.8,z,11,3.6,5.8,color);box(arena,x,3.72,z,11.3,.24,6.1,0x262b30,{cover:false});for(let y=.6;y<3;y+=.55)box(arena,x,y,z-2.95,10,.06,.05,0xb84d47,{cover:false});}
    for(const [x,z,t,c]of [[-17,-8,'barrel',0xa34b41],[17,-9,'crate',0x586873],[-17,8,'concrete',0x5c6268],[17,9,'sandbag',0x53575a],[0,-8,'crate',0x535c60],[0,9,'tire',0x24282c],[-27,0,'barrel',0x57595a],[27,1,'crate',0x555b60]])addProp(arena,x,z,t,c);
    for(const [x,z,c]of [[-8,-10,0x54d9d3],[8,-10,0xf06e54],[-8,10,0x55c6dc],[8,10,0xe76555]]){const light=new THREE.PointLight(c,24,14,2);light.position.set(x,3,z);arena.add(light);box(arena,x,3,z,.18,.18,.18,c,{cover:false,mat:new THREE.MeshBasicMaterial({color:c})});}
    for(let i=0;i<8;i++){const puddle=new THREE.Mesh(new THREE.CircleGeometry(1+Math.random()*1.7,18),new THREE.MeshBasicMaterial({color:0x8797a0,transparent:true,opacity:.09,side:THREE.DoubleSide}));puddle.rotation.x=-Math.PI/2;puddle.position.set((Math.random()-.5)*54,.012,(Math.random()-.5)*54);puddle.scale.y=.35;arena.add(puddle);}
  }
  if(index===3){
    building(arena,-25,-24,14,12,8,0x788d91,'block');building(arena,25,-25,15,12,8,0x81979a,'block');building(arena,-26,22,14,13,10,0x82989a,'block');building(arena,25,22,15,13,9,0x798f94,'block');
    // Snow berms and frozen crates break the lanes into multiple levels.
    for(const [x,z,t,c]of [[-13,-15,'sandbag',0x9bacac],[13,-14,'crate',0x72838a],[-14,14,'concrete',0x8b9b9e],[14,14,'sandbag',0x9cabad],[0,-22,'crate',0x657980],[0,21,'tire',0x33393b],[-27,0,'barrel',0x62777c],[27,0,'crate',0x718389],[-4,3,'concrete',0x829397],[6,-4,'crate',0x64777a]])addProp(arena,x,z,t,c);
    for(let i=0;i<26;i++){let x=(Math.random()-.5)*58,z=(Math.random()-.5)*58;const s=.15+Math.random()*.35;const flake=new THREE.Mesh(new THREE.IcosahedronGeometry(s,0),material(0xe4eff0,.55));flake.position.set(x,.1,z);flake.scale.y=.28;arena.add(flake);}
    for(const [x,z]of [[-18,-4],[18,4],[-5,24],[4,-23]]){cylinder(arena,x,.35,z,.12,.7,0x42494a,8);const light=new THREE.PointLight(0xb9efff,7,8);light.position.set(x,.8,z);arena.add(light);}
  }
  if(index===4){
    building(arena,-25,-24,13,12,9,0x536147,'block');building(arena,25,-23,14,12,8,0x4b5c43,'block');building(arena,-25,22,14,14,8,0x465842,'block');building(arena,25,22,14,14,9,0x526347,'block');
    // Ruined temple core with chunky broken colonnades.
    box(arena,0,2,-26,20,4,3,0x65644c,{cover:false});box(arena,0,2,26,18,4,3,0x69674c,{cover:false});
    for(const x of [-9,-3,3,9]){box(arena,x,2,-12,1.3,4,1.4,0x777657);box(arena,x,2,12,1.3,4,1.4,0x737352);box(arena,x,4.2,-12,2.1,.45,1.9,0x625f45,{cover:false});box(arena,x,4.2,12,2.1,.45,1.9,0x625f45,{cover:false});}
    for(const [x,z,t,c]of [[-16,-8,'concrete',0x706d50],[16,8,'crate',0x665c3b],[-15,12,'sandbag',0x696a4a],[15,-12,'barrel',0x4c593f],[-4,-3,'crate',0x675d3d],[5,4,'concrete',0x6e6b4d],[-28,0,'tire',0x272d26],[27,0,'crate',0x605b3d]])addProp(arena,x,z,t,c);
    for(let i=0;i<22;i++){let x=(Math.random()-.5)*60,z=(Math.random()-.5)*60;const h=2+Math.random()*3;const trunk=cylinder(arena,x,h/2,z,.13,h,0x514535,7);const leaves=new THREE.Mesh(new THREE.ConeGeometry(.8+Math.random()*.7,h*.52,6),material(i%2?0x4d7045:0x658047));leaves.position.set(x,h*.8,z);leaves.castShadow=true;arena.add(leaves);}
    for(const [x,z]of [[-21,-9],[22,9],[-7,19],[7,-18]]){const vine=box(arena,x,3,z,.16,5,.16,0x64764a,{cover:false});vine.rotation.z=.14;}
  }
  if(index===5){
    building(arena,-25,-24,15,15,12,0x65645d,'block');building(arena,24,-24,15,14,10,0x777066,'block');building(arena,-25,23,16,14,9,0x77766c,'block');building(arena,25,23,15,14,13,0x625f57,'block');
    // Rooftop air-conditioning clusters, HVAC ducting and skylight structures.
    for(const [x,z]of [[-19,-12],[19,-13],[-18,14],[18,14]]){box(arena,x,1.2,z,4,2.4,3,0x4c514e);box(arena,x,2.45,z,4.3,.12,3.3,0x343c3d,{cover:false});for(let n=-1;n<=1;n++)box(arena,x+n*1.1,1.25,z-1.6,.06,2,.08,0x77796f,{cover:false});}
    for(const [x,z,t,c]of [[-11,-14,'concrete',0x666c67],[12,-14,'crate',0x776445],[-12,13,'sandbag',0x74746b],[12,13,'barrel',0x6b5d46],[0,-20,'crate',0x6a6356],[0,20,'concrete',0x626963],[-26,0,'tire',0x282a28],[26,0,'crate',0x6d6659]])addProp(arena,x,z,t,c);
    for(let x=-29;x<=29;x+=6){box(arena,x,1.5,-30,.16,3,.16,0x656b65,{cover:false});box(arena,x,3,-30,6,.1,.18,0x73766e,{cover:false});}
    for(const [x,z]of [[-3,-8],[4,7],[-25,3],[24,-3]]){box(arena,x,.25,z,2.8,.5,2.4,0x4d5350);box(arena,x,1.3,z,.35,1.6,.35,0x77796c,{cover:false});}
    const sunDisc=new THREE.Mesh(new THREE.CircleGeometry(4,32),new THREE.MeshBasicMaterial({color:0xf2bd83,transparent:true,opacity:.38}));sunDisc.position.set(-28,17,-37);sunDisc.lookAt(0,0,0);arena.add(sunDisc);
  }
  // Per-map clutter: warning plates, light poles, painted lane strips and scattered debris.
  for(let i=0;i<20;i++){const x=(Math.random()-.5)*57,z=(Math.random()-.5)*57;if(Math.hypot(x,z)<5)continue;const width=.12+Math.random()*.35;const debris=box(arena,x,.08,z,width,.15,width*1.8,index===3?0x89999a:index===4?0x645e3b:0x67675b,{cover:false,cast:false});debris.rotation.y=Math.random()*Math.PI;}
  for(const [x,z]of [[-31,-31],[31,-31],[-31,31],[31,31]]){const sign=box(arena,x,2,z,.12,2,.12,0x555c50,{cover:false});const plaque=box(arena,x,3,z,.9,.62,.08,m.accent,{cover:false,mat:new THREE.MeshStandardMaterial({color:m.accent,roughness:.5,emissive:m.accent,emissiveIntensity:.12})});plaque.rotation.y=Math.PI/4;}
  player.pos.set(0,1.72,13);player.vel.set(0,0,0);player.hp=100;player.ammo=30;player.reserve=120;player.yaw=0;player.pitch=0;player.grounded=true;
  camera.position.copy(player.pos);camera.rotation.set(0,0,0);ui.topMap.textContent=m.name;ui.hudMap.textContent=m.name;ui.mapIndex.textContent=`${m.tag} / 06`;document.querySelector('#mode-label').textContent=index===2?'NIGHT OPS / FFA':'FREE FOR ALL';
  createBots();
}

const spawnPoints=[[-28,0],[28,0],[0,-29],[0,29],[-20,-12],[20,-12],[-20,12],[20,12],[-8,-25],[8,25],[-8,25],[8,-25],[-28,-14],[28,14]];
function getSpawnPoint(){const valid=spawnPoints.filter(([x,z])=>!blocked(x,z,.55));return valid[Math.floor(Math.random()*valid.length)]||[0,0];}
const botColors=[0xf27648,0xd66e47,0xf2bd59,0x66a4a0,0xd18d67];
function createBots(){
  const count=5;
  for(let i=0;i<count;i++){
    const group=new THREE.Group();arena.add(group);
    const main=botColors[i%botColors.length],dark=0x252c2a,helmet=0x39413b;
    const torso=new THREE.Mesh(new THREE.BoxGeometry(.78,.88,.42),material(main,.76));torso.position.y=1.28;torso.castShadow=true;group.add(torso);
    const vest=new THREE.Mesh(new THREE.BoxGeometry(.81,.43,.45),material(dark,.75));vest.position.set(0,1.3,-.03);vest.castShadow=true;group.add(vest);
    for(let s of [-1,1]){
      const arm=new THREE.Mesh(new THREE.BoxGeometry(.24,.76,.26),material(main));arm.position.set(s*.54,1.25,-.01);arm.rotation.z=s*.08;arm.castShadow=true;group.add(arm);
      const leg=new THREE.Mesh(new THREE.BoxGeometry(.3,.72,.34),material(0x303832));leg.position.set(s*.2,.44,0);leg.castShadow=true;group.add(leg);
      const boot=new THREE.Mesh(new THREE.BoxGeometry(.35,.18,.5),material(0x252a27));boot.position.set(s*.2,.1,-.06);group.add(boot);
    }
    const head=new THREE.Mesh(new THREE.BoxGeometry(.46,.48,.43),material(0xd0a47c));head.position.y=1.98;head.castShadow=true;group.add(head);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(.55,.17,.52),material(helmet));cap.position.set(0,2.23,0);cap.castShadow=true;group.add(cap);
    const visor=new THREE.Mesh(new THREE.BoxGeometry(.34,.08,.04),new THREE.MeshStandardMaterial({color:0x293d3b,metalness:.3,roughness:.3,emissive:0x17413b,emissiveIntensity:.3}));visor.position.set(0,2.03,-.23);group.add(visor);
    const gun=new THREE.Mesh(new THREE.BoxGeometry(.15,.16,.68),material(0x252d2c,.45,.45));gun.position.set(.13,1.34,-.48);group.add(gun);
    const spawn=spawnPoints.filter(([x,z])=>!blocked(x,z,.55));
    const p=spawn[i%spawn.length]||[0,0];group.position.set(p[0],0,p[1]);group.rotation.y=Math.PI;
    const bot={group,hp:100,alive:true,respawn:0,fire:1+Math.random()*1.5,phase:Math.random()*8,side:i%2?1:-1,color:main};botList.push(bot);
    group.traverse(o=>{if(o.isMesh){o.userData.bot=bot;shootTargets.push(o);}});
  }
}

// A deliberately chunky, readable first-person rifle with animated recoil and a warm muzzle flash.
const weapon=new THREE.Group();camera.add(weapon);weapon.position.set(.34,-.34,-.62);weapon.rotation.set(-.03,-.045,0);
const gunMat=material(0x252d2a,.42,.55),gunDark=material(0x151b19,.5,.5),gunAccent=material(0x8e9a74,.42,.4);
function weaponBox(x,y,z,sx,sy,sz,mat){const o=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);o.position.set(x,y,z);o.castShadow=true;weapon.add(o);return o;}
weaponBox(0,0,0,.17,.16,.63,gunMat);weaponBox(0,-.045,.22,.11,.21,.25,gunDark);weaponBox(0,.1,-.12,.15,.06,.33,gunDark);weaponBox(0,.13,-.11,.075,.035,.23,gunAccent);weaponBox(0,.04,-.4,.085,.075,.31,gunDark);weaponBox(0,-.24,.15,.12,.31,.16,gunDark).rotation.x=-.19;weaponBox(-.18,-.045,.07,.22,.1,.15,gunMat);weaponBox(.19,-.04,.02,.2,.11,.13,gunMat);
const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.22,10),gunDark);barrel.rotation.x=Math.PI/2;barrel.position.set(0,0,-.51);weapon.add(barrel);
const muzzle=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xffd26b,transparent:true,opacity:.9}));muzzle.position.set(0,0,-.66);muzzle.visible=false;weapon.add(muzzle);
const keys={};
window.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(e.code==='Escape'&&playing&&!paused){pauseGame();}else if(e.code==='KeyR'&&playing&&!paused)reload();else if(e.code==='Space'&&playing&&!paused)jump();});
window.addEventListener('keyup',e=>keys[e.code]=false);
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});
function resizeGame(){const {width,height}=viewportSize();camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,isMobile?1.35:1.8));updateOrientation();}
window.addEventListener('resize',resizeGame);window.visualViewport?.addEventListener('resize',resizeGame);window.screen.orientation?.addEventListener?.('change',resizeGame);
updateOrientation();
window.addEventListener('mousemove',e=>{if(!playing||paused||document.pointerLockElement!==canvas)return;player.yaw-=e.movementX*.0022;player.pitch=Math.max(-1.28,Math.min(1.28,player.pitch-e.movementY*.002));camera.rotation.set(player.pitch,player.yaw,0,'YXZ');});
window.addEventListener('mousedown',e=>{if(e.button!==0)return;if(playing&&!paused){if(document.pointerLockElement!==canvas){canvas.requestPointerLock?.();return;}shoot();}});
canvas.addEventListener('click',()=>{if(playing&&!paused&&document.pointerLockElement!==canvas)canvas.requestPointerLock?.();});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&playing&&!paused){/* Escape handles pause; tolerate browser lock exit. */}});
function startGame(){
  if(playing||isMobile&&!isLandscape())return;
  if(isMobile)window.screen.orientation?.lock?.('landscape')?.catch?.(()=>{});playing=true;paused=false;gameTime=300;player.score=0;botScore=0;ui.score.textContent='00';ui.botScore.textContent='00';ui.progress.style.width='0%';ui.menu.style.display='none';ui.pause.classList.add('hidden');ui.hud.classList.add('active');ui.topMap.textContent=maps[selectedMap].name;ui.hudMap.textContent=maps[selectedMap].name;ui.mapIndex.textContent=`${maps[selectedMap].tag} / 06`;document.querySelector('#top-status').textContent='LIVE / TRAINING SIMULATION';updateHud();if(!isMobile)canvas.requestPointerLock?.();showToast('GOOD HUNT');}
function pauseGame(){paused=true;document.exitPointerLock?.();ui.pause.classList.remove('hidden');}
function resumeGame(){paused=false;ui.pause.classList.add('hidden');if(!isMobile)canvas.requestPointerLock?.();}
function returnToMenu(){playing=false;paused=false;document.exitPointerLock?.();ui.pause.classList.add('hidden');ui.hud.classList.remove('active');ui.menu.style.display='flex';document.querySelector('#top-status').textContent='TRAINING SIMULATION';}
function updateHud(){ui.ammo.textContent=String(player.ammo).padStart(2,'0');ui.reserve.textContent=String(player.reserve).padStart(3,'0');ui.health.textContent=String(Math.ceil(player.hp));ui.healthBar.style.width=`${Math.max(0,player.hp)}%`;ui.score.textContent=String(player.score).padStart(2,'0');ui.botScore.textContent=String(botScore).padStart(2,'0');ui.progress.style.width=`${Math.min(100,player.score/15*100)}%`;ui.objective.textContent=`${player.score} / 15`;ui.clock.textContent=`${Math.floor(gameTime/60).toString().padStart(2,'0')}:${Math.floor(gameTime%60).toString().padStart(2,'0')}`;ui.compass.textContent=`${['N','NE','E','SE','S','SW','W','NW'][Math.round((player.yaw%(Math.PI*2)+Math.PI*2)%(Math.PI*2)/(Math.PI/4))%8]} ${String(Math.round((player.yaw*180/Math.PI%360+360)%360)).padStart(3,'0')}°`;}
function showToast(text){ui.toast.textContent=text;ui.toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>ui.toast.classList.remove('show'),1250);}
function addFeed(text){const row=document.createElement('div');row.className='feed-item';row.innerHTML=`YOU <b>✳</b> ${text}`;ui.feed.prepend(row);while(ui.feed.children.length>3)ui.feed.lastElementChild.remove();setTimeout(()=>row.remove(),3700);}
function flashHit(){ui.hit.classList.add('show');setTimeout(()=>ui.hit.classList.remove('show'),140);}
function reload(){if(player.reloadTimer>0||player.ammo===30||player.reserve<=0)return;player.reloadTimer=1.32;ui.reload.classList.add('show');weapon.position.y=-.44;setTimeout(()=>{if(player.reloadTimer>0){const n=Math.min(30-player.ammo,player.reserve);player.ammo+=n;player.reserve-=n;player.reloadTimer=0;ui.reload.classList.remove('show');updateHud();}},1320);}
function shoot(){if(player.shootCooldown>0||player.reloadTimer>0)return;if(player.ammo<=0){reload();return;}player.ammo--;player.shootCooldown=.105;lastShot=performance.now();weapon.position.z=-.66;weapon.rotation.x=-.13;muzzle.visible=true;setTimeout(()=>muzzle.visible=false,46);setTimeout(()=>{weapon.position.z=-.62;weapon.rotation.x=-.03;},75);updateHud();
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=raycaster.intersectObjects(shootTargets,false);
  const worldHits=raycaster.intersectObjects(arena.children,true);
  const botHit=hits.find(h=>h.object.userData.bot?.alive);
  const obstruction=worldHits.find(h=>!h.object.userData.bot);
  if(botHit&&(!obstruction||botHit.distance<obstruction.distance)){const bot=botHit.object.userData.bot;bot.hp-=34;flashHit();if(bot.hp<=0)killBot(bot);}
  if(soundOn)playTone(110,.055,'sawtooth',.035);
}
function killBot(bot){bot.alive=false;bot.group.visible=false;bot.respawn=2.3;player.score++;player.kills++;addFeed(`HOSTILE ${String(player.kills).padStart(2,'0')}`);showToast(player.score>=15?'FIELD DOMINATED':'ELIMINATION');updateHud();if(player.score>=15){setTimeout(()=>{showToast('VICTORY / 15 ELIMS');},450);setTimeout(()=>returnToMenu(),2800);}}
function damagePlayer(amount){if(player.invuln>0)return;player.hp=Math.max(0,player.hp-amount);player.invuln=.22;ui.flash.classList.add('show');setTimeout(()=>ui.flash.classList.remove('show'),160);updateHud();if(player.hp<=0){botScore++;player.hp=100;player.ammo=30;player.invuln=2;player.pos.set(0,1.72,13);showToast('REDEPLOYING');updateHud();if(botScore>=15){showToast('RIVALS WIN');setTimeout(()=>returnToMenu(),2400);}}}
function playTone(freq,duration,type='sine',volume=.03){try{const ac=playTone.ctx||(playTone.ctx=new AudioContext());const osc=ac.createOscillator(),gain=ac.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.value=volume;osc.connect(gain);gain.connect(ac.destination);osc.start();gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);osc.stop(ac.currentTime+duration);}catch{}}
function jump(){if(player.grounded){player.vel.y=7.1;player.grounded=false;}}

function blocked(x,z,r=.42){
  if(x < -31.2 || x > 31.2 || z < -30.8 || z > 30.8)return true;
  for(const o of mapObstacles){if(o.sy<.78)continue;const hx=(o.sx||1)/2+r,hz=(o.sz||1)/2+r;if(Math.abs(x-o.x)<hx&&Math.abs(z-o.z)<hz)return true;}
  return false;
}
function tryMove(dx,dz){
  let nx=player.pos.x+dx,nz=player.pos.z+dz;
  if(!blocked(nx,player.pos.z))player.pos.x=nx;
  if(!blocked(player.pos.x,nz))player.pos.z=nz;
}
function updatePlayer(dt){
  const forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)+(touchMove.y||0);
  const side=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+(touchMove.x||0);
  const len=Math.hypot(forward,side)||1,sprint=keys.ShiftLeft||keys.ShiftRight;
  const speed=sprint?9.1:6.25;
  const fX=-Math.sin(player.yaw),fZ=-Math.cos(player.yaw),rX=Math.cos(player.yaw),rZ=-Math.sin(player.yaw);
  const mx=(fX*forward+rX*side)/len*speed*dt,mz=(fZ*forward+rZ*side)/len*speed*dt;
  tryMove(mx,mz);
  player.vel.y-=19*dt;player.pos.y+=player.vel.y*dt;
  if(player.pos.y<1.72){player.pos.y=1.72;player.vel.y=0;player.grounded=true;}
  camera.position.copy(player.pos);
  player.shootCooldown=Math.max(0,player.shootCooldown-dt);player.invuln=Math.max(0,player.invuln-dt);
  if(player.reloadTimer>0){player.reloadTimer=Math.max(0,player.reloadTimer-dt);if(player.reloadTimer===0){const n=Math.min(30-player.ammo,player.reserve);player.ammo+=n;player.reserve-=n;ui.reload.classList.remove('show');weapon.position.y=-.34;updateHud();}}
  const moving=Math.abs(forward)+Math.abs(side)>0;
  weapon.position.x=.34+(moving?Math.sin(performance.now()*.012)*.012:0);
  weapon.position.y=player.reloadTimer>0?-.44:-.34+(moving?Math.abs(Math.sin(performance.now()*.012))*.012:0);
  if(mouseFiring||touchFiring)shoot();
}
const botRay=new THREE.Raycaster();
function botHasLine(bot,target){
  const from=bot.group.position.clone().add(new THREE.Vector3(0,1.65,0));
  const to=target.clone().add(new THREE.Vector3(0,.15,0));const delta=to.sub(from),dist=delta.length();
  botRay.set(from,delta.normalize());botRay.far=dist;
  const hit=botRay.intersectObjects(arena.children,true).find(h=>h.object.userData.bot!==bot);
  return !hit||hit.distance>dist-.2;
}
function updateBots(dt){
  for(const bot of botList){
    if(!bot.alive){bot.respawn-=dt;if(bot.respawn<=0){const p=getSpawnPoint();bot.group.position.set(p[0],0,p[1]);bot.group.visible=true;bot.hp=100;bot.alive=true;bot.fire=1+Math.random();}continue;}
    bot.phase+=dt;const bpos=bot.group.position,dx=player.pos.x-bpos.x,dz=player.pos.z-bpos.z,dist=Math.hypot(dx,dz);
    bot.group.rotation.y=Math.atan2(-dx,-dz);
    let vx=0,vz=0;
    if(dist>8){vx=dx/(dist||1)*1.45;vz=dz/(dist||1)*1.45;}
    else if(dist<5){vx=-dx/(dist||1)*.8;vz=-dz/(dist||1)*.8;}
    vx+=Math.cos(bot.phase*1.25)*.68*bot.side;vz+=Math.sin(bot.phase*1.25)*.68*bot.side;
    const scale=dt/(Math.hypot(vx,vz)||1);const nx=bpos.x+vx*scale,nz=bpos.z+vz*scale;
    if(!blocked(nx,bpos.z,.4))bpos.x=nx;else bot.side*=-1;
    if(!blocked(bpos.x,nz,.4))bpos.z=nz;else bot.side*=-1;
    bot.group.position.y=Math.abs(Math.sin(bot.phase*7))*.035;
    bot.fire-=dt;
    if(dist<27&&bot.fire<=0&&botHasLine(bot,player.pos)){
      bot.fire=1.1+Math.random()*1.25;
      const accuracy=Math.max(.35,1-dist/42);
      if(Math.random()<accuracy)damagePlayer(7+Math.random()*7);
      if(soundOn&&Math.random()<.2)playTone(75,.07,'square',.012);
    }
  }
}
function endMatch(text){playing=false;paused=false;document.exitPointerLock?.();showToast(text);setTimeout(()=>{returnToMenu();showToast(text);},2100);}
function updateGame(dt){
  if(!playing||paused)return;
  gameTime=Math.max(0,gameTime-dt);
  updatePlayer(dt);updateBots(dt);
  if(frame%8===0)updateHud();
  if(player.score>=15)endMatch('VICTORY / 15 ELIMS');
  else if(botScore>=15)endMatch('RIVALS WIN');
  else if(gameTime<=0)endMatch(player.score>botScore?'TIME / YOU WIN':player.score<botScore?'TIME / RIVALS WIN':'TIME / DRAW');
}
let mouseFiring=false,touchFiring=false;
window.addEventListener('mousedown',e=>{if(e.button===0&&playing&&!paused){mouseFiring=true;shoot();}});
window.addEventListener('mouseup',e=>{if(e.button===0)mouseFiring=false;});
window.addEventListener('contextmenu',e=>e.preventDefault());
const touchMove={x:0,y:0};let stickPointer=null,stickOrigin=null,lookPointer=null,lastTouch=null;
const stick=document.querySelector('#touch-stick'),stickKnob=stick.querySelector('i');
stick.addEventListener('pointerdown',e=>{e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);const r=stick.getBoundingClientRect();stickOrigin={x:r.left+r.width/2,y:r.top+r.height/2};});
stick.addEventListener('pointermove',e=>{if(e.pointerId!==stickPointer||!stickOrigin)return;const dx=e.clientX-stickOrigin.x,dy=e.clientY-stickOrigin.y,len=Math.hypot(dx,dy),scale=Math.min(1,len/42),x=dx/(len||1)*scale,y=dy/(len||1)*scale;touchMove.x=x;touchMove.y=-y;stickKnob.style.transform=`translate(${x*28}px,${y*28}px)`;});
function resetStick(){stickPointer=null;stickOrigin=null;touchMove.x=0;touchMove.y=0;stickKnob.style.transform='';}
stick.addEventListener('pointerup',resetStick);stick.addEventListener('pointercancel',resetStick);
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&playing&&!paused){lookPointer=e.pointerId;lastTouch={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||e.pointerId!==lookPointer||!lastTouch||paused)return;player.yaw-=(e.clientX-lastTouch.x)*.006;player.pitch=Math.max(-1.22,Math.min(1.22,player.pitch-(e.clientY-lastTouch.y)*.005));camera.rotation.set(player.pitch,player.yaw,0,'YXZ');lastTouch={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',e=>{if(e.pointerId===lookPointer){lookPointer=null;lastTouch=null;}});
const fireButton=document.querySelector('#touch-fire');fireButton.addEventListener('pointerdown',e=>{e.preventDefault();touchFiring=true;fireButton.setPointerCapture(e.pointerId);shoot();});fireButton.addEventListener('pointerup',()=>touchFiring=false);fireButton.addEventListener('pointercancel',()=>touchFiring=false);
document.querySelector('#touch-jump').addEventListener('pointerdown',e=>{e.preventDefault();jump();});document.querySelector('#touch-reload').addEventListener('pointerdown',e=>{e.preventDefault();reload();});
function renderMapMenu(){ui.mapList.innerHTML='';maps.forEach((map,i)=>{const row=document.createElement('button');row.type='button';row.className=`map-row${i===selectedMap?' selected':''}`;row.innerHTML=`<span class="map-number">${map.tag}</span><span class="map-name">${map.name}</span><span class="map-biome">${map.zone}</span><span class="map-arrow">↗</span>`;row.setAttribute('aria-label',`${map.name}, ${map.description}`);row.addEventListener('click',()=>selectMap(i));ui.mapList.append(row);});}
function selectMap(i){selectedMap=i;renderMapMenu();makeMap(i);}
document.querySelector('#play-button').addEventListener('click',startGame);
document.querySelector('#resume-button').addEventListener('click',resumeGame);
document.querySelector('#return-button').addEventListener('click',returnToMenu);
document.querySelector('#sound-button').addEventListener('click',()=>{soundOn=!soundOn;document.querySelector('#sound-icon').textContent=soundOn?'♫':'♪';if(soundOn)playTone(540,.08,'sine',.03);});
document.querySelector('#how-button').addEventListener('click',()=>showToast(innerWidth<700?'LEFT STICK MOVE / DRAG TO LOOK':'WASD MOVE / MOUSE AIM / CLICK FIRE'));
// Render on the display's native requestAnimationFrame cadence (including 120 Hz panels),
// while keeping movement and combat simulation on a stable 120 Hz timestep.
const SIM_STEP=1/120;let last=performance.now(),accumulator=0;
function animate(now){
  requestAnimationFrame(animate);
  accumulator=Math.min(accumulator+Math.min(.1,(now-last)/1000),SIM_STEP*12);last=now;
  while(accumulator>=SIM_STEP){frame++;updateGame(SIM_STEP);accumulator-=SIM_STEP;}
  renderer.render(scene,camera);
}
renderMapMenu();makeMap(selectedMap);updateHud();requestAnimationFrame(animate);
