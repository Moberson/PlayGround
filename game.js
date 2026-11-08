(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const keys = new Set();
  const defs = [
    {id:'cannon',name:'CANNON ARRAY',icon:'⌁',desc:'Twin / triple shot spread',max:3,base:30},
    {id:'shield',name:'SHIELD MATRIX',icon:'⬡',desc:'More energy • faster recharge',max:4,base:24},
    {id:'hull',name:'HULL PLATING',icon:'▰',desc:'Increase max hull integrity',max:4,base:22},
    {id:'fire',name:'FIRE CONTROL',icon:'⌖',desc:'Increase cannon fire rate',max:4,base:28}
  ];
  let saved;
  try { saved = JSON.parse(localStorage.getItem('voidrunner-save') || '{}'); } catch { saved = {}; }
  const profile = {parts:Math.max(0,Number(saved.parts)||0), upgrades:{cannon:0,shield:0,hull:0,fire:0,...saved.upgrades}};
  const persist = () => localStorage.setItem('voidrunner-save', JSON.stringify(profile));
  const costFor = d => Math.round(d.base * (1 + profile.upgrades[d.id] * .82));
  let W=900,H=540,dpr=1,last=0,elapsed=0,gameState='menu',score=0,wave=1,kills=0,spawned=0,waveBreak=0,spawnClock=0,shootClock=0,toastClock=0,shake=0;
  let player, enemies=[],shots=[],enemyShots=[],pickups=[],particles=[],stars=[];
  let muted=false;

  function resize(){
    const r=canvas.getBoundingClientRect(); dpr=Math.min(window.devicePixelRatio||1,2);
    W=Math.max(300,r.width); H=Math.max(300,r.height);
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
    stars=Array.from({length:Math.max(70,Math.floor(W*H/4700))},()=>({x:Math.random()*W,y:Math.random()*H,z:Math.random(),r:Math.random()*1.35+.25,tw:Math.random()*6.28}));
    if(player){player.x=Math.min(W-24,Math.max(24,player.x));player.y=Math.min(H-25,Math.max(H*.48,player.y));}
  }
  window.addEventListener('resize',resize); resize();
  const maxHull=()=>100+profile.upgrades.hull*25;
  const maxShield=()=>50+profile.upgrades.shield*25;
  function freshPlayer(){return {x:W/2,y:H*.78,r:13,hp:maxHull(),shield:maxShield(),invuln:0,power:0,tilt:0};}
  player=freshPlayer();

  function renderUpgrades(){
    $('partsNum').textContent=profile.parts.toLocaleString();
    $('upgradeList').innerHTML=defs.map(d=>{
      const level=profile.upgrades[d.id],cost=costFor(d),max=level>=d.max;
      return `<div class="upgrade-row"><div class="upgrade-icon">${d.icon}</div><div class="upgrade-info"><b>${d.name}</b><small>${d.desc}</small><div class="level-pips">${Array.from({length:d.max},(_,i)=>`<i class="${i<level?'on':''}"></i>`).join('')}</div></div><div class="upgrade-action">${max?'<span class="maxed">MAX</span>':`<button data-upgrade="${d.id}" ${profile.parts<cost?'disabled':''}>⬡ ${cost}</button>`}</div></div>`;
    }).join('');
    document.querySelectorAll('[data-upgrade]').forEach(btn=>btn.addEventListener('click',()=>buyUpgrade(btn.dataset.upgrade)));
  }
  function buyUpgrade(id){
    const d=defs.find(x=>x.id===id); if(!d)return;
    const cost=costFor(d); if(profile.parts<cost||profile.upgrades[id]>=d.max)return;
    profile.parts-=cost; profile.upgrades[id]++; persist(); renderUpgrades();
    if(id==='hull'){const diff=maxHull()-100-(profile.upgrades.hull-1)*25;player.hp=Math.min(maxHull(),player.hp+diff);}
    if(id==='shield'){player.shield=maxShield();}
    toast(`${d.name} UPGRADED // LEVEL ${profile.upgrades[id]}`);
    updateVitals();
  }
  renderUpgrades();

  function startGame(){
    gameState='running';score=0;wave=1;kills=0;spawned=0;waveBreak=1.2;spawnClock=0;shootClock=0;
    enemies=[];shots=[];enemyShots=[];pickups=[];particles=[];player=freshPlayer();
    $('startModal').classList.add('hidden');$('gameOverModal').classList.add('hidden');$('pauseBadge').classList.add('hidden');
    $('objectiveTitle').textContent='CLEAR THE SECTOR';$('objectiveText').textContent='Destroy the hostile fleet and collect their salvage.';
    updateHUD();updateVitals();
  }
  function gameOver(){gameState='over';$('finalScore').textContent=score.toLocaleString();$('finalWave').textContent=String(wave).padStart(2,'0');$('gameOverModal').classList.remove('hidden');$('pauseBadge').classList.add('hidden');$('objectiveTitle').textContent='SIGNAL LOST';$('objectiveText').textContent='Salvaged Ship Parts have been secured.';}
  function togglePause(){if(gameState==='running'){gameState='paused';$('pauseBadge').classList.remove('hidden');}else if(gameState==='paused'){gameState='running';$('pauseBadge').classList.add('hidden');}}
  function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');toastClock=2.2;}
  $('startBtn').addEventListener('click',startGame);$('retryBtn').addEventListener('click',startGame);
  $('shopJump').addEventListener('click',()=>{document.querySelector('.upgrade-panel').scrollIntoView({behavior:'smooth',block:'center'});if(gameState==='running'){togglePause();toast('HANGAR OPEN // MISSION PAUSED');}else if(gameState==='paused'){togglePause();toast('HANGAR CLOSED // RESUMING MISSION');}else toast('HANGAR OPEN // UPGRADES PERSIST');});
  $('soundBtn').addEventListener('click',()=>{muted=!muted;$('soundBtn').textContent=muted?'×':'♫';$('soundBtn').classList.toggle('muted',muted);});
  function updateHUD(){ $('scoreText').textContent=String(score).padStart(6,'0');$('waveNum').textContent=String(wave).padStart(2,'0');$('enemyCount').textContent=enemies.length?String(enemies.length).padStart(2,'0'):'—'; }
  function updateVitals(){
    const mh=maxHull(),ms=maxShield();$('healthNum').innerHTML=`${Math.ceil(player.hp)} <small>/ ${mh}</small>`;$('shieldNum').innerHTML=`${Math.ceil(player.shield)} <small>/ ${ms}</small>`;
    $('healthBar').style.width=`${Math.max(0,player.hp/mh*100)}%`;$('shieldBar').style.width=`${Math.max(0,player.shield/ms*100)}%`;
    $('healthBar').style.background=player.hp/mh<.3?'linear-gradient(90deg,#ff536f,#ff8196)':'';
  }

  function enemySpawn(){
    const roll=Math.random(),type=wave>1&&roll>.72?'brute':wave>1&&roll>.43?'weaver':'scout';
    const stats=type==='brute'?{hp:5+wave*.5,r:19,speed:30+wave*1.5,value:160,color:'#ff687f'}:type==='weaver'?{hp:2+wave*.22,r:12,speed:76+wave*2,value:110,color:'#bd86ff'}:{hp:2+wave*.2,r:14,speed:47+wave*1.4,value:80,color:'#ffad70'};
    enemies.push({x:24+Math.random()*(W-48),y:-30,r:stats.r,hp:stats.hp,maxHp:stats.hp,speed:stats.speed,value:stats.value,color:stats.color,type,phase:Math.random()*6.28,fire:1.6+Math.random()*2,hit:0});spawned++;
  }
  function playerShoot(){
    const level=profile.upgrades.cannon,spread=level>=2?[-.16,0,.16]:level===1?[-.09,.09]:[0];
    for(const angle of spread){shots.push({x:player.x+Math.sin(angle)*9,y:player.y-15,vx:Math.sin(angle)*100,vy:-490,r:3.2,damage:1+Math.floor(level/3),color:player.power>0?'#ffe285':'#75ffe5'});}
    if(player.power>0&&level>=2){shots.push({x:player.x-15,y:player.y-4,vx:-120,vy:-450,r:2.4,damage:1,color:'#ffe285'},{x:player.x+15,y:player.y-4,vx:120,vy:-450,r:2.4,damage:1,color:'#ffe285'});}
  }
  function burst(x,y,color,n=9){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=25+Math.random()*150;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.55,max:.9,r:1+Math.random()*2.5,color});}}
  function dropAt(x,y){
    const roll=Math.random(); if(roll<.47){pickups.push({x,y,type:'parts',r:8,vy:45,spin:Math.random()*6});return;}
    if(roll<.69)pickups.push({x,y,type:Math.random()<.54?'repair':'shield',r:9,vy:42,spin:0});
    else if(roll<.75)pickups.push({x,y,type:'weapon',r:9,vy:42,spin:0});
  }
  function damagePlayer(amount){
    if(player.invuln>0)return;let left=amount;
    if(player.shield>0){const absorbed=Math.min(player.shield,left);player.shield-=absorbed;left-=absorbed;}
    if(left>0)player.hp-=left;
    player.invuln=.55;shake=7;burst(player.x,player.y,'#ff738e',8);updateVitals();
    if(player.hp<=0){player.hp=0;updateVitals();gameOver();}
  }
  function collect(p){
    if(p.type==='parts'){const n=4+Math.floor(Math.random()*7);profile.parts+=n;persist();renderUpgrades();toast(`+${n} SHIP PARTS SALVAGED`);}
    else if(p.type==='repair'){player.hp=Math.min(maxHull(),player.hp+30);toast('HULL PATCH // +30 INTEGRITY');updateVitals();}
    else if(p.type==='shield'){player.shield=Math.min(maxShield(),player.shield+35);toast('SHIELD CELL // +35 CAPACITY');updateVitals();}
    else{player.power=9;toast('OVERDRIVE // CANNONS BOOSTED');}
    burst(p.x,p.y,p.type==='parts'?'#ffbf74':'#6af4dd',8);
  }
  function update(dt){
    elapsed+=dt; if(toastClock>0){toastClock-=dt;if(toastClock<=0)$('toast').classList.remove('show');}
    if(gameState!=='running')return;
    if(player.invuln>0)player.invuln-=dt;if(player.power>0)player.power-=dt;
    // Shield recharge is deliberately gradual, so the shield feels valuable without being infinite.
    player.shield=Math.min(maxShield(),player.shield+dt*(.65+profile.upgrades.shield*.28));
    const speed=245,dx=(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0),dy=(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0),len=Math.hypot(dx,dy)||1;
    player.x=Math.max(18,Math.min(W-18,player.x+dx/len*speed*dt));player.y=Math.max(H*.43,Math.min(H-25,player.y+dy/len*speed*dt));player.tilt+=(dx*.8-player.tilt)*Math.min(1,dt*8);
    shootClock-=dt;const firing=keys.has(' ')||keys.has('Space')||keys.has('fire');if(firing&&shootClock<=0){playerShoot();shootClock=Math.max(.105,.32-profile.upgrades.fire*.047);}
    if(waveBreak>0){waveBreak-=dt;}else{
      const count=7+Math.min(10,wave*2);
      if(spawned<count){spawnClock-=dt;if(spawnClock<=0){enemySpawn();spawnClock=Math.max(.25,.78-wave*.035)*(.72+Math.random()*.65);}}
      if(spawned>=count&&enemies.length===0){wave++;spawned=0;waveBreak=2.3;player.hp=Math.min(maxHull(),player.hp+12);player.shield=maxShield();updateHUD();updateVitals();toast(`WAVE ${String(wave).padStart(2,'0')} // REINFORCEMENTS INBOUND`);}
    }
    for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];e.phase+=dt*(e.type==='weaver'?2.5:1);e.y+=e.speed*dt;e.x+=Math.sin(e.phase)*(e.type==='weaver'?95:28)*dt;e.x=Math.max(e.r,Math.min(W-e.r,e.x));e.fire-=dt;
      if(e.fire<=0&&e.y>12&&e.y<H*.82){enemyShots.push({x:e.x,y:e.y+e.r,vx:(player.x-e.x)*.14,vy:165+wave*7,r:4,color:e.color});e.fire=Math.max(1.0,2.7-Math.min(1.3,wave*.08)+Math.random()*1.4);}
      if(e.y>H+30){enemies.splice(i,1);damagePlayer(14);continue;}
      if(Math.hypot(e.x-player.x,e.y-player.y)<e.r+player.r*.7){enemies.splice(i,1);damagePlayer(e.type==='brute'?24:16);burst(e.x,e.y,e.color,12);}
    }
    for(let i=shots.length-1;i>=0;i--){const b=shots[i];b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.y< -10||b.x<0||b.x>W){shots.splice(i,1);continue;}let hit=false;for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(Math.hypot(b.x-e.x,b.y-e.y)<b.r+e.r){e.hp-=b.damage;e.hit=.09;burst(b.x,b.y,b.color,3);shots.splice(i,1);hit=true;if(e.hp<=0){score+=e.value; kills++;burst(e.x,e.y,e.color,15);dropAt(e.x,e.y);enemies.splice(j,1);updateHUD();}break;}}if(hit)continue;}
    for(let i=enemyShots.length-1;i>=0;i--){const b=enemyShots[i];b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.y>H+10||b.x<0||b.x>W){enemyShots.splice(i,1);continue;}if(Math.hypot(b.x-player.x,b.y-player.y)<b.r+player.r*.75){enemyShots.splice(i,1);damagePlayer(12);}}
    for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.y+=p.vy*dt;p.spin+=dt*3;if(p.y>H+20){pickups.splice(i,1);continue;}if(Math.hypot(p.x-player.x,p.y-player.y)<p.r+player.r+5){collect(p);pickups.splice(i,1);}}
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);p.life-=dt;if(p.life<=0)particles.splice(i,1);}
    if(shake>0)shake=Math.max(0,shake-dt*20);updateHUD();updateVitals();
  }

  function polygon(points,fill,stroke,line=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
  function drawShip(x,y,r,color,type='scout',angle=0){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.shadowColor=color;ctx.shadowBlur=14;
    if(type==='brute'){
      polygon([[0,r*1.35],[-r*.72,r*.2],[-r*1.5,r*.45],[-r*1.13,-r*.55],[-r*.43,-r*.87],[0,-r*1.1],[r*.43,-r*.87],[r*1.13,-r*.55],[r*1.5,r*.45],[r*.72,r*.2]],'#241a2c',color,1.8);
      polygon([[-r*.5,-r*.28],[0,-r*.75],[r*.5,-r*.28],[0,r*.58]],'#8f4764',color,1);ctx.fillStyle='#ffcb86';ctx.fillRect(-r*.23,-r*.03,r*.46,r*.2);
    }else if(type==='weaver'){
      polygon([[0,r*1.2],[-r*.55,r*.15],[-r*1.4,-r*.55],[-r*.34,-r*.48],[0,-r*1.1],[r*.34,-r*.48],[r*1.4,-r*.55],[r*.55,r*.15]],'#231b35',color,1.5);
      polygon([[0,r*.64],[-r*.28,-r*.18],[0,-r*.72],[r*.28,-r*.18]],'#8b65b9',color,1);
    }else{
      polygon([[0,r*1.2],[-r*.46,r*.17],[-r*1.4,r*.65],[-r*.98,-r*.12],[-r*.34,-r*.45],[0,-r],[r*.34,-r*.45],[r*.98,-r*.12],[r*1.4,r*.65],[r*.46,r*.17]],'#261c24',color,1.5);
      polygon([[0,r*.58],[-r*.28,-r*.06],[0,-r*.57],[r*.28,-r*.06]],'#a4564b',color,1);
    }
    ctx.shadowBlur=0;ctx.fillStyle=color;ctx.globalAlpha=.6;ctx.fillRect(-r*.13,r*.72,r*.26,r*.42);ctx.restore();
  }
  function drawPlayer(){
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.tilt*.18);const flash=player.invuln>0&&Math.floor(elapsed*18)%2===0;
    if(player.shield>2){ctx.beginPath();ctx.ellipse(0,0,20,23,0,0,Math.PI*2);ctx.strokeStyle=`rgba(110,165,255,${.17+Math.min(.3,player.shield/maxShield()*.28)})`;ctx.lineWidth=1.5;ctx.shadowColor='#789fff';ctx.shadowBlur=9;ctx.stroke();ctx.shadowBlur=0;}
    if(!flash){ctx.shadowColor='#63ffe0';ctx.shadowBlur=17;polygon([[0,-19],[6,-4],[18,8],[7,6],[4,18],[0,13],[-4,18],[-7,6],[-18,8],[-6,-4]],'#102c3b','#74ffe2',1.6);polygon([[0,-13],[3,-2],[0,5],[-3,-2]],player.power>0?'#ffe285':'#7bfff0',null);ctx.shadowBlur=0;}
    ctx.fillStyle=player.power>0?'#ffe285':'#ff9b72';ctx.globalAlpha=.7+Math.sin(elapsed*26)*.2;ctx.beginPath();ctx.moveTo(-4,15);ctx.lineTo(0,23+Math.random()*5);ctx.lineTo(4,15);ctx.fill();ctx.restore();
  }
  function draw(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#07101e');bg.addColorStop(.55,'#091625');bg.addColorStop(1,'#080e1a');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    const neb=ctx.createRadialGradient(W*.56,H*.42,0,W*.56,H*.42,W*.52);neb.addColorStop(0,'#14273a44');neb.addColorStop(1,'#09101a00');ctx.fillStyle=neb;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.strokeStyle='#2e556022';ctx.lineWidth=1;const step=48,offset=(elapsed*9)%step;for(let x=0;x<W;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=-step;y<H;y+=step){ctx.beginPath();ctx.moveTo(0,y+offset);ctx.lineTo(W,y+offset);ctx.stroke();}ctx.restore();
    for(const s of stars){if(gameState==='running')s.y=(s.y+(18+s.z*55)*(1/60))%H;const alpha=.23+.6*(.5+.5*Math.sin(elapsed*2+s.tw));ctx.globalAlpha=alpha;ctx.fillStyle=s.z>.75?'#a7f9ec':'#b4c6df';ctx.fillRect(s.x,s.y,s.r,s.r*(1+s.z*1.6));}ctx.globalAlpha=1;
    ctx.save();if(shake>0)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
    // distant orbital debris
    ctx.globalAlpha=.42;ctx.strokeStyle='#47627b';ctx.lineWidth=1;for(let i=0;i<5;i++){const x=((i*197+60+elapsed*(7+i))%(W+80))-40,y=(i*127+H*.23)%H;ctx.strokeRect(x,y,5,2);ctx.beginPath();ctx.moveTo(x-3,y+5);ctx.lineTo(x+2,y+5);ctx.stroke();}ctx.globalAlpha=1;
    for(const p of pickups){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.spin);const color=p.type==='parts'?'#ffbf74':p.type==='weapon'?'#ffe285':'#69f4de';ctx.shadowColor=color;ctx.shadowBlur=12;polygon([[0,-p.r],[p.r*.85,-p.r*.45],[p.r*.85,p.r*.45],[0,p.r],[-p.r*.85,p.r*.45],[-p.r*.85,-p.r*.45]],'#122331',color,1.5);ctx.shadowBlur=0;ctx.fillStyle=color;ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.type==='parts'?'⬡':p.type==='repair'?'✚':p.type==='shield'?'S':'⚡',0,1);ctx.restore();}
    for(const e of enemies){drawShip(e.x,e.y,e.r,e.color,e.type,Math.sin(e.phase)*.08);if(e.hit>0){e.hit-=1/60;ctx.fillStyle='#fff';ctx.globalAlpha=Math.max(0,e.hit*7);ctx.beginPath();ctx.arc(e.x,e.y,e.r+2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}if(e.maxHp>3){ctx.fillStyle='#293341';ctx.fillRect(e.x-e.r,e.y-e.r-8,e.r*2,2);ctx.fillStyle=e.color;ctx.fillRect(e.x-e.r,e.y-e.r-8,e.r*2*Math.max(0,e.hp/e.maxHp),2);}}
    for(const b of shots){ctx.strokeStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=9;ctx.lineWidth=b.r;ctx.beginPath();ctx.moveTo(b.x,b.y+9);ctx.lineTo(b.x-b.vx*.008,b.y-6);ctx.stroke();}ctx.shadowBlur=0;
    for(const b of enemyShots){ctx.fillStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    drawPlayer();ctx.restore();
    if(waveBreak>0&&gameState==='running'){ctx.textAlign='center';ctx.fillStyle='#76f3dd';ctx.globalAlpha=Math.min(1,(2.3-waveBreak)*2,.65);ctx.font='10px "DM Mono",monospace';ctx.letterSpacing='3px';ctx.fillText(`WAVE ${String(wave).padStart(2,'0')} // HOSTILES DETECTED`,W/2,H*.34);ctx.globalAlpha=1;}
    if(gameState==='menu'){ctx.fillStyle='#66f3d9';ctx.globalAlpha=.3;ctx.fillRect(W*.08,H*.69,36,1);ctx.fillRect(W*.83,H*.27,52,1);ctx.globalAlpha=1;}
  }
  function frame(now){const dt=Math.min(.04,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();
    if(k==='p'||k==='escape'){togglePause();return;}if(k==='enter'&&gameState==='menu')startGame();if(k==='enter'&&gameState==='over')startGame();keys.add(k);
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>keys.clear());
  document.querySelectorAll('.dpad [data-key]').forEach(btn=>{
    const k=btn.dataset.key.toLowerCase();const down=e=>{e.preventDefault();keys.add(k);btn.setPointerCapture?.(e.pointerId);};const up=e=>{e.preventDefault();keys.delete(k);};
    btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('lostpointercapture',up);
  });
  const fire=$('touchFire');const fireDown=e=>{e.preventDefault();keys.add('fire');fire.setPointerCapture?.(e.pointerId);};const fireUp=e=>{e.preventDefault();keys.delete('fire');};
  fire.addEventListener('pointerdown',fireDown);fire.addEventListener('pointerup',fireUp);fire.addEventListener('pointercancel',fireUp);fire.addEventListener('lostpointercapture',fireUp);
  // The hangar button is also a pause/resume control on touch devices.
  $('shopJump').addEventListener('dblclick',e=>e.preventDefault());
})();
