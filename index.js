// index.js — 读取 GeoJSON 按区域/市区町村/类型过滤
(function () {
  // ------- URL 参数 -------
  const qp = new URLSearchParams(location.search);
  const areaSel = (qp.get("pref")||"").trim();   // 東京都区部 / 多摩地域 / 西多摩郡 / 東京都島嶼部
  const citySel = (qp.get("city")||"").trim();   // 例：新宿区 / 八王子市 …
  const typeSel = (qp.get("type")||"").trim();   // 例：博物館 / 公民館 …

  // ------- 地图 -------
  const map = L.map('map').setView([35.6812, 139.7671], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // ------- 分组表（用来把市区町村归到四大区域）-------
  const ZC = ['千代田区','中央区','港区','新宿区','文京区','台東区','墨田区','江東区','品川区','目黒区','大田区','世田谷区','渋谷区','中野区','杉並区','豊島区','北区','荒川区','板橋区','練馬区','足立区','葛飾区','江戸川区'];
  const TAMA = ['八王子市','立川市','武蔵野市','三鷹市','青梅市','府中市','昭島市','調布市','町田市','小金井市','小平市','日野市','東村山市','国分寺市','国立市','福生市','狛江市','東大和市','清瀬市','東久留米市','武蔵村山市','多摩市','稲城市','羽村市','あきる野市','西東京市'];
  const NISHI = ['瑞穂町','日の出町','檜原村','奥多摩町'];
  const ISLS = ['大島町','利島村','新島村','神津島村','三宅村','御蔵島村','八丈町','青ヶ島村','小笠原村','大島支庁','三宅支庁','八丈支庁','小笠原支庁'];
  const regionOf = (c) => ZC.includes(c) ? '東京都区部' : TAMA.includes(c) ? '多摩地域' : NISHI.includes(c) ? '西多摩郡' : ISLS.includes(c) ? '東京都島嶼部' : '';

  // ------- 类型归一 -------
  function mapUIButtonType(raw, fallback){
    const t = String(raw||"").toLowerCase();
    if (/美術|art/.test(t)) return '美術館';
    if (/図書|library/.test(t)) return '図書館';
    if (/資料/.test(t)) return '資料館';
    if (/博物|museum|科学館|歴史|自然|産業|郷土|考古|民俗|動物園|植物園|文学|人文/.test(t)) return '博物館';
    if (/公民/.test(t)) return '公民館';
    if (/生涯|学習/.test(t)) return '生涯学習センター';
    if (/文化/.test(t)) return '文化センター';
    return fallback || '';
  }
  function iconFor(type){
    const color = type==='美術館' ? '#ee6666'
               : type==='図書館' ? '#5470c6'
               : type==='博物館' ? '#91cc75'
               : type==='資料館' ? '#16a085'
               : type==='公民館' ? '#f39c12'
               : type==='生涯学習センター' ? '#9b59b6'
               : '#73c0de';
    return L.divIcon({ className:'custom-marker',
      html:`<div style="background:${color};width:12px;height:12px;border-radius:50%;
             border:2px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.15);"></div>`,
      iconSize:[16,16], iconAnchor:[8,8] });
  }

  // ------- 从地址里猜市区町村（当数据没有单独列时）-------
  function guessCity(addr){
    const s = String(addr||'').replace(/\s+/g,'');
    const m = s.match(/(.*?(市|区|町|村))/);
    return m ? m[1] : '';
  }

  // ------- 读取你的 GeoJSON 文件（可登记多个）-------
  const DATA_FILES = [
    { url: 'p05_22_13_4326.geojson', typeHint: '' }, // 你已导出的主数据（名称=P05_003, 地址=P05_004）
    // { url: 'P7-13.geojson', typeHint: '博物館' },  // 如有博物館专用数据再打开
  ];

  function fromGeoJSON(gj, typeHint, src){
    if (!gj || !gj.features) return [];
    const arr = [];
    for (const f of gj.features){
      if (!f.geometry || f.geometry.type!=='Point') continue;
      const [lng,lat] = f.geometry.coordinates||[];
      if (!Number.isFinite(lat)||!Number.isFinite(lng)) continue;
      const p = f.properties||{};
      const name = p.P05_003 || p.NAME || p.Name || p.名称 || p['施設名'] || '(名称不明)';
      const addr = p.P05_004 || p.ADDRESS || p.Address || p.住所 || '';
      const city = p.city || p['市区町村'] || p['自治体'] || guessCity(addr);
      const uiTypeRaw = p.TYPE || p['種別'] || p['分類'] || '';
      const uiType = mapUIButtonType(uiTypeRaw, typeHint);
      arr.push({ name:String(name).trim(), addr, city, uiType, lat, lng, __src:src });
    }
    return arr;
  }

  async function loadOne(entry){
    const r = await fetch(entry.url);
    if (!r.ok) throw new Error(entry.url+' fetch failed');
    const gj = await r.json();
    return fromGeoJSON(gj, entry.typeHint, entry.url);
  }

  function render(records){
    // 过滤：四大区域 + 市区町村 + 类型
    const subset = records.filter(r => {
      const okArea = areaSel ? regionOf(r.city) === areaSel : true;
      const okCity = citySel ? r.city === citySel : true;
      const okType = typeSel ? r.uiType === typeSel : true;
      return okArea && okCity && okType;
    });

    const group = L.featureGroup().addTo(map);
    subset.forEach(r=>{
      L.marker([r.lat, r.lng], { icon: iconFor(r.uiType) })
        .bindPopup(`<b>${r.name}</b><br>種別：${r.uiType||''}<br>${r.addr||''}`)
        .addTo(group);
    });

    if (group.getLayers().length){
      map.fitBounds(group.getBounds().pad(0.2));
      if (group.getLayers().length===1) map.setZoom(Math.min(map.getZoom(), 12));
    }else{
      alert('該当する施設が見つかりませんでした。条件を見直してください。');
      map.setView([35.6812,139.7671], 10);
    }
  }

  (async function run(){
    try{
      const datasets = await Promise.all(DATA_FILES.map(loadOne));
      render(datasets.flat());
    }catch(e){
      console.error(e);
      alert('データ読込に失敗しました。ファイル名/パスとHTTPでの起動を確認してください。');
    }
  })();

  // 返回按钮维持你的行为
  document.getElementById('backToSelect')?.addEventListener('click', ()=>{
    try{
      if (document.referrer && /home\.html/.test(document.referrer)) history.back();
      else location.href = 'home.html#card2';
    }catch{ location.href = 'home.html#card2'; }
  });
})();
