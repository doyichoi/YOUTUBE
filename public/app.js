const form = document.getElementById("research-form");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submit-btn");
const healthEl = document.getElementById("health");
const videosSection = document.getElementById("videos-section");
const reportSection = document.getElementById("report-section");
const videosTableBody = document.querySelector("#videos-table tbody");
const reportEl = document.getElementById("report");
const copyBtn = document.getElementById("copy-md");

let lastMarkdown = "";

function formatNum(n) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

function surgeLabel(item) {
  if (item.surgeLabel === "fire") return '<span class="badge-fire">🔥 급상승</span>';
  if (item.surgeLabel === "rising") return '<span class="badge-rising">📈 상승세</span>';
  return "—";
}

async function loadHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const lines = [
      data.youtube ? "✓ YouTube API" : "✗ YouTube API (.env)",
      data.openai ? `✓ OpenAI (${data.model})` : "✗ OpenAI API (.env)",
    ];
    healthEl.textContent = lines.join("\n");
    healthEl.className = "health " + (data.youtube ? "ok" : "warn");
  } catch {
    healthEl.textContent = "서버 연결 실패";
    healthEl.className = "health warn";
  }
}

function renderVideos(top10) {
  videosTableBody.innerHTML = top10
    .map((v, i) => {
      const url = `https://www.youtube.com/watch?v=${v.videoId}`;
      return `<tr>
        <td>${i + 1}</td>
        <td><a href="${url}" target="_blank" rel="noopener">${escapeHtml(v.title)}</a></td>
        <td>${escapeHtml(v.channelTitle)}</td>
        <td>${formatNum(v.viewCount)}</td>
        <td>${formatNum(v.viewsPerHour)}</td>
        <td>${surgeLabel(v)}</td>
      </tr>`;
    })
    .join("");
  videosSection.classList.remove("hidden");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const payload = {
    keyword: fd.get("keyword"),
    daysBack: Number(fd.get("daysBack")),
    maxResults: Number(fd.get("maxResults")),
    regionCode: fd.get("regionCode"),
    language: fd.get("language"),
    skipLlm: fd.get("skipLlm") === "on",
  };

  submitBtn.disabled = true;
  statusEl.className = "status";
  statusEl.textContent =
    "에이전트 실행 중… (YouTube 검색 → 통계 → OpenAI 분석, 30초~2분 소요)";

  try {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? res.statusText);

    renderVideos(data.result.top10);
    lastMarkdown = data.markdown;
    reportEl.innerHTML = marked.parse(data.markdown);
    reportSection.classList.remove("hidden");

    statusEl.textContent = `완료 · ${data.result.videos.length}개 영상 분석 · reports/에 저장됨`;
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = err.message ?? String(err);
  } finally {
    submitBtn.disabled = false;
  }
});

copyBtn.addEventListener("click", async () => {
  if (!lastMarkdown) return;
  await navigator.clipboard.writeText(lastMarkdown);
  statusEl.textContent = "Markdown이 클립보드에 복사되었습니다.";
});

loadHealth();
