const CRIMES = ['Homicídio','Estupro','Estupro de Vulnerável','Roubo','Furto','Roubo de Veículos','Furto de Veículos'];
const CIAS   = ['1ª Cia PM','2ª Cia PM','3ª Cia PM'];
const MES_ORD = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PAL = ['#c84b4b','#bf7a3d','#c8a84b','#3d7abf','#e8c96a','#3dbf7a','#7a4bbf'];
const GR  = {color:'rgba(255,255,255,.04)'};

Chart.defaults.color = '#4a5568';
Chart.defaults.borderColor = '#1c2235';
Chart.defaults.font.family = "'DM Mono', monospace";
Chart.defaults.font.size = 11;

const MESES = MES_ORD.filter(m => RAW.some(r => r.mes === m));
const MUNS  = [...new Set(RAW.map(r => r.mun))];

let selMeses = [...MESES];
let hmMeses  = [...MESES];
let charts   = {};
let moCh     = [];

const q   = f => RAW.filter(r => Object.entries(f).every(([k,v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v));
const sf  = (arr, field='avaliado') => arr.reduce((s,r) => s + (r[field]||0), 0);
const pLbl = m => m.length === MESES.length ? 'Todos os meses' : m.join(' + ');
const hcol = (v,max) => {
  if(v===0) return 'rgba(74,158,232,.12)';
  const r=v/max;
  if(r<0.15) return 'rgba(200,168,75,.22)';
  if(r<0.35) return 'rgba(200,168,75,.5)';
  if(r<0.6)  return 'rgba(200,168,75,.75)';
  if(r<0.8)  return '#c8a84b';
  return '#c84b4b';
};
const mk  = (id,cfg) => { if(charts[id]) charts[id].destroy(); charts[id] = new Chart(document.getElementById(id),cfg); };
const cl  = c => c.replace(' Vulnerável','Vuln.').replace(' Veículos','Veíc.');

function init() {
  buildSbMes();
  buildHmFilter();
  renderAll();
}

function buildSbMes() {
  let h = `<button class="mes-btn on" onclick="sbAll(this)">Todos os meses</button>`;
  MESES.forEach(m => h += `<button class="mes-btn" onclick="sbTog('${m}',this)">${m}</button>`);
  document.getElementById('sb-mes').innerHTML = h;
}

function buildHmFilter() {
  let h = `<button class="hm-mbtn on" onclick="hmAll(this)">Todos</button>`;
  MESES.forEach(m => h += `<button class="hm-mbtn" onclick="hmTog('${m}',this)">${m}</button>`);
  document.getElementById('hm-filter-btns').innerHTML = h;
}

function sbAll(btn) {
  selMeses = [...MESES];
  document.querySelectorAll('#sb-mes .mes-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderAll();
}

function sbTog(mes, btn) {
  if(selMeses.includes(mes) && selMeses.length > 1) {
    selMeses = selMeses.filter(m => m !== mes);
  } else if(!selMeses.includes(mes)) {
    selMeses.push(mes);
    selMeses.sort((a,b) => MES_ORD.indexOf(a)-MES_ORD.indexOf(b));
  } else return;
  const btns = document.querySelectorAll('#sb-mes .mes-btn');
  btns[0].classList.toggle('on', selMeses.length === MESES.length);
  btns.forEach((b,i) => { if(i>0) b.classList.toggle('on', selMeses.includes(MESES[i-1])); });
  renderAll();
}

function hmAll(btn) {
  hmMeses = [...MESES];
  document.querySelectorAll('#hm-filter-btns .hm-mbtn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderHeatmap();
}

function hmTog(mes, btn) {
  if(hmMeses.includes(mes) && hmMeses.length > 1) {
    hmMeses = hmMeses.filter(m => m !== mes);
  } else if(!hmMeses.includes(mes)) {
    hmMeses.push(mes);
    hmMeses.sort((a,b) => MES_ORD.indexOf(a)-MES_ORD.indexOf(b));
  } else return;
  const btns = document.querySelectorAll('#hm-filter-btns .hm-mbtn');
  btns[0].classList.toggle('on', hmMeses.length === MESES.length);
  btns.forEach((b,i) => { if(i>0) b.classList.toggle('on', hmMeses.includes(MESES[i-1])); });
  renderHeatmap();
}

function renderAll() {
  const p = pLbl(selMeses);
  ['lbl-p1','lbl-p2','lbl-p3','lbl-p5'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=p; });
  document.getElementById('sb-periodo').textContent = p;
  document.getElementById('metas-badge').textContent = p;
  renderKPIs(); renderVisao(); renderMetas(); renderRanking(); renderHeatmap(); renderInsights(); renderEvolucao();
}

function renderKPIs() {
  document.getElementById('kpi-row').innerHTML = CRIMES.map((c,i) => {
    const aval=sf(q({crime:c,mes:selMeses})), ant=sf(q({crime:c,mes:selMeses}),'anterior');
    const vp=ant>0?((aval-ant)/ant*100).toFixed(0):0;
    const up=parseFloat(vp)>0, col=PAL[i];
    return `<div class="kpi" onclick="moOpen('${c}','${PAL[i]}')" title="Clique para detalhes">
      <div class="kpi-top" style="background:${PAL[i]}"></div>
      <div class="kpi-lbl">${cl(c)}</div>
      <div class="kpi-val" style="color:${PAL[i]}">${aval}</div>
      <div class="kpi-row2">
        <div class="kpi-sub">ant: ${ant}</div>
        <div class="tag ${up?'tbad':'tok'}">${up?'▲':'▼'}${Math.abs(vp)}%</div>
      </div>
      <div class="kpi-hint">▸ clique p/ detalhes</div>
    </div>`;
  }).join('');
}

function renderVisao() {
  mk('c-crimes',{type:'bar',data:{
    labels:CRIMES.map(cl),
    datasets:[
      {label:'Avaliado',data:CRIMES.map(c=>sf(q({crime:c,mes:selMeses}))),backgroundColor:PAL.map(p=>p+'cc'),borderRadius:4},
      {label:'Meta',data:CRIMES.map(c=>sf(q({crime:c,mes:selMeses}),'meta')),backgroundColor:'rgba(255,255,255,.08)',borderRadius:4}
    ]
  },options:{responsive:true,plugins:{legend:{labels:{boxWidth:9}}},scales:{x:{grid:GR},y:{grid:GR,beginAtZero:true}}}});

  const furCIA=CIAS.map(c=>sf(q({crime:'Furto',cia:c,mes:selMeses})));
  mk('c-donut',{type:'doughnut',data:{labels:['1ª CIA','2ª CIA','3ª CIA'],datasets:[{data:furCIA,backgroundColor:['#c8a84b','#3d7abf','#c84b4b'],borderWidth:0,hoverOffset:6}]},options:{responsive:true,cutout:'68%',plugins:{legend:{position:'bottom',labels:{boxWidth:9,padding:10}}}}});

  mk('c-meta',{type:'bar',data:{
    labels:CRIMES.map(cl),
    datasets:[
      {label:'Meta',data:CRIMES.map(c=>sf(q({crime:c,mes:selMeses}),'meta')),backgroundColor:'rgba(255,255,255,.08)',borderRadius:4},
      {label:'Avaliado',data:CRIMES.map(c=>sf(q({crime:c,mes:selMeses}))),backgroundColor:CRIMES.map(c=>{const a=sf(q({crime:c,mes:selMeses})),m=sf(q({crime:c,mes:selMeses}),'meta');return a<=m?'rgba(61,191,122,.75)':'rgba(200,75,75,.75)'}),borderRadius:4}
    ]
  },options:{responsive:true,plugins:{legend:{labels:{boxWidth:9}}},scales:{x:{grid:GR},y:{grid:GR,beginAtZero:true}}}});

  const vd=CRIMES.map(c=>{const a=sf(q({crime:c,mes:selMeses})),ant=sf(q({crime:c,mes:selMeses}),'anterior');return ant>0?parseFloat(((a-ant)/ant*100).toFixed(1)):0;});
  mk('c-var',{type:'bar',data:{labels:CRIMES.map(cl),datasets:[{label:'Var%',data:vd,backgroundColor:vd.map(v=>v>0?'rgba(200,75,75,.75)':'rgba(61,191,122,.75)'),borderRadius:4}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:GR},y:{grid:GR,ticks:{callback:v=>v+'%'}}}}});
}

function renderMetas() {
  let h='<thead><tr><th>Município</th><th>CIA</th><th>Crime</th><th>Anterior</th><th>Meta</th><th>Avaliado</th><th>Var%</th><th>Status</th></tr></thead><tbody>';
  MUNS.forEach(mun => CRIMES.forEach(crime => {
    const rows=q({crime,mun,mes:selMeses});
    if(!rows.length) return;
    const ant=sf(rows,'anterior'),meta=sf(rows,'meta'),aval=sf(rows,'avaliado'),cia=rows[0].cia;
    const vp=ant>0?((aval-ant)/ant*100).toFixed(0):'—';
    const vc=parseFloat(vp)>0?'var(--red2)':parseFloat(vp)<0?'var(--green2)':'var(--tx3)';
    const vt=vp!=='—'?(parseFloat(vp)>0?'▲':'▼')+Math.abs(vp)+'%':vp;
    let pc,pt;
    if(meta>0){if(aval<=meta*0.8){pc='p-ok';pt='Ótimo'}else if(aval<=meta){pc='p-warn';pt='Na Meta'}else{pc='p-bad';pt='Acima'}}
    else{pc=aval===0?'p-ok':'p-warn';pt=aval===0?'Zero':'Sem Meta'}
    h+=`<tr><td style="font-weight:600">${mun}</td><td style="color:var(--tx3);font-size:11px">${cia}</td><td>${crime}</td><td class="num">${ant}</td><td class="num">${meta}</td><td class="num" style="font-weight:700">${aval}</td><td class="num" style="color:${vc}">${vt}</td><td><span class="pill ${pc}">${pt}</span></td></tr>`;
  }));
  document.getElementById('tbl-metas').innerHTML=h+'</tbody>';
}

function buildRank(id,crime) {
  const data=MUNS.map(m=>({name:m,v:sf(q({crime,mun:m,mes:selMeses}))})).sort((a,b)=>a.v-b.v);
  const max=Math.max(...data.map(d=>d.v))||1;
  document.getElementById(id).innerHTML=data.map((item,i)=>{
    const pct=Math.max(5,(item.v/max*100).toFixed(0));
    const bc=i<3?'#3dbf7a':i>=data.length-2?'#c84b4b':'#c8a84b';
    return `<div class="ri"><div class="ri-n ${i<3?'top':''}">${i+1}</div><div class="ri-lbl">${item.name}</div><div class="ri-bg"><div class="ri-fill" style="width:${pct}%;background:${bc}"><span>${item.v}</span></div></div></div>`;
  }).join('');
}

function renderRanking() {
  buildRank('rk-furto','Furto');
  buildRank('rk-roubo','Roubo');
  buildRank('rk-estv','Estupro de Vulnerável');
  buildRank('rk-rouv','Roubo de Veículos');
}

function renderHeatmap() {
  const p=pLbl(hmMeses);
  document.getElementById('lbl-p4').textContent=p;
  document.getElementById('hm-badge').textContent=p;
  const maxes=CRIMES.map(c=>Math.max(...MUNS.map(m=>sf(q({crime:c,mun:m,mes:hmMeses}))),1));
  let h='<thead><tr><th>Município</th>'+CRIMES.map(c=>`<th>${cl(c)}</th>`).join('')+'<th>Total</th></tr></thead><tbody>';
  MUNS.forEach(mun=>{
    const vals=CRIMES.map(c=>sf(q({crime:c,mun,mes:hmMeses})));
    const total=vals.reduce((a,b)=>a+b,0);
    h+=`<tr><td class="hm-city">${mun}</td>`;
    vals.forEach((v,i)=>{const bg=hcol(v,maxes[i]),tc=v/maxes[i]>0.6?'#000':'var(--tx)';h+=`<td><div class="hm-cell" style="background:${bg};color:${tc}">${v}</div></td>`;});
    h+=`<td><div class="hm-cell" style="background:rgba(255,255,255,.07);color:var(--tx);font-weight:700">${total}</div></td></tr>`;
  });
  document.getElementById('hm-tbl').innerHTML=h+'</tbody>';
}

function renderInsights() {
  const tf=sf(q({crime:'Furto',mes:selMeses})),af=sf(q({crime:'Furto',mes:selMeses}),'anterior');
  const vf=af>0?((tf-af)/af*100).toFixed(0):0,mf=sf(q({crime:'Furto',mes:selMeses}),'meta');
  const th=sf(q({crime:'Homicídio',mes:selMeses})),tr=sf(q({crime:'Roubo',mes:selMeses}));
  const topF=MUNS.map(m=>({m,v:sf(q({crime:'Furto',mun:m,mes:selMeses}))})).sort((a,b)=>b.v-a.v)[0];
  const topH=MUNS.map(m=>({m,v:sf(q({crime:'Homicídio',mun:m,mes:selMeses}))})).sort((a,b)=>b.v-a.v)[0];
  const acima=CRIMES.filter(c=>{const a=sf(q({crime:c,mes:selMeses})),m=sf(q({crime:c,mes:selMeses}),'meta');return m>0&&a>m;}).length;
  const ins=[
    {t:parseFloat(vf)>0?'red':'green',v:`${Math.abs(vf)}%`,title:`Furto ${parseFloat(vf)>0?'sobe':'cai'} vs anterior`,body:`${tf} avaliados vs ${af} anterior (${parseFloat(vf)>0?'▲':'▼'}${Math.abs(vf)}%). Meta: ${mf}. Líder: ${topF.m} (${topF.v} casos).`},
    {t:'red',v:`${topH.v}`,title:`Homicídio — ${topH.m}`,body:`${topH.m} concentra ${topH.v} dos ${th} homicídios (${th>0?Math.round(topH.v/th*100):0}% do batalhão). Atenção especial.`},
    {t:'blue',v:topF.m,title:'Crítico — Furto',body:`${topF.m} lidera com ${topF.v} furtos (${tf>0?Math.round(topF.v/tf*100):0}% do batalhão). Verificar endereços de concentração.`},
    {t:acima>0?'red':'green',v:`${acima}`,title:'Crimes acima da meta',body:`${acima} dos ${CRIMES.length} tipos de crime estão acima da meta. ${acima===0?'Excelente desempenho geral.':'Requer atenção da comandância.'}`},
    {t:'',v:`${tr}`,title:'Roubo — Batalhão',body:`${tr} roubos no período. Meta: ${sf(q({crime:'Roubo',mes:selMeses}),'meta')}. Anterior: ${sf(q({crime:'Roubo',mes:selMeses}),'anterior')}.`},
    {t:'blue',v:`${MUNS.length}`,title:'Municípios monitorados',body:`${MUNS.length} municípios em 3 CIAs. Período: ${pLbl(selMeses)}.`},
  ];
  document.getElementById('ins-grid').innerHTML=ins.map(i=>`<div class="ins ${i.t}"><div class="ins-val">${i.v}</div><div class="ins-title">${i.title}</div><div class="ins-body">${i.body}</div></div>`).join('');

  const top5=MUNS.map(m=>({m,v:sf(q({crime:'Furto',mun:m,mes:selMeses}))})).sort((a,b)=>b.v-a.v).slice(0,5);
  const lc=['#c8a84b','#3d7abf','#c84b4b','#3dbf7a','#bf7a3d'];
  mk('c-radar',{type:'radar',data:{
    labels:CRIMES.map(cl),
    datasets:top5.map(({m},i)=>({label:m,data:CRIMES.map(c=>sf(q({crime:c,mun:m,mes:selMeses}))),borderColor:lc[i],backgroundColor:lc[i]+'22',pointBackgroundColor:lc[i],pointRadius:3}))
  },options:{responsive:true,scales:{r:{grid:{color:'rgba(255,255,255,.06)'},ticks:{display:false},pointLabels:{color:'#8090a8',font:{size:10}}}},plugins:{legend:{labels:{boxWidth:8,padding:10,font:{size:10}}}}}});

  const vd2=CRIMES.map(c=>{const a=sf(q({crime:c,mes:selMeses})),ant=sf(q({crime:c,mes:selMeses}),'anterior');return ant>0?parseFloat(((a-ant)/ant*100).toFixed(1)):0;});
  mk('c-var2',{type:'bar',data:{labels:CRIMES.map(cl),datasets:[{label:'Var%',data:vd2,backgroundColor:vd2.map(v=>v>0?'rgba(200,75,75,.75)':'rgba(61,191,122,.75)'),borderRadius:4}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:GR},y:{grid:GR,ticks:{callback:v=>v+'%'}}}}});
}

function renderEvolucao() {
  mk('c-efurto',{type:'line',data:{labels:MESES,datasets:[
    {label:'Avaliado',data:MESES.map(m=>sf(q({crime:'Furto',mes:m}))),borderColor:'#c8a84b',backgroundColor:'rgba(200,168,75,.1)',tension:.4,fill:true,pointRadius:5,pointBackgroundColor:'#c8a84b'},
    {label:'Meta',data:MESES.map(m=>sf(q({crime:'Furto',mes:m}),'meta')),borderColor:'rgba(255,255,255,.2)',tension:.4,borderDash:[5,3],pointRadius:3},
    {label:'Anterior',data:MESES.map(m=>sf(q({crime:'Furto',mes:m}),'anterior')),borderColor:'rgba(255,255,255,.1)',tension:.4,borderDash:[2,4],pointRadius:2},
  ]},options:{responsive:true,plugins:{legend:{labels:{boxWidth:9}}},scales:{x:{grid:GR},y:{grid:GR,beginAtZero:true}}}});

  mk('c-eroubo',{type:'line',data:{labels:MESES,datasets:[
    {label:'Avaliado',data:MESES.map(m=>sf(q({crime:'Roubo',mes:m}))),borderColor:'#3d7abf',tension:.4,pointRadius:5,pointBackgroundColor:'#3d7abf'},
    {label:'Meta',data:MESES.map(m=>sf(q({crime:'Roubo',mes:m}),'meta')),borderColor:'rgba(255,255,255,.2)',tension:.4,borderDash:[5,3],pointRadius:3},
  ]},options:{responsive:true,plugins:{legend:{labels:{boxWidth:9}}},scales:{x:{grid:GR},y:{grid:GR,beginAtZero:true}}}});

  mk('c-epessoa',{type:'line',data:{labels:MESES,datasets:[
    {label:'Homicídio',data:MESES.map(m=>sf(q({crime:'Homicídio',mes:m}))),borderColor:'#c84b4b',tension:.4,pointRadius:5,pointBackgroundColor:'#c84b4b'},
    {label:'Estupro',data:MESES.map(m=>sf(q({crime:'Estupro',mes:m}))),borderColor:'#bf7a3d',tension:.4,pointRadius:5,pointBackgroundColor:'#bf7a3d'},
    {label:'Est. Vulnerável',data:MESES.map(m=>sf(q({crime:'Estupro de Vulnerável',mes:m}))),borderColor:'#c8a84b',tension:.4,pointRadius:5,pointBackgroundColor:'#c8a84b'},
  ]},options:{responsive:true,plugins:{legend:{labels:{boxWidth:9}}},scales:{x:{grid:GR},y:{grid:GR,beginAtZero:true}}}});

  let h='<thead><tr><th>Crime</th>'+MESES.map(m=>`<th>${m}</th>`).join('')+'<th>Total</th></tr></thead><tbody>';
  CRIMES.forEach((c,ci)=>{
    const vals=MESES.map(m=>sf(q({crime:c,mes:m})));
    const tot=vals.reduce((a,b)=>a+b,0);
    h+=`<tr><td style="font-weight:600;color:${PAL[ci]}">${c}</td>${vals.map(v=>`<td class="num">${v}</td>`).join('')}<td class="num" style="font-weight:700">${tot}</td></tr>`;
  });
  document.getElementById('tbl-evol').innerHTML=h+'</tbody>';
}

function moDestroy(){moCh.forEach(c=>c.destroy());moCh=[];}

function moOpen(crime,color) {
  moDestroy();
  document.getElementById('mo-crime').textContent=crime.toUpperCase();
  document.getElementById('mo-accent').style.background=color;
  document.getElementById('mo-sub').textContent='ANÁLISE DETALHADA — '+pLbl(selMeses).toUpperCase();

  const aval=sf(q({crime,mes:selMeses})),meta=sf(q({crime,mes:selMeses}),'meta'),ant=sf(q({crime,mes:selMeses}),'anterior');
  const vp=ant>0?((aval-ant)/ant*100).toFixed(0):0;
  const topM=MUNS.map(m=>({m,v:sf(q({crime,mun:m,mes:selMeses}))})).sort((a,b)=>b.v-a.v)[0];
  const vc=parseFloat(vp)<=0?'var(--green2)':'var(--red2)';
  const mok=meta>0&&aval<=meta;

  document.getElementById('mo-kpis').innerHTML=`
    <div class="mk"><div class="mk-lbl">Total Avaliado</div><div class="mk-val" style="color:${color}">${aval}</div><div class="mk-sub">${pLbl(selMeses)}</div></div>
    <div class="mk"><div class="mk-lbl">Var vs Anterior</div><div class="mk-val" style="color:${vc}">${parseFloat(vp)<=0?'▼':'▲'}${Math.abs(vp)}%</div><div class="mk-sub">Ant: ${ant}</div></div>
    <div class="mk"><div class="mk-lbl">Município Crítico</div><div class="mk-val" style="color:${color};font-size:16px;padding-top:6px">${topM.m}</div><div class="mk-sub">${topM.v} casos</div></div>
    <div class="mk"><div class="mk-lbl">Meta</div><div class="mk-val" style="color:${mok?'var(--green2)':'var(--red2)'};font-size:16px;padding-top:6px">${mok?'✓ Ok':'✗ Acima'}</div><div class="mk-sub">Meta:${meta} | Real:${aval}</div></div>`;

  const munVals=MUNS.map(m=>sf(q({crime,mun:m,mes:selMeses}))),maxV=Math.max(...munVals)||1;
  const ctx1=document.getElementById('mo-bar').getContext('2d');
  moCh.push(new Chart(ctx1,{type:'bar',data:{labels:MUNS.map(m=>m.split(' ')[0]),datasets:[{label:'Avaliado',data:munVals,backgroundColor:munVals.map(v=>v===maxV?color:color+'77'),borderRadius:3}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:GR},y:{grid:GR,beginAtZero:true,ticks:{stepSize:1}}}}}));

  const withOcc=MUNS.map(m=>({m,v:sf(q({crime,mun:m,mes:selMeses}))})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  const lc2=['#c8a84b','#3d7abf','#c84b4b','#3dbf7a','#bf7a3d','#7a4bbf','#4bbfbf','#e06060','#5ae09a'];
  const ctx2=document.getElementById('mo-line').getContext('2d');
  moCh.push(new Chart(ctx2,{type:'line',data:{labels:MESES,datasets:withOcc.map(({m},i)=>({label:m,data:MESES.map(mes=>sf(q({crime,mun:m,mes}))),borderColor:lc2[i%lc2.length],backgroundColor:'transparent',tension:0,pointRadius:5,borderWidth:2,borderDash:i%2===1?[5,3]:[],pointStyle:i%2===1?'triangle':'circle',pointBackgroundColor:lc2[i%lc2.length]}))},options:{responsive:true,plugins:{legend:{labels:{boxWidth:8,padding:8,font:{size:10},usePointStyle:true}}},scales:{x:{grid:GR},y:{grid:GR,beginAtZero:true,ticks:{stepSize:1}}}}}));

  const mm=MUNS.map(m=>sf(q({crime,mun:m,mes:selMeses}),'meta')),ma=MUNS.map(m=>sf(q({crime,mun:m,mes:selMeses})));
  const ctx3=document.getElementById('mo-meta').getContext('2d');
  moCh.push(new Chart(ctx3,{type:'bar',data:{labels:MUNS.map(m=>m.split(' ')[0]),datasets:[{label:'Meta',data:mm,backgroundColor:'rgba(255,255,255,.09)',borderRadius:3},{label:'Avaliado',data:ma,backgroundColor:ma.map((v,i)=>mm[i]>0&&v<=mm[i]?'rgba(61,191,122,.75)':'rgba(200,75,75,.75)'),borderRadius:3}]},options:{responsive:true,plugins:{legend:{labels:{boxWidth:8}}},scales:{x:{grid:GR},y:{grid:GR,beginAtZero:true}}}}));

  const cv=CIAS.map(c=>sf(q({crime,cia:c,mes:selMeses})));
  const ctx4=document.getElementById('mo-donut').getContext('2d');
  moCh.push(new Chart(ctx4,{type:'doughnut',data:{labels:['1ª CIA','2ª CIA','3ª CIA'],datasets:[{data:cv,backgroundColor:['#c8a84b','#3d7abf','#c84b4b'],borderWidth:0,hoverOffset:5}]},options:{responsive:true,cutout:'65%',plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}}}}}));

  const sorted=MUNS.map(m=>{const rows=q({crime,mun:m,mes:selMeses});return {m,cia:rows[0]?.cia||'—',aval:sf(rows),meta:sf(rows,'meta'),ant:sf(rows,'anterior')};}).sort((a,b)=>b.aval-a.aval);
  let tbl='<thead><tr><th>#</th><th>Município</th><th>CIA</th><th>Ant</th><th>Meta</th><th>Aval</th><th>Var%</th><th>Status</th></tr></thead><tbody>';
  sorted.forEach((row,i)=>{
    const vp2=row.ant>0?((row.aval-row.ant)/row.ant*100).toFixed(0):'—';
    const vc2=parseFloat(vp2)>0?'var(--red2)':parseFloat(vp2)<0?'var(--green2)':'var(--tx3)';
    const vt2=vp2!=='—'?(parseFloat(vp2)>0?'▲':'▼')+Math.abs(vp2)+'%':vp2;
    const st=row.meta>0?(row.aval<=row.meta?'✓ Meta':'✗ Acima'):(row.aval===0?'✓ Zero':'Sem Meta');
    const sc=row.meta>0?(row.aval<=row.meta?'var(--green2)':'var(--red2)'):(row.aval===0?'var(--green2)':'var(--tx3)');
    tbl+=`<tr><td style="font-family:'DM Mono',monospace;color:var(--tx3);font-size:10px">${i+1}</td><td style="font-weight:600">${row.m}</td><td style="color:var(--tx3);font-size:11px">${row.cia}</td><td class="num" style="color:var(--tx3)">${row.ant}</td><td class="num">${row.meta||'—'}</td><td class="num" style="font-weight:700;color:${color}">${row.aval}</td><td class="num" style="color:${vc2}">${vt2}</td><td style="font-family:'DM Mono',monospace;font-size:10px;color:${sc}">${st}</td></tr>`;
  });
  document.getElementById('mo-tbl').innerHTML=tbl+'</tbody>';
  document.getElementById('mo').classList.add('on');
  document.body.style.overflow='hidden';
}

function moClickOut(e){if(e.target===document.getElementById('mo'))moClose();}
function moClose(){document.getElementById('mo').classList.remove('on');document.body.style.overflow='';setTimeout(moDestroy,250);}
document.addEventListener('keydown',e=>{if(e.key==='Escape')moClose();});

function goPage(id,btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('on'));
  document.getElementById('page-'+id).classList.add('on');
  btn.classList.add('on');
}

init();
</script>