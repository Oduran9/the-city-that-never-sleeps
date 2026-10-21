// Chapters 03 and 04: weekday/weekend reporting rates and noise categories.
// Both sections use the same period and borough as the skyline.
let storyController, storyTimer, dailyRows=[], categoryRows=[];
const fmt = n => Math.round(n).toLocaleString('en-US');
function calendarCounts(range){
  let weekday=0,weekend=0;
  for(let t=new Date(range.start+'T00:00:00Z');t<new Date(range.end+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+1)){
    if([0,6].includes(t.getUTCDay()))weekend++;else weekday++;
  }
  return {weekday,weekend};
}
function drawWeek(){
  const s=window.NYCStory.getState();if(!dailyRows.length)return;
  const count=calendarCounts(s.range);let weekdayTotal=0,weekendTotal=0;
  dailyRows.forEach(r=>{
    if(s.borough!=='ALL'&&r.borough!==s.borough)return;
    const day=new Date(r.day.slice(0,10)+'T00:00:00Z').getUTCDay();
    if([0,6].includes(day))weekendTotal+=r.total;else weekdayTotal+=r.total;
  });
  const weekdayAvg=weekdayTotal/count.weekday,weekendAvg=weekendTotal/count.weekend;
  const maximum=Math.max(weekdayAvg,weekendAvg,1);
  const root=document.getElementById('week-chart');root.replaceChildren();
  const legend=document.createElement('div');legend.className='week-legend';legend.textContent=`${count.weekday} weekdays and ${count.weekend} weekend days included`;
  root.appendChild(legend);
  function bar(label,n,kind){const row=document.createElement('div');row.className='week-row';
    const heading=document.createElement('div');heading.className='week-heading';
    const title=document.createElement('strong');title.textContent=label;
    const value=document.createElement('span');value.textContent=`${fmt(n)} complaints / day`;
    heading.append(title,value);
    const track=document.createElement('div');track.className='track';
    const fill=document.createElement('div');fill.className=`fill ${kind}`;fill.style.width=`${n/maximum*100}%`;
    track.appendChild(fill);row.append(heading,track);root.appendChild(row);
  }
  bar('Weekdays · Monday–Friday',weekdayAvg,'weekday');bar('Weekends · Saturday–Sunday',weekendAvg,'weekend');
  const place=BOROUGH_NAMES[s.borough];let message;
  if(weekdayAvg===0&&weekendAvg===0)message=`No matching reports for ${place}.`;
  else if(weekdayAvg===0)message=`${place} has no weekday reports in this period; a percentage change cannot be calculated.`;
  else{const diff=100*(weekendAvg-weekdayAvg)/weekdayAvg;
    message=Math.abs(diff)<.05?`${place}: weekday and weekend daily complaint averages are almost identical.`:
      `${place}: the average weekend day has ${Math.abs(diff).toFixed(1)}% ${diff>0?'more':'fewer'} reported noise complaints than the average weekday.`;
  }
  document.getElementById('week-insight').textContent=message;
}
function drawCategories(){
  if(!categoryRows.length)return;
  const s=window.NYCStory.getState();const totals=new Map();
  for(const row of categoryRows){if(s.borough!=='ALL'&&row.borough!==s.borough)continue;totals.set(row.type,(totals.get(row.type)||0)+row.total)}
  const rows=[...totals.entries()].map(([type,total])=>({type,total})).sort((a,b)=>b.total-a.total).slice(0,8);
  const root=document.getElementById('category-chart');root.replaceChildren();
  const maximum=Math.max(rows[0]?.total||0,1);
  for(const row of rows){const outer=document.createElement('div');outer.className='category-row';
    const head=document.createElement('div');head.className='category-head';const title=document.createElement('span');title.textContent=row.type;const val=document.createElement('span');val.textContent=`${row.total.toLocaleString()} reports`;head.append(title,val);
    const track=document.createElement('div');track.className='category-track';const fill=document.createElement('div');fill.className='category-fill';fill.style.width=`${row.total/maximum*100}%`;track.appendChild(fill);outer.append(head,track);root.appendChild(outer);
  }
  const leader=rows[0];document.getElementById('category-insight').textContent=leader?`${BOROUGH_NAMES[s.borough]}: “${leader.type}” is the most reported noise category in this selected period (${leader.total.toLocaleString()} requests).`:'No complaint categories found.';
}
async function loadStoryData(){
  storyController?.abort();const controller=new AbortController();storyController=controller;
  dailyRows=[];categoryRows=[];
  document.getElementById('week-status').textContent='Calculating weekday and weekend averages…';
  document.getElementById('category-status').textContent='Loading complaint categories…';
  const where=whereNoise();
  const queries=[
    query311({'$select':'borough, date_trunc_ymd(created_date) as day, count(*) as total','$where':where,'$group':'borough, date_trunc_ymd(created_date)','$limit':'2500'},controller.signal),
    query311({'$select':'borough, complaint_type as type, count(*) as total','$where':where,'$group':'borough, complaint_type','$limit':'1000'},controller.signal)
  ];
  const results=await Promise.allSettled(queries);if(storyController!==controller)return;
  if(results[0].status==='fulfilled'){
    dailyRows=results[0].value.map(r=>({borough:r.borough,day:r.day,total:Number(r.total)}));
    document.getElementById('week-status').textContent='Daily comparison loaded from NYC 311';drawWeek();
  }else if(results[0].reason.name!=='AbortError'){
    console.error('Daily 311 query',results[0].reason);
    document.getElementById('week-status').textContent=`Couldn't load daily comparison: ${results[0].reason.message}`;
  }
  if(results[1].status==='fulfilled'){
    categoryRows=results[1].value.map(r=>({borough:r.borough,type:r.type||'Unspecified',total:Number(r.total)}));
    document.getElementById('category-status').textContent='Complaint categories loaded from NYC 311';drawCategories();
  }else if(results[1].reason.name!=='AbortError'){
    console.error('Category 311 query',results[1].reason);
    document.getElementById('category-status').textContent=`Couldn't load categories: ${results[1].reason.message}`;
  }
}
let previousDays=window.NYCStory.getState().days;
window.addEventListener('nyc:filters-changed',()=>{
  const s=window.NYCStory.getState();
  if(s.days!==previousDays){previousDays=s.days;clearTimeout(storyTimer);storyController?.abort();storyTimer=setTimeout(loadStoryData,350);}
  else{drawWeek();drawCategories();}
});
loadStoryData();
