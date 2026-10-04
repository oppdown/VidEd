# VidEd Studio

An early, free, Windows desktop video editor for local game footage. Current version: **0.1.4.0**.

## Run it

Install Node.js, open this folder in PowerShell, then run:

```powershell
npm install
npm run desktop
```

## Working in this first build

- Import local video and audio into the media bin.
- Drag clips to video and audio tracks, add tracks, move clips between tracks, and split clips at the playhead.
- Drag either edge of a timeline clip to trim its in/out points.
- Preview video locally.
- Adjust brightness, contrast, and saturation; apply warm, monochrome, or cinematic looks; add a title or caption overlay; fade clips in or out.
- Save and open `.vide` project files.
- Export a WebM with video and source audio at 720p, 1080p, 1440p, or 4K and 30 or 60 fps presets.
- Use **Help → Check For Updates** to open the latest GitHub release, or **Help → Version Info** to inspect the app/runtime versions.
- Use **Edit → Key bind...** to change the play/pause, split, and delete shortcuts; choices are stored locally and can be reset to defaults.

## Current limits

This is the editing foundation, not yet a full Premiere replacement. Audio from video clips is included in WebM export, but separate audio tracks and additional video tracks are not mixed/composited yet; export renders the first video track. MP4/H.264 is not supported yet. Project files store source locations and reconnect media automatically when those files remain there; if a source has moved, use its Relink button and choose the file with the same name. More effects, caption timing, and installer packaging are planned follow-up work.

The app has no paid services or subscriptions. Media is opened from the user's computer. Electron and the web interface are open source; the editor does not bundle an external codec suite. The source repository is [oppdown/VidEd](https://github.com/oppdown/VidEd). A downloadable installer and published release feed are not available yet.
