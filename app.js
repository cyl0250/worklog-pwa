// === 설정: 본인 Apps Script Web App URL + token ===
const GAS_URL = "https://script.google.com/macros/s/AKfycbx_WvW6QAiGBajEcIMyLNV6BzMd-IwGArlnmdRryXfhnmG0D7r4cwBzxQZw6wZJtJvv/exec"; // 예: https://script.google.com/macros/s/....../exec
const TOKEN  = "worklog2026"; // Apps Script의 API_TOKEN과 동일하게

const $ = (id) => document.getElementById(id);

function fmt(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function todayStr() { return fmt(new Date()); }
function yesterdayStr() { const d=new Date(); d.setDate(d.getDate()-1); return fmt(d); }

async function apiGet(action, params = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", TOKEN);
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  return res.json();
}
async function apiPost(action, body = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", TOKEN);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(body)
  });
  return res.json();
}

function escapeHtml(s) {
  return (s||"").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}

/** ====== Big Confirm Dialog ====== */
function showBigConfirm({ title, message, yesText="덮어쓰기", noText="취소" }) {
  return new Promise((resolve) => {
    const dlg = $("confirmDlg");
    $("confirmTitle").textContent = title;
    $("confirmMsg").textContent = message;

    const yesBtn = $("confirmYes");
    const noBtn = $("confirmNo");
    yesBtn.textContent = yesText;
    noBtn.textContent = noText;

    const cleanup = () => {
      yesBtn.onclick = null;
      noBtn.onclick = null;
      dlg.oncancel = null;
    };

    yesBtn.onclick = () => { cleanup(); dlg.close(); resolve(true); };
    noBtn.onclick = () => { cleanup(); dlg.close(); resolve(false); };
    dlg.oncancel = () => { cleanup(); resolve(false); };

    dlg.showModal();
  });
}

function collectValues(boxId, selector, joiner) {
  const box = $(boxId);
  const arr = Array.from(box.querySelectorAll(selector))
    .map(el => (el.value || "").trim())
    .filter(v => v.length > 0);
  return arr.join(joiner);
}

function hasAnyInput() {
  const leader = collectValues("leaderBox", ".leader", "").trim();
  const workers = collectValues("workersBox", ".worker", "").trim();
  const work = collectValues("workBox", ".work", "").trim();
  return (leader.length + workers.length + work.length) > 0;
}

/** ====== Dynamic fields (+추가) ====== */
function addInput(boxId, className, placeholder) {
  const box = $(boxId);
  const input = document.createElement("input");
  input.className = className;
  input.placeholder = placeholder;
  box.appendChild(input);
  input.focus();
}
function addTextarea(boxId, className, placeholder) {
  const box = $(boxId);
  const ta = document.createElement("textarea");
  ta.className = className;
  ta.placeholder = placeholder;
  box.appendChild(ta);
  ta.focus();
}
function keepOnlyFirst(boxId) {
  const box = $(boxId);
  while (box.children.length > 1) box.removeChild(box.lastChild);
}
function setFirstValue(boxId, selector, value) {
  const box = $(boxId);
  const first = box.querySelector(selector);
  if (first) first.value = value || "";
}
function clearAll(boxId, selector) {
  const box = $(boxId);
  box.querySelectorAll(selector).forEach(el => el.value = "");
}
function setLastFieldText(boxId, selector, text) {
  const box = $(boxId);
  const fields = box.querySelectorAll(selector);
  const last = fields[fields.length - 1];
  if (!last) return;

  if (last.tagName === "TEXTAREA") last.value = (last.value ? last.value + "\n" : "") + text;
  else last.value = text;
}

/** ====== Wrap text by separators (comma/slash) ====== */
function wrapText(text, maxLen = 30) {
  const s = (text || "").trim();
  if (!s) return "";

  const tokens = [];
  const re = /([^,\/]+)|([,\/])/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) tokens.push(m[1].trim());
    if (m[2]) tokens.push(m[2]);
  }

  const lines = [];
  let line = "";

  const pushLine = () => {
    if (line.trim()) lines.push(line.trim());
    line = "";
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t === "," || t === "/") {
      if (!line) line = t;
      else line += t;
      if (i < tokens.length - 1) line += " ";
      continue;
    }

    if (!line) {
      line = t;
    } else {
      const candidate = line + t;
      if (candidate.length <= maxLen) line = candidate;
      else { pushLine(); line = t; }
    }
  }
  pushLine();
  return lines.join("\n");
}

/** ====== Sites ====== */
async function loadSites() {
  const data = await apiGet("sites");
  if (!data.ok) return alert(data.error || "sites_error");

  const sel = $("site");
  sel.innerHTML = "";
  data.sites.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  });

  const ssel = $("searchSite");
  ssel.innerHTML = `<option value="">(전체 현장)</option>`;
  data.sites.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s; opt.textContent = s;
    ssel.appendChild(opt);
  });

  const lastSite = localStorage.getItem("lastSite");
  if (lastSite) sel.value = lastSite;
}

/** ====== Prefill (yesterday + selected site) ====== */
async function applyYesterdayPrefillForSelectedSite() {
  const selectedSite = $("site").value || "";
  const data = await apiGet("prefill", { date: yesterdayStr(), site: selectedSite });
  if (!data.ok) return alert(data.error || "prefill_error");

  const p = data.prefill;
  const leaderVal  = p ? (p.leader || "")  : "";
  const workersVal = p ? (p.workers || "") : "";
  const workVal    = p ? (p.work || "")    : "";

  const useLeader = $("useLeader").checked;
  const useWorkers = $("useWorkers").checked;
  const useWork = $("useWork").checked;

  keepOnlyFirst("leaderBox");
  if (useLeader) setFirstValue("leaderBox", ".leader", leaderVal);
  else clearAll("leaderBox", ".leader");

  keepOnlyFirst("workersBox");
  if (useWorkers) setFirstValue("workersBox", ".worker", workersVal);
  else clearAll("workersBox", ".worker");

  keepOnlyFirst("workBox");
  if (useWork) setFirstValue("workBox", ".work", workVal);
  else clearAll("workBox", ".work");
}

async function confirmAndApplyPrefillBig(reasonText, revertFn) {
  if (!hasAnyInput()) {
    await applyYesterdayPrefillForSelectedSite();
    return true;
  }

  const ok = await showBigConfirm({
    title: "전날값 적용",
    message: `${reasonText}\n전날값으로 덮어쓰시겠습니까?`,
    yesText: "덮어쓰기",
    noText: "취소"
  });

  if (ok) {
    await applyYesterdayPrefillForSelectedSite();
    return true;
  } else {
    if (typeof revertFn === "function") revertFn();
    return false;
  }
}

/** ====== Save (update if same date+site exists) ====== */
async function save() {
  const payload = {
    date: $("date").value,
    site: $("site").value,
    // 팀 단위 저장: 줄바꿈 join
    leader: collectValues("leaderBox", ".leader", "\n"),
    workers: collectValues("workersBox", ".worker", "\n"),
    work: collectValues("workBox", ".work", "\n---\n")
  };

  if (!payload.site) return alert("현장을 선택하세요.");
  if (!payload.work) return alert("작업내용을 입력하세요.");

  const data = await apiPost("save", payload);
  if (!data.ok) return alert(data.error || "save_error");

  localStorage.setItem("lastSite", payload.site);
  alert(data.mode === "updated" ? "저장 완료(수정)" : "저장 완료");
}

/** ====== Search all (paged) + tap to load ====== */
async function searchAll() {
  const keyword = $("keyword").value.trim();
  const site = $("searchSite").value;
  const from = $("from").value;
  const to = $("to").value;

  const all = [];
  let offset = 0;
  const limit = 300;

  while (true) {
    const data = await apiGet("search", { keyword, site, from, to, offset, limit });
    if (!data.ok) return alert(data.error || "search_error");

    const page = data.page;
    const items = page.items || [];
    all.push(...items);

    if (items.length < limit) break;
    offset = page.nextOffset || (offset + items.length);

    if (all.length >= 30000) {
      alert("결과가 너무 많아서 30,000건까지만 표시합니다. 키워드/기간/현장 필터를 사용해 주세요.");
      break;
    }
  }

  renderResults(all);
}

function splitToInputs(boxId, className, placeholder, text, splitterRegexOrString, isTextarea=false) {
  keepOnlyFirst(boxId);
  const first = $(boxId).querySelector("." + className);
  if (first) first.value = "";

  const parts = (text || "").split(splitterRegexOrString).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return;

  setFirstValue(boxId, "." + className, parts[0]);

  for (let i = 1; i < parts.length; i++) {
    if (isTextarea) addTextarea(boxId, className, placeholder);
    else addInput(boxId, className, placeholder);
    setLastFieldText(boxId, "." + className, parts[i]);
  }
}

async function loadItemToForm(rowId) {
  const data = await apiGet("getOne", { rowId });
  if (!data.ok) return alert(data.error || "getOne_error");
  const it = data.item;
  if (!it) return alert("기록을 찾을 수 없습니다.");

  $("date").value = it.date;
  $("site").value = it.site;
  localStorage.setItem("lastSite", it.site);

  $("useLeader").checked = true;
  $("useWorkers").checked = true;
  $("useWork").checked = true;

  splitToInputs("leaderBox", "leader", "팀장 (한 칸 = 한 팀)", it.leader, /\r?\n/, false);
  splitToInputs("workersBox", "worker", "작업자 (한 칸 = 한 팀)", it.workers, /\r?\n/, false);
  splitToInputs("workBox", "work", "작업내용", it.work, /\n---\n/, true);
}

function renderResults(items) {
  const box = $("results");
  box.innerHTML = "";
  if (!items || items.length === 0) {
    box.innerHTML = `<div class="muted">검색 결과 없음</div>`;
    return;
  }

  items.forEach(it => {
    const div = document.createElement("div");
    div.className = "card";
    div.style.cursor = "pointer";
    div.innerHTML = `
      <div><b>${it.date}</b> · ${escapeHtml(it.site)}</div>
      <div class="muted">팀장: ${escapeHtml((it.leader || "").replace(/\r?\n/g, " / ") || "-")}</div>
      <div class="muted">작업자: ${escapeHtml((it.workers || "").replace(/\r?\n/g, " / ") || "-")}</div>
      <div class="muted" style="margin-top:8px;">(탭하면 불러오기)</div>
    `;
    div.addEventListener("click", async () => {
      const ok = await showBigConfirm({
        title: "기록 불러오기",
        message: "검색 결과를 불러오면 현재 입력이 덮어써질 수 있습니다.\n불러오시겠습니까?",
        yesText: "불러오기",
        noText: "취소"
      });
      if (!ok) return;
      await loadItemToForm(it.rowId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    box.appendChild(div);
  });
}

/** ====== Speech ====== */
function startSpeechTo(target) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return alert("이 기기/브라우저는 음성 입력을 지원하지 않습니다. Chrome 권장");

  const rec = new SpeechRecognition();
  rec.lang = "ko-KR";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    if (target === "leader") setLastFieldText("leaderBox", ".leader", text);
    if (target === "workers") setLastFieldText("workersBox", ".worker", text);
    if (target === "work") setLastFieldText("workBox", ".work", text);
  };
  rec.onerror = () => alert("음성 인식 실패. 마이크 권한/네트워크 확인");
  rec.start();
}

/** ====== Daily text ====== */
async function fetchTodayAll() {
  const date = $("date").value || todayStr();
  const data = await apiGet("todayAll", { date });
  if (!data.ok) throw new Error(data.error || "todayAll_error");
  return data.items || [];
}

function splitLines(text) {
  return (text || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}
function isCountOnly(s) {
  const t = (s || "").replace(/\s+/g, "");
  return /^\d+명$/.test(t) || /^\?명$/.test(t);
}

function buildDailyText(items) {
  const d = $("date").value || todayStr();
  let out = `출력일보\n날짜: ${d}\n\n`;

  if (!items || items.length === 0) {
    out += "오늘 등록된 작업이 없습니다.";
    return out;
  }

  items.forEach((it, idx) => {
    out += `${idx+1}. ${it.site}\n`;

    const leaders = splitLines(it.leader);
    const workerTeams = splitLines(it.workers);
    const teamCount = Math.max(leaders.length, workerTeams.length, 1);

    for (let t = 0; t < teamCount; t++) {
      const leader = leaders[t] || leaders[0] || "-";
      const workersRaw = workerTeams[t] || workerTeams[0] || "";

      let line;
      if (!workersRaw) {
        line = `${leader} -`;
      } else if (isCountOnly(workersRaw)) {
        line = `${leader} 근로자 ${workersRaw.replace(/\s+/g, "")}`;
      } else {
        const names = workersRaw
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
          .join(" ");
        line = `${leader} ${names}`;
      }

      const wrapped = wrapText(line, 34)
        .split("\n")
        .map((ln, i) => (i === 0 ? ln : "  " + ln))
        .join("\n");

      out += `- ${wrapped}\n`;
    }

    out += "\n";
  });

  return out.trim();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}
async function shareText(text) {
  if (navigator.share) {
    await navigator.share({ text });
    return true;
  }
  return false;
}
async function openDailyDialog() {
  const items = await fetchTodayAll();
  const text = buildDailyText(items);
  $("dailyText").value = text;
  $("dailyDlg").showModal();
}

/** ====== Init ====== */
document.addEventListener("DOMContentLoaded", async () => {
  $("date").value = todayStr();

  await loadSites();
  await applyYesterdayPrefillForSelectedSite();

  // site change confirm + prefill
  let prevSite = $("site").value;
  $("site").addEventListener("focus", () => { prevSite = $("site").value; });
  $("site").addEventListener("change", async () => {
    await confirmAndApplyPrefillBig(
      "현장을 변경하면 입력 중인 내용이 덮어써질 수 있습니다.",
      () => { $("site").value = prevSite; }
    );
    localStorage.setItem("lastSite", $("site").value);
  });

  // checkbox confirm
  ["useLeader","useWorkers","useWork"].forEach(id => {
    $(id).addEventListener("change", async () => {
      const ok = await showBigConfirm({
        title: "전날값 설정 변경",
        message: "설정을 바꾸면 입력이 덮어써질 수 있습니다.\n전날값으로 다시 적용할까요?",
        yesText: "적용",
        noText: "취소"
      });
      if (!ok) { $(id).checked = !$(id).checked; return; }
      await applyYesterdayPrefillForSelectedSite();
    });
  });

  $("btnSave").onclick = save;
  $("btnSearch").onclick = searchAll;
  $("btnPrefill").onclick = () => applyYesterdayPrefillForSelectedSite();

  $("addLeader").onclick = () => addInput("leaderBox", "leader", "팀장 (한 칸 = 한 팀)");
  $("addWorker").onclick = () => addInput("workersBox", "worker", "작업자 (한 칸 = 한 팀: 예) 김철수,박영희 또는 ?명)");
  $("addWork").onclick = () => addTextarea("workBox", "work", "작업내용");

  document.querySelectorAll("button[data-mic]").forEach(btn => {
    btn.onclick = () => startSpeechTo(btn.dataset.mic);
  });

  // sites manage (dialog 미지원 기기 대비)
  const dlg = $("dlgSites");

  async function addSiteName(name) {
    const siteName = (name || "").trim();
    if (!siteName) return;
    const data = await apiPost("site_add", { siteName });
    if (!data.ok) return alert(data.error || "site_add_error");
    await loadSites();
    alert("현장 추가 완료");
  }

  $("btnSiteManage").onclick = async () => {
    // dialog 지원하면 기존 팝업 사용
    if (dlg && typeof dlg.showModal === "function") {
      dlg.showModal();
      return;
    }
    // dialog 미지원이면 prompt로 대체
    const name = prompt("추가할 현장명(가칭)을 입력하세요");
    if (name) await addSiteName(name);
  };

  $("btnCloseSites").onclick = () => {
    if (dlg && typeof dlg.close === "function") dlg.close();
  };

  $("btnAddSite").onclick = async () => {
    const name = $("newSite").value.trim();
    $("newSite").value = "";
    await addSiteName(name);
  };

  // daily text
  $("btnDailyText").onclick = async () => {
    try { await openDailyDialog(); }
    catch (e) { alert("출력일보 생성 실패: " + e.message); }
  };
  $("btnCopyDaily").onclick = async () => {
    try {
      const items = await fetchTodayAll();
      const text = buildDailyText(items);
      const ok = await copyToClipboard(text);
      alert(ok ? "복사 완료" : "복사 실패");
    } catch (e) {
      alert("복사 실패: " + e.message);
    }
  };
  $("dailyCopy").onclick = async () => {
    const ok = await copyToClipboard($("dailyText").value);
    alert(ok ? "복사 완료" : "복사 실패");
  };
  $("dailyShare").onclick = async () => {
    const text = $("dailyText").value;
    const ok = await shareText(text);
    if (!ok) {
      const copied = await copyToClipboard(text);
      alert(copied ? "공유 미지원: 복사 완료" : "공유/복사 실패");
    }
  };
  $("dailyClose").onclick = () => $("dailyDlg").close();
});
