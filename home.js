// page3.js — 直接读取 Excel 作为数据源
document.addEventListener("DOMContentLoaded", function () {
  const XLSX_PATH = "MuseumList_20250905.xlsx"; // 确保与页面同目录
  const card1 = document.getElementById("card1");
  const card2 = document.getElementById("card2");
  const nextBtn = document.getElementById("nextToCard2");
  const backBtn = document.getElementById("backToCard1");
  const form = document.getElementById("searchForm");
  const alertBox = document.getElementById("alertBox");
  const prefSel = document.getElementById("pref");
  const citySel = document.getElementById("city");
  const distSel = document.getElementById("dist");

  // 你提供的覆盖表（保持顺序，优先使用）
  const PREF_CITY_OVERRIDES = {
    "東京都区部": ["千代田区","中央区","新宿区","文京区","台東区","墨田区","江東区","品川区","目黒区","大田区","世田谷区","渋谷区","中野区","杉並区","豊島区","北区","荒川区","板橋区","練馬区","足立区","葛飾区","江戸川区","八王子市","立川市","武蔵野市","三鷹市","昭島市","町田市","小金井市","小平市","国分寺市","狛江市","清瀬市","東久留米市","羽村市","西東京市"],
    "多摩地域": ["八王子市","立川市","武蔵野市","三鷹市","青梅市","府中市","昭島市","調布市","町田市","小金井市","小平市","日野市","東村山市","国分寺市","国立市","福生市","狛江市","東大和市","清瀬市","東久留米市","武蔵村山市","多摩市","稲城市","羽村市","あきる野市","西東京市"],
    "西多摩郡": ["瑞穂町","日の出町","檜原村","奥多摩町"],
    "東京都島嶼部": ["大島町","利島村","新島村","神津島村","三宅村","御蔵島村","八丈町","青ヶ島村","小笠原村"]
  };

  // 卡片切换
  function showCard(cardNum) {
    [card1, card2].forEach(c => c.classList.remove("show","slide-up","slide-down"));
    if (cardNum === 1) card1.classList.add("show");
    if (cardNum === 2) card2.classList.add("show");
  }
  nextBtn.onclick = () => showCard(2);
  backBtn.onclick = () => showCard(1);
  if (location.hash === "#card2") showCard(2);

  // 类型按钮激活态
  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.onclick = function () {
      document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  // 读取 Excel → 动态补充城市（未在覆盖表的都道府県）
  let prefToCities = {};
  (async function loadExcel() {
    try {
      const buf = await fetch(XLSX_PATH).then(r => r.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array" });

      const map = {};
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (!rows.length) continue;

        // 识别表头（最好包含 名称/都道府県/市区町村/館種/公式HP）
        const headerIdx = rows.findIndex(r => r.some(x => String(x).includes("都道府県")));
        const start = headerIdx >= 0 ? headerIdx + 1 : 1;

        for (let i = start; i < rows.length; i++) {
          const r = rows[i];
          // 依据你文件的列序：名称 都道府県 市区町村 登録状況 設置者 館種 公式HP
          const pref = String(r[1] || "").trim();
          const city = String(r[2] || "").trim();
          if (!pref || !city) continue;
          if (!map[pref]) map[pref] = new Set();
          map[pref].add(city);
        }
      }

      // 转数组 & 排序
      for (const k in map) {
        map[k] = Array.from(map[k]).sort((a,b)=>a.localeCompare(b,'ja'));
      }
      // 合并覆盖表（覆盖并保留顺序）
      for (const [pref, list] of Object.entries(PREF_CITY_OVERRIDES)) {
        map[pref] = [...list];
      }
      prefToCities = map;
    } catch (e) {
      console.error("Excel 読み込み失敗:", e);
      prefToCities = {};
    }
  })();

  // 选择都道府県 → 刷新市区町村
  prefSel.addEventListener('change', () => {
    const pref = prefSel.value;
    citySel.innerHTML = '';
    const cities = (PREF_CITY_OVERRIDES[pref] && PREF_CITY_OVERRIDES[pref].length)
      ? PREF_CITY_OVERRIDES[pref]
      : (prefToCities[pref] || []);
    if (!pref || !cities.length) {
      citySel.disabled = true;
      citySel.innerHTML = `<option value="">（選択可能な市区町村がありません）</option>`;
      return;
    }
    citySel.disabled = false;
    const opts = [`<option value="">選択してください</option>`]
      .concat(cities.map(c => `<option>${c}</option>`));
    citySel.innerHTML = opts.join('');
  });

  // 提交跳转：pref + city + type 必选；dist 可选
  form.onsubmit = function (e) {
    e.preventDefault();
    const pref = prefSel.value;
    const city = citySel.value;
    const dist = distSel.value;
    const typeBtn = document.querySelector(".choice-btn.active");
    const type = typeBtn ? typeBtn.getAttribute('data-type') : '';
    if (!pref || !city || !type) {
      alertBox.innerText = "都道府県・市区町村・施設種類 を選択してください。";
      alertBox.style.display = "block";
      setTimeout(() => alertBox.style.display = "none", 1800);
      return false;
    }
    const params = new URLSearchParams({ pref, city, type, ...(dist ? {dist} : {}) });
    window.location.href = `index.html?${params.toString()}`;
    return false;
  };
});
