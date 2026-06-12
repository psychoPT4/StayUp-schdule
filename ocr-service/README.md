# StayUp OCR Service

This optional service provides higher quality schedule-image import than browser OCR.

It uses:

- OpenCV to crop the schedule area and detect blue course blocks.
- PaddleOCR to read text inside each course block.
- Position mapping to infer weekday and lesson periods from each block.

## Run locally

```powershell
cd "D:\ZHTAO\desktop\新建文件夹 (2)\schedule-app\ocr-service"
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app:app --host 0.0.0.0 --port 8787
```

On the phone, set the OCR service URL in the app import page to:

```text
http://YOUR_PC_LAN_IP:8787/api/recognize
```

For example:

```text
http://192.168.1.20:8787/api/recognize
```

The phone and PC must be on the same Wi-Fi network, and Windows Firewall must allow port `8787`.
