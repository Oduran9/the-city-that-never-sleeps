// Core state, 311 queries, and the interactive skyline.
const API_URL = 'https://data.cityofnewyork.us/resource/erm2-nwe9.json';
const BOROUGHS = ['MANHATTAN','BROOKLYN','QUEENS','BRONX','STATEN ISLAND'];
const BOROUGH_NAMES = {ALL:'All NYC',MANHATTAN:'Manhattan',BROOKLYN:'Brooklyn',QUEENS:'Queens',BRONX:'The Bronx','STATEN ISLAND':'Staten Island'};
const state = {borough:'ALL',days:30,hour:22};
let totals = [], skylineController, skylineChart;
const formatHour = h => new Date(2026,0,1,h).toLocaleTimeString('en-US',{hour:'numeric',hour12:true});
const isoDay = d => d.toISOString().slice(0,10);
function getDateRange() {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part = n => Number(parts.find(p=>p.type===n).value);
  const end = new Date(Date.UTC(part('year'),part('month')-1,part('day')));
  const start = new Date(end); start.setUTCDate(start.getUTCDate()-state.days);
  return {start:isoDay(start),end:isoDay(end)};
}
function whereNoise(range=getDateRange()) {
  return `created_date >= '${range.start}T00:00:00' AND created_date < '${range.end}T00:00:00' AND complaint_type like 'Noise%' AND borough in (${BOROUGHS.map(b=>`'${b}'`).join(',')})`;
}
function buildURL(params) {
  const url = new URL(API_URL);
  for (const [key,val] of Object.entries(params)) url.searchParams.set(key,val);
  return url;
}
async function query311(params,signal) {
  const response = await fetch(buildURL(params),{signal});
  if (!response.ok) throw new Error(`NYC 311 API returned HTTP ${response.status}: ${(await response.text()).slice(0,250)}`);
  return response.json();
}
function broadcast() {window.dispatchEvent(new CustomEvent('nyc:filters-changed',{detail:{...state}}));}
window.NYCStory = {getState:()=>({...state,range:getDateRange()}),whereNoise,query311,formatHour,BOROUGHS,BOROUGH_NAMES};
function hourlyData(){
  const arr=Array.from({length:24},(_,hour)=>({hour,total:0}));
  totals.forEach(r=>{if(state.borough==='ALL'||r.borough===state.borough) if(Number.isInteger(r.hour)&&r.hour>=0&&r.hour<24)arr[r.hour].total+=r.total;});
  return arr;
}
async function loadSkyline() {
  skylineController?.abort();const controller=new AbortController();skylineController=controller;
  document.getElementById('status').textContent=`Loading ${state.days} completed days of NYC noise complaints…`;
  const range=getDateRange();
  try {
    const result=await query311({
      '$select':'borough, date_extract_hh(created_date) as hour, count(*) as total',
      '$where':whereNoise(range),
      '$group':'borough, date_extract_hh(created_date)',
      '$order':'borough ASC, hour ASC',
      '$limit':'200'
    },controller.signal);
    if(skylineController!==controller)return;
    totals=result.map(r=>({borough:r.borough,hour:Number(r.hour),total:Number(r.total)}));
    if(!totals.length)throw new Error('No records returned in selected period');
    const last=new Date(range.end+'T00:00:00Z');last.setUTCDate(last.getUTCDate()-1);
    document.getElementById('status').textContent=`Reporting period: ${range.start} through ${isoDay(last)} (${state.days} completed days)`;
    renderSkyline();
  }catch(error){if(error.name==='AbortError')return;console.error(error);document.getElementById('status').textContent=`Unable to load skyline: ${error.message}`;}
}
function renderSkyline(){
  if(!totals.length)return;
  const data=hourlyData();const count=d3.sum(data,d=>d.total);
  const peak=data.reduce((a,b)=>b.total>a.total?b:a,data[0]);
  document.getElementById('selected-borough').textContent=BOROUGH_NAMES[state.borough];
  document.getElementById('total-complaints').textContent=count.toLocaleString();
  document.getElementById('peak-hour').textContent=count?formatHour(peak.hour):'—';
  if(!skylineChart)skylineChart=createSkyline();
  skylineChart.update(data);updateHour(data);
}
function updateHour(data=hourlyData()){
  document.getElementById('hour-label').textContent=formatHour(state.hour);
  document.getElementById('time-slider').value=state.hour;
  document.getElementById('chart-detail').textContent=`${BOROUGH_NAMES[state.borough]} · ${formatHour(state.hour)} · ${data[state.hour].total.toLocaleString()} reports during the selected period`;
  skylineChart?.highlight(state.hour);
}
function createSkyline(){
  const width=1000,height=440,margin={top:44,right:20,bottom:55,left:75},bottom=height-margin.bottom;
  const svg=d3.select('#noise-chart').append('svg').attr('viewBox',`0 0 ${width} ${height}`).attr('role','img').attr('aria-label','Skyline representing NYC noise reports by hour');
  const x=d3.scaleBand().domain(d3.range(24)).range([margin.left,width-margin.right]).padding(.12);
  const y=d3.scaleLinear().range([bottom,margin.top]);
  const grid=svg.append('g'),buildingLayer=svg.append('g'),axis=svg.append('g').attr('class','axis').attr('transform',`translate(${margin.left},0)`);
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${bottom})`).call(d3.axisBottom(x).tickValues([0,3,6,9,12,15,18,21]).tickFormat(formatHour));
  svg.append('text').attr('x',15).attr('y',20).attr('fill','#a5b3c8').attr('font-size',13).text('Noise reports');
  let revision=0;
  function roof(d){if(!d.total)return '';const w=x.bandwidth(),top=y(d.total),i=d.hour;
    if(i%4===0)return `M0 ${top} L${w/2} ${top-9} L${w} ${top}Z`;
    if(i%4===1)return `M${w*.25} ${top} L${w*.25} ${top-9} L${w*.75} ${top-9} L${w*.75} ${top}Z`;
    if(i%4===2)return `M${w/2-1} ${top} L${w/2-1} ${top-15} L${w/2+1} ${top-15} L${w/2+1} ${top}Z`;
    return '';
  }
  function windows(el,d){const g=d3.select(el);g.selectAll('*').remove();const h=bottom-y(d.total),w=x.bandwidth();
    const rows=Math.max(0,Math.floor((h-10)/13)),cols=Math.max(1,Math.floor((w-8)/9));
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const lit=(r*7+c*11+d.hour*3)%5!==0;
      g.append('rect').attr('x',5+c*9).attr('y',y(d.total)+10+r*13).attr('width',3.5).attr('height',5).attr('fill',lit?'#e6bb78':'#182a43').attr('opacity',lit?.75:.6);
    }
  }
  function highlight(hour){buildingLayer.selectAll('.building-body,.building-roof').attr('fill',d=>d.hour===hour?'#efaa55':'#344e73');}
  function choose(d){state.hour=d.hour;updateHour();broadcast();}
  function update(data){revision++;const version=revision;y.domain([0,d3.max(data,d=>d.total)||1]).nice();
    grid.selectAll('line').data(y.ticks(5)).join('line').attr('stroke','#344158').attr('stroke-opacity',.5).attr('x1',margin.left).attr('x2',width-margin.right).attr('y1',d=>y(d)).attr('y2',d=>y(d));
    axis.call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('~s')));
    const buildings=buildingLayer.selectAll('.building').data(data,d=>d.hour).join(enter=>{
      const group=enter.append('g').attr('class','building').attr('transform',d=>`translate(${x(d.hour)},0)`).attr('tabindex',0).attr('role','button');
      group.append('rect').attr('class','building-body').attr('width',x.bandwidth()).attr('y',bottom).attr('height',0);
      group.append('path').attr('class','building-roof');group.append('g').attr('class','building-windows');return group;
    });
    buildings.attr('aria-label',d=>`${formatHour(d.hour)}: ${d.total.toLocaleString()} complaints`);
    buildings.select('.building-body').interrupt().transition().duration(650).attr('y',d=>y(d.total)).attr('height',d=>bottom-y(d.total));
    buildings.select('.building-roof').interrupt().transition().duration(650).attr('d',roof);
    buildings.select('.building-windows').interrupt().attr('opacity',0);
    setTimeout(()=>{if(version!==revision)return;buildings.select('.building-windows').each(function(d){windows(this,d)}).transition().duration(250).attr('opacity',1)},700);
    buildings.on('click',(_,d)=>choose(d)).on('mouseover',(_,d)=>choose(d)).on('keydown',(event,d)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(d)}});
    highlight(state.hour);
  }
  return {update,highlight};
}
document.querySelectorAll('.borough-btn').forEach(button=>button.addEventListener('click',()=>{
  state.borough=button.dataset.borough;document.querySelectorAll('.borough-btn').forEach(b=>b.classList.toggle('active',b===button));renderSkyline();broadcast();
}));
document.querySelectorAll('.period-btn').forEach(button=>button.addEventListener('click',()=>{
  state.days=Number(button.dataset.days);document.querySelectorAll('.period-btn').forEach(b=>b.classList.toggle('active',b===button));
  broadcast();loadSkyline();
}));
document.getElementById('time-slider').addEventListener('input',event=>{state.hour=Number(event.target.value);updateHour();broadcast();});
loadSkyline();
