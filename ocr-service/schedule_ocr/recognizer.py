from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


DEFAULT_PERIOD_TIMES = {
    1: ("08:00", "08:45"),
    2: ("08:55", "09:40"),
    3: ("10:10", "10:55"),
    4: ("11:05", "11:50"),
    5: ("14:00", "14:45"),
    6: ("14:55", "15:40"),
    7: ("16:10", "16:55"),
    8: ("17:05", "17:50"),
    9: ("19:00", "19:45"),
    10: ("19:55", "20:40"),
    11: ("20:50", "21:35"),
    12: ("21:45", "22:30"),
    13: ("21:45", "22:30"),
    14: ("22:40", "23:25"),
}

WEEKDAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"]


@dataclass
class CourseBlock:
    text: str
    weekday: int
    start_period: int
    end_period: int
    confidence: float = 0.7


def parse_course_block(text: str) -> dict[str, str]:
    raw = _normalize_text(text)
    parts = re.findall(r"[（(]([^（）()]+)[）)]", raw)
    code = next((part for part in parts if re.fullmatch(r"\d{3,5}", part)), "")
    week_part = next((part for part in parts if re.search(r"\d{1,2}\s*[-~至]\s*\d{1,2}", part)), "")
    teacher = _extract_teacher(parts, week_part)

    name_end = raw.find(f"({code})") if code and f"({code})" in raw else -1
    if name_end < 0 and code:
        name_end = raw.find(f"（{code}）")
    if name_end < 0:
        week_match = re.search(r"[（(]\d{1,2}\s*[-~至]\s*\d{1,2}", raw)
        name_end = week_match.start() if week_match else len(raw)

    week_text, location = _split_week_location(week_part)
    return {
        "name": raw[:name_end].strip(),
        "code": code,
        "teacher": teacher,
        "weeks": week_text,
        "location": location,
    }


def build_course_from_block(block: CourseBlock | dict[str, Any], period_times: dict[int, tuple[str, str]] | None = None) -> dict[str, Any]:
    if isinstance(block, dict):
        block = CourseBlock(
            text=str(block["text"]),
            weekday=int(block["weekday"]),
            start_period=int(block["start_period"]),
            end_period=int(block["end_period"]),
            confidence=float(block.get("confidence", 0.7)),
        )

    parsed = parse_course_block(block.text)
    times = period_times or DEFAULT_PERIOD_TIMES
    start_time = times.get(block.start_period, ("", ""))[0]
    end_time = times.get(block.end_period, ("", ""))[1]

    return {
        "id": "",
        "name": parsed["name"] or "未命名课程",
        "weekday": block.weekday,
        "weekdayLabel": WEEKDAY_LABELS[block.weekday] if 0 < block.weekday < len(WEEKDAY_LABELS) else "",
        "time": {
            "startPeriod": block.start_period,
            "endPeriod": block.end_period,
            "startTime": start_time,
            "endTime": end_time,
            "label": f"{block.start_period}-{block.end_period}节",
        },
        "weeks": _normalize_weeks(parsed["weeks"]),
        "location": parsed["location"] or "地点待确认",
        "teacher": parsed["teacher"],
        "courseCode": parsed["code"],
        "source": "ocr-service",
        "confidence": block.confidence,
    }


def recognize_schedule_image(image_bytes: bytes) -> dict[str, Any]:
    cv2, np = _load_cv2()
    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("无法读取图片")

    schedule = _crop_schedule_area(image, cv2)
    blocks = _detect_course_blocks(schedule, cv2, np)
    ocr = _load_paddle_ocr()

    courses = []
    raw_blocks = []
    for index, block in enumerate(blocks):
      crop = schedule[block["y0"]:block["y1"], block["x0"]:block["x1"]]
      text, confidence = _read_block_text(ocr, crop)
      raw_blocks.append({**block, "text": text, "confidence": confidence})
      course = build_course_from_block({
          "text": text,
          "weekday": block["weekday"],
          "start_period": block["start_period"],
          "end_period": block["end_period"],
          "confidence": confidence,
      })
      if course["name"] != "未命名课程" and course["weeks"]["label"]:
          course["id"] = f"ocr-{index}"
          courses.append(course)

    return {
        "courses": courses,
        "rawBlocks": raw_blocks,
        "diagnostics": {
            "blockCount": len(blocks),
            "courseCount": len(courses),
            "engine": "opencv+paddleocr",
        },
    }


def _load_cv2():
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as exc:
        raise RuntimeError("OCR 服务缺少 opencv-python-headless 和 numpy，请先安装 ocr-service/requirements.txt") from exc
    return cv2, np


def _load_paddle_ocr():
    try:
        from paddleocr import PaddleOCR  # type: ignore
    except ImportError as exc:
        raise RuntimeError("OCR 服务缺少 paddleocr，请先安装 ocr-service/requirements.txt") from exc
    return PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)


def _crop_schedule_area(image, cv2):
    height = image.shape[0]
    width = image.shape[1]
    # Mobile browser screenshots often include address bars and bottom navigation.
    top = int(height * 0.12)
    bottom = int(height * 0.72)
    cropped = image[top:bottom, 0:width]
    return cropped


def _detect_course_blocks(image, cv2, np) -> list[dict[str, int]]:
    height, width = image.shape[:2]
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    blue_mask = cv2.inRange(hsv, np.array([85, 35, 80]), np.array([135, 180, 255]))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    blue_mask = cv2.morphologyEx(blue_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(blue_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    rects = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w < width * 0.06 or h < height * 0.035:
            continue
        if y < height * 0.12:
            continue
        rects.append({"x0": x, "y0": y, "x1": x + w, "y1": y + h})

    if not rects:
        return []

    left = min(rect["x0"] for rect in rects)
    right = max(rect["x1"] for rect in rects)
    top = min(rect["y0"] for rect in rects)
    bottom = max(rect["y1"] for rect in rects)
    column_width = max(1, (right - left) / 6)
    row_height = max(1, (bottom - top) / 14)

    blocks = []
    for rect in rects:
        center_x = (rect["x0"] + rect["x1"]) / 2
        weekday = int(round((center_x - left) / column_width)) + 1
        start_period = int((rect["y0"] - top) / row_height) + 1
        end_period = max(start_period, int((rect["y1"] - top) / row_height) + 1)
        blocks.append({
            **rect,
            "weekday": max(1, min(7, weekday)),
            "start_period": max(1, min(14, start_period)),
            "end_period": max(1, min(14, end_period)),
        })

    return sorted(blocks, key=lambda block: (block["weekday"], block["start_period"], block["y0"]))


def _read_block_text(ocr, image) -> tuple[str, float]:
    result = ocr.ocr(image, cls=True)
    fragments = []
    confidences = []
    for page in result or []:
        for item in page or []:
            if len(item) < 2:
                continue
            text, confidence = item[1][0], float(item[1][1])
            fragments.append(str(text))
            confidences.append(confidence)
    confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return "".join(fragments), confidence


def _normalize_text(text: str) -> str:
    return (
        str(text)
        .replace(" ", "")
        .replace("\n", "")
        .strip()
    )


def _extract_teacher(parts: list[str], week_part: str) -> str:
    for part in reversed(parts):
        if part == week_part:
            continue
        if re.fullmatch(r"\d{3,5}", part):
            continue
        if re.search(r"\d{1,2}\s*[-~至]\s*\d{1,2}", part):
            continue
        if re.fullmatch(r"[\u4e00-\u9fa5、,，·]{2,24}", part):
            return part.replace(",", "、").replace("，", "、")
    return ""


def _split_week_location(value: str) -> tuple[str, str]:
    if not value:
        return "", ""
    parts = [part.strip() for part in re.split(r"[,，]", value) if part.strip()]
    week_text = parts[0] if parts else ""
    if week_text and not week_text.endswith("周"):
        week_text = f"{week_text}周"
    location = "，".join(parts[1:])
    return week_text, location


def _normalize_weeks(value: str) -> dict[str, Any]:
    numbers = [int(item) for item in re.findall(r"\d{1,2}", value)]
    week_type = "odd" if re.search(r"单周|奇周", value) else "even" if re.search(r"双周|偶周", value) else "all"
    if "," in value or "，" in value:
        return {"start": min(numbers), "end": max(numbers), "type": "custom", "values": numbers, "label": value}
    if len(numbers) >= 2:
        return {"start": numbers[0], "end": numbers[1], "type": week_type, "label": value}
    single = numbers[0] if numbers else 1
    return {"start": single, "end": single, "type": week_type, "label": value or f"{single}周"}
