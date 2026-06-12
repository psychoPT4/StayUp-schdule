import {
  normalizeWeeks,
  parseCourseBlockText,
  parseScheduleText,
  periodTimes as DEFAULT_PERIOD_TIMES,
  resolveLessonTime,
  weekdayLabels,
} from "./parser.mjs";

const STORAGE_KEY = "mobile-schedule-courses";
const SCHEDULES_KEY = "mobile-schedule-books";
const SETTINGS_KEY = "mobile-schedule-settings";
const VIEW_KEY = "mobile-schedule-view";
const OCR_SERVICE_KEY = "mobile-schedule-ocr-service-url";
const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const COURSE_THEMES = [
  { border: "#d98b37", bg: "#fff5e7", fg: "#7a3d00" },
  { border: "#2f7dcb", bg: "#eaf4ff", fg: "#174b78" },
  { border: "#7a60c8", bg: "#f1edff", fg: "#413177" },
  { border: "#2c9a68", bg: "#e9f7ef", fg: "#17613f" },
  { border: "#d35f75", bg: "#fff0f3", fg: "#8a2638" },
  { border: "#5b8d35", bg: "#f1f8e9", fg: "#35591e" },
];

const sampleCourses = parseScheduleText(`
高等数学A
星期一 第1-2节 1-16周 教学楼A101
大学英语 周三 3-4节 2-12周 双周 外语楼305
数据结构 周五 7-8节 1-8周 计算机楼B204
`);

let scheduleState = loadScheduleState();
let courses = getActiveSchedule().courses;
let settings = loadSettings();
let selectedWeek = getCurrentWeek();
let viewMode = loadViewMode();

const elements = {
  currentWeek: document.querySelector("#currentWeek"),
  viewWeekLabel: document.querySelector("#viewWeekLabel"),
  prevWeekButton: document.querySelector("#prevWeekButton"),
  nextWeekButton: document.querySelector("#nextWeekButton"),
  todayWeekButton: document.querySelector("#todayWeekButton"),
  viewModeButton: document.querySelector("#viewModeButton"),
  activeScheduleName: document.querySelector("#activeScheduleName"),
  todayLabel: document.querySelector("#todayLabel"),
  nextClass: document.querySelector("#nextClass"),
  weekGrid: document.querySelector("#weekGrid"),
  rawSchedule: document.querySelector("#rawSchedule"),
  importUrl: document.querySelector("#importUrl"),
  parseButton: document.querySelector("#parseButton"),
  fetchButton: document.querySelector("#fetchButton"),
  ocrServiceUrl: document.querySelector("#ocrServiceUrl"),
  testOcrServiceButton: document.querySelector("#testOcrServiceButton"),
  imageInput: document.querySelector("#imageInput"),
  ocrHint: document.querySelector("#ocrHint"),
  courseForm: document.querySelector("#courseForm"),
  reviewList: document.querySelector("#reviewList"),
  courseCount: document.querySelector("#courseCount"),
  clearButton: document.querySelector("#clearButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  termStart: document.querySelector("#termStart"),
  scheduleSelect: document.querySelector("#scheduleSelect"),
  newScheduleName: document.querySelector("#newScheduleName"),
  addScheduleButton: document.querySelector("#addScheduleButton"),
  deleteScheduleButton: document.querySelector("#deleteScheduleButton"),
  periodEditor: document.querySelector("#periodEditor"),
  addPeriodButton: document.querySelector("#addPeriodButton"),
  saveSettings: document.querySelector("#saveSettings"),
};

bindEvents();
render();

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => activatePanel(button.dataset.panel));
  });

  elements.parseButton.addEventListener("click", () => {
    const imported = parseScheduleText(elements.rawSchedule.value, { periodTimes: settings.periodTimes });
    mergeCourses(imported);
    elements.rawSchedule.value = "";
    activatePanel("reviewPanel");
  });

  elements.fetchButton.addEventListener("click", importFromUrl);
  elements.imageInput.addEventListener("change", importFromImage);
  elements.ocrServiceUrl.value = localStorage.getItem(OCR_SERVICE_KEY) || "";
  elements.ocrServiceUrl.addEventListener("change", () => {
    localStorage.setItem(OCR_SERVICE_KEY, elements.ocrServiceUrl.value.trim());
  });
  elements.testOcrServiceButton.addEventListener("click", testOcrService);
  elements.courseForm.addEventListener("submit", addManualCourse);
  elements.prevWeekButton.addEventListener("click", () => setSelectedWeek(selectedWeek - 1));
  elements.nextWeekButton.addEventListener("click", () => setSelectedWeek(selectedWeek + 1));
  elements.todayWeekButton.addEventListener("click", () => setSelectedWeek(getCurrentWeek()));
  elements.viewModeButton.addEventListener("click", toggleViewMode);
  elements.scheduleSelect.addEventListener("change", switchSchedule);
  elements.addScheduleButton.addEventListener("click", addSchedule);
  elements.deleteScheduleButton.addEventListener("click", deleteActiveSchedule);
  elements.addPeriodButton.addEventListener("click", addPeriodEditorRow);

  elements.clearButton.addEventListener("click", () => {
    if (!confirm("确定清空所有课程吗？")) return;
    courses = [];
    saveCoursesToActiveSchedule();
    render();
  });

  elements.settingsButton.addEventListener("click", () => {
    elements.termStart.value = settings.termStart;
    renderScheduleManager();
    renderPeriodEditor();
    elements.settingsDialog.showModal();
  });

  elements.saveSettings.addEventListener("click", () => {
    settings.termStart = elements.termStart.value || settings.termStart;
    settings.periodTimes = readPeriodEditor();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    courses = courses.map((course) => ({
      ...course,
      time: resolveLessonTime(course.time.label, settings.periodTimes) || course.time,
    }));
    saveCoursesToActiveSchedule();
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
    const imported = parseScheduleText(text, { periodTimes: settings.periodTimes });
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

  try {
    elements.ocrHint.textContent = "正在识别图片并恢复课表结构，请稍等...";
    const { text, courses: imageCourses } = await recognizeImageSchedule(file);
    elements.rawSchedule.value = text;
    const imported = imageCourses.length ? imageCourses : parseScheduleText(text, { periodTimes: settings.periodTimes });
    ensurePeriodCount(Math.max(0, ...imported.map((course) => course.time.endPeriod)));
    mergeCourses(imported);
    activatePanel("reviewPanel");
  } catch (error) {
    elements.ocrHint.textContent = `图片识别失败：${error.message}。可以先用系统相册或微信识别文字后粘贴导入。`;
  }
}

async function recognizeImageSchedule(file) {
  const serviceUrl = getOcrServiceUrl();
  if (serviceUrl) {
    localStorage.setItem(OCR_SERVICE_KEY, elements.ocrServiceUrl.value.trim());
    try {
      return await recognizeImageWithService(file, serviceUrl);
    } catch (error) {
      elements.ocrHint.textContent = `高精度 OCR 服务失败，正在改用离线识别：${error.message}`;
    }
  }

  const prepared = await prepareScheduleImage(file);

  try {
    await loadScript(TESSERACT_CDN);
    if (!window.Tesseract) throw new Error("OCR 模块加载失败");

    const result = await window.Tesseract.recognize(prepared.canvas, "chi_sim+eng", {
      logger(message) {
        if (message.status === "recognizing text") {
          elements.ocrHint.textContent = `正在识别图片：${Math.round(message.progress * 100)}%`;
        }
      },
    });

    const words = normalizeOcrWords(result.data?.words || []);
    return {
      text: result.data?.text || "",
      courses: parseSpatialScheduleWords(words, prepared.canvas, settings.periodTimes),
    };
  } catch (error) {
    if (!("TextDetector" in window)) throw error;
    const bitmap = await createImageBitmap(file);
    const detector = new window.TextDetector();
    const detected = await detector.detect(bitmap);
    return {
      text: detected.map((item) => item.rawValue).join("\n"),
      courses: [],
    };
  }
}

async function testOcrService() {
  const serviceUrl = getOcrServiceUrl();
  if (!serviceUrl) {
    elements.ocrHint.textContent = "先填写电脑 IP，例如 192.168.1.20。";
    return;
  }

  const healthUrl = serviceUrl.replace(/\/api\/recognize\/?$/, "/health");
  elements.ocrHint.textContent = "正在检测 OCR 服务...";
  try {
    const response = await fetch(healthUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    elements.ocrHint.textContent = "OCR 服务可用，上传图片会优先使用高精度识别。";
  } catch (error) {
    elements.ocrHint.textContent = `检测失败：确认电脑和手机在同一 Wi-Fi，服务已启动，并允许 8787 端口。${error.message}`;
  }
}

function getOcrServiceUrl() {
  const value = elements.ocrServiceUrl.value.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    return value.endsWith("/api/recognize") ? value : `${value.replace(/\/$/, "")}/api/recognize`;
  }
  const host = value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!host) return "";
  return `http://${host.includes(":") ? host : `${host}:8787`}/api/recognize`;
}

async function recognizeImageWithService(file, serviceUrl) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(serviceUrl, { method: "POST", body });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `HTTP ${response.status}`);
  }
  const payload = await response.json();
  const courses = Array.isArray(payload.courses) ? payload.courses.map(normalizeServiceCourse).filter(Boolean) : [];
  if (!courses.length) throw new Error("服务没有识别到课程块");
  return {
    text: JSON.stringify(payload.diagnostics || {}, null, 2),
    courses,
  };
}

function normalizeServiceCourse(course) {
  if (!course?.name || !course?.weekday || !course?.time || !course?.weeks) return null;
  return {
    id: course.id || crypto.randomUUID(),
    name: String(course.name),
    weekday: Number(course.weekday),
    weekdayLabel: weekdayLabels[Number(course.weekday)] || course.weekdayLabel || "",
    time: {
      startPeriod: Number(course.time.startPeriod),
      endPeriod: Number(course.time.endPeriod),
      startTime: course.time.startTime || settings.periodTimes[course.time.startPeriod]?.[0] || "",
      endTime: course.time.endTime || settings.periodTimes[course.time.endPeriod]?.[1] || "",
      label: course.time.label || `${course.time.startPeriod}-${course.time.endPeriod}节`,
    },
    weeks: course.weeks,
    location: course.location || "地点待确认",
    teacher: course.teacher || "",
    source: "ocr-service",
    confidence: Number(course.confidence || 0.7),
  };
}

async function prepareScheduleImage(file) {
  const bitmap = await createImageBitmap(file);
  const crop = {
    x: 0,
    y: Math.round(bitmap.height * 0.14),
    width: bitmap.width,
    height: Math.round(bitmap.height * 0.62),
  };
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = crop.width * scale;
  canvas.height = crop.height * scale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.filter = "grayscale(1) contrast(1.45) brightness(1.08)";
  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return { canvas };
}

function normalizeOcrWords(words) {
  return words
    .map((word) => ({
      text: String(word.text || "").trim(),
      confidence: Number(word.confidence ?? 0),
      x0: word.bbox?.x0 ?? word.x0 ?? 0,
      y0: word.bbox?.y0 ?? word.y0 ?? 0,
      x1: word.bbox?.x1 ?? word.x1 ?? 0,
      y1: word.bbox?.y1 ?? word.y1 ?? 0,
    }))
    .filter((word) => word.text && word.confidence > 20);
}

function parseSpatialScheduleWords(words, canvas, periodTimes) {
  const weekdayCenters = findWeekdayCenters(words, canvas.width);
  if (weekdayCenters.length < 2) return [];

  const grid = inferScheduleGrid(words, canvas, weekdayCenters);
  const columns = weekdayCenters.map((center) => ({ ...center, words: [] }));
  const minCourseX = Math.min(...weekdayCenters.map((center) => center.x)) - grid.columnWidth / 2;

  for (const word of words) {
    const x = (word.x0 + word.x1) / 2;
    const y = (word.y0 + word.y1) / 2;
    if (x < minCourseX || y < grid.top || y > grid.bottom) continue;
    if (isTableNoise(word.text)) continue;
    const column = nearestColumn(columns, x, grid.columnWidth);
    if (column) column.words.push(word);
  }

  const courses = [];
  for (const column of columns) {
    for (const group of groupColumnWords(column.words, grid.rowHeight)) {
      const startPeriod = clampPeriod(Math.floor((group.y0 - grid.top) / grid.rowHeight) + 1, grid.periodCount);
      const endPeriod = clampPeriod(Math.ceil((group.y1 - grid.top) / grid.rowHeight), grid.periodCount);
      const blockText = group.words
        .sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0))
        .map((word) => word.text)
        .join("");
      const course = parseCourseBlockText(blockText, {
        weekday: column.day,
        startPeriod,
        endPeriod: Math.max(startPeriod, endPeriod),
        index: courses.length,
        periodTimes,
      });
      if (course) courses.push(course);
    }
  }

  return courses;
}

function findWeekdayCenters(words, width) {
  const dayMap = new Map([
    ["一", 1],
    ["二", 2],
    ["三", 3],
    ["四", 4],
    ["五", 5],
    ["六", 6],
    ["日", 7],
    ["天", 7],
  ]);
  const centers = [];

  for (const word of words) {
    const match = word.text.match(/(?:星期|周)?([一二三四五六日天])/);
    if (!match || !dayMap.has(match[1])) continue;
    const x = (word.x0 + word.x1) / 2;
    if (x < width * 0.14) continue;
    centers.push({ day: dayMap.get(match[1]), x, y: (word.y0 + word.y1) / 2 });
  }

  const unique = [];
  for (const item of centers.sort((a, b) => a.day - b.day || a.x - b.x)) {
    if (!unique.some((center) => center.day === item.day)) unique.push(item);
  }
  if (unique.length >= 2) return unique.sort((a, b) => a.x - b.x);

  const left = width * 0.18;
  const columnWidth = (width * 0.82) / 6;
  return Array.from({ length: 6 }, (_, index) => ({
    day: index + 1,
    x: left + columnWidth * index + columnWidth / 2,
    y: 0,
  }));
}

function inferScheduleGrid(words, canvas, weekdayCenters) {
  const headerY = Math.max(...weekdayCenters.map((center) => center.y || canvas.height * 0.16));
  const courseListWord = words.find((word) => /课程列表/.test(word.text));
  const periodLabels = words
    .filter((word) => /第?[一二三四五六七八九十]{1,3}节/.test(word.text) || /^第?\d{1,2}节?$/.test(word.text))
    .map((word) => (word.y0 + word.y1) / 2)
    .sort((a, b) => a - b);
  const periodCount = Math.max(getPeriodEntries().length, periodLabels.length, 12);
  const top = periodLabels[0] ? periodLabels[0] - 4 : headerY + 36;
  const bottom = courseListWord ? courseListWord.y0 - 20 : canvas.height * 0.9;
  const rowHeight = Math.max(44, (bottom - top) / periodCount);
  const columnWidth = medianGap(weekdayCenters.map((center) => center.x)) || canvas.width / 7;
  return { top, bottom, rowHeight, columnWidth, periodCount };
}

function groupColumnWords(words, rowHeight) {
  const groups = [];
  const sorted = words.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  for (const word of sorted) {
    const last = groups.at(-1);
    if (!last || word.y0 - last.y1 > rowHeight * 0.72) {
      groups.push({ y0: word.y0, y1: word.y1, words: [word] });
    } else {
      last.y0 = Math.min(last.y0, word.y0);
      last.y1 = Math.max(last.y1, word.y1);
      last.words.push(word);
    }
  }
  return groups.filter((group) => group.words.map((word) => word.text).join("").length >= 8);
}

function nearestColumn(columns, x, columnWidth) {
  let nearest = null;
  for (const column of columns) {
    const distance = Math.abs(column.x - x);
    if (distance <= columnWidth * 0.58 && (!nearest || distance < nearest.distance)) {
      nearest = { column, distance };
    }
  }
  return nearest?.column || null;
}

function medianGap(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((value, index) => value - sorted[index]).filter((gap) => gap > 0);
  if (!gaps.length) return 0;
  return gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
}

function clampPeriod(period, max) {
  return Math.min(Math.max(period, 1), max);
}

function isTableNoise(text) {
  return /^(星期|周|第?[一二三四五六七八九十]{1,3}节|第?\d{1,2}节?|课程列表|课表|格式|说明|节次|周次)$/.test(text);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      if (window.Tesseract) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("无法加载 OCR 脚本"));
    document.head.append(script);
  });
}

function addManualCourse(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const time = resolveLessonTime(String(form.get("period")), settings.periodTimes);
  if (!time) {
    alert("节次格式请写成 1-2节、3-4节 这样的形式。");
    return;
  }

  const nextCourse = {
    id: crypto.randomUUID(),
    name: String(form.get("name")).trim(),
    weekday: Number(form.get("weekday")),
    weekdayLabel: weekdayLabels[Number(form.get("weekday"))],
    time,
    weeks: normalizeWeeks(String(form.get("weeks"))),
    location: String(form.get("location")).trim(),
    teacher: String(form.get("teacher")).trim(),
    source: "manual",
    confidence: 1,
  };
  const conflict = findCourseConflict(nextCourse, courses);
  if (conflict) {
    alert(`该时间段已有课程：${conflict.name}。请先删除冲突课程或修改节次。`);
    return;
  }

  courses.push(nextCourse);
  event.currentTarget.reset();
  saveCoursesToActiveSchedule();
  render();
  activatePanel("schedulePanel");
}

function mergeCourses(imported) {
  if (!imported.length) {
    alert("没有识别到课程。请确认文本里包含课程名、星期、节次、周次和地点。");
    return;
  }

  const existing = new Set(courses.map(courseKey));
  const accepted = [];
  const conflicts = [];
  const fresh = imported
    .map((course) => ({ ...course, id: crypto.randomUUID() }))
    .filter((course) => {
      if (existing.has(courseKey(course))) return false;
      const conflict = findCourseConflict(course, [...courses, ...accepted]);
      if (conflict) {
        conflicts.push({ course, conflict });
        return false;
      }
      accepted.push(course);
      return true;
    });
  courses = [...courses, ...fresh];
  saveCoursesToActiveSchedule();
  render();

  if (conflicts.length) {
    alert(`已跳过 ${conflicts.length} 门时间冲突课程。请到“校对”页检查现有课程后再导入。`);
  }
}

function render() {
  const currentWeek = selectedWeek;
  const today = new Date().getDay() || 7;
  courses = getActiveSchedule().courses;
  elements.activeScheduleName.textContent = getActiveSchedule().name;
  elements.currentWeek.textContent = currentWeek;
  elements.viewWeekLabel.textContent = `第 ${currentWeek} 周`;
  elements.prevWeekButton.disabled = currentWeek <= 1;
  elements.viewModeButton.textContent = viewMode === "week" ? "当日" : "整周";
  elements.viewModeButton.setAttribute("aria-pressed", String(viewMode === "week"));
  elements.todayLabel.textContent = weekdayLabels[today];
  renderWeekGrid(currentWeek);
  renderToday(today, currentWeek);
  renderReviewList();
}

function renderWeekGrid(currentWeek) {
  elements.weekGrid.innerHTML = "";
  elements.weekGrid.className = `schedule-board ${viewMode === "week" ? "week-view" : "day-view"}`;
  const today = new Date().getDay() || 7;

  const timeRail = document.createElement("aside");
  timeRail.className = "time-rail";
  timeRail.style.setProperty("--period-count", getPeriodEntries().length);
  timeRail.innerHTML = `
    <div class="time-header">节次</div>
    ${getPeriodEntries()
      .map(
        ([period, range]) => `
          <div class="period-slot">
            <strong>${period}</strong>
            <span>${range[0]}</span>
            <span>${range[1]}</span>
          </div>
        `,
      )
      .join("")}
  `;

  const daysBoard = document.createElement("div");
  daysBoard.className = "days-board";

  for (let day = 1; day <= 7; day += 1) {
    const dayCourses = courses
      .filter((course) => course.weekday === day && courseAppliesToWeek(course, currentWeek) && courseFitsCurrentPeriods(course))
      .sort((a, b) => a.time.startPeriod - b.time.startPeriod);

    const column = document.createElement("article");
    column.className = "day-column";
    column.dataset.weekday = String(day);
    if (day === today) column.classList.add("is-active-day");
    column.innerHTML = `
      <div class="day-header">
        <span>${weekdayLabels[day]}</span>
        <span>${dayCourses.length}</span>
      </div>
      <div class="period-grid" style="--period-count:${getPeriodEntries().length}">
        ${renderPeriodLines()}
        ${dayCourses.map(renderCourseCard).join("")}
      </div>
    `;
    daysBoard.append(column);
  }

  elements.weekGrid.append(timeRail, daysBoard);
}

function setSelectedWeek(week) {
  selectedWeek = Math.max(1, Number(week) || 1);
  render();
}

function toggleViewMode() {
  viewMode = viewMode === "week" ? "day" : "week";
  localStorage.setItem(VIEW_KEY, viewMode);
  render();
}

function renderCourseCard(course) {
  const theme = getCourseTheme(course.name);
  return `
    <div class="course-card" style="--course-border:${theme.border};--course-bg:${theme.bg};--course-fg:${theme.fg};grid-row:${course.time.startPeriod} / ${course.time.endPeriod + 1}">
      <strong>${escapeHtml(course.name)}</strong>
      <div class="course-meta">
        ${course.teacher ? `<span>${escapeHtml(course.teacher)}</span>` : ""}
        <span>${escapeHtml(course.location)}</span>
        <span>${escapeHtml(course.weeks.label)}</span>
      </div>
    </div>
  `;
}

function renderPeriodLines() {
  return getPeriodEntries()
    .map(([period]) => `<div class="period-line" style="grid-row:${period}"></div>`)
    .join("");
}

function getCourseTheme(name) {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COURSE_THEMES[hash % COURSE_THEMES.length];
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
        <span>${escapeHtml(course.weeks.label)} · ${escapeHtml(course.location)}${course.teacher ? ` · ${escapeHtml(course.teacher)}` : ""}</span>
        <span>来源：${course.source === "manual" ? "手动" : "导入"} · 可信度 ${Math.round(course.confidence * 100)}%</span>
      </div>
      <div class="review-actions"><button class="danger" data-delete="${course.id}">删除</button></div>
    `;
    elements.reviewList.append(item);
  }

  elements.reviewList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      courses = courses.filter((course) => course.id !== button.dataset.delete);
      saveCoursesToActiveSchedule();
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

function courseFitsCurrentPeriods(course) {
  const maxPeriod = getPeriodEntries().length;
  return course.time.startPeriod >= 1 && course.time.endPeriod <= maxPeriod;
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

function loadScheduleState() {
  const stored = localStorage.getItem(SCHEDULES_KEY);
  if (stored) return JSON.parse(stored);
  return {
    activeId: "default",
    schedules: [
      {
        id: "default",
        name: "默认课表",
        courses: loadCourses(),
      },
    ],
  };
}

function getActiveSchedule() {
  return scheduleState.schedules.find((schedule) => schedule.id === scheduleState.activeId) || scheduleState.schedules[0];
}

function saveScheduleState() {
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(scheduleState));
}

function saveCoursesToActiveSchedule() {
  const active = getActiveSchedule();
  active.courses = courses;
  saveScheduleState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
}

function renderScheduleManager() {
  elements.scheduleSelect.innerHTML = scheduleState.schedules
    .map((schedule) => `<option value="${schedule.id}">${escapeHtml(schedule.name)}</option>`)
    .join("");
  elements.scheduleSelect.value = getActiveSchedule().id;
}

function switchSchedule() {
  scheduleState.activeId = elements.scheduleSelect.value;
  courses = getActiveSchedule().courses;
  saveScheduleState();
  render();
}

function addSchedule() {
  const name = elements.newScheduleName.value.trim();
  if (!name) {
    alert("请输入课表名称。");
    return;
  }
  const id = `schedule-${Date.now()}`;
  scheduleState.schedules.push({ id, name, courses: [] });
  scheduleState.activeId = id;
  courses = [];
  elements.newScheduleName.value = "";
  saveScheduleState();
  renderScheduleManager();
  render();
}

function deleteActiveSchedule() {
  if (scheduleState.schedules.length <= 1) {
    alert("至少保留一个课表。");
    return;
  }
  const active = getActiveSchedule();
  if (!confirm(`确定删除“${active.name}”吗？`)) return;
  scheduleState.schedules = scheduleState.schedules.filter((schedule) => schedule.id !== active.id);
  scheduleState.activeId = scheduleState.schedules[0].id;
  courses = getActiveSchedule().courses;
  saveScheduleState();
  renderScheduleManager();
  render();
}

function loadSettings() {
  const stored = localStorage.getItem(SETTINGS_KEY);
  const fallback = getMonday(new Date()).toISOString().slice(0, 10);
  const parsed = stored ? JSON.parse(stored) : {};
  return {
    termStart: parsed.termStart || fallback,
    periodTimes: normalizePeriodSettings(parsed.periodTimes),
  };
}

function loadViewMode() {
  return localStorage.getItem(VIEW_KEY) === "week" ? "week" : "day";
}

function saveCourses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
}

function courseKey(course) {
  return [course.name, course.weekday, course.time.label, course.weeks.label, course.location].join("|");
}

function findCourseConflict(nextCourse, courseList) {
  return courseList.find((course) => {
    if (course.weekday !== nextCourse.weekday) return false;
    if (!weeksOverlap(course.weeks, nextCourse.weeks)) return false;
    return periodsOverlap(course.time, nextCourse.time);
  });
}

function periodsOverlap(a, b) {
  return a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod;
}

function weeksOverlap(a, b) {
  const weeksA = expandWeeks(a);
  const weeksB = expandWeeks(b);
  return weeksA.some((week) => weeksB.includes(week));
}

function expandWeeks(weeks) {
  if (weeks.type === "custom") return weeks.values;
  const values = [];
  for (let week = weeks.start; week <= weeks.end; week += 1) {
    if (weeks.type === "odd" && week % 2 === 0) continue;
    if (weeks.type === "even" && week % 2 === 1) continue;
    values.push(week);
  }
  return values;
}

function normalizePeriodSettings(value) {
  const source = value && Object.keys(value).length ? value : DEFAULT_PERIOD_TIMES;
  return Object.fromEntries(
    Object.entries(source)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([period, fallback]) => {
        const custom = value?.[period];
        return [period, Array.isArray(custom) && custom.length === 2 ? custom : fallback];
      }),
  );
}

function renderPeriodEditor() {
  elements.periodEditor.innerHTML = getPeriodEntries()
    .map(
      ([period, range]) => `
        <label class="period-edit-row">
          <span>第 ${period} 节</span>
          <input type="time" data-period="${period}" data-kind="start" value="${range[0]}" />
          <input type="time" data-period="${period}" data-kind="end" value="${range[1]}" />
          <button type="button" class="ghost danger-text" data-delete-period="${period}" aria-label="删除第 ${period} 节">删除</button>
        </label>
      `,
    )
    .join("");

  elements.periodEditor.querySelectorAll("[data-delete-period]").forEach((button) => {
    button.addEventListener("click", () => {
      if (getPeriodEntries().length <= 1) {
        alert("至少保留一节课。");
        return;
      }
      delete settings.periodTimes[button.dataset.deletePeriod];
      renumberPeriodSettings();
      renderPeriodEditor();
    });
  });
}

function readPeriodEditor() {
  const next = normalizePeriodSettings(settings.periodTimes);
  elements.periodEditor.querySelectorAll("input[data-period]").forEach((input) => {
    const period = input.dataset.period;
    const kind = input.dataset.kind === "start" ? 0 : 1;
    next[period][kind] = input.value || next[period][kind];
  });
  return next;
}

function addPeriodEditorRow() {
  const entries = getPeriodEntries();
  const last = entries.at(-1)?.[1] || ["08:00", "08:45"];
  const nextPeriod = String(entries.length + 1);
  settings.periodTimes[nextPeriod] = suggestNextPeriodTime(last);
  renderPeriodEditor();
}

function ensurePeriodCount(count) {
  let entries = getPeriodEntries();
  while (entries.length < count) {
    const last = entries.at(-1)?.[1] || ["08:00", "08:45"];
    settings.periodTimes[String(entries.length + 1)] = suggestNextPeriodTime(last);
    entries = getPeriodEntries();
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function suggestNextPeriodTime(previousRange) {
  const start = addMinutes(previousRange[1], 10);
  const end = addMinutes(start, 45);
  return [start, end];
}

function addMinutes(value, minutes) {
  const [hour, minute] = value.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  const nextHour = Math.floor(total / 60) % 24;
  const nextMinute = total % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

function renumberPeriodSettings() {
  settings.periodTimes = Object.fromEntries(
    getPeriodEntries().map(([, range], index) => [String(index + 1), range]),
  );
}

function getPeriodEntries() {
  return Object.entries(settings.periodTimes).sort(([a], [b]) => Number(a) - Number(b));
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
