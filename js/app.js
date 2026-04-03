// =========================
// Sync Meta (Local/Input 기준)
// =========================
let blotterMeta = JSON.parse(localStorage.getItem('blotter_meta_v96')) || {
  lastLocalInputAt: null,      // 로컬 입력/수정 기준
  lastImportedInputAt: null,   // CSV에 담겨 있던 로컬입력시간
  lastExportedInputAt: null    // CSV에 담겨 있던 로컬입력시간
};

function saveMeta() {
  localStorage.setItem('blotter_meta_v96', JSON.stringify(blotterMeta));
}

const AUTO_SYNC_DEBOUNCE_MS = 4000;

let autoSyncCanRun = false;
let autoSyncTimer = null;
let autoSyncInFlight = false;
let autoSyncLastAttemptLocalAt = null;
let autoImportFromCloudDone = false;
let autoImportInFlight = false;
let autoImportDoneUserId = null;
let authAutoActionsBound = false;

function applySyncAuthState(session = null, options = {}) {
  const { keepImportState = false } = options;
  const statusEl = document.getElementById('sync-auth-status');
  const btnEl = document.getElementById('syncAuthBtn');

  if (!statusEl) return;

  const user = session?.user || null;

  if (user) {
    const email = user.email || 'Google User';
    statusEl.innerText = `로그인됨 · ${email}`;
    statusEl.classList.remove('sync-auth-off');
    statusEl.classList.add('sync-auth-on');

    if (btnEl) btnEl.innerText = '로그아웃';

    if (autoImportDoneUserId === user.id && !autoImportInFlight) {
      autoSyncCanRun = true;
      maybeScheduleAutoSync();
    } else {
      autoSyncCanRun = false;
    }

    return;
  }

  autoSyncCanRun = false;

  if (!keepImportState) {
    autoImportDoneUserId = null;
    autoImportFromCloudDone = false;
  }

  statusEl.innerText = '로그인 필요';
  statusEl.classList.remove('sync-auth-on');
  statusEl.classList.add('sync-auth-off');

  if (btnEl) btnEl.innerText = '동기화 로그인';
}

function setAutoSyncStatus(text, className = '') {
  const statusEl = document.getElementById('autosync-status');
  if (!statusEl) return;

  statusEl.innerText = text;
  statusEl.classList.remove('sync-ok', 'sync-warn', 'sync-danger');
  if (className) statusEl.classList.add(className);
}

function initAutoSyncUI() {
  autoSyncCanRun = false;
}

async function runAutoCloudActionsForUser(user, source = 'manual') {
  if (!user?.id) {
    autoSyncCanRun = false;
    return false;
  }

  const allowed = await isAllowedEmail(user.email);
  if (!allowed) {
    autoSyncCanRun = false;
    autoImportDoneUserId = null;
    await supabaseClient.auth.signOut();
    console.warn('auto cloud actions skipped: not allowed user');
    return false;
  }

  if (autoImportDoneUserId !== user.id) {
    if (!autoImportInFlight) {
      autoImportInFlight = true;
      try {
        await importFromCloudInternal({ user, skipConfirm: true, silent: true, source });
        autoImportFromCloudDone = true;
      } finally {
        autoImportInFlight = false;
      }
    }
    autoImportDoneUserId = user.id;
  }

  autoSyncCanRun = true;
  maybeScheduleAutoSync();
  return true;
}

async function runAutoCloudActionsFromSession(source = 'manual') {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error('session restore failed for auto actions:', error.message);
    autoSyncCanRun = false;
    return false;
  }

  return runAutoCloudActionsForUser(data?.session?.user || null, source);
}

function bindAuthAutoActions() {
  if (authAutoActionsBound) return;
  authAutoActionsBound = true;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      autoSyncCanRun = false;
      autoImportInFlight = false;
      autoImportDoneUserId = null;
      autoImportFromCloudDone = false;
      applySyncAuthState(null);
      return;
    }

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      applySyncAuthState(session, { keepImportState: true });

      setTimeout(() => {
        runAutoCloudActionsForUser(session?.user || null, `auth-${event}`)
          .catch((err) => console.error('auto cloud actions failed:', err))
          .finally(() => {
            updateSyncAuthUI();
          });
      }, 0);
    }
  });
}

function maybeScheduleAutoSync(statusOverride = null) {
  if (!autoSyncCanRun || autoSyncInFlight) return;

  const status = statusOverride || getSyncStatus(
    blotterMeta.lastLocalInputAt,
    blotterMeta.lastImportedInputAt,
    blotterMeta.lastExportedInputAt
  );

  if (status === 'OK') {
    setAutoSyncStatus('SYNCED', 'sync-ok');
    return;
  }

  if (status === 'DANGER') {
    setAutoSyncStatus('CHECK', 'sync-danger');
    return;
  }

  if (status !== 'WARN') {
    setAutoSyncStatus('IDLE');
    return;
  }

  const localAt = Number(blotterMeta.lastLocalInputAt) || null;
  if (!localAt) return;

  if (Number(blotterMeta.lastExportedInputAt) === localAt) {
    setAutoSyncStatus('SYNCED', 'sync-ok');
    return;
  }

  if (autoSyncLastAttemptLocalAt === localAt) {
    setAutoSyncStatus('WAIT', 'sync-warn');
    return;
  }

  setAutoSyncStatus('PENDING', 'sync-warn');

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
  }

  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    runAutoSyncIfNeeded();
  }, AUTO_SYNC_DEBOUNCE_MS);
}

async function getCurrentUserSilently() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) return null;

  const user = data?.session?.user;
  if (!user) return null;

  const allowed = await isAllowedEmail(user.email);
  if (!allowed) return null;

  return user;
}

async function runAutoSyncIfNeeded() {
  if (!autoSyncCanRun || autoSyncInFlight) return;

  const status = getSyncStatus(
    blotterMeta.lastLocalInputAt,
    blotterMeta.lastImportedInputAt,
    blotterMeta.lastExportedInputAt
  );

  if (status !== 'WARN') return;

  const localAt = Number(blotterMeta.lastLocalInputAt) || null;
  if (!localAt) return;
  if (Number(blotterMeta.lastExportedInputAt) === localAt) return;

  autoSyncInFlight = true;
  setAutoSyncStatus('SYNCING', 'sync-warn');

  try {
    const user = await getCurrentUserSilently();
    if (!user) {
      setAutoSyncStatus('LOGIN', 'sync-warn');
      return;
    }

    const ok = await exportToCloudInternal({ user, skipConfirm: true, silent: true, source: 'autosync' });

    if (ok) {
      autoSyncLastAttemptLocalAt = localAt;
      setAutoSyncStatus('SYNCED', 'sync-ok');
    } else {
      setAutoSyncStatus('RETRY', 'sync-danger');
    }
  } catch (error) {
    console.error('autosync failed:', error);
    setAutoSyncStatus('RETRY', 'sync-danger');
  } finally {
    autoSyncInFlight = false;
  }
}

function fmtTime(ts) {
  if (!ts) return "-";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}:${ss}`;
}

/**
 * =========================
 * 1) Data / Storage
 * =========================
 * marginType:
 *  - "FIXED": 해외파생(고정액)  -> init/maint는 "금액"(통화 기준)
 *  - "PCT"  : 국내파생(비율)    -> init/maint는 "%", multiplier(승수) 필요
 */
const DEFAULT_MASTER = {
  "USDKRW": { symbol:"FX_IDC:USDKRW", ySymbol:"KRW=X", tick:0.1, tickVal:1000, fee:1000, cur:"KRW",
              marginType:"PCT", initMargin:4.15, maintMargin:2.77, multiplier:10000, desc:"국내형(비율)" },

  "MES":    { symbol:"SPX500", ySymbol:"MES=F", tick:0.25, tickVal:1.25, fee:1.0, cur:"USD",
              marginType:"FIXED", initMargin:1600, maintMargin:1450, multiplier:0, desc:"해외형(고정액)" },

  "MNQ":    { symbol:"VANTAGE:NAS100", ySymbol:"MNQ=F", tick:0.25, tickVal:0.5,  fee:1.0, cur:"USD",
              marginType:"FIXED", initMargin:2200, maintMargin:2000, multiplier:0, desc:"해외형(고정액)" },

  "MCL":    { symbol:"TVC:USOIL",      ySymbol:"MCL=F", tick:0.01, tickVal:1.0,  fee:1.5, cur:"USD",
              marginType:"FIXED", initMargin:1200, maintMargin:1100, multiplier:0, desc:"해외형(고정액)" }
};

let master   = JSON.parse(localStorage.getItem('blotter_master_v96')) || DEFAULT_MASTER;
let trades   = JSON.parse(localStorage.getItem('blotter_trades_v96'))  || [];
let capitals = JSON.parse(localStorage.getItem('blotter_capitals_v96'))|| { dom: 0, ovs: 0 };
let atmRecords = JSON.parse(localStorage.getItem('blotter_atm_v96')) || []; // ATM 기록 추가
let mtmPrices = JSON.parse(localStorage.getItem('blotter_mtm_v96')) || {};
let globalFX = parseFloat(localStorage.getItem('blotter_fx_v96')) || 1350;

let isStealth = false;
let editingId = null;
let editingAsset = null;
let historyFocusKey = null;
const tableSortState = {
  history: { key: 'inputOrder', dir: 'desc' },
  report: { key: 'date', dir: 'desc' }
};
const tableSortLabels = {
  history: {
    inputOrder: '입력순', date: '일자', asset: '상품', side: '구분', price: '가격', qty: '수량',
    status: '상태', stopLoss: '스탑', netPnlCur: '순손익(통화)', netPct: '손익률', memo: '메모'
  },
  report: {
    date: '날짜', asset: '상품', side: '구분', price: '가격', qty: '수량', status: '상태',
    realizedPnlCur: '실현손익(통화)', feeCur: '수수료(통화)', netPnlCur: '순손익(통화)', netPct: '손익률', memo: '메모'
  }
};

/**
 * =========================
 * Tabs
 * =========================
 */


/**
 * 탭 전환 함수 (모든 콘텐츠 숨기고 선택된 것만 표시)
 */
function openTab(evt, tabName) {
  // 1. 모든 탭 콘텐츠 숨기기
  const tabContents = document.getElementsByClassName("tab-content");
  for (let i = 0; i < tabContents.length; i++) {
    tabContents[i].classList.remove("active");
  }

  // 2. 모든 탭 버튼에서 active 클래스 제거
  const tabLinks = document.getElementsByClassName("tab-link");
  for (let i = 0; i < tabLinks.length; i++) {
    tabLinks[i].classList.remove("active");
  }

  // 3. 선택된 탭 콘텐츠 보이기 및 버튼 강조
  const targetTab = document.getElementById(tabName);
  if (targetTab) {
    targetTab.classList.add("active");
    evt.currentTarget.classList.add("active");
  }

  // 4. 탭별 특수 기능 실행
  if (tabName === 'tab-performance') {
    // 날짜가 없으면 기본값 세팅 후 리포트 생성
    if (!document.getElementById('repStartDate').value) {
      const today = new Date();
      const lastMonth = new Date(); lastMonth.setMonth(today.getMonth() - 1);
      document.getElementById('repStartDate').value = lastMonth.toISOString().split('T')[0];
      document.getElementById('repEndDate').value = today.toISOString().split('T')[0];
    }
    renderPerformanceReport();
  }
  
  if (tabName === 'tab-settings') {
    renderATM(); // 입출금 내역 갱신
  }
}

/**
 * =========================
 * Capitals
 * =========================
 */
function saveCapitals() {
  capitals.dom = parseFloat(document.getElementById('capital-dom').value) || 0;
  capitals.ovs = parseFloat(document.getElementById('capital-ovs').value) || 0;
  localStorage.setItem('blotter_capitals_v96', JSON.stringify(capitals));
  renderAll();
}
function loadCapitals() {
  document.getElementById('capital-dom').value = capitals.dom;
  document.getElementById('capital-ovs').value = capitals.ovs;
}

/**
 * =========================
 * DTE sync
 * =========================
 */
function syncMaturityFromDTE() {
  const tradeDateStr = document.getElementById('tradeDate').value;
  const dteVal = parseInt(document.getElementById('dteInput').value);
  if(!tradeDateStr || isNaN(dteVal)) return;
  const tradeDate = new Date(tradeDateStr);
  tradeDate.setDate(tradeDate.getDate() + dteVal);
  document.getElementById('maturityDate').value = tradeDate.toISOString().split('T')[0];
}
function syncDTEFromMaturity() {
  const d1 = new Date(document.getElementById('tradeDate').value);
  const d2 = new Date(document.getElementById('maturityDate').value);
  if(!isNaN(d1) && !isNaN(d2)) {
    document.getElementById('dteInput').value = Math.ceil((d2 - d1) / 86400000);
  }
}

/**
 * =========================
 * CSV
 * =========================
 */
function getTimestamp() {
  const now = new Date();
  return now.getFullYear()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + "_" + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0');
}



async function updateSyncAuthUI(sessionOverride = undefined) {
  if (sessionOverride !== undefined) {
    applySyncAuthState(sessionOverride, { keepImportState: !sessionOverride?.user });
    return;
  }

  const statusEl = document.getElementById('sync-auth-status');
  const btnEl = document.getElementById('syncAuthBtn');

  if (!statusEl) return;

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    autoSyncCanRun = false;
    statusEl.innerText = '로그인 확인 실패';
    statusEl.classList.remove('sync-auth-on');
    statusEl.classList.add('sync-auth-off');

    if (btnEl) btnEl.innerText = '동기화 로그인';
    return;
  }

  applySyncAuthState(data?.session || null);
}

async function getCurrentUserOrAlert() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data?.session?.user) {
    alert("먼저 동기화 로그인(Google 로그인)을 해주세요.");
    return null;
  }

  const user = data.session.user;
  const allowed = await isAllowedEmail(user.email);

  if (!allowed) {
    await supabaseClient.auth.signOut();
    await updateSyncAuthUI();
    alert("허용되지 않은 계정입니다. 관리자의 허용이 필요합니다.");
    return null;
  }

  return user;
}

function toISOStringSafeFromMillis(ms) {
  if (!ms) return new Date().toISOString();

  const d = new Date(ms);
  if (isNaN(d.getTime())) {
    return new Date().toISOString();
  }

  return d.toISOString();
}





async function isAllowedEmail(email) {
  if (!email) return false;

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!normalizedEmail) return false;

  const { data, error } = await supabaseClient
    .from('allowed_emails')
    .select('email')
    .eq('email', normalizedEmail)
    .limit(1);

  if (error) {
    console.error('허용 이메일 확인 실패:', error.message);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

function buildCSVSnapshot() {
  let csv = "---META---\nLAST_LOCAL_INPUT_AT\n";
  csv += `${blotterMeta.lastLocalInputAt || ""}\n\n`;
	
  csv += "---TRADES---\nDate,Asset,Maturity,Side,Price,Qty,FXRate,StopLoss,Memo,CreatedAt,UpdatedAt\n";
  trades.forEach(t => {
    const memo = (t.memo || "")
      .replace(/\r?\n/g, "\\n")
      .replace(/"/g,'""');
    csv += `${t.date},${t.asset},${t.maturity},${t.side},${t.price},${t.qty},${t.fxRate},${t.stopLoss ?? ""},"${memo}",${t.createdAt},${t.updatedAt}\n`;
  });

  csv += "\n---MASTER---\nAsset,Symbol,YSymbol,Tick,TickVal,Fee,Cur,MarginType,InitMargin,MaintMargin,Multiplier,Desc\n";
  Object.keys(master).forEach(k => {
    const m = master[k];
    csv += `${k},${m.symbol||""},${m.ySymbol||""},${m.tick},${m.tickVal},${m.fee},${m.cur},${m.marginType||"FIXED"},${m.initMargin||0},${m.maintMargin||0},${m.multiplier||0},"${(m.desc||"")
      .replace(/\r?\n/g,"\\n")
      .replace(/"/g,'""')}"\n`;
  });

  csv += "\n---ATM---\nDate,Account,Amount,Memo\n";
  atmRecords.forEach(r => {
    const memo = (r.memo || "")
      .replace(/\r?\n/g, "\\n")
      .replace(/"/g, '""');
    csv += `${r.date},${r.acc},${r.amt},"${memo}"\n`;
  });

  csv += "\n---CAPITALS---\nDOM_KRW,OVS_USD\n";
  csv += `${capitals.dom},${capitals.ovs}\n`;

    return csv;
}

function downloadCSV(csv, fileName) {
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.setAttribute("href", URL.createObjectURL(blob));
  link.setAttribute("download", fileName);
  link.click();
}

function exportToCSV() {
  const csv = buildCSVSnapshot();
  downloadCSV(csv, `AlphaBlotter_v96_FullBackup_${getTimestamp()}.csv`);

  blotterMeta.lastExportedInputAt = blotterMeta.lastLocalInputAt;
  saveMeta();
  updateSyncHeader();
}

function parseAndApplyCSV(text, sourceLabel = "CSV") {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const rows = normalizedText.split(/\r?\n/);
  const newTrades = [];
  const newATM = [];
  const newMaster = {};
  let newCapitals = { dom: 0, ovs: 0 };
  let csvLocalInputAt = null;
  let currentSection = "";

  rows.forEach((row) => {
    const tr = row.trim();
    if (!tr) return;

    if (tr === "---META---") { currentSection = "META"; return; }
    if (tr === "---TRADES---") { currentSection = "TRADES"; return; }
    if (tr === "---MASTER---") { currentSection = "MASTER"; return; }
    if (tr === "---ATM---") { currentSection = "ATM"; return; }
    if (tr === "---CAPITALS---") { currentSection = "CAPITALS"; return; }

    if (tr.startsWith("Date,Asset,") || tr.startsWith("Asset,Symbol,") ||
        tr.startsWith("Date,Account,") || tr.startsWith("DOM_KRW,") ||
        tr === "LAST_LOCAL_INPUT_AT") return;

    if (currentSection === "META") {
      csvLocalInputAt = parseInt(tr, 10) || null;
      return;
    }

    const parts = parseCSVLine(tr);

    if (currentSection === "TRADES" && parts.length >= 10) {
      newTrades.push({
        id: parts[9] ? parseInt(parts[9], 10) : Date.now(),
        date: parts[0],
        asset: parts[1],
        maturity: parts[2],
        side: parts[3],
        price: parseFloat(parts[4]),
        qty: parseInt(parts[5]),
        fxRate: parseFloat(parts[6]),
        stopLoss: (parts[7] && parts[7] !== "") ? parseFloat(parts[7]) : null,
        memo: (parts[8] || "").replace(/\\n/g, "\n"),
        createdAt: parts[9] ? parseInt(parts[9]) : Date.now(),
        updatedAt: parts[10] ? parseInt(parts[10]) : Date.now()
      });
    }

    if (currentSection === "MASTER" && parts.length >= 11) {
      newMaster[parts[0]] = {
        symbol: parts[1],
        ySymbol: parts[2],
        tick: parseFloat(parts[3]),
        tickVal: parseFloat(parts[4]),
        fee: parseFloat(parts[5]),
        cur: parts[6],
        marginType: parts[7],
        initMargin: parseFloat(parts[8]),
        maintMargin: parseFloat(parts[9]),
        multiplier: parseFloat(parts[10]),
        desc: (parts[11] || "").replace(/\\n/g, "\n")
      };
    }

    if (currentSection === "ATM" && parts.length >= 3) {
      newATM.push({
        id: Date.now(),
        date: parts[0],
        acc: parts[1],
        amt: parseFloat(parts[2]),
        memo: (parts[3] || "").replace(/\\n/g, "\n")
      });
    }

    if (currentSection === "CAPITALS" && parts.length >= 2) {
      newCapitals.dom = parseFloat(parts[0]) || 0;
      newCapitals.ovs = parseFloat(parts[1]) || 0;
    }
  });

  const hasTrades = newTrades.length > 0;
  const hasATM = newATM.length > 0;
  const hasMaster = Object.keys(newMaster).length > 0;
  const hasCapitals = newCapitals.dom !== 0 || newCapitals.ovs !== 0;

  if (!(hasTrades || hasATM || hasMaster || hasCapitals)) {
    alert(`${sourceLabel} 데이터에서 유효한 항목을 찾을 수 없습니다.`);
    return false;
  }

  const msg = `${sourceLabel} 데이터를 발견했습니다:
- 매매: ${newTrades.length}건
- 입출금: ${newATM.length}건
- 상품설정: ${Object.keys(newMaster).length}건

기존 데이터를 덮어쓰시겠습니까?`;
  if (!confirm(msg)) return false;

  localStorage.setItem('blotter_backup_before_import', localStorage.getItem('blotter_trades_v96'));

  trades = newTrades;
  atmRecords = newATM;
  capitals = newCapitals;
  if (hasMaster) master = newMaster;

  localStorage.setItem('blotter_trades_v96', JSON.stringify(trades));
  localStorage.setItem('blotter_atm_v96', JSON.stringify(atmRecords));
  localStorage.setItem('blotter_master_v96', JSON.stringify(master));
  localStorage.setItem('blotter_capitals_v96', JSON.stringify(capitals));

  loadCapitals();
  renderMaster();
  initAssetSelect();
  if (typeof renderATM === "function") renderATM();
  renderAll();

  blotterMeta.lastImportedInputAt = csvLocalInputAt;
  blotterMeta.lastLocalInputAt = csvLocalInputAt || Date.now();
  saveMeta();
  updateSyncHeader();

  alert(`${sourceLabel} 가져오기가 완료되었습니다.`);
  return true;
}

function importFromCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    parseAndApplyCSV(String(event.target.result || ""), "CSV 파일");
    e.target.value = "";
  };
  reader.readAsText(file);
}

async function syncLogin() {
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();

  if (sessionError) {
    alert("세션 확인 실패: " + sessionError.message);
    return;
  }

  if (sessionData?.session) {
    alert("이미 로그인되어 있습니다.");
    await updateSyncAuthUI();
    return;
  }

  const redirectTo = window.location.origin + window.location.pathname;

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo
    }
  });

  if (error) {
    alert("Google 로그인 실패: " + error.message);
  }
}

async function syncLogout() {
  const confirmed = confirm("로그아웃 하시겠습니까?");
  if (!confirmed) return;

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert("로그아웃 실패: " + error.message);
    return;
  }

  await updateSyncAuthUI();
  alert("로그아웃 되었습니다.");
}

async function handleSyncAuth() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    alert("로그인 상태 확인 실패: " + error.message);
    return;
  }

  const user = data?.session?.user;

  if (user) {
    const allowed = await isAllowedEmail(user.email);
    if (!allowed) {
      await supabaseClient.auth.signOut();
      await updateSyncAuthUI();
      alert("허용되지 않은 계정입니다. 관리자의 허용이 필요합니다.");
      return;
    }

    const confirmed = confirm("로그아웃 하시겠습니까?");
    if (!confirmed) return;

    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) {
      alert("로그아웃 실패: " + signOutError.message);
      return;
    }

    await updateSyncAuthUI();
    alert("로그아웃 되었습니다.");
    return;
  }

  // 로그인 안 된 상태 -> Google 로그인 시작
  const redirectTo = window.location.origin + window.location.pathname;

  const { error: signInError } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo
    }
  });

  if (signInError) {
    alert("Google 로그인 실패: " + signInError.message);
  }
}

function toSafeIntegerId(value) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    return Math.trunc(n);
  }
  return Date.now();
}

async function exportToCloudInternal({ user = null, skipConfirm = false, silent = false, source = 'manual' } = {}) {
  const currentUser = user || await getCurrentUserOrAlert();
  if (!currentUser) return false;

  if (!skipConfirm) {
    const exportSummaryMsg = `현재 데이터를 원격 동기화 데이터로 저장합니다:
- 매매: ${trades.length}건
- 입출금: ${atmRecords.length}건
- 상품설정: ${Object.keys(master).length}건

기존 원격 데이터는 덮어써질 수 있습니다.
계속하시겠습니까?`;
    const confirmed = confirm(exportSummaryMsg);
    if (!confirmed) return false;
  }

  try {
    const { error: delTradesError } = await supabaseClient
      .from('trades')
      .delete()
      .eq('user_id', currentUser.id);

    if (delTradesError) throw delTradesError;

    if (trades.length > 0) {
      const tradeRows = trades.map(t => ({
        user_id: currentUser.id,
        trade_id: toSafeIntegerId(t.id),
        date: t.date,
        asset: t.asset,
        maturity: t.maturity || null,
        side: t.side,
        price: t.price,
        qty: t.qty,
        fx_rate: t.fxRate,
        stop_loss: t.stopLoss,
        memo: t.memo || "",
        created_at: toISOStringSafeFromMillis(t.createdAt),
        updated_at: toISOStringSafeFromMillis(t.updatedAt)
      }));

      const { error: insTradesError } = await supabaseClient
        .from('trades')
        .insert(tradeRows);

      if (insTradesError) throw insTradesError;
    }

    const { error: delAtmError } = await supabaseClient
      .from('atm_records')
      .delete()
      .eq('user_id', currentUser.id);

    if (delAtmError) throw delAtmError;

    if (atmRecords.length > 0) {
      const atmRows = atmRecords.map(r => ({
        user_id: currentUser.id,
        record_id: toSafeIntegerId(r.id),
        acc: r.acc,
        date: r.date,
        amt: r.amt,
        memo: r.memo || ""
      }));

      const { error: insAtmError } = await supabaseClient
        .from('atm_records')
        .insert(atmRows);

      if (insAtmError) throw insAtmError;
    }

    const { error: delMasterError } = await supabaseClient
      .from('asset_master')
      .delete()
      .eq('user_id', currentUser.id);

    if (delMasterError) throw delMasterError;

    const masterRows = Object.keys(master).map(assetCode => {
      const m = master[assetCode];
      return {
        user_id: currentUser.id,
        asset_code: assetCode,
        symbol: m.symbol || "",
        y_symbol: m.ySymbol || "",
        tick: m.tick || 0,
        tick_val: m.tickVal || 0,
        fee: m.fee || 0,
        cur: m.cur || "USD",
        margin_type: m.marginType || "FIXED",
        init_margin: m.initMargin || 0,
        maint_margin: m.maintMargin || 0,
        multiplier: m.multiplier || 0,
        description: m.desc || ""
      };
    });

    if (masterRows.length > 0) {
      const { error: insMasterError } = await supabaseClient
        .from('asset_master')
        .insert(masterRows);

      if (insMasterError) throw insMasterError;
    }

    const { error: capitalsError } = await supabaseClient
      .from('capitals')
      .upsert({
        user_id: currentUser.id,
        dom: capitals.dom || 0,
        ovs: capitals.ovs || 0,
        updated_at: new Date().toISOString()
      });

    if (capitalsError) throw capitalsError;

    blotterMeta.lastExportedInputAt = blotterMeta.lastLocalInputAt;
    saveMeta();

    const { error: metaError } = await supabaseClient
      .from('blotter_meta')
      .upsert({
        user_id: currentUser.id,
        last_local_input_at: blotterMeta.lastLocalInputAt || null,
        last_imported_input_at: blotterMeta.lastImportedInputAt || null,
        last_exported_input_at: blotterMeta.lastExportedInputAt || null,
        updated_at: new Date().toISOString()
      });

    if (metaError) throw metaError;

    updateSyncHeader();

    if (!silent) {
      alert("동기화 내보내기가 완료되었습니다.");
    }

    return true;
  } catch (error) {
    console.error(error);

    if (!silent) {
      alert("동기화 내보내기 실패: " + error.message);
    } else if (source === 'autosync') {
      console.warn("autosync export failed:", error.message);
    }

    return false;
  }
}

async function exportToCloud() {
  await exportToCloudInternal();
}

async function importFromCloudInternal({ user = null, skipConfirm = false, silent = false, source = 'manual' } = {}) {
  const currentUser = user || await getCurrentUserOrAlert();
  if (!currentUser) return false;

  try {
    // 1) trades 조회
    const { data: tradeRows, error: tradeError } = await supabaseClient
      .from('trades')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: true });

    if (tradeError) throw tradeError;

    // 2) atm_records 조회
    const { data: atmRows, error: atmError } = await supabaseClient
      .from('atm_records')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: false });

    if (atmError) throw atmError;

    // 3) asset_master 조회
    const { data: masterRows, error: masterError } = await supabaseClient
      .from('asset_master')
      .select('*')
      .eq('user_id', currentUser.id);

    if (masterError) throw masterError;

    // 4) capitals 조회 (사용자당 1행)
    const { data: capitalRow, error: capitalError } = await supabaseClient
      .from('capitals')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (capitalError) throw capitalError;

    // 5) blotter_meta 조회 (사용자당 1행)
    const { data: metaRow, error: metaError } = await supabaseClient
      .from('blotter_meta')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (metaError) throw metaError;

    // 6) Supabase rows -> 앱 구조로 변환
    const remoteTrades = (tradeRows || []).map(r => ({
      id: r.trade_id || r.id,
      date: r.date,
      asset: r.asset,
      maturity: r.maturity || "",
      side: r.side,
      price: Number(r.price),
      qty: Number(r.qty),
      fxRate: Number(r.fx_rate),
      stopLoss: r.stop_loss != null ? Number(r.stop_loss) : null,
      memo: r.memo || "",
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
    }));

    const remoteATM = (atmRows || []).map(r => ({
      id: r.record_id || r.id,
      acc: r.acc,
      date: r.date,
      amt: Number(r.amt),
      memo: r.memo || ""
    }));

    const remoteMaster = {};
    (masterRows || []).forEach(r => {
      remoteMaster[r.asset_code] = {
        symbol: r.symbol || "",
        ySymbol: r.y_symbol || "",
        tick: Number(r.tick || 0),
        tickVal: Number(r.tick_val || 0),
        fee: Number(r.fee || 0),
        cur: r.cur || "USD",
        marginType: r.margin_type || "FIXED",
        initMargin: Number(r.init_margin || 0),
        maintMargin: Number(r.maint_margin || 0),
        multiplier: Number(r.multiplier || 0),
        desc: r.description || ""
      };
    });

    // 7) 원격 데이터 존재 여부 체크
    const hasTrades = remoteTrades.length > 0;
    const hasATM = remoteATM.length > 0;
    const hasMaster = Object.keys(remoteMaster).length > 0;
    const hasCapitals = !!capitalRow;

    if (!(hasTrades || hasATM || hasMaster || hasCapitals)) {
      if (!silent) {
        alert("동기화 데이터가 없습니다.");
      }
      return false;
    }

    // 8) 덮어쓰기 확인
    if (!skipConfirm) {
      const msg = `동기화 데이터를 발견했습니다:
- 매매: ${remoteTrades.length}건
- 입출금: ${remoteATM.length}건
- 상품설정: ${Object.keys(remoteMaster).length}건

기존 데이터를 덮어쓰시겠습니까?`;

      if (!confirm(msg)) return false;
    }

    // 9) 현재 메모리 상태 교체
    trades = remoteTrades;
    atmRecords = remoteATM;

    if (hasMaster) {
      master = remoteMaster;
    }

    capitals = {
      dom: Number(capitalRow?.dom || 0),
      ovs: Number(capitalRow?.ovs || 0)
    };

    const syncedLocalInputAt = Number(metaRow?.last_local_input_at) || Date.now();
    // IMPORT/EXPORT 시각은 원본 데이터가 가진 "로컬 입력 기준 시각"을 사용
    blotterMeta.lastImportedInputAt = syncedLocalInputAt;
    blotterMeta.lastLocalInputAt = syncedLocalInputAt;
    blotterMeta.lastExportedInputAt = Number(metaRow?.last_exported_input_at) || null;

    // 10) localStorage 캐시도 갱신
    localStorage.setItem('blotter_trades_v96', JSON.stringify(trades));
    localStorage.setItem('blotter_atm_v96', JSON.stringify(atmRecords));
    localStorage.setItem('blotter_master_v96', JSON.stringify(master));
    localStorage.setItem('blotter_capitals_v96', JSON.stringify(capitals));
    localStorage.setItem('blotter_meta_v96', JSON.stringify(blotterMeta));

    // 11) UI 반영
    loadCapitals();
    renderMaster();
    initAssetSelect();
    renderATM();
    renderAll();
    updateSyncHeader();

    if (!silent) {
      alert("동기화 가져오기가 완료되었습니다.");
    }

    return true;
  } catch (error) {
    console.error(error);

    if (!silent) {
      alert("동기화 가져오기 실패: " + error.message);
    } else if (source === 'auto-login') {
      console.warn("auto import failed:", error.message);
    }

    return false;
  }
}

async function importFromCloud() {
  await importFromCloudInternal();
}

/**
 * =========================
 * 유틸리티: 대기 함수 (프록시 차단 방지용)
 * =========================
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * =========================
 * Market prices (Yahoo via proxy) - 성능 개선 버전
 * =========================
 */
async function fetchYahooPrice(ySymbol) {
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ySymbol}?interval=1m&range=1d&_seed=${Date.now()}`;
  
  // 1순위 프록시: corsproxy.io
  try {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) return price;
    }
  } catch (e) { console.warn(`Proxy 1 failed for ${ySymbol}`); }

  // 2순위 프록시: allorigins (백업)
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const json = await res.json();
      const data = JSON.parse(json.contents);
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) return price;
    }
  } catch (e) { console.warn(`Proxy 2 failed for ${ySymbol}`); }

  return null;
}
/**
 * 시세 동기화 메인 함수
 * 실패하더라도 티커는 무조건 노출하며, 요청 간격을 두어 안정성을 확보합니다.
 */
async function syncMarketPrices() {
  const btn = document.querySelector('.btn-green');
  const monitor = document.getElementById('fx-monitor');
  const syncDisplay = document.getElementById('sync-time-display');

  if (!btn || !monitor) return;

  btn.innerText = "⏳ 시세 요청 중...";
  btn.disabled = true;

  // ySymbol이 설정된 모든 상품 추출
  const assetKeys = Object.keys(master).filter(id => master[id] && master[id].ySymbol);
  let updatedCount = 0;
  let htmlBuffer = ""; 

  try {
    for (const id of assetKeys) {
      const price = await fetchYahooPrice(master[id].ySymbol);
      const m = master[id];
      const isFX = id === "USDKRW" || m.ySymbol === "KRW=X";

      if (price !== null) {
        // [성공] 시세 업데이트
        updatedCount++;

        if (isFX) {
          globalFX = price;
          localStorage.setItem('blotter_fx_v96', String(globalFX));
        }

        // 최신가 저장
        mtmPrices[`LAST_${id}`] = price;

        // 정상 표시 (흰색/노란색)
        htmlBuffer += `<span class="price-tag" style="color:${isFX ? 'var(--warn)' : 'var(--text)'}">${id} ${price.toFixed(2)}</span>`;
      } else {
        // [실패] 시세 획득 실패 시에도 티커는 표시
        const prevPrice = mtmPrices[`LAST_${id}`];
        const displayPrice = prevPrice ? Number(prevPrice).toFixed(2) : "---";
        
        // 실패 상태 표시 (회색/반투명)
        htmlBuffer += `<span class="price-tag" style="color:var(--muted); opacity:0.6;" title="시세 갱신 실패">${id} ${displayPrice}</span>`;
      }
      
      // 요청 간격 (안정성)
      await sleep(100);
    }

    // 결과 화면 반영 (중간에 실패했어도 버퍼에 쌓인 티커들이 모두 출력됨)
    monitor.innerHTML = htmlBuffer || '<span style="font-size:10px; color:var(--muted);">대상 상품 없음</span>';

    // ================================
    // [Active Positions] 현재가 덮어쓰기
    // ================================
    const res = calculateEngine();
    res.openPos.forEach(p => {
      const last = mtmPrices[`LAST_${p.asset}`];
      if (last != null) {
        mtmPrices[p.key] = last; 
      }
    });

    localStorage.setItem('blotter_mtm_v96', JSON.stringify(mtmPrices));
    
    // 현재 선택 상품 입력창 자동 완성
    const currentAsset = document.getElementById('asset').value;
    if (mtmPrices[`LAST_${currentAsset}`]) {
        document.getElementById('price').value = mtmPrices[`LAST_${currentAsset}`];
    }

    const now = new Date().toLocaleTimeString();
    syncDisplay.innerText = updatedCount === assetKeys.length ? `전체 갱신: ${now}` : `일부 갱신 (${updatedCount}/${assetKeys.length}): ${now}`;
    
    renderAll(); 
    runCalc();   

  } catch (error) {
    console.error("동기화 중 오류:", error);
    syncDisplay.innerText = "네트워크 오류";
  } finally {
    btn.innerText = "🔄 시세 강제 동기화";
    btn.disabled = false;
  }
}

/**
 * =========================
 * Risk / Margin helpers
 * =========================
 */
function safeNum(x, d=0){ const n=parseFloat(x); return isNaN(n)?d:n; }
function isLongSide(side){ return side === "Buy"; }
function sideLabel(side){ return isLongSide(side) ? "Long" : "Short"; }
function sidePill(side){ return `<span class="pill ${isLongSide(side) ? 'pill-long' : 'pill-short'}">${sideLabel(side)}</span>`; }
function compareSortValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'ko', { numeric: true, sensitivity: 'base' });
}
function sortRows(rows, tableName) {
  const { key, dir } = tableSortState[tableName];
  const mult = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const result = compareSortValues(a[key], b[key]);
    if (result !== 0) return result * mult;
    return compareSortValues(a.date, b.date) * -1;
  });
}
function refreshSortHeaders() {
  Object.entries(tableSortLabels).forEach(([tableName, labels]) => {
    const state = tableSortState[tableName];
    Object.entries(labels).forEach(([key, label]) => {
      const el = document.getElementById(`${tableName}-sort-${key}`);
      if (!el) return;
      const arrow = state.key === key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '';
      el.textContent = label + arrow;
    });
  });
}
function toggleTableSort(tableName, key) {
  const state = tableSortState[tableName];
  if (state.key === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
  else { state.key = key; state.dir = 'asc'; }
  if (tableName === 'history') renderAll();
  else renderPerformanceReport();
}
function getTradeInputOrderMap(sourceTrades = trades) {
  const orderMap = new Map();
  sourceTrades.forEach((t, idx) => orderMap.set(t.id, idx + 1));
  return orderMap;
}

function calcStopRiskKRW(t) {
  if (t.stopLoss == null || t.stopLoss === "" || isNaN(t.stopLoss)) return 0;
  const m = master[t.asset];
  if (!m) return 0;

  const diff = isLongSide(t.side) ? (t.price - t.stopLoss) : (t.stopLoss - t.price);
  if (diff <= 0) return 0;

  const lossPoint = (diff / m.tick) * m.tickVal * t.qty;
  return m.cur === "USD" ? lossPoint * t.fxRate : lossPoint;
}

function marginPerContractKRW(assetId, price, useInit=true){
  const m = master[assetId];
  if(!m) return 0;
  if(m.marginType === "FIXED"){
    const amt = useInit ? (m.initMargin || 0) : (m.maintMargin || 0);
    return m.cur === "USD" ? amt * globalFX : amt;
  }
  // PCT
  const pct = useInit ? (m.initMargin || 0) : (m.maintMargin || 0);
  const mult = m.multiplier || 0;
  if(!price || !mult || !pct) return 0;
  return price * mult * (pct / 100);
}

function marginPerContractUSD(assetId, price, useInit=true){
  const m = master[assetId];
  if(!m) return 0;
  if(m.cur !== "USD") return 0;
  if(m.marginType === "FIXED"){
    return useInit ? (m.initMargin || 0) : (m.maintMargin || 0);
  }
  // PCT
  const krw = marginPerContractKRW(assetId, price, useInit);
  return krw / globalFX;
}


function stopToStopPct(side, curPrice, stop){
  const p = safeNum(curPrice, 0);
  const s = safeNum(stop, NaN);
  if(!p || isNaN(s)) return null;
  if(isLongSide(side)) return ((p - s) / p) * 100;
  return ((s - p) / p) * 100;
}

function pnlPctForPosition(p){
  if(!p.avgPrice || !p.currPrice) return 0;

  // Long / Short 방향 고려
  const dir = (p.qty > 0) ? 1 : -1;

  return ((p.currPrice - p.avgPrice) / p.avgPrice) * 100 * dir;
}


/**
 * =========================
 * Core engine (FIFO)
 * =========================
 */
function calculateEngine() {

  const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
  const inventory = {}; 

  let rKRW_Total = 0, rKRW_Dom = 0, rUSD_Ovs = 0;
  let tFeeKRW = 0, feeKRW_Dom = 0, feeUSD_Ovs = 0;

  const processed = sorted.map((t, idx) => {
    const key = `${t.asset}_${t.maturity}`;

    if (!inventory[key]) inventory[key] = [];

    const m = master[t.asset] || { tick: 1, tickVal: 0, fee: 0, cur: "KRW" };
    const feeThisCur = (m.fee || 0) * t.qty;
    const feeThisKRW = (m.cur === "USD") ? feeThisCur * t.fxRate : feeThisCur;
    tFeeKRW += feeThisKRW;
    if (m.cur === "USD") feeUSD_Ovs += feeThisCur; else feeKRW_Dom += feeThisCur;

    let remain = t.qty;
    let realizedThisTradeKRW = 0;
    let realizedThisTradeCur = 0;
    let totalMatchValue = 0; // 수익률 계산용 매입원가 합계

    if (inventory[key].length > 0 && inventory[key][0].side !== t.side) {
      while (remain > 0 && inventory[key].length > 0) {
        const matchingLot = inventory[key][0];
        const matchQty = Math.min(remain, matchingLot.qty);

        const diff = isLongSide(t.side) ? (matchingLot.price - t.price) : (t.price - matchingLot.price);
        const pnlPoint = (diff / m.tick) * m.tickVal * matchQty;
        const pnlKRW = (m.cur === "USD") ? pnlPoint * t.fxRate : pnlPoint;
        const pnlCur = (m.cur === "USD") ? pnlPoint : pnlKRW;

        realizedThisTradeKRW += pnlKRW;
        realizedThisTradeCur += pnlCur;
        totalMatchValue += (matchingLot.price * matchQty); // 원가 누적
        rKRW_Total += pnlKRW;
        
        if (m.cur === "KRW") rKRW_Dom += pnlKRW; else rUSD_Ovs += pnlPoint;

        matchingLot.qty -= matchQty;
        remain -= matchQty;
        if (matchingLot.qty <= 0) inventory[key].shift();
      }
    }

    if (remain > 0) {
      inventory[key].push({ side: t.side, qty: remain, price: t.price, fx: t.fxRate, tradeId: t.id });
    }

    const netQty = inventory[key].reduce((acc, lot) => acc + (isLongSide(lot.side) ? lot.qty : -lot.qty), 0);

    const netPnlKRW = realizedThisTradeKRW - feeThisKRW;
    const netPnlCur = realizedThisTradeCur - feeThisCur;

    // --- 수정: 수익률(netPct) 계산 로직 추가 ---
    let netPct = 0;
    if (realizedThisTradeKRW !== 0 && totalMatchValue > 0) {
      const matchQtyTotal = (t.qty - remain);
      const avgMatchPrice = totalMatchValue / matchQtyTotal;
      // 점수 기준 수익률 계산
      const realizedPoint = realizedThisTradeKRW / (m.cur === "USD" ? t.fxRate : 1);
      const costKRW = (m.cur === "USD"
  ? avgMatchPrice * matchQtyTotal * m.tickVal / m.tick * t.fxRate
  : avgMatchPrice * matchQtyTotal * m.tickVal / m.tick);

netPct = (realizedThisTradeKRW / costKRW) * 100;
    }

    // 체결 성과 평가는 실현손익(수수료 제외) 기준으로 별도 집계합니다.
	  
    return {
      ...t,
      cur: m.cur || "KRW",
      realizedPnlCur: realizedThisTradeCur,
      feeCur: feeThisCur,
      netPnlCur: netPnlCur,
      realizedPnlKRW: realizedThisTradeKRW,
      feeKRW: feeThisKRW,
      netPnlKRW: netPnlKRW,
      netPct: netPct, // 리포트 반영을 위해 추가
      currentNetQty: netQty,
      isCloseTrade: realizedThisTradeKRW !== 0
    };
  });

  // (미실현 손익 및 오픈 포지션 로직은 기존과 동일)
  let unrealizedKRW = 0, uDom = 0, uOvsPoint = 0;
  const openPos = [];
  Object.keys(inventory).forEach(key => {
    const lots = inventory[key];
    if (lots.length === 0) return;
    const [asset, maturity] = key.split('_');
    const m = master[asset];
    const totalQty = lots.reduce((s, l) => s + (isLongSide(l.side) ? l.qty : -l.qty), 0);
    if (totalQty === 0) return;
    const sameSideLots = lots.filter(l => isLongSide(l.side) === (totalQty > 0));
const avgPrice =
  sameSideLots.reduce((s,l)=>s + l.price*l.qty,0) /
  sameSideLots.reduce((s,l)=>s + l.qty,0);
    const currPrice =
  (mtmPrices[key] != null)
    ? mtmPrices[key]
    : (mtmPrices[`LAST_${asset}`] != null
        ? mtmPrices[`LAST_${asset}`]
        : avgPrice);
    const uPnlPoint = (currPrice - avgPrice) * (totalQty > 0 ? 1 : -1) * (1 / m.tick) * m.tickVal * Math.abs(totalQty);
    if (m.cur === "USD") { unrealizedKRW += uPnlPoint * globalFX; uOvsPoint += uPnlPoint; }
    else { unrealizedKRW += uPnlPoint; uDom += uPnlPoint; }
    openPos.push({ key, asset, maturity, qty: totalQty, avgPrice, currPrice, uPnl: uPnlPoint, cur: m.cur });
  });

// calculateEngine 함수 내부에 삽입
const moveDom = atmRecords.filter(r => r.acc === 'DOM').reduce((s, r) => s + safeNum(r.amt), 0);
const moveOvs = atmRecords.filter(r => r.acc === 'OVS').reduce((s, r) => s + safeNum(r.amt), 0);


const residualTradeQtyMap = {};
Object.values(inventory).forEach(lots => {
  lots.forEach(lot => {
    if (lot.tradeId == null || !lot.qty) return;
    residualTradeQtyMap[lot.tradeId] = (residualTradeQtyMap[lot.tradeId] || 0) + lot.qty;
  });
});

const positionOutcome = calculatePositionOutcomes(processed);
const tradeOutcome = calculateTradeOutcomes(processed);

return {
  processed, openPos, residualTradeQtyMap, netRealizedKRW: rKRW_Total - tFeeKRW,
  posWin: positionOutcome.win,
  posLoss: positionOutcome.loss,
  posWinSum: positionOutcome.winSum,
  posLossSum: positionOutcome.lossSum,
  posTotal: positionOutcome.total,

  rKRW_Dom, rUSD_Ovs, unrealizedKRW, feeKRW_Dom, feeUSD_Ovs,
  tradeWin: tradeOutcome.win,
  tradeLoss: tradeOutcome.loss,
  tradeNeutral: tradeOutcome.neutral,
  tradeWinSum: tradeOutcome.winSum,
  tradeLossSum: tradeOutcome.lossSum,
  tradeTotal: tradeOutcome.total,
  // 수정된 부분: 초기자본(capitals) + 입출금누계(move) + 매매손익
  eqDom: capitals.dom + moveDom + rKRW_Dom + uDom - feeKRW_Dom,
  eqOvs: capitals.ovs + moveOvs + rUSD_Ovs + uOvsPoint - feeUSD_Ovs
};
}





function calculatePositionOutcomes(processedTrades) {
  const cycleState = {};
  const outcomes = [];

  processedTrades.forEach(t => {
    const key = `${t.asset}_${t.maturity}`;
    if (!cycleState[key]) cycleState[key] = { current: null };

    if (!cycleState[key].current) {
      cycleState[key].current = { netPnlKRW: 0, hasOpen: false, hasClose: false };
    }

    const cycle = cycleState[key].current;
    cycle.netPnlKRW += t.netPnlKRW;

    if (t.isCloseTrade) cycle.hasClose = true;
    else cycle.hasOpen = true;

    if (t.currentNetQty === 0) {
      if (cycle.hasOpen && cycle.hasClose) outcomes.push(cycle);
      cycleState[key].current = null;
    }
  });

  let win = 0, loss = 0, winSum = 0, lossSum = 0;
  outcomes.forEach(o => {
    if (o.netPnlKRW > 0) { win++; winSum += o.netPnlKRW; }
    else if (o.netPnlKRW < 0) { loss++; lossSum += Math.abs(o.netPnlKRW); }
  });

  return { win, loss, winSum, lossSum, total: outcomes.length };
}

function calculateTradeOutcomes(processedTrades) {
  let win = 0, loss = 0, neutral = 0;
  let winSum = 0, lossSum = 0;

  processedTrades.forEach(t => {
    if (t.realizedPnlKRW > 0) {
      win++;
      winSum += t.realizedPnlKRW;
    } else if (t.realizedPnlKRW < 0) {
      loss++;
      lossSum += Math.abs(t.realizedPnlKRW);
    } else {
      neutral++;
    }
  });

  return { win, loss, neutral, winSum, lossSum, total: processedTrades.length };
}


function calculateStopRiskSummary(res) {
  let totalStopRiskKRW = 0;
  trades.forEach(t => totalStopRiskKRW += calcStopRiskKRW(t));

  const equityTotalKRW = res.eqDom + (res.eqOvs * globalFX);
  const riskRatio = equityTotalKRW > 0 ? totalStopRiskKRW / equityTotalKRW : 0;

  let status = "SAFE";
  let color = "var(--good)";
  if (riskRatio > 0.25) { status = "⚠️ WARNING"; color = "var(--warn)"; }
  if (riskRatio > 0.40) { status = "🚨 MARGIN CALL RISK"; color = "var(--bad)"; }

  return { totalStopRiskKRW, riskRatio, status, color };
}

/**
 * 유지증거금 계산: 이제 getOpenQtyForTrade를 쓰지 않고 openPos(현재 잔고)만 사용합니다.
 */
function calculateMarginSummary(res) {
  // 전체 순자산(Equity) 계산
  const equityTotalKRW = res.eqDom + (res.eqOvs * globalFX);
  
  let usedKRW_byKRW = 0, usedUSD_byUSD = 0;

  res.openPos.forEach(p => {
    const m = master[p.asset];
    const absQty = Math.abs(p.qty);
    // 유지증거금(Maint) 기준 계산
    const perMaintKRW = marginPerContractKRW(p.asset, p.currPrice, false);

    if (m.cur === "KRW") {
      usedKRW_byKRW += perMaintKRW * absQty;
    } else {
      const perMaintUSD = marginPerContractUSD(p.asset, p.currPrice, false);
      usedUSD_byUSD += perMaintUSD * absQty;
    }
  });

  const maintUsedKRW = usedKRW_byKRW + (usedUSD_byUSD * globalFX);
  const maintRatio = equityTotalKRW > 0 ? maintUsedKRW / equityTotalKRW : 0;
  
  let status = "SAFE", color = "var(--good)";
  if (maintRatio > 0.8) { status = "⚠️ TIGHT"; color = "var(--warn)"; }
  if (maintRatio > 0.95) { status = "🚨 DANGER"; color = "var(--bad)"; }

  return { 
    usedKRW_byKRW, 
    usedUSD_byUSD, 
    maintUsedKRW, 
    maintRatio, 
    status, 
    color,
    // 수정: 각 통화별 여유금은 해당 통화 Equity에서 직접 차감
    freeKRW: res.eqDom - usedKRW_byKRW,
    freeUSD: res.eqOvs - usedUSD_byUSD
  };
}

/**
 * 위탁증거금 계산: 마찬가지로 현재 열려있는 포지션 기준
 */
function calculateInitMarginSummary(res) {
  let initKRW_byKRW = 0, initUSD_byUSD = 0;

  res.openPos.forEach(p => {
    const m = master[p.asset];
    const absQty = Math.abs(p.qty);
    const perInitKRW = marginPerContractKRW(p.asset, p.currPrice, true);

    if (m.cur === "KRW") {
      initKRW_byKRW += perInitKRW * absQty;
    } else {
      const perInitUSD = marginPerContractUSD(p.asset, p.currPrice, true);
      initUSD_byUSD += perInitUSD * absQty;
    }
  });

  return { initKRW_byKRW, initUSD_byUSD };
}








/**
 * =========================================================================
 * [CORE RENDERING] 화면 전체 데이터 업데이트
 * 엔진에서 계산된 수치들을 대시보드 각 UI 요소에 바인딩합니다.
 * =========================================================================
 */
function renderAll() {
  const res = calculateEngine();

  // ---------------------------------------------------------
  // 1. 체결(Trade) 기준 성과 지표 계산
  // 전체 거래 단위를 대상으로 하되, 승/패 분류는 실현손익(수수료 제외) 기준으로 계산합니다.
  // ---------------------------------------------------------
  const tradeTotal = res.tradeTotal;
  const tradeWinRate = tradeTotal > 0 ? ((res.tradeWin / tradeTotal) * 100).toFixed(1) : "0.0";
  const tradePF = res.tradeLossSum > 0 ? (res.tradeWinSum / res.tradeLossSum).toFixed(2) : (res.tradeWinSum > 0 ? "∞" : "0.00");

  // ---------------------------------------------------------
  // 2. 우측 사이드바: 계좌 자산 및 리스크 지표 업데이트
  // ---------------------------------------------------------
  const risk = calculateStopRiskSummary(res);
  const margin = calculateMarginSummary(res);
  const initMargin = calculateInitMarginSummary(res);

  const availCashKRW = res.eqDom - initMargin.initKRW_byKRW;
  const availCashUSD = res.eqOvs - initMargin.initUSD_byUSD;
  const equityTotalKRW = res.eqDom + (res.eqOvs * globalFX);

  // 계좌 자산 표시
  document.getElementById('equity-dom').innerText = Math.round(res.eqDom).toLocaleString();
  document.getElementById('equity-ovs').innerText = "$" + res.eqOvs.toLocaleString(undefined, { minimumFractionDigits: 2 });
  document.getElementById('equity-total-krw-side').innerText = Math.round(equityTotalKRW).toLocaleString();
  
  // 리스크 지표 표시
  document.getElementById('stop-risk-krw-side').innerText = Math.round(risk.totalStopRiskKRW).toLocaleString() + " KRW";
  document.getElementById('risk-ratio').innerText = (risk.riskRatio * 100).toFixed(1) + "%";
  document.getElementById('margin-alert-side').innerHTML = `<span style="color:${margin.color}; font-weight:bold">${margin.status}</span>`;
  
  // 증거금 여유 표시
  document.getElementById('free-krw').innerText = Math.round(margin.freeKRW).toLocaleString() + " KRW";
  document.getElementById('free-usd').innerText = "$" + (margin.freeUSD).toLocaleString(undefined, { minimumFractionDigits: 2 });

  // ---------------------------------------------------------
  // 3. 중앙 대시보드: 실현 손익 상단 카드 업데이트
  // ---------------------------------------------------------
  const netRealizedKRWDom = res.rKRW_Dom - res.feeKRW_Dom;
  const netRealizedUSD = res.rUSD_Ovs - res.feeUSD_Ovs;
  const netRealizedKRWTotal = netRealizedKRWDom + (netRealizedUSD * globalFX);

  document.getElementById("total-realized-krw").innerText = Math.round(netRealizedKRWTotal).toLocaleString();
  const capitalTotalKRW = capitals.dom + (capitals.ovs * globalFX);
  const realizedPct = capitalTotalKRW ? (netRealizedKRWTotal / capitalTotalKRW) * 100 : 0;
  document.getElementById("total-realized-pct").innerText = realizedPct.toFixed(1) + "%";

  const realizedBreakdownEl = document.getElementById("total-realized-breakdown");
  if (realizedBreakdownEl) {
    realizedBreakdownEl.innerText = "₩" + Math.round(netRealizedKRWDom).toLocaleString() + " / $" + netRealizedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---------------------------------------------------------
  // 4. 미실현(평가) 손익률 및 가중치 계산
  // 각 포지션의 규모에 따라 평균적인 수익률(Weighted PnL%)을 계산합니다.
  // ---------------------------------------------------------
  let weightedUnrealTotal = 0; // 전체(KRW환산) 가중치 합
  let totalBaseTotal = 0;      // 전체 매입금액 합
  let weightedUnrealUSD = 0;   // USD 전용 가중치 합
  let totalBaseUSD = 0;        // USD 전용 매입금액 합
  let totalSumUnrealUSD = 0;   // USD 전용 평가손익 합계

  res.openPos.forEach(p => {
    if (!p.avgPrice || !p.currPrice) return;

    const dir = (p.qty > 0) ? 1 : -1;
    const pct = ((p.currPrice - p.avgPrice) / p.avgPrice) * 100 * dir;
    const baseValue = Math.abs(p.qty) * p.avgPrice; // 해당 통화 기준 매입 가치

    // (A) 전체 기준 누계 (KRW 환산)
    const baseKRW = (p.cur === "USD") ? baseValue * globalFX : baseValue;
    weightedUnrealTotal += pct * baseKRW;
    totalBaseTotal += baseKRW;

    // (B) 해외(USD) 기준 누계
    if (p.cur === "USD") {
      weightedUnrealUSD += pct * baseValue;
      totalBaseUSD += baseValue;
      totalSumUnrealUSD += p.uPnl;
    }
  });

  const unrealPctTotal = totalBaseTotal ? (weightedUnrealTotal / totalBaseTotal) : 0;
  const unrealPctUSD = totalBaseUSD ? (weightedUnrealUSD / totalBaseUSD) : 0;

  // 중앙 상단 미실현 손익 UI 업데이트
  document.getElementById('total-unrealized-krw').innerText = Math.round(res.unrealizedKRW).toLocaleString();
  document.getElementById('total-unrealized-pct').innerText = unrealPctTotal.toFixed(1) + "%";

  document.getElementById('total-unrealized-usd').innerText = totalSumUnrealUSD.toFixed(2);
  const usdPctEl = document.getElementById('total-unrealized-usd-pct');
  if (usdPctEl) usdPctEl.innerText = unrealPctUSD.toFixed(1) + "%";

  // ---------------------------------------------------------
  // 5. 증거금 사용률 및 주문 가능 금액 업데이트 (하단 리스크 카드)
  // ---------------------------------------------------------
  document.getElementById('maint-used-krw').innerText = Math.round(margin.usedKRW_byKRW).toLocaleString() + " KRW";
  document.getElementById('maint-used-usd').innerText = "$" + margin.usedUSD_byUSD.toFixed(2);
  document.getElementById('maint-free-krw').innerText = Math.round(margin.freeKRW).toLocaleString() + " KRW";
  document.getElementById('maint-free-usd').innerText = "$" + margin.freeUSD.toFixed(2);
  
  const maintRatioKRW = (res.eqDom > 0) ? (margin.usedKRW_byKRW / res.eqDom) : 0;
  const maintRatioUSD = (res.eqOvs > 0) ? (margin.usedUSD_byUSD / res.eqOvs) : 0;
  document.getElementById('maint-ratio-krw').innerText = (maintRatioKRW * 100).toFixed(1) + "%";
  document.getElementById('maint-ratio-usd').innerText = (maintRatioUSD * 100).toFixed(1) + "%";

  document.getElementById('init-used-krw').innerText = Math.round(initMargin.initKRW_byKRW).toLocaleString() + " KRW";
  document.getElementById('init-used-usd').innerText = "$" + initMargin.initUSD_byUSD.toFixed(2);
  document.getElementById('avail-cash-krw').innerText = Math.round(availCashKRW).toLocaleString() + " KRW";
  document.getElementById('avail-cash-usd').innerText = "$" + availCashUSD.toLocaleString(undefined, { minimumFractionDigits: 2 });

// --- [6] 퍼포먼스 요약 텍스트 업데이트 ---
  document.getElementById('perf-summary').innerHTML = `
    <!-- [첫 번째 칸] 통화별 실현 내역 및 수수료 (가독성 강화) -->
    <div>
      <span style="color:var(--muted)">통화별 실현 (수수료)</span><br>
      <b style="font-size:12px; color:var(--text);">
        ₩${Math.round(res.rKRW_Dom).toLocaleString()} / $${res.rUSD_Ovs.toFixed(2)}
      </b><br>
      <span style="color:var(--bad); font-size:11px; font-weight:bold;">
        (Fee ₩${Math.round(res.feeKRW_Dom).toLocaleString()} / $${res.feeUSD_Ovs.toFixed(2)})
      </span>
    </div>

    <!-- [두 번째 칸] 체결 기준 성과 -->
    <div>
      <span style="color:var(--muted)">체결 승률 / PF</span><br>
      <b style="font-size:12px;">${tradeTotal}회 / ${tradeWinRate}%</b><br>
      <span style="font-size:10px; color:var(--muted);">승 ${res.tradeWin} / 패 ${res.tradeLoss} / 중립 ${res.tradeNeutral}</span><br>
      <span style="font-size:11px; color:var(--accent);">PF ${tradePF}</span>
    </div>

    <!-- [세 번째 칸] 포지션 기준 성과 -->
    <div>
      <span style="color:var(--muted)">포지션 승률 / PF</span><br>
      <b style="font-size:12px;">${res.posTotal}회 /
      ${
        res.posTotal > 0
          ? ((res.posWin / res.posTotal) * 100).toFixed(1)
          : "0.0"
      }%</b><br>
      <span style="font-size:11px; color:var(--accent);">PF ${
        res.posLossSum > 0
          ? (res.posWinSum / res.posLossSum).toFixed(2)
          : (res.posWinSum > 0 ? "∞" : "0.00")
      }</span>
    </div>
  `;

  // ---------------------------------------------------------
  // 7. 기타 UI 갱신: 테이블 및 추가 매수 가능량
  // ---------------------------------------------------------
  renderTables(res, margin);      // 포지션 및 히스토리 테이블 재생성
  updateAvailContracts(res, margin); // 현재 설정된 상품의 추가 매수 가능량 계산
  runCalc();                      // 틱 가치 계산기 업데이트
}





function getPositionMemoSummary(asset, maturity) {
  const related = trades
    .filter(t => t.asset === asset && t.maturity === maturity && t.memo)
    .map(t => t.memo.trim())
    .filter(m => m.length > 0);

  if (related.length === 0) return "-";

  // 1개면 그대로
  if (related.length === 1) return related[0];

  // 여러 개면 요약
  return `${related[0]} +${related.length - 1}`;
}



function updateHistoryFocusUi() {
  const labelEl = document.getElementById('historyFocusLabel');
  const resetBtn = document.getElementById('historyFocusResetBtn');
  if (!labelEl || !resetBtn) return;

  if (!historyFocusKey) {
    labelEl.classList.add('hidden');
    resetBtn.classList.add('hidden');
    labelEl.textContent = '';
    return;
  }

  const [asset, maturity] = historyFocusKey.split('_');
  labelEl.textContent = (`필터: ${asset} ${maturity || ''}`).trim();
  labelEl.classList.remove('hidden');
  resetBtn.classList.remove('hidden');
}

function focusHistoryByPosition(positionKey) {
  historyFocusKey = positionKey;
  renderAll();
  const historyTable = document.getElementById('historyTable');
  if (historyTable) historyTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearHistoryFocus() {
  historyFocusKey = null;
  renderAll();
}

function renderTables(res, margin) {
  const openBody = document.querySelector('#openPosTable tbody');
  const histBody = document.querySelector('#historyTable tbody');
  const inputOrderMap = getTradeInputOrderMap();
  openBody.innerHTML = '';
  histBody.innerHTML = '';
  updateHistoryFocusUi();
  refreshSortHeaders();

  const editingTrade = editingId ? trades.find(t => t.id === editingId) : null;
  const editingKey = editingTrade ? `${editingTrade.asset}_${editingTrade.maturity}` : null;

  res.openPos.forEach(p => {
    const dte = Math.ceil((new Date(p.maturity) - new Date().setHours(0,0,0,0)) / 86400000);
    const pnlPct = pnlPctForPosition(p);
    const isRelated = (p.key === editingKey);
    const isFocused = (p.key === historyFocusKey);
    const memoSummary = getPositionMemoSummary(p.asset, p.maturity);
    const residualTrades = res.processed.filter(t => `${t.asset}_${t.maturity}` === p.key && (res.residualTradeQtyMap[t.id] || 0) > 0);
    const residualSummary = residualTrades.length > 0
      ? residualTrades.map(t => `#${inputOrderMap.get(t.id) || '-'} ${sideLabel(t.side)} ${res.residualTradeQtyMap[t.id]}`).join(' / ')
      : '-';

    openBody.innerHTML += `
      <tr class="${isRelated ? 'edit-active-row' : ''} ${isFocused ? 'history-focus-row' : ''}">
        <td><b>${p.asset}</b><br><small style="color:var(--muted)">${p.maturity || '-'}</small></td>
        <td>${sidePill(p.qty > 0 ? 'Buy' : 'Sell')}</td>
        <td class="${dte <= 3 ? 'down' : ''}">${isNaN(dte) ? '-' : dte + 'd'}</td>
        <td class="${p.qty > 0 ? 'up' : 'down'}">${p.qty}</td>
        <td>${Number(p.avgPrice).toFixed(2)}</td>
        <td>
          <input type="number"
                 value="${p.currPrice}"
                 onchange="updateMTM('${p.key}', this.value)"
                 class="td-input-mtm">
        </td>
        <td>-</td>
        <td>-</td>
        <td class="${pnlPct >= 0 ? 'up' : 'down'}">${pnlPct.toFixed(2)}%</td>
        <td class="${p.uPnl >= 0 ? 'up' : 'down'}">
          ${Math.round(p.cur === "USD" ? p.uPnl * globalFX : p.uPnl).toLocaleString()}
        </td>
        <td class="mono" title="${memoSummary}
잔존 lot: ${residualSummary}">${memoSummary}</td>
        <td>
          <button onclick="focusHistoryByPosition('${p.key}')" class="btn-outline btn-xs">관련 보기</button>
        </td>
      </tr>
    `;
  });

  const historyRows = res.processed.map(t => {
    const posKey = `${t.asset}_${t.maturity}`;
    const isSquared = !res.openPos.some(p => p.key === posKey);
    const residualQty = res.residualTradeQtyMap[t.id] || 0;
    const tradeStatus = t.isCloseTrade ? 'CLOSE' : 'OPEN';
    const contributesToOpen = residualQty > 0;
    return {
      ...t,
      posKey,
      isSquared,
      residualQty,
      tradeStatus,
      contributesToOpen,
      inputOrder: inputOrderMap.get(t.id) || 0,
      status: `${tradeStatus}_${isSquared ? 'SQUARED' : 'OPEN'}_${residualQty > 0 ? 'LIVE' : 'FLAT'}`
    };
  });

  sortRows(historyRows, 'history').forEach(t => {
    const qtyHint = t.contributesToOpen
      ? `<span class="pill pill-live">잔존 ${t.residualQty}</span>`
      : ((t.isCloseTrade && !t.isSquared) ? `<span class="pill" style="opacity:.7">포지션 진행중</span>` : '');
    const statusLabel = `
      <span class="pill">${t.tradeStatus}</span>
      ${t.isSquared ? `<span class="pill up">SQUARED</span>` : `<span class="pill muted">OPEN</span>`}
      ${qtyHint}
    `;
    const isEditingThis = (t.id === editingId);
    const isRelatedToFocus = (t.posKey === historyFocusKey);
    const rowClass = [
      isEditingThis ? 'edit-active-row' : '',
      isRelatedToFocus ? 'history-focus-row' : '',
      !isRelatedToFocus && t.contributesToOpen ? 'history-related-row' : ''
    ].filter(Boolean).join(' ');

    histBody.innerHTML += `
      <tr class="${rowClass}">
        <td><span class="pill pill-order">#${t.inputOrder || '-'}</span></td>
        <td>${t.date}</td>
        <td>${t.asset}</td>
        <td>${sidePill(t.side)}</td>
        <td>${t.price}</td>
        <td>${t.qty}</td>
        <td>${statusLabel}</td>
        <td>${t.stopLoss ?? '-'}</td>
        <td class="${t.netPnlCur >= 0 ? 'up' : 'down'}">${
          t.netPnlCur !== 0
            ? (t.cur === "USD"
                ? "$" + t.netPnlCur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : Math.round(t.netPnlCur).toLocaleString())
            : '-'
        }</td>
        <td class="${t.netPct >= 0 ? 'up' : 'down'}">${t.netPct !== 0 ? t.netPct.toFixed(2) + '%' : '-'}</td>
        <td>
          <button onclick="editTrade(${t.id})" class="btn-edit">수정</button>
          <button onclick="deleteTrade(${t.id})" class="btn-danger">삭제</button>
        </td>
        <td class="mono" title="${t.memo || '-'}">${t.memo ? t.memo : '-'}</td>
      </tr>`;
  });
}

/**
 * =========================
 * Performance report
 * =========================
 */


/**
 * =========================
 * Trade CRUD
 * =========================
 */


function deleteTrade(id) {
  if (!confirm("이 거래를 삭제하시겠습니까?")) return;

  trades = trades.filter(t => t.id !== id);
  localStorage.setItem('blotter_trades_v96', JSON.stringify(trades));

  blotterMeta.lastLocalInputAt = Date.now();
  saveMeta();
  updateSyncHeader();

  renderAll();
}


function addOrUpdateTrade() {
  const assetId = document.getElementById('asset').value;
  const price = parseFloat(document.getElementById('price').value);
  const date = document.getElementById('tradeDate').value;
  const qty = parseInt(document.getElementById('qty').value, 10);
  const fxRate = parseFloat(document.getElementById('fxRate').value);

  if (!date || !assetId || isNaN(price) || isNaN(qty) || isNaN(fxRate)) {
    return alert("정보를 정확히 입력하세요.");
  }

  const old = editingId ? trades.find(tr => tr.id === editingId) : null;

  const t = {
    id: editingId || Date.now(),
    createdAt: old?.createdAt ?? Date.now(),
    updatedAt: Date.now(),

    date,
    asset: assetId,
    maturity: document.getElementById('maturityDate').value,
    side: document.getElementById('side').value,
    price,
    qty,
    stopLoss: document.getElementById('stopLoss').value
      ? parseFloat(document.getElementById('stopLoss').value)
      : null,
    fxRate,
    memo: document.getElementById('memoInput').value || ""
  };

  if (editingId) {
    trades = trades.map(tr => (tr.id === editingId ? t : tr));
  } else {
    trades.push(t);
  }

localStorage.setItem('blotter_trades_v96', JSON.stringify(trades));

// ✅ 업데이트 버튼을 눌렀다는 "의미적 완료 시점"
blotterMeta.lastLocalInputAt = Date.now();
saveMeta();
updateSyncHeader();

// UI 정리는 그 다음
cancelEdit();

}





function editTrade(id) {
  const t = trades.find(tr => tr.id === id);
  if (!t) return;

  editingId = id; // 수정 중인 ID 설정

  // UI 상태 변경
  document.getElementById('inputCard').classList.add('edit-active');
  document.getElementById('inputTitle').innerText = "기록 수정 중...";
  document.getElementById('mainBtn').innerText = "업데이트";
  document.getElementById('resetBtn').classList.add('hidden');
  document.getElementById('cancelEditBtn').classList.remove('hidden');

  // 데이터 로드
  document.getElementById('tradeDate').value = t.date;
  document.getElementById('side').value = t.side;
  document.getElementById('asset').value = t.asset;
  document.getElementById('maturityDate').value = t.maturity;
  document.getElementById('price').value = t.price;
  document.getElementById('qty').value = t.qty;
  document.getElementById('stopLoss').value = t.stopLoss || "";
  document.getElementById('fxRate').value = t.fxRate;
  document.getElementById('memoInput').value = t.memo || "";

  syncDTEFromMaturity();
  
  // 테이블 하이라이트 갱신을 위해 재호출
  renderAll();

  // 입력창으로 부드럽게 스크롤
  document.getElementById('inputCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEdit() {
  editingId = null;
  
  // UI 원복
  document.getElementById('inputCard').classList.remove('edit-active');
  document.getElementById('inputTitle').innerText = "체결 입력";
  document.getElementById('mainBtn').innerText = "기록 저장";
  document.getElementById('resetBtn').classList.remove('hidden');
  document.getElementById('cancelEditBtn').classList.add('hidden');

  // 필드 초기화
  document.getElementById('price').value = "";
  document.getElementById('qty').value = "1";
  document.getElementById('stopLoss').value = "";
  document.getElementById('memoInput').value = "";
  document.getElementById('dteInput').value = "";
  document.getElementById('tradeDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('maturityDate').value = new Date().toISOString().split('T')[0];
  
  // 하이라이트 제거를 위해 갱신
  renderAll();
}
/**
 * 상품 마스터 리스트 렌더링
 * - 수수료 표시 추가 및 개별 강조 로직 포함
 */

function renderMaster() {
  const container = document.getElementById('master-list');
  const calcSelect = document.getElementById('calc-asset');
  if(!container) return;
  container.innerHTML = ''; calcSelect.innerHTML = '';

  Object.keys(master).forEach(k => {
    const m = master[k];
    const isEditing = (editingAsset === k);
    const marginHint = (m.marginType === "PCT")
      ? `PCT | 위탁 ${m.initMargin}% / 유지 ${m.maintMargin}% | 승수 ${m.multiplier}`
      : `FIXED | 위탁 ${m.initMargin}(${m.cur}) / 유지 ${m.maintMargin}(${m.cur})`;
    
    container.innerHTML += `
      <div class="master-item ${isEditing ? 'edit-active-item' : ''}" style="border-bottom:1px solid var(--line); padding:8px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <small><b>${k}</b> (${m.cur}) 수수료:${m.fee}</small>
          <div>
            <button class="btn-edit" onclick="editAsset('${k}')" style="padding:2px 5px;">편집</button>
            <button onclick="removeAsset('${k}')" class="btn-danger" style="padding:2px 5px;">X</button>
          </div>
        </div>
        <div style="font-size:10px; color:var(--muted); margin-top:4px;">${marginHint}</div>
      </div>`;
    calcSelect.innerHTML += `<option value="${k}">${k}</option>`;
  });
  initReportAssetFilter();
}

/**
 * 상품 편집 데이터 로드
 */
function editAsset(id) {
  const m = master[id];
  if (!m) return;

  editingAsset = id; 

  // UI 상태 변경
  document.getElementById('masterInputCard').classList.add('edit-active');
  document.getElementById('addAssetBtn').innerText = "상품 업데이트";
  document.getElementById('cancelMasterEditBtn').classList.remove('hidden');
  document.getElementById('masterResetBtn').innerText = "되돌리기"; // 편집 모드용 텍스트

  // 데이터 로드 (모든 필드 매칭)
  document.getElementById('newAsset').value = id;
  document.getElementById('newSymbol').value = m.symbol || "";
  document.getElementById('newYSymbol').value = m.ySymbol || "";
  document.getElementById('newCur').value = m.cur || "USD";
  document.getElementById('newMarginType').value = m.marginType || "FIXED";
  document.getElementById('newInitMargin').value = m.initMargin || 0;
  document.getElementById('newMaintMargin').value = m.maintMargin || 0;
  document.getElementById('newMultiplier').value = m.multiplier || 0;
  document.getElementById('newFee').value = m.fee || 0;
  document.getElementById('newTick').value = m.tick || 0;
  document.getElementById('newTickVal').value = m.tickVal || 0;
  document.getElementById('newDesc').value = m.desc || "";

  renderMaster(); 

  // 수정창으로 스크롤 이동
  document.getElementById('masterInputCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
}





function addOrUpdateAsset() {
  const id = document.getElementById('newAsset').value.trim().toUpperCase();
  if (!id) return alert("상품명을 입력하세요.");

  const m = {
    symbol: document.getElementById('newSymbol').value.trim(),
    ySymbol: document.getElementById('newYSymbol').value.trim(),
    tick: parseFloat(document.getElementById('newTick').value) || 0,
    tickVal: parseFloat(document.getElementById('newTickVal').value) || 0,
    fee: parseFloat(document.getElementById('newFee').value) || 0,
    cur: document.getElementById('newCur').value,
    marginType: document.getElementById('newMarginType').value,
    initMargin: parseFloat(document.getElementById('newInitMargin').value) || 0,
    maintMargin: parseFloat(document.getElementById('newMaintMargin').value) || 0,
    multiplier: parseFloat(document.getElementById('newMultiplier').value) || 0,
    desc: document.getElementById('newDesc').value.trim()
  };

  // [수정] 수정 모드일 때 기존 키를 삭제하고 새 키로 교체 (ID 변경 대응)
  if (editingAsset && editingAsset !== id) {
    delete master[editingAsset];
  }
  
  master[id] = m;
  localStorage.setItem('blotter_master_v96', JSON.stringify(master));


  blotterMeta.lastLocalInputAt = Date.now();
saveMeta();
updateSyncHeader();

  alert(editingAsset ? "수정되었습니다." : "추가되었습니다.");
  
  clearAssetForm(); // 여기서 UI 초기화 및 노란 테두리 제거가 실행됨
  initAssetSelect();
  onAssetChange();
}


/**
 * 초기화(또는 되돌리기) 로직
 */
/**
 * 초기화(Factory Reset) 로직
 * - 편집 중: 시스템 최초 기본값(DEFAULT_MASTER)으로 복구
 * - 신규 입력: 모든 칸 비움
 */
function masterResetForm() {
  if (editingAsset) {
    // 1. 시스템 최초 기본 설정(DEFAULT_MASTER)에서 해당 상품 정보를 찾음
    const factoryData = DEFAULT_MASTER[editingAsset];

    if (factoryData) {
      // 시스템 초기값이 존재하는 경우 (예: MES, MNQ, USDKRW 등)
      loadMasterToInputs(editingAsset, factoryData);
      alert(`${editingAsset} 상품을 시스템 초기 설정값으로 복구했습니다.`);
    } else {
      // 사용자가 직접 추가한 상품이라 초기값이 없는 경우
      clearInputs();
      alert("사용자 추가 상품입니다. 초기값이 없어 모든 칸을 비웁니다.");
    }
  } else {
    // 편집 중이 아닐 때: 단순히 입력창 비우기
    clearInputs();
  }
}

// 데이터를 입력창에 로드하는 공통 함수
function loadMasterToInputs(id, data) {
  document.getElementById('newAsset').value = id;
  document.getElementById('newSymbol').value = data.symbol || "";
  document.getElementById('newYSymbol').value = data.ySymbol || "";
  document.getElementById('newCur').value = data.cur || "USD";
  document.getElementById('newMarginType').value = data.marginType || "FIXED";
  document.getElementById('newInitMargin').value = data.initMargin || 0;
  document.getElementById('newMaintMargin').value = data.maintMargin || 0;
  document.getElementById('newMultiplier').value = data.multiplier || 0;
  document.getElementById('newFee').value = data.fee || 0;
  document.getElementById('newTick').value = data.tick || 0;
  document.getElementById('newTickVal').value = data.tickVal || 0;
  document.getElementById('newDesc').value = data.desc || "";
}

/**
 * 취소/완료 시 입력창 완전 리셋
 */
function clearAssetForm() {
  editingAsset = null;
  document.getElementById('masterInputCard').classList.remove('edit-active');
  document.getElementById('addAssetBtn').innerText = "상품 추가";
  document.getElementById('cancelMasterEditBtn').classList.add('hidden');
  document.getElementById('masterResetBtn').innerText = "초기화";

  clearInputs();
  renderMaster();
}

/**
 * 순수 필드 초기화 함수
 */
function clearInputs() {
  const fields = [
    'newAsset', 'newSymbol', 'newYSymbol', 'newInitMargin', 
    'newMaintMargin', 'newMultiplier', 'newFee', 'newTick', 
    'newTickVal', 'newDesc'
  ];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = "";
  });
  document.getElementById('newCur').value = "USD";
  document.getElementById('newMarginType').value = "FIXED";
}

function removeAsset(id) {
  if (!confirm("삭제?")) return;
  delete master[id];
  localStorage.setItem('blotter_master_v96', JSON.stringify(master));
  renderMaster();
  initAssetSelect();
  renderAll();

blotterMeta.lastLocalInputAt = Date.now();
saveMeta();
updateSyncHeader();
}

function updateM(a,f,v) {
  const numFields = new Set(["tick","tickVal","fee","initMargin","maintMargin","multiplier"]);
  master[a][f] = numFields.has(f) ? parseFloat(v) : v;
  localStorage.setItem('blotter_master_v96', JSON.stringify(master));
  onAssetChange();
  renderAll();
}

/**
 * =========================
 * UI Helpers
 * =========================
 */
function initAssetSelect() {
  const s = document.getElementById('asset');
  s.innerHTML = "";
  Object.keys(master).forEach(k => s.innerHTML += `<option value="${k}">${k}</option>`);
  if (!s.value) s.value = Object.keys(master)[0] || "";
  initReportAssetFilter();
}

function initReportAssetFilter(sourceTrades = trades) {
  const reportSelect = document.getElementById("repAssetFilter");
  if (!reportSelect) return;

  const prev = reportSelect.value || "ALL";
  const idsFromMaster = Object.keys(master || {});
  const idsFromTrades = Array.from(new Set((sourceTrades || []).map(t => t.asset).filter(Boolean)));
  const assetIds = Array.from(new Set([...idsFromMaster, ...idsFromTrades])).sort();

  reportSelect.innerHTML = `<option value="ALL">전체 상품</option>`;
  assetIds.forEach(k => reportSelect.innerHTML += `<option value="${k}">${k}</option>`);
  reportSelect.value = assetIds.includes(prev) ? prev : "ALL";
}
// 전역 변수에 위젯 저장 객체 추가
let tvWidget = null;

function updateTVChart() {
  if (isStealth) return;
  const assetId = document.getElementById('asset').value;
  const m = master[assetId];
  if (!m?.symbol) return;

  // 기존 위젯이 있다면 제거 (메모리 관리)
  const container = document.getElementById('fx-chart-mini');
  container.innerHTML = ""; 

  tvWidget = new TradingView.widget({
    "autosize": true,
    "symbol": m.symbol,
    "interval": document.getElementById('tv-interval').value,
    "theme": document.getElementById('tv-theme').value,
    "style": "1",
    "locale": "ko",
    "toolbar_bg": "#141824",
    "enable_publishing": false,
    "hide_top_toolbar": true,
    "save_image": false,
    "container_id": "fx-chart-mini"
  });
}

function toggleStealthMode() {
  isStealth = !isStealth;
  document.getElementById('chartCard').classList.toggle('hidden');
}

function onAssetChange() {
  const assetId = document.getElementById('asset').value;
  const m = master[assetId];
  if (!m) return;

  document.getElementById('fxRate').value = (m.cur === "KRW") ? 1 : Number(globalFX).toFixed(2);
  
  // --- [추가된 로직]: 상품 변경 시 저장된 최신 시세가 있다면 체결가 칸에 입력 ---
  if (mtmPrices[`LAST_${assetId}`]) {
      document.getElementById('price').value = mtmPrices[`LAST_${assetId}`];
  } else {
      document.getElementById('price').value = ""; // 시세가 없으면 비움
  }
  // ----------------------------------------------------------------------

  updateTVChart();
  runCalc();
  renderAll(); 
}

function updateMTM(k, v) {
  const n = parseFloat(v);
  if (isNaN(n)) return;
  mtmPrices[k] = n;
  localStorage.setItem('blotter_mtm_v96', JSON.stringify(mtmPrices));
  renderAll();
}

function runCalc() {
  const assetId = document.getElementById('calc-asset').value;
  const ticks = parseFloat(document.getElementById('calc-ticks').value) || 0;
  const m = master[assetId];
  if (!m) return;

  const valUSD = (m.cur === "USD") ? (ticks * m.tickVal) : (ticks * m.tickVal / globalFX);
  const valKRW = (m.cur === "KRW") ? (ticks * m.tickVal) : (ticks * m.tickVal * globalFX);

  const valPerPointUSD = (1.0 / m.tick) * m.tickVal;
  const valPerPointKRW = (m.cur === "USD") ? (valPerPointUSD * globalFX) : valPerPointUSD;

  document.getElementById('calc-result').innerHTML =
    `수익: <b>${m.cur === "USD" ? "$" : "₩"}${valUSD.toLocaleString(undefined, {minimumFractionDigits: 2})} / ₩${valKRW.toLocaleString(undefined, {maximumFractionDigits:0})}</b>` +
    `<br><span style="color:var(--accent)">1포인트(1.0) 가치: ${m.cur === "USD" ? "$" + valPerPointUSD.toFixed(1) : ""} (약 ₩${Math.round(valPerPointKRW).toLocaleString()})</span>`;
}


function markLocalDirty() {
  blotterMeta.lastLocalInputAt = Date.now();
  saveMeta();
  updateSyncHeader();
}



function clearAllData() {
  if (!confirm("⚠️ 모든 데이터와 설정을 초기화합니다. 계속할까요?")) return;

  localStorage.removeItem('blotter_trades_v96');
  localStorage.removeItem('blotter_mtm_v96');
  localStorage.removeItem('blotter_master_v96');
  localStorage.removeItem('blotter_capitals_v96');
  localStorage.removeItem('blotter_atm_v96');
  localStorage.removeItem('blotter_meta_v96');

  location.reload(); // 가장 안전
}

/**
 * =========================
 * Additional buyable contracts
 * =========================
 */
function updateAvailContracts(res=null, margin=null){
  // compute with latest snapshot if not passed
  if(!res) res = calculateEngine();
  if(!margin) margin = calculateMarginSummary(res);

  const assetId = document.getElementById('asset').value;
  const m = master[assetId];
  if(!m) return;

  const priceInput = safeNum(document.getElementById('price').value, 0);
  const refPrice = priceInput || mtmPrices[`${assetId}_${document.getElementById('maturityDate').value}`] || 0;

  // 계약당 "위탁" 기준(주문/위탁)으로 추가매수 계산
  const perInitKRW = marginPerContractKRW(assetId, refPrice, true);
  const perInitUSD = marginPerContractUSD(assetId, refPrice, true);

  // free margin by currency
  const freeKRW = margin.freeKRW;
  const freeUSD = margin.freeUSD;

  const availKRW = (perInitKRW > 0) ? Math.max(0, Math.floor(freeKRW / perInitKRW)) : 0;
  const availUSD = (perInitUSD > 0) ? Math.max(0, Math.floor(freeUSD / perInitUSD)) : 0;

  document.getElementById('availKRW').innerText = isFinite(availKRW) ? availKRW : '-';
  document.getElementById('availUSD').innerText = isFinite(availUSD) ? availUSD : '-';

  // pill (asset currency 기준 우선)
  let pillText = "추가매수: -";
  if(m.cur === "KRW") pillText = `추가매수: ${availKRW} (KRW)`;
  else pillText = `추가매수: ${availUSD} (USD)`;
  document.getElementById('availContractsPill').innerText = pillText;
}

function updateAvailContractsOnPrice(){ // on price input
  renderAll();
}

/**
 * =========================
 * Boot
 * =========================
 */
window.onload = async () => {
  initAssetSelect();
  renderMaster();
  loadCapitals();

  document.getElementById('tradeDate').value = new Date().toISOString().split('T')[0];

  if (!document.getElementById('maturityDate').value) {
    document.getElementById('maturityDate').value = new Date().toISOString().split('T')[0];
  }

  syncDTEFromMaturity();

  renderATM();
  onAssetChange();
  renderAll();
  syncMarketPrices();
  updateSyncHeader();
  initAutoSyncUI();
  bindAuthAutoActions();

  // 로그인 표시를 먼저 반영
  await updateSyncAuthUI();

  // 자동 import/export는 백그라운드로 실행
  runAutoCloudActionsFromSession('boot')
    .catch((err) => console.error('boot auto actions failed:', err))
    .finally(() => {
      updateSyncAuthUI();
    });

  setTimeout(() => {
    runAutoCloudActionsFromSession('boot-delayed')
      .catch((err) => console.error('boot-delayed auto actions failed:', err))
      .finally(() => {
        updateSyncAuthUI();
      });
  }, 1500);
};



/**
 * 리포트 및 세팅용 추가 함수
 */

function renderPerformanceReport() {
  const start = document.getElementById('repStartDate').value;
  const end = document.getElementById('repEndDate').value;
  const res = calculateEngine();
  const processed = res.processed;
  initReportAssetFilter(processed);
  const assetFilter = document.getElementById("repAssetFilter")?.value || "ALL";
  // 선택한 기간에 해당하는 거래만 필터링
  const filtered = processed.filter(t => (!start || t.date >= start) && (!end || t.date <= end) && (assetFilter === "ALL" || t.asset === assetFilter));

  // --- [데이터 집계 변수] ---
  let realizedKRW = 0, realizedUSD = 0;
  let feeKRW = 0, feeUSD = 0;

  // 체결(Trade) 기준 변수
  let tWin = 0, tLoss = 0;
  let tWinSum = 0, tLossSum = 0;



  const body = document.querySelector('#repDetailTable tbody');
  body.innerHTML = '';
  refreshSortHeaders();

  const reportRows = sortRows(filtered.map(t => ({
    ...t,
    status: t.currentNetQty === 0 ? 'SQUARED' : (t.isCloseTrade ? 'CLOSE' : 'OPEN')
  })), 'report');

  reportRows.forEach(t => {
    // 1. 기본 손익/수수료 누적
    if (t.cur === "USD") {
      realizedUSD += t.realizedPnlCur;
      feeUSD += t.feeCur;
    } else {
      realizedKRW += t.realizedPnlCur;
      feeKRW += t.feeCur;
    }

    // 2. 체결 기준 집계 (전체 거래 단위)
    // 수수료로만 마이너스인 경우(실현손익 0)는 패배로 보지 않고 중립 처리
    if (t.realizedPnlKRW > 0) {
      tWin++;
      tWinSum += t.realizedPnlKRW;
    } else if (t.realizedPnlKRW < 0) {
      tLoss++;
      tLossSum += Math.abs(t.realizedPnlKRW);
    }

    // 3. 테이블 행 추가
    const statusLabel = t.status;
    body.innerHTML += `
      <tr>
        <td>${t.date}</td>
        <td>${t.asset}</td>
        <td>${sidePill(t.side)}</td>
        <td>${t.price.toLocaleString()}</td>
        <td>${t.qty}</td>
        <td><span class="pill">${statusLabel}</span></td>
        <td>${t.cur === "USD" ? "$" + t.realizedPnlCur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(t.realizedPnlCur).toLocaleString()}</td>
        <td style="color:var(--bad)">${t.cur === "USD" ? "$" + t.feeCur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(t.feeCur).toLocaleString()}</td>
        <td><b>${t.cur === "USD" ? "$" + t.netPnlCur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(t.netPnlCur).toLocaleString()}</b></td>
        <td class="${t.netPct >= 0 ? 'up' : 'down'}">${t.netPct.toFixed(2)}%</td>
        <td class="mono" style="font-size:10px; opacity:0.7;">${t.memo || '-'}</td>
      </tr>`;
  });

  // --- [최종 성과 지표 계산] ---
  
  // 체결 기준 승률/PF
  const tTotal = filtered.length;
  const tWinRate = tTotal > 0 ? ((tWin / tTotal) * 100).toFixed(1) : "0.0";
  const tPF = tLossSum > 0 ? (tWinSum / tLossSum).toFixed(2) : (tWinSum > 0 ? "∞" : "0.00");

  // 포지션 기준 승률/PF (사이클 단위)
  const periodPos = calculatePositionOutcomes(filtered);
  const pWin = periodPos.win;
  const pLoss = periodPos.loss;
  const pWinSum = periodPos.winSum;
  const pLossSum = periodPos.lossSum;
  const pTotal = periodPos.total;
  const pWinRate = pTotal > 0 ? ((pWin / pTotal) * 100).toFixed(1) : "0.0";
  const pPF = pLossSum > 0 ? (pWinSum / pLossSum).toFixed(2) : (pWinSum > 0 ? "∞" : "0.00");

  // --- [UI 업데이트] ---
  const realizedKRWTotal = realizedKRW + (realizedUSD * globalFX);
  const feeKRWTotal = feeKRW + (feeUSD * globalFX);
  const netKRWTotal = realizedKRWTotal - feeKRWTotal;

  document.getElementById('rep-realized').innerText = Math.round(realizedKRWTotal).toLocaleString();
  document.getElementById('rep-fee').innerText = "-" + Math.round(feeKRWTotal).toLocaleString();
  document.getElementById('rep-net').innerText = Math.round(netKRWTotal).toLocaleString();

  const netKRW = realizedKRW - feeKRW;
  const netUSD = realizedUSD - feeUSD;
  const repRealizedBreakdown = document.getElementById('rep-realized-breakdown');
  if (repRealizedBreakdown) repRealizedBreakdown.innerText = "₩" + Math.round(realizedKRW).toLocaleString() + " / $" + realizedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const repFeeBreakdown = document.getElementById('rep-fee-breakdown');
  if (repFeeBreakdown) repFeeBreakdown.innerText = "₩" + Math.round(feeKRW).toLocaleString() + " / $" + feeUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const repNetBreakdown = document.getElementById('rep-net-breakdown');
  if (repNetBreakdown) repNetBreakdown.innerText = "₩" + Math.round(netKRW).toLocaleString() + " / $" + netUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  // 승률 표시 (체결 / 포지션)
  document.getElementById('rep-winrate').innerHTML = 
    `<span style="color:var(--text)">${tWinRate}%</span> <span style="color:var(--muted); font-size:10px;">/</span> <span style="color:var(--accent)">${pWinRate}%</span>`;
  
  // PF 표시 (체결 / 포지션)
  document.getElementById('rep-pf').innerHTML = 
    `<span style="color:var(--text)">${tPF}</span> <span style="color:var(--muted); font-size:10px;">/</span> <span style="color:var(--accent)">${pPF}</span>`;
}

// 2. ATM 기록 관리
function addATMRecord() {
  const acc = document.getElementById('atm-account').value;
  const date = document.getElementById('atm-date').value;
  const amt = parseFloat(document.getElementById('atm-amount').value);
  const memo = document.getElementById('atm-memo').value;

  if(!date || isNaN(amt)) return alert("날짜와 금액을 정확히 입력하세요.");

  atmRecords.push({ id: Date.now(), acc, date, amt, memo });
  localStorage.setItem('blotter_atm_v96', JSON.stringify(atmRecords));
  
  document.getElementById('atm-amount').value = "";
  document.getElementById('atm-memo').value = "";
blotterMeta.lastLocalInputAt = Date.now();
saveMeta();
updateSyncHeader();

}

function renderATM() {
  const body = document.querySelector('#atmTable tbody');
  if(!body) return;
  body.innerHTML = '';
  let moveDom = 0, moveOvs = 0;

  [...atmRecords].sort((a,b) => b.date.localeCompare(a.date)).forEach(r => {
    if(r.acc === 'DOM') moveDom += r.amt; else moveOvs += r.amt;
    body.innerHTML += `
      <tr>
        <td>${r.date}</td><td style="color:${r.acc==='DOM'?'var(--accent)':'var(--warn)'}">${r.acc}</td>
        <td class="${r.amt>=0?'up':'down'}">${r.amt.toLocaleString()}</td><td>${r.memo || '-'}</td>
        <td><button class="btn-danger" style="padding:2px 6px;" onclick="deleteATM(${r.id})">삭제</button></td>
      </tr>`;
  });
  document.getElementById('atm-total-dom').innerText = moveDom.toLocaleString();
  document.getElementById('atm-total-ovs').innerText = moveOvs.toLocaleString();
}

function deleteATM(id) {
  if (!confirm("삭제하시겠습니까?")) return;

  atmRecords = atmRecords.filter(r => r.id !== id);
  localStorage.setItem('blotter_atm_v96', JSON.stringify(atmRecords));

  blotterMeta.lastLocalInputAt = Date.now();
  saveMeta();
  updateSyncHeader();

  renderATM();
  renderAll();
}

function updateSyncHeader() {
  const localEl  = document.getElementById('sync-local');
  const importEl = document.getElementById('sync-import');
  const exportEl = document.getElementById('sync-export');

  if (!localEl || !importEl || !exportEl) return;

  const local = blotterMeta.lastLocalInputAt;
  const imp   = blotterMeta.lastImportedInputAt;
  const exp   = blotterMeta.lastExportedInputAt;

  // 시간 표시
  localEl.innerText  = fmtTime(local);
  importEl.innerText = fmtTime(imp);
  exportEl.innerText = fmtTime(exp);

  // 상태 초기화
  [localEl, importEl, exportEl].forEach(el =>
    el.classList.remove('sync-ok', 'sync-warn', 'sync-danger')
  );

  const status = getSyncStatus(local, imp, exp);

  if (status === 'OK') {
    localEl.classList.add('sync-ok');
    importEl.classList.add('sync-ok');
    exportEl.classList.add('sync-ok');
  }

  if (status === 'WARN') {
    localEl.classList.add('sync-warn');
    importEl.classList.add('sync-warn');
    exportEl.classList.add('sync-warn');
  }

  if (status === 'DANGER') {
    importEl.classList.add('sync-danger');
    localEl.classList.add('sync-warn');
    exportEl.classList.add('sync-warn');
  }

  maybeScheduleAutoSync(status);

  // INIT: 아무것도 없으면 굳이 색칠 안 함(원하면 warn 처리 가능)
}

function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // "" -> escaped quote
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

function getSyncStatus(local, imp, exp) {
  const L = local ? Number(local) : null;
  const I = imp   ? Number(imp)   : null;
  const E = exp   ? Number(exp)   : null;

  if (!L) return 'INIT';

  // 🚨 CSV가 더 최신 → 덮어쓰기 위험
  if (I && I > L) return 'DANGER';

  // 🔵 LOCAL이 IMPORT 또는 EXPORT와 동일
  if ((I && L === I) || (E && L === E)) return 'OK';

  // 🟡 그 외는 전부 경고
  return 'WARN';
}

function toggleHeaderInfo() {
  const fxContainer = document.getElementById('fx-container');
  const toggleBtn = document.getElementById('toggleHeaderInfoBtn');

  if (!fxContainer || !toggleBtn) return;

  const expanded = fxContainer.classList.toggle('expanded');
  toggleBtn.textContent = expanded ? '시세/싱크 접기' : '시세/싱크 펼치기';
}
