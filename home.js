// ===== ガード：必須クエリが無ければ選択ページへ =====
(() => {
  const q = new URLSearchParams(location.search);
  const ok = q.get('pref') && q.get('city') && q.get('type');
  if (!ok) location.replace('index.html#card2');
})();

// ===== Leaflet 基本ベースマップ =====
const map = L.map('map', { preferCanvas: true }).setView([35.6812, 139.7671], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// ===== URL パラメータ =====
const qp       = new URLSearchParams(location.search);
const areaSel  = (qp.get('pref') || '').trim();   // 東京都区部 / 多摩地域 / 西多摩郡 / 東京都島嶼部
const citySel  = (qp.get('city') || '').trim();   // 例：台東区／世田谷区 など
const typeSel  = (qp.get('type') || '')
  .split(/[,\u3001]/).map(s => s.trim()).filter(Boolean);
const selectedTypeSet = new Set(typeSel.map(s => norm(s)));
const distMode = (qp.get('dist') || '').trim();   // '' / 'me' / 'nearest' / 'station'
const limit    = +(qp.get('limit') || 50);
const radius   = +(qp.get('r') || 0);             // 単位：メートル（0＝制限なし）

// ===== データファイル（必要に応じて追加）=====
const DATA_FILES = [
  { url: 'P27-13_1.geojson' }, // 文化施設
  { url: 'P05-22_1.geojson' }, // 公民館・生涯学習センター
];

// ===== ユーティリティ =====
function norm(s){
  return (s == null ? '' : String(s))
    .replace(/　/g, '')       // 全角スペース
    .replace(/\s+/g, '')      // 半角スペース
    .trim();
}
function haversine(a, b){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const TYPE_PIN = {
  '美術館': '#FF375F',
  '図書館': '#007AFF',
  '博物館': '#34C759',
  '資料館': '#0a312f',
  '公民館': '#e68e09',
  '生涯学習センター': '#BF5AF2',
  'スポーツ施設': '#10b981',
  'default': '#306cc7e0'
};
function iconFor(type, size = 32){
  const t = norm(type);
  const color = TYPE_PIN[t] || TYPE_PIN.default;
  const w = size, h = Math.round(size * 1.35), sw = Math.max(2, size * 0.08);
  const path = `
    M ${w/2} ${sw}
    C ${w*0.2} ${h*0.25}, ${w*0.2} ${h*0.6}, ${w/2} ${h - sw}
    C ${w*0.8} ${h*0.6}, ${w*0.8} ${h*0.25}, ${w/2} ${sw} Z
  `;
  const html = `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">
      <path d="${path}" fill="${color}" stroke="white" stroke-width="${sw}"></path>
      <circle cx="${w/2}" cy="${h*0.32}" r="${w*0.18}" fill="rgba(255,255,255,.9)"></circle>
    </svg>`;
  return L.divIcon({ className: 'custom-marker', html, iconSize: [w,h], iconAnchor: [w/2, h - sw/2] });
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
    // 名称／住所（P27/P05/P28 等の一般化）
    const name = p.P27_004 || p.P05_003 || p.P28_003 || p.NAME || p.Name || p.名称 || '(名称不明)';
    const addr = p.P27_005 || p.P05_004 || p.P28_004 || p.ADDRESS || p.Address || p.住所 || '';
    const city = p.CITY || p.City || p['市区町村'] || p['自治体'] || '';
    const area = p.AREA || p.AIRE || p.Area || p.area || '';
    let uiType = (p.TYPE || p.Type || '').toString().trim();
    // 大分類の統合例：031xx → スポーツ施設（不要なら削除可）
    if (/^031\d{2}$/.test(String(p.P27_003 || p.P28_002 || '')) || /^スポーツ/.test(uiType)) {
      uiType = 'スポーツ施設';
    }
    arr.push({ name: String(name).trim(), addr, city, area, uiType, lat, lng, __src: url });
  }
  return arr;
}
async function loadAll(){
  const chunks = await Promise.all(DATA_FILES.map(d => loadOne(d.url)));
  return chunks.flat();
}

// ===== 描画 =====
const layerGroup = L.layerGroup().addTo(map);
function fmtMeters(m){
  return (m >= 1000) ? `約${(m/1000).toFixed(1)}km` : `約${Math.round(m)}m`;
}
function render(list){
  layerGroup.clearLayers();
  if (!list.length) {
    alert('該当する施設が見つかりませんでした。条件を見直してください。');
    return;
  }
  list.forEach(r=>{
    const m = L.marker([r.lat, r.lng], { icon: iconFor(r.uiType) });
    // 駅/現在地 いずれも距離表示（無距離は非表示）
    const dline = Number.isFinite(r._d)
      ? (distMode === 'station'
          ? `<div>最寄駅：${r._near || '不明'}（${fmtMeters(r._d)}）</div>`
          : (distMode === 'me' || distMode === 'nearest'
              ? `<div>現在地から：${fmtMeters(r._d)}</div>`
              : ''))
      : '';

    m.bindPopup(`
      <div style="min-width:240px">
        <div style="font-weight:700;margin-bottom:4px">${escapeHtml(r.name)}</div>
        <div>${escapeHtml(r.addr || '')}</div>
        <div>${escapeHtml(r.city || '')}／${escapeHtml(r.area || '')}</div>
        <div>種類：${escapeHtml(r.uiType || '')}</div>
        ${dline}
      </div>
    `);
    layerGroup.addLayer(m);
  });
  const g = L.featureGroup(list.map(r=>L.marker([r.lat,r.lng])));
  try{ map.fitBounds(g.getBounds().pad(0.2)); }catch(_){}
}

// ===== 最寄駅モード：駅データ（KSJ N02）=====
async function nearestStationMode(base){
  const stRes = await fetch('N02-24_Station.geojson');  // 駅データ
  if (!stRes.ok) throw new Error('fetch failed: N02-24_Station.geojson');
  const sj = await stRes.json();
  const stations = (sj.features || []).map(f=>{
    const [lng,lat] = f.geometry?.coordinates || [];
    const p = f.properties || {};
    const nm = p.N02_005 || p.N02_003 || p.N02_002 || p.name || '';
    return { lat, lng, name: String(nm||'') };
  }).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  const ranked = base.map(x=>{
    let best = { d: Infinity, name: '' };
    for (const s of stations){
      const d = haversine({lat:x.lat,lng:x.lng}, {lat:s.lat,lng:s.lng});
      if (d < best.d) best = { d, name: s.name };
    }
    return {...x, _d: best.d, _near: best.name};
  }).sort((a,b)=>a._d - b._d);

  const filtered = radius>0 ? ranked.filter(x=>x._d<=radius) : ranked;
  render(filtered.slice(0, limit));
}

// ===== メイン処理 =====
(async function main(){
  try{
    const all = await loadAll();

    // クエリの正規化
    const areaQ = norm(areaSel);
    const cityQ = norm(citySel);

    // 基本フィルタ（完全一致。空欄は通過）
    const base = all.filter(r=>{
      const okArea = areaQ ? norm(r.area) === areaQ : true;
      const okCity = cityQ ? norm(r.city) === cityQ : true;
      const okType = selectedTypeSet.size ? selectedTypeSet.has(norm(r.uiType)) : true;
      return okArea && okCity && okType;
    });

    if (!base.length) { render(base); return; }

    // 距離：現在地（nearest 同義）
    if (distMode === 'me' || distMode === 'nearest') {
      navigator.geolocation.getCurrentPosition(pos=>{
        const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const ranked = base
          .map(x => ({...x, _d: haversine(me, {lat:x.lat, lng:x.lng})}))
          .sort((a,b)=>a._d-b._d);
        const filtered = radius>0 ? ranked.filter(x=>x._d<=radius) : ranked;
        render(filtered.slice(0, limit));
      }, _ => render(base), { enableHighAccuracy:true, timeout:10000, maximumAge:60000 });
      return;
    }

    // 距離：最寄駅
    if (distMode === 'station') {
      await nearestStationMode(base);
      return;
    }

    // デフォルト：距離指定なし
    render(base);

  }catch(err){
    console.error(err);
    alert('この地域には該当施設ありません。');
  }
})();

// ===== 戻るボタン（クエリ付きで戻る）=====
document.getElementById('backToSelect')?.addEventListener('click', () => {
  const qs = new URLSearchParams(location.search).toString();
  location.href = `index.html${qs ? `?${qs}` : ''}#card2`;
});

// ===== HTML エスケープ（XSS 対策）=====
function escapeHtml(s){
  return String(s||'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
