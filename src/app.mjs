import { normalizeWeeks, parseScheduleText, resolveLessonTime, weekdayLabels } from "./parser.mjs";

const STORAGE_KEY = "mobile-schedule-courses";
const SETTINGS_KEY = "mobile-schedule-settings";

const sampleCourses = parseScheduleText(`
高等数学A
星期一 第1-2节 1-16周 教学楼A101
大学英语 周三 3-4节 2-12周 双周 外语楼305
数据结构 周五 7-8节 1-8周 计算机楼B204
`);

let courses = loadCourses();
let settings = loadSettings();

const elements = {
  currentWeek: document.querySelector("#currentWeek"),
  todayLabel: document.querySelector("#todayLabel"),
  nextClass: document.querySelector("#nextClass"),
  weekGrid: document.querySelector("#weekGrid"),
  rawSchedule: document.querySelector("#rawSchedule"),
  importUrl: document.querySelector("#importUrl"),
  parseButton: document.querySelector("#parseButton"),
  fetchButton: document.querySelector("#fetchButton"),
  imageInput: document.querySelector("#imageInput"),
  ocrHint: document.querySelector("#ocrHint"),
  courseForm: document.querySelector("#courseForm"),
  reviewList: document.querySelector("#reviewList"),
  courseCount: document.querySelector("#courseCount"),
  clearButton: document.querySelector("#clearButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  termStart: document.querySelector("#termStart"),
  saveSettings: document.querySelector("#saveSettings"),
};

bindEvents();
render();

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => activatePanel(button.dataset.panel));
  });

  document.querySelectorAll("[data-panel-target]").forEach((button) => {
    button.addEventListener("click", () => activatePanel(button.dataset.panelTarget));
  });

  elements.parseButton.addEventListener("click", () => {
    const imported = parseScheduleText(elements.rawSchedule.value);
    mergeCourses(imported);
    elements.rawSchedule.value = "";
    activatePanel("reviewPanel");
  });

  elements.fetchButton.addEventListener("click", importFromUrl);
  elements.imageInput.addEventListener("change", importFromImage);
  elements.courseForm.addEventListener("submit", addManualCourse);

  elements.clearButton.addEventListener("click", () => {
    if (!confirm("确定清空所有课程吗？")) return;
    courses = [];
    saveCourses();
    render();
  });

  elements.settingsButton.addEventListener("click", () => {
    elements.termStart.value = settings.termStart;
    elements.settingsDialog.showModal();
  });

  elements.saveSettings.addEventListener("click", () => {
    settings.termStart = elements.termStart.value || settings.termStart;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    render();
  });
}

function activatePanel(panelId) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.panel === panelId);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });
}

async function importFromUrl() {
  const url = elements.importUrl.value.trim();
  if (!url) return;

  try {
    const response = await fetch(url);
    const html = await response.text();
    const text = new DOMParser().parseFromString(html, "text/html").body.innerText;
    const imported = parseScheduleText(text);
    if (!imported.length) throw new Error("未识别到课程");
    mergeCourses(imported);
    activatePanel("reviewPanel");
  } catch (error) {
    elements.rawSchedule.value = `无法直接读取该网站，请登录教务系统后复制课表文字粘贴到这里。\n\n错误：${error.message}`;
  }
}

async function importFromImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!("TextDetector" in window)) {
    elements.ocrHint.textContent = "当前浏览器没有开放内置 OCR。请用系统相册或微信识别图片文字后粘贴导入。";
    return;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const detector = new window.TextDetector();
    const detected = await detector.detect(bitmap);
    const text = detected.map((item) => item.rawValue).join("\n");
    elements.rawSchedule.value = text;
    mergeCourses(parseScheduleText(text));
    activatePanel("reviewPanel");
  } catch (error) {
    elements.ocrHint.textContent = `图片识别失败：${error.message}`;
  }
}

function addManualCourse(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const time = resolveLessonTime(String(form.get("period")));
  if (!time) {
    alert("节次格式请写成 1-2节、3-4节 这样的形式。");
    return;
  }

  courses.push({
    id: crypto.randomUUID(),
    name: String(form.get("name")).trim(),
    weekday: Number(form.get("weekday")),
    weekdayLabel: weekdayLabels[Number(form.get("weekday"))],
    time,
    weeks: normalizeWeeks(String(form.get("weeks"))),
    location: String(form.get("location")).trim(),
    source: "manual",
    confidence: 1,
  });
  event.currentTarget.reset();
  saveCourses();
  render();
  activatePanel("schedulePanel");
}

function mergeCourses(imported) {
  if (!imported.length) {
    alert("没有识别到课程。请确认文本里包含课程名、星期、节次、周次和地点。");
    return;
  }

  const existing = new Set(courses.map(courseKey));
  const fresh = imported
    .map((course) => ({ ...course, id: crypto.randomUUID() }))
    .filter((course) => !existing.has(courseKey(course)));
  courses = [...courses, ...fresh];
  saveCourses();
  render();
}

function render() {
  const currentWeek = getCurrentWeek();
  const today = new Date().getDay() || 7;
  elements.currentWeek.textContent = currentWeek;
  elements.todayLabel.textContent = weekdayLabels[today];
  renderWeekGrid(currentWeek);
  renderToday(today, currentWeek);
  renderReviewList();
}

function renderWeekGrid(currentWeek) {
  elements.weekGrid.innerHTML = "";

  for (let day = 1; day <= 7; day += 1) {
    const dayCourses = courses
      .filter((course) => course.weekday === day && courseAppliesToWeek(course, currentWeek))
      .sort((a, b) => a.time.startPeriod - b.time.startPeriod);

    const column = document.createElement("article");
    column.className = "day-column";
    column.innerHTML = `
      <div class="day-header">
        <span>${weekdayLabels[day]}</span>
        <span>${dayCourses.length}</span>
      </div>
      ${
        dayCourses.length
          ? dayCourses.map(renderCourseCard).join("")
          : '<div class="empty-day">本周无课</div>'
      }
    `;
    elements.weekGrid.append(column);
  }
}

function renderCourseCard(course) {
  return `
    <div class="course-card">
      <strong>${escapeHtml(course.name)}</strong>
      <div class="course-meta">
        <span>${course.time.startTime}-${course.time.endTime} · ${course.time.label}</span>
        <span>${escapeHtml(course.location)}</span>
        <span>${escapeHtml(course.weeks.label)}</span>
      </div>
    </div>
  `;
}

function renderToday(today, currentWeek) {
  const next = courses
    .filter((course) => course.weekday === today && courseAppliesToWeek(course, currentWeek))
    .sort((a, b) => a.time.startPeriod - b.time.startPeriod)[0];

  elements.nextClass.textContent = next
    ? `${next.time.startTime} ${next.name} · ${next.location}`
    : "暂无课程";
}

function renderReviewList() {
  elements.courseCount.textContent = `${courses.length} 门课程`;
  elements.reviewList.innerHTML = courses.length ? "" : '<div class="empty-state">还没有课程，去导入或手动添加。</div>';

  for (const course of courses) {
    const item = document.createElement("article");
    item.className = "review-item";
    item.innerHTML = `
      <strong>${escapeHtml(course.name)}</strong>
      <div class="course-meta">
        <span>${course.weekdayLabel} ${course.time.label} ${course.time.startTime}-${course.time.endTime}</span>
        <span>${escapeHtml(course.weeks.label)} · ${escapeHtml(course.location)}</span>
        <span>来源：${course.source === "manual" ? "手动" : "导入"} · 可信度 ${Math.round(course.confidence * 100)}%</span>
      </div>
      <div class="review-actions"><button class="danger" data-delete="${course.id}">删除</button></div>
    `;
    elements.reviewList.append(item);
  }

  elements.reviewList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      courses = courses.filter((course) => course.id !== button.dataset.delete);
      saveCourses();
      render();
    });
  });
}

function courseAppliesToWeek(course, week) {
  if (course.weeks.type === "custom") return course.weeks.values.includes(week);
  if (week < course.weeks.start || week > course.weeks.end) return false;
  if (course.weeks.type === "odd") return week % 2 === 1;
  if (course.weeks.type === "even") return week % 2 === 0;
  return true;
}

function getCurrentWeek() {
  const start = new Date(`${settings.termStart}T00:00:00`);
  const now = new Date();
  const diff = now - start;
  if (Number.isNaN(diff) || diff < 0) return 1;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function loadCourses() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : sampleCourses;
}

function loadSettings() {
  const stored = localStorage.getItem(SETTINGS_KEY);
  const fallback = getMonday(new Date()).toISOString().slice(0, 10);
  return stored ? JSON.parse(stored) : { termStart: fallback };
}

function saveCourses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
}

function courseKey(course) {
  return [course.name, course.weekday, course.time.label, course.weeks.label, course.location].join("|");
}

function getMonday(date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}
