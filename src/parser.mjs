const PERIOD_TIMES = {
  1: ["08:00", "08:45"],
  2: ["08:55", "09:40"],
  3: ["10:10", "10:55"],
  4: ["11:05", "11:50"],
  5: ["14:00", "14:45"],
  6: ["14:55", "15:40"],
  7: ["16:10", "16:55"],
  8: ["17:05", "17:50"],
  9: ["19:00", "19:45"],
  10: ["19:55", "20:40"],
  11: ["20:50", "21:35"],
  12: ["21:45", "22:30"],
};

const WEEKDAY_MAP = new Map([
  ["一", 1],
  ["二", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["日", 7],
  ["天", 7],
  ["1", 1],
  ["2", 2],
  ["3", 3],
  ["4", 4],
  ["5", 5],
  ["6", 6],
  ["7", 7],
]);

const WEEKDAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function resolveLessonTime(rawValue, scheduleTimes = PERIOD_TIMES) {
  const match = String(rawValue).match(/(?:第)?\s*(\d{1,2})(?:\s*[-~至,，]\s*(\d{1,2}))?\s*节/);
  if (!match) return resolveExplicitTime(rawValue, scheduleTimes);

  const startPeriod = Number(match[1]);
  const endPeriod = Number(match[2] || match[1]);
  const startTime = scheduleTimes[startPeriod]?.[0] || "";
  const endTime = scheduleTimes[endPeriod]?.[1] || "";

  return {
    startPeriod,
    endPeriod,
    startTime,
    endTime,
    label: `${startPeriod}-${endPeriod}节`,
  };
}

function resolveExplicitTime(rawValue, scheduleTimes = PERIOD_TIMES) {
  const match = String(rawValue).match(/(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/);
  if (!match) return null;

  const [, explicitStart, explicitEnd] = match;
  const entries = Object.entries(scheduleTimes).map(([period, range]) => ({
    period: Number(period),
    start: range[0],
    end: range[1],
  }));
  const startPeriod = entries.find((entry) => entry.start === explicitStart)?.period;
  const endPeriod = entries.find((entry) => entry.end === explicitEnd)?.period;

  if (!startPeriod || !endPeriod) return null;

  return {
    startPeriod,
    endPeriod,
    startTime: explicitStart,
    endTime: explicitEnd,
    label: `${startPeriod}-${endPeriod}节`,
  };
}

export function normalizeWeeks(rawValue) {
  const value = String(rawValue).replace(/\s+/g, " ").trim();
  const type = /单周|奇周/.test(value) ? "odd" : /双周|偶周/.test(value) ? "even" : "all";
  const numbers = [...value.matchAll(/\d{1,2}/g)].map((item) => Number(item[0]));

  if (value.includes(",") || value.includes("，")) {
    return {
      start: Math.min(...numbers),
      end: Math.max(...numbers),
      type: "custom",
      values: numbers,
      label: value,
    };
  }

  const range = value.match(/(\d{1,2})\s*[-~至]\s*(\d{1,2})/);
  if (range) {
    return {
      start: Number(range[1]),
      end: Number(range[2]),
      type,
      label: value,
    };
  }

  const single = numbers[0] || 1;
  return { start: single, end: single, type, label: value || `${single}周` };
}

export function parseScheduleText(text, options = {}) {
  const scheduleTimes = options.periodTimes || PERIOD_TIMES;
  const lines = String(text)
    .replace(/<[^>]+>/g, "\n")
    .replace(/[|；;]/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const courses = [];
  let pendingName = "";

  for (const line of lines) {
    const parsed = parseLine(line, pendingName, courses.length, scheduleTimes);
    if (parsed) {
      courses.push(parsed);
      pendingName = "";
    } else if (!hasScheduleSignal(line) && !isHeaderLine(line)) {
      pendingName = cleanCourseName(line);
    }
  }

  return courses;
}

export function parseCourseBlockText(block, defaults = {}) {
  const raw = String(block).replace(/\s+/g, "");
  if (!raw || !/\d{3,5}|\d{1,2}\s*[-~至]\s*\d{1,2}/.test(raw)) return null;

  const weekLocation = extractBlockWeekLocation(raw);
  if (!weekLocation.weekText) return null;

  const time = defaults.time || resolveLessonTime(`${defaults.startPeriod || 1}-${defaults.endPeriod || defaults.startPeriod || 1}节`, defaults.periodTimes);
  if (!time) return null;

  const name = cleanCourseName(extractBlockName(raw));
  const teacher = extractBlockTeacher(raw, weekLocation.weekText);

  return {
    id: `course-${defaults.index || 0}`,
    name: name || "未命名课程",
    weekday: defaults.weekday,
    weekdayLabel: WEEKDAY_LABELS[defaults.weekday],
    time,
    weeks: normalizeWeeks(weekLocation.weekText),
    location: weekLocation.location || "地点待确认",
    teacher,
    source: "import",
    confidence: 0.72,
  };
}

function parseLine(line, pendingName, index, scheduleTimes) {
  const weekday = extractWeekday(line);
  const time = resolveLessonTime(line, scheduleTimes);
  const weekText = extractWeekText(line);

  if (!weekday || !time || !weekText) return null;

  const weeks = normalizeWeeks(weekText);
  const name = cleanCourseName(pendingName || extractInlineName(line, weekday.raw, time.label, weekText));
  const teacher = extractTeacher(line);
  const location = extractLocation(line, name, weekday.raw, time.label, weekText);

  return {
    id: `course-${index}`,
    name: name || "未命名课程",
    weekday: weekday.value,
    weekdayLabel: WEEKDAY_LABELS[weekday.value],
    time,
    weeks,
    location,
    teacher,
    source: "import",
    confidence: location ? 0.92 : 0.78,
  };
}

function extractWeekday(line) {
  const match = line.match(/(?:星期|周)([一二三四五六日天1-7])/);
  if (!match) return null;
  return {
    raw: match[0],
    value: WEEKDAY_MAP.get(match[1]),
  };
}

function extractWeekText(line) {
  const match = line.match(/\d{1,2}\s*(?:[-~至,，]\s*\d{1,2})*\s*周\s*(?:单周|双周|奇周|偶周)?/);
  return match?.[0]?.trim() || "";
}

function extractInlineName(line, weekdayRaw, timeLabel, weekText) {
  const firstSignal = line.indexOf(weekdayRaw);
  if (firstSignal > 0) return line.slice(0, firstSignal);
  return line.replace(weekdayRaw, "").replace(timeLabel, "").replace(weekText, "");
}

function extractLocation(line, name, weekdayRaw, timeLabel, weekText) {
  let location = line;
  location = location.replace(/(?:教师|老师|授课教师|任课教师)\s*[:：]\s*[\u4e00-\u9fa5A-Za-z·.\s]{1,12}/g, " ");
  location = location.replace(/第?\s*\d{1,2}\s*[-~至,，]\s*\d{1,2}\s*节/g, " ");
  location = location.replace(/\d{1,2}:\d{2}\s*[-~至]\s*\d{1,2}:\d{2}/g, " ");
  for (const token of [name, weekdayRaw, timeLabel, `第${timeLabel}`, weekText]) {
    if (token) location = location.replace(token, " ");
  }
  location = location.replace(/\s+/g, " ").trim();
  location = location.replace(/^(单周|双周|奇周|偶周)\s*/, "");
  return location || "地点待确认";
}

function extractTeacher(line) {
  const match = String(line).match(/(?:教师|老师|授课教师|任课教师)\s*[:：]\s*([\u4e00-\u9fa5A-Za-z·.\s]{1,12})/);
  return match?.[1]?.trim() || "";
}

function extractBlockWeekLocation(raw) {
  const parenthesized = [...raw.matchAll(/[（(]([^（）()]+)[）)]/g)].map((match) => match[1]);
  const weekChunk = parenthesized.find((chunk) => /\d{1,2}\s*[-~至]\s*\d{1,2}/.test(chunk));
  if (!weekChunk) return { weekText: "", location: "" };

  const [weekText, ...locationParts] = weekChunk.split(/[,，]/).map((part) => part.trim()).filter(Boolean);
  return {
    weekText: `${weekText}周`,
    location: locationParts.join("，"),
  };
}

function extractBlockName(raw) {
  const codeIndex = raw.search(/[（(]\d{3,5}[）)]/);
  if (codeIndex > 0) return raw.slice(0, codeIndex);
  const weekIndex = raw.search(/[（(]\d{1,2}\s*[-~至]\s*\d{1,2}/);
  return weekIndex > 0 ? raw.slice(0, weekIndex) : raw;
}

function extractBlockTeacher(raw, weekText) {
  const chunks = [...raw.matchAll(/[（(]([^（）()]+)[）)]/g)].map((match) => match[1].trim());
  const candidates = chunks.filter((chunk) => {
    if (chunk === weekText) return false;
    if (/^\d{3,5}$/.test(chunk)) return false;
    if (/\d{1,2}\s*[-~至]\s*\d{1,2}/.test(chunk)) return false;
    return /^[\u4e00-\u9fa5、，,·]{2,16}$/.test(chunk);
  });
  return candidates.at(-1) || "";
}

function hasScheduleSignal(line) {
  return /(?:星期|周)[一二三四五六日天1-7]|\d{1,2}\s*[-~至]\s*\d{1,2}\s*节|\d{1,2}\s*周/.test(line);
}

function isHeaderLine(line) {
  const headerWords = ["课程", "课程名称", "星期", "节次", "周次", "地点", "教室"];
  return headerWords.filter((word) => line.includes(word)).length >= 2;
}

function cleanCourseName(value) {
  return String(value)
    .replace(/课程名称[:：]?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const weekdayLabels = WEEKDAY_LABELS;
export const periodTimes = PERIOD_TIMES;
