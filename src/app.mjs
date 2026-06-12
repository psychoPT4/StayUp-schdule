import {
  normalizeWeeks,
  parseScheduleText,
  periodTimes as DEFAULT_PERIOD_TIMES,
  resolveLessonTime,
  weekdayLabels,
} from "./parser.mjs";

const STORAGE_KEY = "mobile-schedule-courses";
const SCHEDULES_KEY = "mobile-schedule-books";
const SETTINGS_KEY = "mobile-schedule-settings";
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

const elements = {
  currentWeek: document.querySelector("#currentWeek"),
  activeScheduleName: document.querySelector("#activeScheduleName"),
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
  elements.courseForm.addEventListener("submit", addManualCourse);
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
    elements.ocrHint.textContent = "正在识别图片，请稍等...";
    const text = await recognizeImageText(file);
    elements.rawSchedule.value = text;
    mergeCourses(parseScheduleText(text, { periodTimes: settings.periodTimes }));
    activatePanel("reviewPanel");
  } catch (error) {
    elements.ocrHint.textContent = `图片识别失败：${error.message}。可以先用系统相册或微信识别文字后粘贴导入。`;
  }
}

async function recognizeImageText(file) {
  if ("TextDetector" in window) {
    const bitmap = await createImageBitmap(file);
    const detector = new window.TextDetector();
    const detected = await detector.detect(bitmap);
    return detected.map((item) => item.rawValue).join("\n");
  }

  await loadScript(TESSERACT_CDN);
  if (!window.Tesseract) throw new Error("OCR 模块加载失败");

  const result = await window.Tesseract.recognize(file, "chi_sim+eng", {
    logger(message) {
      if (message.status === "recognizing text") {
        elements.ocrHint.textContent = `正在识别图片：${Math.round(message.progress * 100)}%`;
      }
    },
  });
  return result.data.text;
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
  const currentWeek = getCurrentWeek();
  const today = new Date().getDay() || 7;
  courses = getActiveSchedule().courses;
  elements.activeScheduleName.textContent = getActiveSchedule().name;
  elements.currentWeek.textContent = currentWeek;
  elements.todayLabel.textContent = weekdayLabels[today];
  renderWeekGrid(currentWeek);
  renderToday(today, currentWeek);
  renderReviewList();
}

function renderWeekGrid(currentWeek) {
  elements.weekGrid.innerHTML = "";
  elements.weekGrid.className = "schedule-board";
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
