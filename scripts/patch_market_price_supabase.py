from pathlib import Path

path = Path('js/app.js')
text = path.read_text(encoding='utf-8')

start_marker = '''/**
 * =========================
 * Market prices (Yahoo via proxy) - P0 bounded refresh
 * =========================
 */'''
end_marker = '''/**
 * =========================
 * Risk / Margin helpers'''

if start_marker not in text or end_marker not in text:
    raise SystemExit('market price section markers not found')

start = text.index(start_marker)
end = text.index(end_marker, start)

replacement = r'''/**
 * =========================
 * Market prices (Supabase Edge Function gateway)
 * =========================
 */
const MARKET_PRICE_TIMEOUT_MS = 7000;

async function fetchMarketPriceBatch(assetKeys) {
  const symbols = [...new Set(
    assetKeys
      .map(id => master[id]?.ySymbol)
      .filter(Boolean)
  )];

  if (!symbols.length) return {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MARKET_PRICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/market-prices`, {
      method: 'POST',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ symbols })
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch (_) {}
      throw new Error(`Market gateway HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
    }

    const payload = await response.json();
    const quotes = payload?.quotes;

    if (!quotes || typeof quotes !== 'object') {
      throw new Error('Market gateway returned invalid payload');
    }

    return quotes;
  } finally {
    clearTimeout(timer);
  }
}

async function syncMarketPrices() {
  const btn = document.querySelector('button.btn-green[onclick*="syncMarketPrices"]') || document.querySelector('.btn-green');
  const monitor = document.getElementById('fx-monitor');
  const syncDisplay = document.getElementById('sync-time-display');

  if (!btn || !monitor) return;

  btn.innerText = '⏳ 시세 요청 중...';
  btn.disabled = true;

  const assetKeys = Object.keys(master).filter(id => master[id] && master[id].ySymbol);
  let updatedCount = 0;
  let htmlBuffer = '';

  try {
    if (!assetKeys.length) {
      monitor.innerHTML = '<span style="font-size:10px; color:var(--muted);">대상 상품 없음</span>';
      if (syncDisplay) syncDisplay.innerText = '대상 상품 없음';
      return;
    }

    if (syncDisplay) {
      syncDisplay.innerText = `시세 요청 중 (0/${assetKeys.length})`;
    }

    const quotesBySymbol = await fetchMarketPriceBatch(assetKeys);

    for (const id of assetKeys) {
      const m = master[id];
      const quote = quotesBySymbol[m.ySymbol];
      const price = Number(quote?.price);
      const hasPrice = Number.isFinite(price);
      const isFX = id === 'USDKRW' || m.ySymbol === 'KRW=X';

      if (hasPrice) {
        updatedCount += 1;

        if (isFX) {
          globalFX = price;
          localStorage.setItem('blotter_fx_v96', String(globalFX));
        }

        mtmPrices[`LAST_${id}`] = price;
        const cacheLabel = quote?.cached ? ' · cache' : '';
        htmlBuffer += `<span class="price-tag" style="color:${isFX ? 'var(--warn)' : 'var(--text)'}" title="시세 출처: Supabase → Yahoo${cacheLabel}">${id} ${price.toFixed(2)}</span>`;
      } else {
        const prevPrice = Number(mtmPrices[`LAST_${id}`]);
        const hasPrev = Number.isFinite(prevPrice);
        const displayPrice = hasPrev ? prevPrice.toFixed(2) : '---';
        htmlBuffer += `<span class="price-tag" style="color:var(--muted); opacity:0.6;" title="시세 갱신 실패 · 이전값 유지">${id} ${displayPrice}</span>`;
      }

      if (syncDisplay) {
        syncDisplay.innerText = `시세 반영 중 (${updatedCount}/${assetKeys.length})`;
      }
    }

    monitor.innerHTML = htmlBuffer;

    const res = calculateEngine();
    res.openPos.forEach(p => {
      const last = mtmPrices[`LAST_${p.asset}`];
      if (last != null) mtmPrices[p.key] = last;
    });

    localStorage.setItem('blotter_mtm_v96', JSON.stringify(mtmPrices));

    const currentAssetEl = document.getElementById('asset');
    const priceEl = document.getElementById('price');
    const currentAsset = currentAssetEl?.value;
    const currentLast = currentAsset ? mtmPrices[`LAST_${currentAsset}`] : null;
    if (priceEl && currentLast != null) priceEl.value = currentLast;

    const now = new Date().toLocaleTimeString();
    if (syncDisplay) {
      syncDisplay.innerText = updatedCount === assetKeys.length
        ? `전체 갱신: ${now}`
        : updatedCount === 0
          ? `시세 게이트웨이 실패 (0/${assetKeys.length}): ${now}`
          : `일부 갱신 (${updatedCount}/${assetKeys.length}): ${now}`;
    }

    renderAll();
    runCalc();
  } catch (error) {
    console.error('Supabase market price sync failed:', error);

    htmlBuffer = assetKeys.map(id => {
      const prevPrice = Number(mtmPrices[`LAST_${id}`]);
      const displayPrice = Number.isFinite(prevPrice) ? prevPrice.toFixed(2) : '---';
      return `<span class="price-tag" style="color:var(--muted); opacity:0.6;" title="시세 게이트웨이 오류 · 이전값 유지">${id} ${displayPrice}</span>`;
    }).join('');
    monitor.innerHTML = htmlBuffer;

    if (syncDisplay) {
      syncDisplay.innerText = error?.name === 'AbortError'
        ? '시세 게이트웨이 시간초과'
        : '시세 게이트웨이 오류';
    }
  } finally {
    btn.innerText = '🔄 시세 강제 동기화';
    btn.disabled = false;
  }
}

'''

path.write_text(text[:start] + replacement + text[end:], encoding='utf-8')
