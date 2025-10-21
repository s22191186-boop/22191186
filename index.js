// home.js — 简化为“固定映射 + 与 index.js 一致的参数拼接”
document.addEventListener("DOMContentLoaded", function () {
  const card1 = document.getElementById("card1");
  const card2 = document.getElementById("card2");
  const nextBtn = document.getElementById("nextToCard2");
  const backBtn = document.getElementById("backToCard1");
  const form = document.getElementById("searchForm");
  const alertBox = document.getElementById("alertBox");
  const prefSel = document.getElementById("pref");
  const citySel = document.getElementById("city");
  const distSel = document.getElementById("dist"); // 可能不存在，下面会做兼容

  // —— 与 index.js 中 GeoJSON 的字段对应 —— 
  // area（地域）只允许下列四类，city（市区町村）对应真实行政区
  const PREF_CITY = {
    "東京都区部": [
      "千代田区","中央区","港区","新宿区","文京区","台東区","墨田区","江東区",
      "品川区","目黒区","大田区","世田谷区","渋谷区","中野区","杉並区","豊島区",
      "北区","荒川区","板橋区","練馬区","足立区","葛飾区","江戸川区"
    ],
    "多摩地域": [
      "八王子市","立川市","武蔵野市","三鷹市","青梅市","府中市","昭島市","調布市",
      "町田市","小金井市","小平市","日野市","東村山市","国分寺市","国立市","福生市",
      "狛江市","東大和市","清瀬市","東久留米市","武蔵村山市","多摩市","稲城市",
      "羽村市","あきる野市","西東京市"
    ],
    "西多摩郡": ["瑞穂町","日の出町","檜原村","奥多摩町"],
    "東京都島嶼部": ["大島町","利島村","新島村","神津島村","三宅村","御蔵島村","八丈町","青ヶ島村","小笠原村"]
  };

  // 卡片切换（锚点直达 card2）
  function showCard(cardNum) {
    [card1, card2].forEach(c => c.classList.remove("show","slide-up","slide-down"));
    if (cardNum === 1) card1.classList.add("show");
    if (cardNum === 2) card2.classList.add("show");
  }
  nextBtn.onclick = () => showCard(2);
  backBtn.onclick = () => showCard(1);
  if (location.hash === "#card2") showCard(2);

// 设施类型按钮：多选（最多3个）
const MAX_TYPES = 3;
const typeButtons = Array.from(document.querySelectorAll('.choice-btn'));
typeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const already = btn.classList.contains('active');
    if (already) {
      btn.classList.remove('active');
      return;
    }
    const selectedCount = document.querySelectorAll('.choice-btn.active').length;
    if (selectedCount >= MAX_TYPES) {
      const alertBox = document.getElementById('alertBox');
      if (alertBox) {
        alertBox.innerText = `施設の種類は最大 ${MAX_TYPES} つまで選択できます。`;
        alertBox.style.display = 'block';
        setTimeout(() => (alertBox.style.display = 'none'), 1600);
      }
      return;
    }
    btn.classList.add('active');
  });
});


  // 选择地域 -> 刷新市区町村（固定映射）
  prefSel.addEventListener('change', () => {
    const pref = prefSel.value;
    const cities = PREF_CITY[pref] || [];
    if (!pref || !cities.length) {
      citySel.disabled = true;
      citySel.innerHTML = `<option value="">（選択可能な市区町村がありません）</option>`;
      return;
    }
    citySel.disabled = false;
    citySel.innerHTML = [`<option value="">選択してください</option>`]
      .concat(cities.map(c => `<option>${c}</option>`))
      .join('');
  });

  // 提交跳转：pref + city + type 必选；dist 可选（不存在也OK）
  form.onsubmit = function (e) {
    e.preventDefault();
    const pref = prefSel.value.trim();
    const city = citySel.value.trim();
    const typeBtn = document.querySelector(".choice-btn.active");
    const type = typeBtn ? typeBtn.getAttribute('data-type') : '';
    const dist = distSel ? distSel.value.trim() : ''; // ← 兼容没有 dist 的情况

    if (!pref || !city || !type) {
      alertBox.innerText = "都道府県・市区町村・施設種類 を選択してください。";
      alertBox.style.display = "block";
      setTimeout(() => alertBox.style.display = "none", 1800);
      return false;
    }

    const params = new URLSearchParams({ pref, city, type });
    if (dist) params.set('dist', dist); // 仅当选择了“私より近い”等时才带上
    window.location.href = `home.html?${params.toString()}`;
    return false;
  };
});
