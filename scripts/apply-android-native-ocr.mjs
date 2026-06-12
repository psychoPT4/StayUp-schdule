import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const androidRoot = join(root, "android");
const appGradle = join(androidRoot, "app", "build.gradle");
const sourceDir = join(androidRoot, "app", "src", "main", "java", "com", "stayup", "schedule");

if (!existsSync(appGradle)) {
  throw new Error("Android project is missing. Run `npx cap add android` first.");
}

mkdirSync(sourceDir, { recursive: true });
patchGradle();
writeFileSync(join(sourceDir, "MainActivity.java"), mainActivitySource());
writeFileSync(join(sourceDir, "NativeScheduleOcrPlugin.java"), pluginSource());

function patchGradle() {
  let gradle = readFileSync(appGradle, "utf8");
  const dependency = 'implementation "com.google.mlkit:text-recognition-chinese:16.0.1"';
  if (gradle.includes(dependency)) return;
  gradle = gradle.replace(/dependencies\s*\{/, `dependencies {\n    ${dependency}`);
  writeFileSync(appGradle, gradle);
}

function mainActivitySource() {
  return `package com.stayup.schedule;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeScheduleOcrPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
}

function pluginSource() {
  return `package com.stayup.schedule;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

@CapacitorPlugin(name = "NativeScheduleOcr")
public class NativeScheduleOcrPlugin extends Plugin {
    @PluginMethod
    public void recognize(PluginCall call) {
        String imageValue = call.getString("image");
        if (imageValue == null || imageValue.isEmpty()) {
            call.reject("Missing image");
            return;
        }

        try {
            String base64 = imageValue.contains(",") ? imageValue.substring(imageValue.indexOf(",") + 1) : imageValue;
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) {
                call.reject("Unable to decode image");
                return;
            }

            InputImage inputImage = InputImage.fromBitmap(bitmap, 0);
            TextRecognizer recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
            recognizer.process(inputImage)
                .addOnSuccessListener(text -> resolveText(call, text, bitmap.getWidth(), bitmap.getHeight()))
                .addOnFailureListener(error -> call.reject(error.getMessage()));
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    private void resolveText(PluginCall call, Text text, int width, int height) {
        JSObject result = new JSObject();
        JSArray words = new JSArray();

        for (Text.TextBlock block : text.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                for (Text.Element element : line.getElements()) {
                    Rect rect = element.getBoundingBox();
                    if (rect == null) continue;

                    JSObject word = new JSObject();
                    word.put("text", element.getText());
                    word.put("confidence", 90);
                    word.put("x0", rect.left);
                    word.put("y0", rect.top);
                    word.put("x1", rect.right);
                    word.put("y1", rect.bottom);
                    words.put(word);
                }
            }
        }

        result.put("text", text.getText());
        result.put("words", words);
        result.put("width", width);
        result.put("height", height);
        call.resolve(result);
    }
}
`;
}
