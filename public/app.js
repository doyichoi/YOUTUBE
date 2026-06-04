const BOOKMARKS_KEY = "yt-trend-bookmarks";

const $ = (sel) => document.querySelector(sel);
const feedEl = $("#magazine-feed");
const feedEmpty = $("#feed-empty");
const viewHome = $("#view-home");
const viewDetail = $("#view-detail");
const adminPanel = $("#admin-panel");
const loginModal = $("#login-modal");
const loginForm = $("#login-form");
const loginError = $("#login-error");
const userBadge = $("#user-badge");
const btnLogin = $("#btn-login");
const btnLogout = $("#btn-logout");
const btnBookmarks = $("#btn-bookmarks");
const bookmarkCount = $("#bookmark-count");
const researchForm = $("#research-form");

let state = {
  role: "reader",
  email: null,
  reports: [],
  insights: null,
  showBookmarksOnly: false,
  currentReportId: null,
};

function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function setBookmarks(ids) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
  updateBookmarkCount();
}

function toggleBookmark(id, ev) {
  if (ev) ev.stopPropagation();
  const list = getBookmarks();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  setBookmarks(list);
  renderFeed();
  if (state.currentReportId === id) renderDetailActions();
}

function updateBookmarkCount() {
  bookmarkCount.textContent = String(getBookmarks().length);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNum(n) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function surgeBadge(label) {
  if (label === "fire") return '<span class="badge-fire">🔥 급상승</span>';
  if (label === "rising") return '<span class="badge-rising">📈 상승세</span>';
  return "";
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

function setAuthUI() {
  const isAdmin = state.role === "admin";
  userBadge.textContent = isAdmin ? "관리자" : "독자";
  userBadge.classList.toggle("admin", isAdmin);
  btnLogin.classList.toggle("hidden", isAdmin);
  btnLogout.classList.toggle("hidden", !isAdmin);
  adminPanel.classList.toggle("hidden", !isAdmin);
}

async function loadAuth() {
  try {
    const me = await api("/api/auth/me");
    state.role = me.role;
    state.email = me.email;
  } catch {
    state.role = "reader";
  }
  setAuthUI();
}

function renderInsights() {
  const ins = state.insights;
  if (!ins) return;

  const p = ins.contentPulse;
  $("#pulse-stats").innerHTML = `
    <span class="insight-stat">${formatNum(p.totalVideosAnalyzed)}</span>
    분석 영상 · 리포트 ${ins.reportCount}건<br/>
    평균 시간당 조회 <strong>${formatNum(p.avgViewsPerHour)}</strong><br/>
    🔥 ${p.fireCount} · 📈 ${p.risingCount}
  `;

  const chHtml =
    ins.channels.length === 0
      ? "<p>데이터 수집 후 표시됩니다.</p>"
      : `<ul class="insight-list">${ins.channels
          .map(
            (c) =>
              `<li><strong>${escapeHtml(c.name)}</strong><br/>${c.videos}편 · ${formatNum(c.totalViews)} 조회</li>`
          )
          .join("")}</ul>`;
  $("#channel-insights").innerHTML = chHtml;

  const topHtml =
    ins.topics.length === 0
      ? "<p>데이터 수집 후 표시됩니다.</p>"
      : `<ul class="insight-list">${ins.topics
          .map((t) => `<li>#${escapeHtml(t.label)} <span>(${t.count})</span></li>`)
          .join("")}</ul>`;
  $("#topic-insights").innerHTML = topHtml;
}

function renderFeed() {
  const bookmarks = getBookmarks();
  let list = state.reports;
  if (state.showBookmarksOnly) {
    list = list.filter((r) => bookmarks.includes(r.id));
  }

  feedEmpty.classList.toggle("hidden", list.length > 0);
  feedEl.innerHTML = list
    .map((r) => {
      const saved = bookmarks.includes(r.id);
      const thumb =
        r.coverThumbnail ??
        "https://i.ytimg.com/img/no_thumbnail.jpg";
      return `
        <button type="button" class="pin-card" data-report-id="${escapeHtml(r.id)}">
          <div class="pin-img-wrap">
            <img src="${escapeHtml(thumb)}" alt="" loading="lazy" />
            <button type="button" class="pin-save ${saved ? "active" : ""}" data-bookmark="${escapeHtml(r.id)}" aria-label="찜">${saved ? "♥" : "♡"}</button>
          </div>
          <div class="pin-body">
            <h3 class="pin-keyword">${escapeHtml(r.keyword)}</h3>
            <p class="pin-excerpt">${escapeHtml(r.excerpt ?? "")}</p>
            <p class="pin-meta">${formatDate(r.generatedAt)} · ${escapeHtml(r.regionCode ?? "KR")} · Top ${r.topVideoCount ?? 10}</p>
          </div>
        </button>`;
    })
    .join("");

  feedEl.querySelectorAll(".pin-card").forEach((btn) => {
    btn.addEventListener("click", () => openReport(btn.dataset.reportId));
  });
  feedEl.querySelectorAll("[data-bookmark]").forEach((btn) => {
    btn.addEventListener("click", (e) => toggleBookmark(btn.dataset.bookmark, e));
  });
}

async function loadHome() {
  const [reports, insights] = await Promise.all([
    api("/api/reports"),
    api("/api/insights"),
  ]);
  state.reports = reports;
  state.insights = insights;
  renderInsights();
  renderFeed();
}

function showView(name) {
  viewHome.classList.toggle("hidden", name !== "home");
  viewDetail.classList.toggle("hidden", name !== "detail");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function openReport(id) {
  state.currentReportId = id;
  const report = await api(`/api/reports/${encodeURIComponent(id)}`);
  showView("detail");

  const cover = report.coverThumbnail ?? report.top10?.[0]?.thumbnailUrl ?? "";
  const saved = getBookmarks().includes(id);

  $("#detail-hero").innerHTML = `
    <div class="detail-hero-inner">
      ${cover ? `<img class="detail-cover" src="${escapeHtml(cover)}" alt="" />` : ""}
      <div class="detail-hero-text">
        <p class="pin-meta">${formatDate(report.generatedAt)} · ${escapeHtml(report.input?.regionCode ?? "KR")}</p>
        <h1>${escapeHtml(report.keyword)}</h1>
        <p>${escapeHtml(report.excerpt ?? "")}</p>
        <div class="detail-actions" id="detail-actions">
          <button type="button" class="nav-btn" data-bookmark-detail="${escapeHtml(id)}">${saved ? "♥ 찜함" : "♡ 찜하기"}</button>
        </div>
      </div>
    </div>`;

  $("#detail-actions [data-bookmark-detail]").addEventListener("click", () => {
    toggleBookmark(id);
    const btn = $("#detail-actions [data-bookmark-detail]");
    const s = getBookmarks().includes(id);
    btn.textContent = s ? "♥ 찜함" : "♡ 찜하기";
  });

  $("#detail-top10").innerHTML = (report.top10 ?? [])
    .map((v, i) => {
      const videoUrl = `https://www.youtube.com/watch?v=${v.videoId}`;
      const chUrl = v.channelId
        ? `https://www.youtube.com/channel/${v.channelId}`
        : "#";
      const thumb = v.thumbnailUrl || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      return `
        <article class="video-pin">
          <a href="${videoUrl}" target="_blank" rel="noopener">
            <img src="${escapeHtml(thumb)}" alt="" loading="lazy" />
          </a>
          <div class="video-pin-info">
            <h4><a href="${videoUrl}" target="_blank" rel="noopener">${i + 1}. ${escapeHtml(v.title)}</a></h4>
            <p class="ch"><a href="${chUrl}" target="_blank" rel="noopener">${escapeHtml(v.channelTitle)}</a></p>
            <p class="video-pin-stats">
              조회 ${formatNum(v.viewCount)} · 시간당 ${formatNum(v.viewsPerHour)}
              ${surgeBadge(v.surgeLabel)}
            </p>
          </div>
        </article>`;
    })
    .join("");

  const a = report.analysis ?? {};
  $("#detail-analysis").innerHTML = `
    <div class="analysis-card"><h3>🔥 급상승 토픽</h3><div class="body">${escapeHtml(a.trendingTopics ?? "").replace(/\n/g, "<br/>")}</div></div>
    <div class="analysis-card"><h3>💡 제목 패턴</h3><div class="body">${escapeHtml(a.titlePatterns ?? "").replace(/\n/g, "<br/>")}</div></div>
    <div class="analysis-card"><h3>🚀 콘텐츠 아이디어</h3><div class="body">${escapeHtml(a.contentIdeas ?? "").replace(/\n/g, "<br/>")}</div></div>
  `;

  $("#detail-markdown").innerHTML = marked.parse(report.markdown ?? "");
}

function renderDetailActions() {
  /* updated via openReport */
}

function openLoginModal() {
  loginModal.classList.remove("hidden");
  loginError.textContent = "";
  loginForm.email.value = loginForm.email.value || "naebon1@gmail.com";
}

function closeLoginModal() {
  loginModal.classList.add("hidden");
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const fd = new FormData(loginForm);
  try {
    const me = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: fd.get("email"),
        password: fd.get("password"),
      }),
    });
    state.role = me.role;
    state.email = me.email;
    setAuthUI();
    closeLoginModal();
    await loadHome();
  } catch (err) {
    loginError.textContent = err.message;
  }
});

btnLogin.addEventListener("click", openLoginModal);
btnLogout.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  state.role = "reader";
  state.email = null;
  setAuthUI();
});

btnBookmarks.addEventListener("click", () => {
  state.showBookmarksOnly = !state.showBookmarksOnly;
  btnBookmarks.classList.toggle("primary", state.showBookmarksOnly);
  renderFeed();
});

document.querySelectorAll("[data-close-modal]").forEach((el) => {
  el.addEventListener("click", closeLoginModal);
});

document.querySelectorAll("[data-nav=home]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    showView("home");
  });
});

researchForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#admin-status");
  const btn = $("#submit-btn");
  const fd = new FormData(researchForm);
  btn.disabled = true;
  status.className = "status";
  status.textContent = "리서치 실행 중… (1~2분)";

  try {
    await api("/api/research", {
      method: "POST",
      body: JSON.stringify({
        keyword: fd.get("keyword"),
        daysBack: Number(fd.get("daysBack")),
        maxResults: Number(fd.get("maxResults")),
        regionCode: fd.get("regionCode"),
        language: "ko",
        skipLlm: fd.get("skipLlm") === "on",
      }),
    });
    status.textContent = "완료! 매거진 피드가 갱신되었습니다.";
    researchForm.reset();
    researchForm.daysBack.value = 7;
    researchForm.maxResults.value = 25;
    researchForm.regionCode.value = "KR";
    await loadHome();
  } catch (err) {
    status.className = "status error";
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

async function init() {
  updateBookmarkCount();
  await loadAuth();
  await loadHome();
}

init();
