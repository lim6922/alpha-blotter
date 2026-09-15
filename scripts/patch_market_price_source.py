from pathlib import Path

path = Path('js/app.js')
text = path.read_text(encoding='utf-8')

start = text.index('async function fetchYahooPrice(ySymbol) {')
end = text.index('\nasync function mapWithConcurrency', start)

replacement = r'''async function fetchYahooPrice(ySymbol) {
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1m&range=1d&_seed=${Date.now()}`;

  const sources = [
    {
      name: "cors.lol",
      url: `https://api.cors.lol/?url=${encodeURIComponent(targetUrl)}`,
      unwrap: (payload) => payload
    },
    {
      name: "allorigins",
      url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
      unwrap: (payload) => JSON.parse(payload?.contents || "{}")
    }
  ];

  for (const source of sources) {
    try {
      const payload = await fetchJsonWithTimeout(source.url);
      const data = source.unwrap(payload);
      const result = data?.chart?.result?.[0];
      const returnedSymbol = result?.meta?.symbol;
      const price = Number(result?.meta?.regularMarketPrice);

      if (returnedSymbol === ySymbol && Number.isFinite(price)) {
        return { price, source: source.name };
      }

      console.warn(`Invalid quote payload from ${source.name} for ${ySymbol}`);
    } catch (error) {
      console.warn(`${source.name} failed for ${ySymbol}:`, error?.name || error);
    }
  }

  return { price: null, source: null };
}
'''

text = text[:start] + replacement + text[end:]

old_mapper = '''        const price = await fetchYahooPrice(master[id].ySymbol);
        completedCount += 1;
        if (syncDisplay) {
          syncDisplay.innerText = `시세 요청 중 (${completedCount}/${assetKeys.length})`;
        }
        return { id, price };'''
new_mapper = '''        const quote = await fetchYahooPrice(master[id].ySymbol);
        completedCount += 1;
        if (syncDisplay) {
          syncDisplay.innerText = `시세 요청 중 (${completedCount}/${assetKeys.length})`;
        }
        return { id, price: quote?.price ?? null, source: quote?.source ?? null };'''
if old_mapper not in text:
    raise SystemExit('sync mapper block not found')
text = text.replace(old_mapper, new_mapper, 1)

old_loop = 'for (const { id, price } of results) {'
new_loop = 'for (const { id, price, source } of results) {'
if old_loop not in text:
    raise SystemExit('result loop not found')
text = text.replace(old_loop, new_loop, 1)

old_success = '''        mtmPrices[`LAST_${id}`] = price;
        htmlBuffer += `<span class="price-tag" style="color:${isFX ? 'var(--warn)' : 'var(--text)'}">${id} ${price.toFixed(2)}</span>`;'''
new_success = '''        mtmPrices[`LAST_${id}`] = price;
        htmlBuffer += `<span class="price-tag" style="color:${isFX ? 'var(--warn)' : 'var(--text)'}" title="시세 출처: ${source || 'unknown'}">${id} ${price.toFixed(2)}</span>`;'''
if old_success not in text:
    raise SystemExit('success render block not found')
text = text.replace(old_success, new_success, 1)

path.write_text(text, encoding='utf-8')
