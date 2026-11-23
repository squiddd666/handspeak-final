# Local Watch & Learn research references

The 147 additional reference videos are **local, non-commercial research
material**, not publicly redistributable website assets. The user approved
using the ASL Citizen recordings already present in the project's research
caches. No publisher videos were scraped or downloaded for this change.

- Source: [Microsoft Research ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/)
- [Dataset license and use restrictions](https://www.microsoft.com/en-us/research/project/asl-citizen/dataset-license/)
- Inventory and provenance: `recognition-videos.json` in this directory.
- Generated MP4s: `media/research-signs/` (excluded from Git).

Each exported clip has its original filename, participant code, dataset split,
ASL Citizen gloss, ASL-LEX dictionary code, source hash, output hash, and
transcoding changes recorded in the manifest. Sources are exact gloss matches
to the current model label maps, with test recordings preferred over validation
and training recordings. The complete source motion is retained; audio is
removed and video is encoded as H.264/yuv420p with faststart.

GOOD MORNING, GOOD AFTERNOON, and GOOD NIGHT are explicitly labelled **two-clip
learning sequences** (GOOD + the time-of-day component), not continuous phrase
performances. The legacy Beginner checkpoint's corresponding labels were
trained on MORNING, AFTERNOON, and NIGHT alone. The repaired Beginner weights
now use synthetic joined GOOD + time-of-day training, with isolated MORNING
retained as a separate label. These synthetic sequences still do not validate
natural continuous full-greeting recognition.

The existing 51 reference videos are preserved, and the new 147 videos are
reference videos as well. The 3D signer and its 40 reconstructions of the first
videos were removed from the project on 2026-11-17: examples are videos and
pictures only. A video example is not evidence of recognition accuracy.

## Rebuild

From the repository directory, using the existing `hs-eval/.venv` environment:

```powershell
& ..\hs-eval\.venv\Scripts\python.exe scripts\build_local_research_videos.py --dry-run
& ..\hs-eval\.venv\Scripts\python.exe scripts\build_local_research_videos.py --update-catalog
```

Serve with this project's `server.py`, not an unrestricted generic static
server. The research-media route accepts only loopback clients and localhost
Host headers, and rejects forwarded/proxied public requests. A public deployment
must omit these generated files unless permission is obtained from the dataset
rights holder. The frontend also hides research-video playback on non-local
hosts; this is a usability safeguard, not a substitute for the HTTP restriction.

All 198 labels have learning references in the local demo. Recognition still
uses separate default, extra, daily, category, full-100, and Beginner-79 models.
The repaired deployment checkpoint is `beginner-repaired-v1.pt` in this
directory; `beginner-need79-v1.pt` remains a legacy fallback. Both contain the
complete 79-label vocabulary. The formerly preferred phased checkpoint
contained only 64 labels; status endpoints check actual model loading rather
than reporting the external 79-label map as a loaded model. The Beginner model
was retrained on corrected training labels. The existing full-100 ensemble was
retained because the retrained candidate did not improve validation results.
Rejection gates for both server families were selected on validation data and
bound to the checkpoint hashes in `motion-calibration.json`. New independent
held-out recorded counts are published separately from the archived benchmarks;
Watch references were excluded from that held-out audit. Wrong outputs, no
matches, tracking failures, and unsupported false accepts are all retained.
There is no simultaneous 198-label recognition mode; merging uncalibrated scores
would not make one. Shared capture and isolated routing have been repaired,
but reliable unified recognition still requires cross-model validation and
additional independent signing data. All 198 learning references being present
does not mean all 198 words are reliably recognized.
