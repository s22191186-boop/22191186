// --- Guard: open index.html without query -> go Home (card2) ---
(() => {
  const q = new URLSearchParams(location.search);
  const ok = q.get('pref') && q.get('city') && q.get('type');
  if (!ok) {
    // 作为 GitHub Pages 的默认入口时会走这里
    location.replace('home.html');
  }
})();

// ===== 地图初始化 =====
const map = L.map('map', { preferCanvas: true }).setView([35.6812, 139.7671], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// ===== URL 参数 =====
const qp = new URLSearchParams(location.search);
const areaSel = (qp.get('pref') || '').trim();   // 東京都区部 / 多摩地域 / 西多摩郡 / 東京都島嶼部
const citySel = (qp.get('city') || '').trim();   // 例：大田区 / 世田谷区 …
const typeSel = (qp.get('type') || '').trim();   // 例：美術館 / 博物館 / 図書館 / 資料館 / 公民館 / 生涯学習センター
const distMode = (qp.get('dist') || '').trim();  // '', 'me' | 'nearest' | 'station'
const limit    = +(qp.get('limit') || 50);
const radius   = +(qp.get('r') || 0);            // 米; 0=不限

// ===== 数据文件路径 =====
const DATA_FILES = [
  { url: 'P27-13_1.geojson' },  // 文化施設
  { url: 'P05-22_1.geojson' },  // 公民館・生涯学習センター 等
];

// ===== 字符串规范化（只去空格/全角空格；保持日文）=====
function norm(s){
  return (s==null ? '' : String(s))
    .replace(/　/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// ===== 颜色与图标（按日文 TYPE）=====
function iconFor(type) {
  const t = norm(type);
  const color =
    t === '美術館' ? '#ee6666' :
    t === '図書館' ? '#5470c6' :
    t === '博物館' ? '#91cc75' :
    t === '資料館' ? '#16a085' :
    t === '公民館' ? '#f39c12' :
    t === '生涯学習センター' ? '#a566ff' :
    '#73c0de';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;
            border:2px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.15);"></div>`,
    iconSize: [16,16], iconAnchor: [8,8]
  });
}

// ===== 读取 & 规范化记录 =====
async function loadOne(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('fetch failed: ' + url);
  const gj = await res.json();
  const arr = [];
  for (const f of (gj.features || [])) {
    if (!f.geometry || f.geometry.type !== 'Point') continue;
    const [lng, lat] = f.geometry.coordinates || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const p = f.properties || {};
    const name = p.P27_005 || p.P05_003 || p.NAME || p.Name || p.名称 || '(名称不明)';
    const addr = p.P27_006 || p.P05_004 || p.ADDRESS || p.Address || p.住所 || '';
    const city = p.CITY || p['市区町村'] || p['自治体'] || '';
    const area = p.AREA || '';
    const uiType = (p.TYPE || '').toString().trim(); // TYPE 已在 QGIS 统一为日文

    arr.push({ name: String(name).trim(), addr, city, area, uiType, lat, lng, __src: url });
  }
  return arr;
}

// ===== 距离函数 =====
function haversine(a, b){
  const toRad = d => d*Math.PI/180, R=6371000;
  const dLat = toRad(b.lat-a.lat), dLng = toRad(b.lng-a.lng);
  const s1 = Math.sin(dLat/2), s2 = Math.sin(dLng/2);
  const h = s1*s1 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2;
  return 2*R*Math.asin(Math.sqrt(h));
}

// ===== 渲染 =====
function render(records){
  const group = L.featureGroup().addTo(map);
  records.forEach(r=>{
    const dText = r._d!=null ? `<br>距離：約${Math.round(r._d)} m` : '';
    const sText = r._near ? `<br>最寄駅：${r._near}` : '';
    L.marker([r.lat, r.lng], { icon: iconFor(r.uiType) })
      .bindPopup(`<b>${r.name}</b><br>種別：${r.uiType||''}<br>${r.addr||''}${sText}${dText}`)
      .addTo(group);
  });
  if (group.getLayers().length){
    map.fitBounds(group.getBounds().pad(0.2));
    if (group.getLayers().length === 1) map.setZoom(Math.min(map.getZoom(), 12));
  } else {
    alert('該当する施設が見つかりませんでした。条件を見直してください。');
    map.setView([35.6812,139.7671], 10);
  }
}

// ===== 主流程 =====
(async function main(){
  try{
    // 载入数据
    const datasets = await Promise.all(DATA_FILES.map(x => loadOne(x.url)));
    const all = datasets.flat();

    // // 调试可开启：
    // const uniq = k => [...new Set(all.map(x=>x[k]).filter(Boolean))];
    // console.log('AREA sample:', uniq('area'));
    // console.log('CITY sample:', uniq('city'));
    // console.log('TYPE sample:', uniq('uiType'));

    // 参数规范化
    const areaQ = norm(areaSel);
    const cityQ = norm(citySel);
    const typeQ = norm(typeSel);

    // 基础过滤（精确日文匹配 + 去空格）
    const base = all.filter(r=>{
      const okArea = areaQ ? norm(r.area) === areaQ : true;
      const okCity = cityQ ? norm(r.city) === cityQ : true;
      const okType = typeQ ? norm(r.uiType) === typeQ : true;
      return okArea && okCity && okType;
    });

    if (!base.length) { render(base); return; }

    // 距离模式：我最近
    if (distMode === 'me' || distMode === 'nearest') {
      navigator.geolocation.getCurrentPosition(pos=>{
        const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const ranked = base
          .map(x => ({...x, _d: haversine(me, {lat:x.lat, lng:x.lng})}))
          .sort((a,b)=>a._d-b._d);
        const filtered = radius>0 ? ranked.filter(x=>x._d<=radius) : ranked;
        render(filtered.slice(0, limit));
      }, _ => render(base));
      return;
    }

    // 距离模式：离车站最近（需要 stations_tokyo.geojson）
    if (distMode === 'station') {
      try{
        const st = await fetch('stations_tokyo.geojson');
        if (!st.ok) throw new Error('stations file missing');
        const sj = await st.json();
        const stations = (sj.features||[]).map(f=>{
          const [lng,lat] = f.geometry?.coordinates || [];
          return { lat, lng, name: (f.properties?.name || '').toString() };
        }).filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng));

        const ranked = base.map(x=>{
          let best = { d: Infinity, name: '' };
          for(const s of stations){
            const d = haversine({lat:x.lat,lng:x.lng}, s);
            if (d < best.d) best = { d, name: s.name };
          }
          return {...x, _d: best.d, _near: best.name};
        }).sort((a,b)=>a._d-b._d);

        const filtered = radius>0 ? ranked.filter(x=>x._d<=radius) : ranked;
        render(filtered.slice(0, limit));
      } catch(e){
        console.warn('station mode fallback:', e);
        render(base);
      }
      return;
    }

    // 默认：不按距离
    render(base);

  }catch(err){
    console.error(err);
    alert('この地域には該当施設ありません。');
  }
})();

// 返回按钮（始终回 Home 的筛选卡）
document.getElementById('backToSelect')?.addEventListener('click', () => {
  location.href = 'home.html#card2';
});

