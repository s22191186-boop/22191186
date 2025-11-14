// index.js — UIカードと選択フォームの制御（固定マッピング＋復元＋パラメータ連結）
document.addEventListener("DOMContentLoaded", function () {
  const card1 = document.getElementById("card1");
  const card2 = document.getElementById("card2");
  const nextBtn = document.getElementById("nextToCard2");
  const backBtn = document.getElementById("backToCard1");
  const form = document.getElementById("searchForm");
  const alertBox = document.getElementById("alertBox");
  const prefSel = document.getElementById("pref");
  const citySel = document.getElementById("city");
  const distSel = document.getElementById("dist"); // 無い場合も想定

  // —— GeoJSON のフィールドに対応（固定マップ）——
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

  // カード切替：デフォルトは card1。URLに #card2 がある時だけ card2 を表示
  function showCard(cardNum) {
    [card1, card2].forEach(c => c.classList.remove("show","slide-up","slide-down"));
    if (cardNum === 1) card1.classList.add("show");
    if (cardNum === 2) card2.classList.add("show");
  }
  // 先に card1 を出す → 明示的に #card2 がある時だけ card2
  showCard(1);
  if (location.hash === "#card2") showCard(2);

  nextBtn.onclick = () => showCard(2);
  backBtn.onclick = () => showCard(1);

  // 施設タイプのボタン：複数選択（最大3つ）
  const MAX_TYPES = 3;
  const typeButtons = Array.from(document.querySelectorAll('.choice-btn'));
  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const already = btn.classList.contains('active');
      if (already) return btn.classList.remove('active');

      const selectedCount = document.querySelectorAll('.choice-btn.active').length;
      if (selectedCount >= MAX_TYPES) {
        alertBox.innerText = `施設の種類は最大 ${MAX_TYPES} つまで選択できます。`;
        alertBox.style.display = 'block';
        setTimeout(() => (alertBox.style.display = 'none'), 1600);
        return;
      }
      btn.classList.add('active');
    });
  });

  // 地域選択 → 市区町村リスト更新
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

  // —— URL / Session から選択状態を復元（※ページは自動で card2 にしない）—— 
  (function restoreSelections(){
    const q = new URLSearchParams(location.search);
    let pref = q.get('pref') || '';
    let city = q.get('city') || '';
    let typeStr = q.get('type') || '';
    let dist = q.get('dist') || '';

    // 兜底：Session
    if (!pref && !city && !typeStr && !dist) {
      try {
        const cached = JSON.parse(sessionStorage.getItem('lastSearch') || 'null');
        if (cached) {
          pref = cached.pref || '';
          city = cached.city || '';
          typeStr = (cached.types || []).join(',');
          dist = cached.dist || '';
        }
      } catch {}
    }

    if (pref) {
      prefSel.value = pref;
      prefSel.dispatchEvent(new Event('change')); // city options を更新
    }
    queueMicrotask(() => {
      if (city) {
        const has = Array.from(citySel.options).some(o => (o.value === city || o.text === city));
        if (has) citySel.value = city;
        citySel.disabled = !has;
      }
    });

    const types = typeStr.split(/[,\u3001]/).map(s=>s.trim()).filter(Boolean);
    if (types.length) {
      document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('active'));
      types.forEach(t => {
        document.querySelector(`.choice-btn[data-type="${t}"]`)?.classList.add('active');
      });
    }

    if (distSel && dist) {
      const has = Array.from(distSel.options).some(o => o.value === dist);
      if (has) distSel.value = dist;
    }

    // ここではページ遷移をしない（card1 のまま）。#card2 が URL にある場合は既に上で表示済み。
  })();

  // 送信：pref + city + type（1～3）、dist（任意）
  form.onsubmit = function (e) {
    e.preventDefault();

    const pref = prefSel.value.trim();
    const city = citySel.value.trim();
    const dist = distSel ? distSel.value.trim() : '';

    const types = Array.from(document.querySelectorAll('.choice-btn.active'))
      .map(b => b.getAttribute('data-type'))
      .filter(Boolean);

    if (!pref || !city || types.length === 0) {
      alertBox.innerText = "都道府県・市区町村・施設種類（1～3つ）を選択してください。";
      alertBox.style.display = "block";
      setTimeout(() => (alertBox.style.display = "none"), 1800);
      return false;
    }

    // Session に保存（戻る時の復元用）
    sessionStorage.setItem('lastSearch', JSON.stringify({ pref, city, types, dist }));

    const params = new URLSearchParams();
    params.set('pref', pref);
    params.set('city', city);
    params.set('type', types.join(','));   // カンマ区切り
    if (dist) params.set('dist', dist);

    // 地図ページへ
    window.location.href = `home.html?${params.toString()}`;
    return false;
  };
});
