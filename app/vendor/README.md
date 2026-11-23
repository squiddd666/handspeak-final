# Bundled browser runtimes

Unmodified copies of the third-party runtimes the main page needs for hand tracking,
face tracking and finding the person in front of the camera. They are served from this folder so that letter
recognition, the on-device words, the letter accuracy check and the lessons work
without an internet connection. Downloaded 2026-11-12; the Pose Landmarker file on 2026-11-14.

| Folder | Package | Version | License | Source |
|---|---|---|---|---|
| `mediapipe-tasks-vision-0.10.22-rc.20250304/` | `@mediapipe/tasks-vision` (ES module build and its WebAssembly files) | 0.10.22-rc.20250304 | Apache-2.0 (`LICENSE` in the folder) | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/` |
| `mediapipe-models/` | MediaPipe Hand Landmarker and Face Landmarker task files (float16, version 1) | – | Apache-2.0, as published by Google with MediaPipe | `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` |
| `mediapipe-models/pose_landmarker_lite.task` | MediaPipe Pose Landmarker task file (lite, float16, version 1), used to find the person in front of the camera | – | Apache-2.0: the license of the MediaPipe repository, read on 2026-11-14. The file is published by Google on the same model server as the two files above; its model card (BlazePose GHUM 3D, linked from the Pose Landmarker guide) could not be read by a program on that day, so its license line is not confirmed word for word | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` |

## Files

| File | Bytes | SHA-256 |
|---|---|---|
| `mediapipe-models/face_landmarker.task` | 3758596 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| `mediapipe-models/hand_landmarker.task` | 7819105 | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |
| `mediapipe-models/pose_landmarker_lite.task` | 5777746 | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| `mediapipe-tasks-vision-0.10.22-rc.20250304/vision_bundle.mjs` | 137809 | `3252b10e0fd26c4095e4b6ee545c1c898120b3a3813388ecd4876abe6f1399a9` |
| `mediapipe-tasks-vision-0.10.22-rc.20250304/wasm/vision_wasm_internal.js` | 204284 | `4a97e2520ba506c680ecd6ba6acfb146888afa0e2746d57f205352bc6ebb82eb` |
| `mediapipe-tasks-vision-0.10.22-rc.20250304/wasm/vision_wasm_internal.wasm` | 9574032 | `f00ec4731faa23b3e714d00e88d4d10e2df5c0a427d3a2b4ae6e3526fdd14ef7` |
| `mediapipe-tasks-vision-0.10.22-rc.20250304/wasm/vision_wasm_nosimd_internal.js` | 204137 | `927def7b465c51b86e4b3060f93646aca4e27121f4b8fc0483786e407ea9cf1f` |
| `mediapipe-tasks-vision-0.10.22-rc.20250304/wasm/vision_wasm_nosimd_internal.wasm` | 9448638 | `3821ea9b1f7fb8c549ef2a064ef5c85750bf375c545a49fd6eea0df44a95f1f4` |

## Still loaded from the internet

- Google Fonts (the page falls back to system fonts without them).
- MediaPipe Holistic 0.5.1675471629, used only by the server word models (Beginner, 100-word, 20-word).
- ONNX Runtime Web 1.23.2, used only by the optional `?letterEngine=hybrid` recovery detector.
- The J and Z reference videos and the links to external lessons.

To update a runtime, download the new version into a new versioned folder, record its
hashes here, and change the paths in `js/app.js`, `js/face-tracker.js`, `js/body-tracker.js`, the two workers
in `js/` and the import map in `index.html`.
