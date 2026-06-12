import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const res = join(root, "android", "app", "src", "main", "res");

const valuesDir = join(res, "values");
const drawableDir = join(res, "drawable");
const mipmapDir = join(res, "mipmap-anydpi-v26");

for (const directory of [valuesDir, drawableDir, mipmapDir]) {
  mkdirSync(directory, { recursive: true });
}

writeFileSync(
  join(valuesDir, "ic_launcher_colors.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#F8F4EA</color>
</resources>
`,
);

writeFileSync(
  join(drawableDir, "ic_launcher_foreground.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="108dp"
  android:height="108dp"
  android:viewportWidth="108"
  android:viewportHeight="108">
  <path
    android:fillColor="#1F6F68"
    android:pathData="M25,43c0,-8 7,-15 15,-15h28c8,0 15,7 15,15v27c0,8 -7,15 -15,15H40c-8,0 -15,-7 -15,-15V43z"/>
  <path
    android:fillColor="#FFFDF8"
    android:pathData="M34,52c0,-2 2,-4 4,-4h13c2,0 4,2 4,4v6c0,2 -2,4 -4,4H38c-2,0 -4,-2 -4,-4V52zM59,52c0,-2 2,-4 4,-4h13c2,0 4,2 4,4v6c0,2 -2,4 -4,4H63c-2,0 -4,-2 -4,-4V52zM34,68c0,-2 2,-4 4,-4h13c2,0 4,2 4,4v6c0,2 -2,4 -4,4H38c-2,0 -4,-2 -4,-4V68zM59,68c0,-2 2,-4 4,-4h13c2,0 4,2 4,4v6c0,2 -2,4 -4,4H63c-2,0 -4,-2 -4,-4V68z"/>
  <path
    android:fillColor="#FFFDF8"
    android:pathData="M66,25c3,-3 8,-3 11,0l4,4l12,-12c3,-3 8,-3 11,0s3,8 0,11L86,46c-3,3 -8,3 -11,0L66,37c-3,-3 -3,-9 0,-12z"/>
  <path
    android:fillColor="#1F6F68"
    android:pathData="M70,28c2,-2 5,-2 7,0l5,5l15,-15c2,-2 5,-2 7,0s2,5 0,7L86,43c-2,2 -5,2 -7,0l-9,-8c-2,-2 -2,-5 0,-7z"/>
  <path
    android:strokeColor="#D98B37"
    android:strokeWidth="4"
    android:strokeLineCap="round"
    android:fillColor="@android:color/transparent"
    android:pathData="M42,18v7M54,16v8M66,19v7"/>
</vector>
`,
);

const adaptiveIcon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
`;

writeFileSync(join(mipmapDir, "ic_launcher.xml"), adaptiveIcon);
writeFileSync(join(mipmapDir, "ic_launcher_round.xml"), adaptiveIcon);
