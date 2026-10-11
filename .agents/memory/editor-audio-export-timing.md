---
name: Timeline audio export timing
description: Audio export must remain synchronized with video even when video encoding is slower than real time.
---

Encode timeline audio from project timestamps rather than capturing a real-time `MediaStreamAudioTrackSource` while video rendering runs at variable speed.

**Why:** A slow browser render produced an 18.125-second video stream with a 25.12-second audio stream and gaps in a continuous tone. The real-time audio source followed wall-clock render time instead of the edit timeline.

**How to apply:** For audio-bearing export changes, use timestamped/offline audio samples and verify a continuous tone has no gaps and ends with the video on a slow or software-only encoder.
