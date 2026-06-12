import unittest

from schedule_ocr.recognizer import parse_course_block, build_course_from_block


class RecognizerTest(unittest.TestCase):
    def test_parse_nankai_course_block(self):
        parsed = parse_course_block("高等数学（A类）II(0487)(吴立波)(1-16,津南公教楼C区421)")

        self.assertEqual(parsed["name"], "高等数学（A类）II")
        self.assertEqual(parsed["code"], "0487")
        self.assertEqual(parsed["teacher"], "吴立波")
        self.assertEqual(parsed["weeks"], "1-16周")
        self.assertEqual(parsed["location"], "津南公教楼C区421")

    def test_build_course_from_positioned_block(self):
        course = build_course_from_block(
            {
                "text": "高级语言程序设计2-2(0571)(宋春瑶)(1-16,津南公教楼C区103)",
                "weekday": 4,
                "start_period": 5,
                "end_period": 6,
            }
        )

        self.assertEqual(course["name"], "高级语言程序设计2-2")
        self.assertEqual(course["weekday"], 4)
        self.assertEqual(course["teacher"], "宋春瑶")
        self.assertEqual(course["time"]["startPeriod"], 5)
        self.assertEqual(course["time"]["endPeriod"], 6)
        self.assertEqual(course["weeks"]["start"], 1)
        self.assertEqual(course["weeks"]["end"], 16)
        self.assertEqual(course["location"], "津南公教楼C区103")


if __name__ == "__main__":
    unittest.main()
