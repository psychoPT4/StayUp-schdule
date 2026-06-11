import test from "node:test";
import assert from "node:assert/strict";
import {
  parseScheduleText,
  resolveLessonTime,
  normalizeWeeks,
} from "../src/parser.mjs";

test("normalizes Chinese week ranges and odd/even weeks", () => {
  assert.deepEqual(normalizeWeeks("1-16周"), {
    start: 1,
    end: 16,
    type: "all",
    label: "1-16周",
  });

  assert.deepEqual(normalizeWeeks("3-15周 单周"), {
    start: 3,
    end: 15,
    type: "odd",
    label: "3-15周 单周",
  });

  assert.deepEqual(normalizeWeeks("2,4,6,8周"), {
    start: 2,
    end: 8,
    type: "custom",
    values: [2, 4, 6, 8],
    label: "2,4,6,8周",
  });
});

test("resolves lesson numbers to class time", () => {
  assert.deepEqual(resolveLessonTime("3-4节"), {
    startPeriod: 3,
    endPeriod: 4,
    startTime: "10:10",
    endTime: "11:50",
    label: "3-4节",
  });

  assert.deepEqual(resolveLessonTime("第9-10节"), {
    startPeriod: 9,
    endPeriod: 10,
    startTime: "19:00",
    endTime: "20:40",
    label: "9-10节",
  });
});

test("parses website-style schedule text with weekday, time, location, and weeks", () => {
  const text = `
    高等数学A
    星期一 第1-2节 1-16周 教学楼A101
    大学英语 周三 3-4节 2-12周 双周 外语楼305
  `;

  assert.deepEqual(parseScheduleText(text), [
    {
      id: "course-0",
      name: "高等数学A",
      weekday: 1,
      weekdayLabel: "周一",
      time: {
        startPeriod: 1,
        endPeriod: 2,
        startTime: "08:00",
        endTime: "09:40",
        label: "1-2节",
      },
      weeks: {
        start: 1,
        end: 16,
        type: "all",
        label: "1-16周",
      },
      location: "教学楼A101",
      source: "import",
      confidence: 0.92,
    },
    {
      id: "course-1",
      name: "大学英语",
      weekday: 3,
      weekdayLabel: "周三",
      time: {
        startPeriod: 3,
        endPeriod: 4,
        startTime: "10:10",
        endTime: "11:50",
        label: "3-4节",
      },
      weeks: {
        start: 2,
        end: 12,
        type: "even",
        label: "2-12周 双周",
      },
      location: "外语楼305",
      source: "import",
      confidence: 0.92,
    },
  ]);
});

test("parses compact manual entry lines", () => {
  const text = "数据结构 周五 7-8节 1-8周 计算机楼B204";
  const [course] = parseScheduleText(text);

  assert.equal(course.name, "数据结构");
  assert.equal(course.weekday, 5);
  assert.equal(course.location, "计算机楼B204");
  assert.equal(course.time.startTime, "16:10");
  assert.equal(course.weeks.label, "1-8周");
});
