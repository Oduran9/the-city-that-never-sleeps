// Maps a limited sample of geolocated NYC 311 reports
const MAP_AREAS={ALL:{name:'All NYC',center:[40.7128,-74.006],zoom:10},MANHATTAN:{name:'Manhattan',center:[40.7831,-73.9712],zoom:12},BROOKLYN:{name:'Brooklyn',center:[40.6782,-73.9442],zoom:12},QUEENS:{name:'Queens',center:[40.7282,-73.7949],zoom:11},BRONX:{name:'The Bronx',center:[40.8448,-73.8648],zoom:12},'STATEN ISLAND':{name:'Staten Island',center:[40.5795,-74.1502],zoom:12}};
const nycMap=L.map('nyc-map',{scrollWheelZoom:false}).setView(MAP_AREAS.ALL.center,MAP_AREAS.ALL.zoom);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(nycMap);
const noiseMarkers=L.layerGroup().addTo(nycMap);
let mapController,mapTimer,lastBorough='ALL';
function mapHeading(){const s=window.NYCStory.getState();document.getElementById('map-selection').textContent=`${MAP_AREAS[s.borough].name} / ${s.days} days / ${formatHour(s.hour)}`;}
function mapWhere(s){let condition=whereNoise(s.range)+` AND date_extract_hh(created_date) = ${s.hour} AND latitude IS NOT NULL AND longitude IS NOT NULL`;if(s.borough!=='ALL')condition+=` AND borough = '${s.borough}'`;return condition;}
function addMarker(row){const lat=Number(row.latitude),lon=Number(row.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<40.45||lat>40.95||lon< -74.30||lon> -73.65)return false;
  const marker=L.circleMarker([lat,lon],{radius:8,color:'#fff',weight:2.5,opacity:1,fillColor:'#e63946',fillOpacity:1});
  const popup=document.createElement('div');const heading=document.createElement('strong');heading.textContent=row.complaint_type||'Noise complaint';
  const details=document.createElement('p');details.textContent=`${row.borough||'Unknown borough'} · ${(row.created_date||'Unknown date').replace('T',' ')}`;
  const desc=document.createElement('p');desc.textContent=row.descriptor||'';popup.append(heading,details,desc);marker.bindPopup(popup).addTo(noiseMarkers);return true;
}
async function loadMap(){const s=window.NYCStory.getState();mapHeading();mapController?.abort();const controller=new AbortController();mapController=controller;
  const status=document.getElementById('map-status');status.textContent='Loading map locations…';
  try{
    const records=await query311({'$select':'created_date,complaint_type,descriptor,borough,latitude,longitude','$where':mapWhere(s),'$order':'created_date DESC','$limit':'300'},controller.signal);
    if(mapController!==controller)return;
    noiseMarkers.clearLayers();let plotted=0;records.forEach(r=>{if(addMarker(r))plotted++});
    if(s.borough!==lastBorough){const area=MAP_AREAS[s.borough];nycMap.flyTo(area.center,area.zoom,{duration:.65});lastBorough=s.borough;}
    status.textContent=`${plotted.toLocaleString()} recent matching locations shown (maximum 300; not all complaints).`;
    nycMap.invalidateSize();
  }catch(e){if(e.name==='AbortError')return;console.error(e);status.textContent=`Map error: ${e.message}`;}
}
function scheduleMap(){mapHeading();clearTimeout(mapTimer);mapController?.abort();mapTimer=setTimeout(loadMap,500)}
window.addEventListener('nyc:filters-changed',scheduleMap);
document.getElementById('reset-map').addEventListener('click',()=>nycMap.flyTo(MAP_AREAS.ALL.center,MAP_AREAS.ALL.zoom,{duration:.65}));
loadMap();