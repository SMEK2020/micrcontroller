(() => {
  'use strict';
  const $=(q,r=document)=>r.querySelector(q); const $$=(q,r=document)=>[...r.querySelectorAll(q)];
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

  /* ---------- scroll / navigation ---------- */
  const sections=$$('.story-section'); const dots=[];
  const sceneEls={solution:$('#sceneA'),blackout:$('#sceneB'),hardware:$('#sceneC')};
  const sceneCaption=$('#sceneCaption'); const visualStage=$('#visualStage'); const mapLabels=$('#mapLabels'); const visualDemo=$('#visualDemo');
  let currentScene='solution'; let currentFlow='normal'; let simulatorOverride=false;
  const captions={
    solution:'Grid → Substation / Central Controller → University Node + House Node',
    blackout:'Shortage → coarse disconnection → university and homes lose power together',
    hardware:'One central controller coordinates two local smart nodes over ESP-NOW'
  };
  function showScene(name){
    currentScene=name; Object.entries(sceneEls).forEach(([k,el])=>el?.classList.toggle('is-on',k===name));
    if(sceneCaption) sceneCaption.textContent=captions[name]||'';
    visualStage?.classList.toggle('blackout-mode',name==='blackout');
    fx.setLayout(name==='hardware'?'solution':name);
  }
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(!e.isIntersecting) return;
      const i=sections.indexOf(e.target);
      const scene=e.target.dataset.scene||'solution'; const flow=e.target.dataset.flow||'normal';
      visualStage?.classList.toggle('sim-mode',e.target.id==='simulator');
      if(!(e.target.id==='simulator' && simulatorOverride)){ showScene(scene); fx.setMode(flow); currentFlow=flow; }
    });
  },{threshold:.55});
  sections.forEach(s=>observer.observe(s));
  addEventListener('scroll',()=>{
    const h=document.documentElement.scrollHeight-innerHeight; const p=h?scrollY/h:0; $('#progressBar').style.width=(p*100)+'%';
  },{passive:true});
  $('#fullscreenBtn')?.addEventListener('click',()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.());

  /* ---------- Three.js energy overlay ---------- */
  const fx=(()=>{
    const canvas=$('#fx'); if(!canvas || !window.THREE) return {setMode(){},setLayout(){},setLevel(){}};
    const T=window.THREE; const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'}); renderer.setClearColor(0x000000,0); renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    const scene=new T.Scene(); const camera=new T.OrthographicCamera(0,100,100,0,-10,10); camera.position.z=5;
    const paths=[]; const particles=[]; let mode='normal', layout='solution', level=1, raf;
    const layouts={
      solution:[[[91,15],[77,30],[69,40]],[[69,40],[53,59],[42,74]],[[69,40],[78,57],[88,74]]],
      blackout:[[[8,44],[31,50],[49,45]],[[49,45],[68,34],[80,28]],[[49,45],[67,58],[79,72]]],
      hardware:[[[72,22],[68,38],[63,48]],[[63,48],[51,30],[43,20]],[[63,48],[79,32],[90,20]],[[63,48],[58,75],[70,80]]]
    };
    function clear(){ while(scene.children.length) scene.remove(scene.children[0]); paths.length=0; particles.length=0; }
    function mat(hex,intensity=.8){ const m=new T.MeshBasicMaterial({color:hex,transparent:true,opacity:intensity,blending:T.AdditiveBlending,depthWrite:false}); return m; }
    function makePath(points,idx){
      const vs=points.map(([x,y])=>new T.Vector3(x,100-y,0)); const curve=new T.CatmullRomCurve3(vs); const col=idx===0?0x20c77a:0x24b8ff; const line=new T.Mesh(new T.TubeGeometry(curve,56,.16,6,false),mat(col,.45)); scene.add(line); paths.push({curve,line,col});
      for(let i=0;i<4;i++){ const p=new T.Mesh(new T.SphereGeometry(.65,12,8),mat(col,.92)); scene.add(p); particles.push({mesh:p,curve,phase:i/4,speed:.045+idx*.008}); }
    }
    function rebuild(){ clear(); (layouts[layout]||layouts.solution).forEach(makePath); }
    function setMode(m){mode=m||'normal'} function setLayout(l){layout=l||'solution';rebuild()} function setLevel(v){level=clamp(v,0,1)}
    function resize(){ const r=canvas.getBoundingClientRect(); renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false); }
    function animate(tms){ raf=requestAnimationFrame(animate); const t=tms*.001; const fail=mode==='failure'||level<=.01; paths.forEach((p,idx)=>{ let col=p.col,op=.45; if(mode==='shortage'||mode==='low'){col=idx===0?0xffa52b:0x38a9ff;op=.38} if(fail){col=0xef3f4d;op=.20} p.line.material.color.setHex(col);p.line.material.opacity=op*(.45+.55*level); }); particles.forEach((p,i)=>{ const active=!fail && level>.04; p.mesh.visible=active; if(active){ const u=(p.phase+t*p.speed*(.45+.9*level))%1; p.mesh.position.copy(p.curve.getPointAt(u)); const sc=.75+.35*Math.sin(t*3+i); p.mesh.scale.setScalar(sc); } }); renderer.render(scene,camera); }
    rebuild(); resize(); addEventListener('resize',resize); animate(0); return {setMode,setLayout,setLevel};
  })();
  showScene('solution');

  /* ---------- Allocation model ---------- */
  const LOADS=[
    {id:'C1',name:'Server / Core Network',short:'Server',mw:1.2,zone:'University',kind:'protected',rank:5},
    {id:'C2',name:'Classroom / Projector',short:'Classroom',mw:.8,zone:'University',kind:'important',rank:4},
    {id:'C3',name:'University Fan',short:'Uni Fan',mw:1.0,zone:'University',kind:'flex',rank:3,fair:7},
    {id:'C4',name:'University AC',short:'Uni AC',mw:2.1,zone:'University',kind:'flex',rank:1,fair:4},
    {id:'C5',name:'Refrigerator',short:'Fridge',mw:.7,zone:'House',kind:'protected',rank:5},
    {id:'C6',name:'Essential Lighting',short:'Light',mw:.8,zone:'House',kind:'important',rank:4},
    {id:'C7',name:'House Fan',short:'House Fan',mw:1.2,zone:'House',kind:'flex',rank:3,fair:10},
    {id:'C8',name:'House AC',short:'House AC',mw:1.7,zone:'House',kind:'flex',rank:1,fair:5}
  ];
  const total=LOADS.reduce((s,l)=>s+l.mw,0); // 9.5

  function iconSVG(id){
    const common='viewBox="0 0 32 32" aria-hidden="true"';
    if(id==='C1') return `<svg ${common}><rect x="7" y="4" width="18" height="24" rx="3" fill="#17283f"/><rect x="10" y="8" width="12" height="3" rx="1" fill="#2e9cff"/><rect x="10" y="14" width="12" height="3" rx="1" fill="#20c77a"/><rect x="10" y="20" width="12" height="3" rx="1" fill="#7a45e8"/></svg>`;
    if(id==='C2') return `<svg ${common}><rect x="5" y="6" width="22" height="15" rx="2" class="screen-on" fill="#2b8fff"/><rect x="14" y="21" width="4" height="4" fill="#52657c"/><rect x="10" y="25" width="12" height="2" rx="1" fill="#52657c"/></svg>`;
    if(id==='C3'||id==='C7') return `<svg ${common}><circle cx="16" cy="16" r="3" fill="#26374d"/><g class="fan-blades" fill="#60738c"><path d="M16 13c1-7 6-8 8-5 2 4-2 7-8 8z"/><path d="M19 16c7 1 8 6 5 8-4 2-7-2-8-8z"/><path d="M16 19c-1 7-6 8-8 5-2-4 2-7 8-8z"/><path d="M13 16c-7-1-8-6-5-8 4-2 7 2 8 8z"/></g></svg>`;
    if(id==='C4'||id==='C8') return `<svg ${common}><rect x="4" y="7" width="24" height="12" rx="3" fill="#eef3f8" stroke="#7d8fa5"/><path d="M8 14h16M10 17h12" stroke="#597189" stroke-width="1.3"/><g class="cool-air" stroke="#20bffa" stroke-width="1.5" stroke-linecap="round"><path d="M10 21c0 2 2 2 2 4"/><path d="M16 21c0 2 2 2 2 4"/><path d="M22 21c0 2 2 2 2 4"/></g></svg>`;
    if(id==='C5') return `<svg ${common}><rect x="9" y="3" width="14" height="26" rx="3" fill="#e9eef4" stroke="#778ba2"/><path d="M9 13h14" stroke="#778ba2"/><circle cx="20" cy="8" r="1" fill="#20c77a"/><rect x="18" y="16" width="2" height="5" rx="1" fill="#778ba2"/></svg>`;
    if(id==='C6') return `<svg ${common}><path class="bulb-glow" d="M16 4a8 8 0 0 0-5 14c1.5 1.2 2 2.3 2.2 3.8h5.6c.2-1.5.7-2.6 2.2-3.8A8 8 0 0 0 16 4z" fill="#ffd34d"/><rect x="13" y="23" width="6" height="4" rx="1" fill="#67798f"/></svg>`;
    return `<svg ${common}><circle cx="16" cy="16" r="10" fill="#dfe7f0"/></svg>`;
  }
  function buildVisualDevices(){
    const uni=$('#uniDevices'), house=$('#houseDevices');
    LOADS.forEach(l=>{
      const el=document.createElement('div'); el.className='mini-device on'; el.dataset.id=l.id;
      el.innerHTML=`${iconSVG(l.id)}<b>${l.short}</b><em>ON</em>`;
      (l.zone==='University'?uni:house)?.appendChild(el);
    });
  }
  buildVisualDevices();
  function allocate(supply){
    supply=clamp(+supply||0,0,10); const safe=supply*.97; const on=Object.fromEntries(LOADS.map(l=>[l.id,false]));
    if(supply<=.001) return {supply,safe,served:0,state:'Grid failure',on};
    if(safe>=total-.001){LOADS.forEach(l=>on[l.id]=true);return{supply,safe,served:total,state:'Normal',on};}
    let used=0; const add=id=>{const l=LOADS.find(x=>x.id===id);if(used+l.mw<=safe+1e-9){on[id]=true;used+=l.mw;return true}return false};
    if(!add('C1')) return {supply,safe,served:0,state:'Critical emergency',on};
    add('C5'); // fridge protected after C1
    if(used+.8+.8<=safe+1e-9){add('C2');add('C6')} else {add('C2');add('C6')}
    const flex=LOADS.filter(l=>l.kind==='flex'); const rem=Math.max(0,safe-used); let best={score:-1,ids:[],used:0};
    for(let mask=0;mask<16;mask++){
      let u=0,score=0,ids=[]; flex.forEach((l,i)=>{if(mask&(1<<i)){u+=l.mw;ids.push(l.id);score+=l.rank*18+l.fair*.45+l.mw*2.2}}); if(u>rem+1e-9)continue; score+=u*1.5; if(score>best.score||(Math.abs(score-best.score)<1e-9&&u>best.used))best={score,ids,used:u};
    }
    best.ids.forEach(id=>{on[id]=true}); used+=best.used;
    let state=safe<2?'Critical emergency':safe<5.6?'Severe shortage':'Adaptive shortage'; return{supply,safe,served:used,state,on};
  }

  /* ---------- Simulator UI ---------- */
  const board=$('#loadBoard');
  if(board){LOADS.forEach(l=>{const el=document.createElement('article');el.className='load-card';el.dataset.id=l.id;el.innerHTML=`<div class="top"><code>${l.id}</code><em>ON</em></div><b>${l.short}</b><span>${l.zone} · ${l.mw.toFixed(1)} MW eq.</span>`;board.appendChild(el);});}
  const slider=$('#supplySlider'), supplyV=$('#supplyValue'), safeV=$('#safeValue'), servedV=$('#servedValue'), stateV=$('#stateValue'), explain=$('#scenarioExplain');
  function describe(r){
    const off=LOADS.filter(l=>!r.on[l.id]).map(l=>l.short); if(r.state==='Grid failure')return'No grid supply is available, so every controlled load is OFF and the system enters grid-failure alarm mode.'; if(r.state==='Normal')return'All requested loads fit inside the safe capacity, so no load is shed.'; if(r.state==='Critical emergency')return'Available power is extremely low. Only the highest-priority service that physically fits can remain active.'; if(!off.length)return'All loads remain active.'; return`The shortage cannot be avoided completely, so the controller curtails ${off.join(', ')} while keeping higher-priority services inside the safe capacity.`;
  }
  function renderSim(v){
    const r=allocate(v);
    if(slider)slider.value=r.supply;if(supplyV)supplyV.textContent=r.supply.toFixed(1)+' MW';if(safeV)safeV.textContent=r.safe.toFixed(1)+' MW';if(servedV)servedV.textContent=r.served.toFixed(1)+' MW';
    if(stateV){stateV.textContent=r.state;stateV.className=r.state==='Normal'?'ok':r.state==='Grid failure'||r.state==='Critical emergency'?'danger':'warn'}
    if(explain)explain.textContent=describe(r);
    $$('.load-card',board).forEach(el=>{const on=!!r.on[el.dataset.id];el.classList.toggle('on',on);el.classList.toggle('off',!on);$('em',el).textContent=on?'ON':'OFF'});
    $$('.mini-device').forEach(el=>{const on=!!r.on[el.dataset.id];el.classList.toggle('on',on);el.classList.toggle('off',!on);$('em',el).textContent=on?'ON':'OFF'});
    const vs=$('#visualSupply'), vst=$('#visualState'); if(vs)vs.textContent=r.supply.toFixed(1); if(vst){vst.textContent=r.state.toUpperCase();vst.style.color=r.state==='Normal'?'#0d8b59':r.state==='Grid failure'||r.state==='Critical emergency'?'#c72c39':'#c77712'}
    $$('.preset-row button[data-s]').forEach(b=>b.classList.toggle('active',Math.abs(+b.dataset.s-r.supply)<.01));
    simulatorOverride=true; fx.setLevel(r.safe/9.7); fx.setMode(r.state==='Grid failure'?'failure':r.state==='Normal'?'normal':'shortage'); if(r.state==='Grid failure')showScene('blackout');else showScene('solution');
  }
  slider?.addEventListener('input',()=>{stopAuto();renderSim(+slider.value)}); $$('.preset-row button[data-s]').forEach(b=>b.addEventListener('click',()=>{stopAuto();renderSim(+b.dataset.s)}));
  let autoTimers=[]; const autoBtn=$('#autoDemoBtn');
  function stopAuto(){autoTimers.forEach(clearTimeout);autoTimers=[];if(autoBtn){autoBtn.classList.remove('running');autoBtn.textContent='▶ Auto demo'}}
  function runAuto(){stopAuto(); if(autoBtn){autoBtn.classList.add('running');autoBtn.textContent='■ Stop demo'} const seq=[10,7.3,6.6,5.2,3.2,0,5.2,7.3,10]; seq.forEach((v,i)=>autoTimers.push(setTimeout(()=>renderSim(v),i*1700))); autoTimers.push(setTimeout(stopAuto,seq.length*1700+300));}
  autoBtn?.addEventListener('click',()=>autoBtn.classList.contains('running')?stopAuto():runAuto());
  renderSim(10);

  // release simulator visual override after leaving that section
  const sim=$('#simulator'); const simObs=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting){simulatorOverride=false}}),{threshold:.1}); if(sim)simObs.observe(sim);
})();
