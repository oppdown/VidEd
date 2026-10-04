import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const uid = () => Math.random().toString(36).slice(2, 10)
const blankTracks = () => [{ id: 'v1', kind: 'video', name: 'Video 1', clips: [] }, { id: 'a1', kind: 'audio', name: 'Audio 1', clips: [] }]
const fmt = (value = 0) => { const n = Math.max(0, Math.floor(value)); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` }
const EXPORTS = { '720p30': [1280, 720, 30], '1080p30': [1920, 1080, 30], '1080p60': [1920, 1080, 60], '1440p60': [2560, 1440, 60], '2160p60': [3840, 2160, 60] }
const EFFECTS = { None: '', Warm: 'sepia(22%) saturate(115%)', Monochrome: 'grayscale(100%)', Cinematic: 'contrast(112%) saturate(82%)' }
const DEFAULT_KEYBINDS = [
  { action: 'play-pause', label: 'Play / Pause', shortcut: 'Space' },
  { action: 'split-clip', label: 'Split at Playhead', shortcut: 'Ctrl+K' },
  { action: 'delete-clip', label: 'Delete Selected Clip', shortcut: 'Delete' },
]
const keyLabel = (event) => {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null
  const modifiers = []
  if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  const key = event.code === 'Space' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  return [...modifiers, key].join('+')
}

function Icon({ name, size = 16 }) {
  const p = {
    play: <path d="m8 5 12 7-12 7z" fill="currentColor" stroke="none"/>, pause: <path d="M8 5v14M16 5v14" strokeWidth="3"/>,
    plus: <path d="M12 5v14M5 12h14"/>, folder: <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H10l2 2h7.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>,
    save: <><path d="M5 3h12l4 4v14H3V3z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>, cut: <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.2 8.2 12 12M8.2 15.8l12-12"/></>, trash: <><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/></>,
    undo: <><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/></>, zoom: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M10.5 7.5v6M7.5 10.5h6"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, sliders: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="#191a1e"/><circle cx="15" cy="12" r="2" fill="#191a1e"/><circle cx="10" cy="18" r="2" fill="#191a1e"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name] || p.plus}</svg>
}

function App() {
  const [projectName, setProjectName] = useState('Untitled Project')
  const [media, setMedia] = useState([])
  const [tracks, setTracks] = useState(blankTracks)
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('Media')
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(46)
  const [exportPreset, setExportPreset] = useState('1080p30')
  const [notice, setNotice] = useState('Import a clip to start editing')
  const [exporting, setExporting] = useState(false)
  const [history, setHistory] = useState([])
  const [keybinds, setKeybinds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('vided-keybinds') || 'null')
      return Array.isArray(saved) ? DEFAULT_KEYBINDS.map((entry) => ({ ...entry, shortcut: saved.find((item) => item.action === entry.action)?.shortcut || entry.shortcut })) : DEFAULT_KEYBINDS
    } catch { return DEFAULT_KEYBINDS }
  })
  const [keybindOpen, setKeybindOpen] = useState(false)
  const [recordingKey, setRecordingKey] = useState(null)
  const [keybindNotice, setKeybindNotice] = useState('Click a shortcut, then press the new key combination.')
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const timelineRef = useRef(null)
  const pendingProject = useRef(null)
  const menuActionRef = useRef({})
  const keybindsRef = useRef(keybinds)
  const recordingKeyRef = useRef(recordingKey)
  const keybindOpenRef = useRef(keybindOpen)
  keybindsRef.current = keybinds
  recordingKeyRef.current = recordingKey
  keybindOpenRef.current = keybindOpen

  const allClips = tracks.flatMap((track) => track.clips.map((clip) => ({ ...clip, trackId: track.id, kind: track.kind })))
  const selectedClip = allClips.find((clip) => clip.id === selected)
  const selectedTrack = selectedClip && tracks.find((track) => track.id === selectedClip.trackId)
  const activeMedia = media.find((item) => item.id === (selectedClip?.mediaId || allClips[0]?.mediaId))
  const totalDuration = Math.max(0, ...tracks.flatMap((track) => track.clips.map((clip) => clip.start + clip.duration)))
  const timelineDuration = Math.max(30, totalDuration)
  const px = zoom
  const marks = useMemo(() => Array.from({ length: Math.ceil(timelineDuration / 5) + 1 }, (_, i) => i * 5), [timelineDuration])
  const remember = () => setHistory((items) => [...items.slice(-19), tracks])

  const importFiles = async (files) => {
    const accepted = [...files].filter((file) => file.type.startsWith('video/') || file.type.startsWith('audio/'))
    const incoming = await Promise.all(accepted.map(async (file) => {
      const filePath = window.vided?.getPathForFile?.(file) || null
      const url = filePath ? await window.vided?.resolveMedia?.(filePath) : null
      const item = { id: uid(), name: file.name, type: file.type.startsWith('audio/') ? 'audio' : 'video', path: filePath, url: url || URL.createObjectURL(file), size: file.size, duration: 0 }
      const probe = document.createElement(item.type)
      probe.preload = 'metadata'; probe.crossOrigin = 'anonymous'; probe.src = item.url
      probe.onloadedmetadata = () => setMedia((items) => items.map((entry) => entry.id === item.id ? { ...entry, duration: probe.duration || 0 } : entry))
      return item
    }))
    if (!incoming.length) { setNotice('Choose video or audio files'); return }
    if (pendingProject.current) {
      const saved = pendingProject.current
      const linked = new Set(saved.relinked || [])
      const idMap = new Map()
      const relinked = incoming.map((item) => {
        const source = (saved.media || []).find((entry) => !linked.has(entry.id) && entry.name.toLowerCase() === item.name.toLowerCase() && entry.type === item.type)
        if (!source) return item
        linked.add(source.id)
        idMap.set(source.id, item.id)
        return item
      })
      setMedia((items) => {
        const replacedIds = new Set(idMap.keys())
        return [...items.filter((entry) => !replacedIds.has(entry.id)), ...relinked]
      })
      setTracks((rows) => rows.map((row) => ({ ...row, clips: row.clips.map((clip) => idMap.has(clip.mediaId) ? { ...clip, mediaId: idMap.get(clip.mediaId) } : clip) })))
      saved.relinked = [...linked]
      const missing = (saved.media || []).filter((item) => !linked.has(item.id))
      if (!missing.length) {
        pendingProject.current = null
        setNotice(`Reconnected all ${saved.media.length} project media files`)
      } else {
        setNotice(`Reconnected ${linked.size} of ${saved.media.length} files. Import the remaining media to finish relinking.`)
      }
    } else {
      setMedia((items) => [...items, ...incoming])
      setNotice(`${incoming.length} file${incoming.length > 1 ? 's' : ''} added to the media bin`)
    }
  }
  const makeClip = (item, start) => ({ id: uid(), mediaId: item.id, start, sourceIn: 0, duration: item.duration || 12, title: '', caption: '', brightness: 100, contrast: 100, saturation: 100, volume: 100, transition: 'None', effect: 'None' })
  const addClip = (item, trackId = item.type === 'audio' ? 'a1' : 'v1', at) => {
    remember()
    const track = tracks.find((entry) => entry.id === trackId) || tracks[0]
    const start = at ?? Math.max(0, ...track.clips.map((clip) => clip.start + clip.duration))
    const clip = makeClip(item, start)
    setTracks((rows) => rows.map((row) => row.id === track.id ? { ...row, clips: [...row.clips, clip].sort((a, b) => a.start - b.start) } : row))
    setSelected(clip.id); setNotice(`Added ${item.name} to ${track.name}`)
  }
  const updateClip = (changes) => setTracks((rows) => rows.map((row) => row.id === selectedClip?.trackId ? { ...row, clips: row.clips.map((clip) => clip.id === selected ? { ...clip, ...changes } : clip) } : row))
  const startTrim = (event, clip, side) => {
    event.preventDefault(); event.stopPropagation()
    const trackId = allClips.find((entry) => entry.id === clip.id)?.trackId
    const source = media.find((entry) => entry.id === clip.mediaId)
    const original = { start: clip.start, sourceIn: clip.sourceIn, duration: clip.duration }
    const originX = event.clientX
    setSelected(clip.id); remember()
    const move = (pointerEvent) => {
      const delta = (pointerEvent.clientX - originX) / px
      let changes
      if (side === 'left') {
        const maxIn = Math.max(0, original.sourceIn + original.duration - .25)
        const minIn = Math.max(0, original.sourceIn - original.start)
        const sourceIn = Math.min(maxIn, Math.max(minIn, original.sourceIn + delta))
        const shift = sourceIn - original.sourceIn
        changes = { sourceIn, start: Math.max(0, original.start + shift), duration: Math.max(.25, original.duration - shift) }
      } else {
        const maxDuration = Math.max(.25, (source?.duration || original.sourceIn + original.duration) - original.sourceIn)
        changes = { duration: Math.min(maxDuration, Math.max(.25, original.duration + delta)) }
      }
      setTracks((rows) => rows.map((row) => row.id === trackId ? { ...row, clips: row.clips.map((item) => item.id === clip.id ? { ...item, ...changes } : item) } : row))
    }
    const finish = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish)
  }
  const seek = (time) => {
    const next = Math.max(0, Math.min(time, totalDuration)); setPlayhead(next)
    if (videoRef.current && selectedClip) videoRef.current.currentTime = Math.max(0, next - selectedClip.start + selectedClip.sourceIn)
  }
  const split = () => {
    if (!selectedClip) { setNotice('Select a timeline clip before splitting'); return }
    const cut = playhead - selectedClip.start
    if (cut < .2 || cut > selectedClip.duration - .2) { setNotice('Move the playhead inside the selected clip before splitting'); return }
    remember()
    const first = { ...selectedClip, duration: cut }
    const second = { ...selectedClip, id: uid(), start: playhead, sourceIn: selectedClip.sourceIn + cut, duration: selectedClip.duration - cut }
    setTracks((rows) => rows.map((row) => row.id === selectedClip.trackId ? { ...row, clips: row.clips.flatMap((clip) => clip.id === selected ? [first, second] : [clip]) } : row))
    setSelected(second.id); setNotice('Clip split at the playhead')
  }
  const remove = () => {
    if (!selectedClip) return
    remember(); setTracks((rows) => rows.map((row) => ({ ...row, clips: row.clips.filter((clip) => clip.id !== selected) }))); setSelected(null); setNotice('Clip removed from timeline')
  }
  const undo = () => { if (history.length) { setTracks(history.at(-1)); setHistory((items) => items.slice(0, -1)); setNotice('Last edit undone') } }
  const addTrack = (kind) => {
    const index = tracks.filter((track) => track.kind === kind).length + 1
    const row = { id: uid(), kind, name: `${kind === 'video' ? 'Video' : 'Audio'} ${index}`, clips: [] }
    setTracks((items) => kind === 'video' ? [row, ...items] : [...items, row]); setNotice(`${row.name} added`)
  }
  const saveProject = async () => {
    const data = { format: 'vided-project', version: 1, name: projectName, media: media.map(({ id, name, type, duration, size, path }) => ({ id, name, type, duration, size, path })), tracks }
    if (window.vided?.saveProject) { const result = await window.vided.saveProject(data); if (result) setNotice(`Project saved: ${result.split(/[\\/]/).pop()}`) }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = `${projectName}.vide`; a.click(); setNotice('Project file downloaded') }
  }
  const openProject = async () => {
    const data = await window.vided?.openProject?.()
    if (data) {
      const loadedMedia = await Promise.all((data.media || []).map(async (item) => {
        let url = null
        if (item.path) url = await window.vided?.resolveMedia?.(item.path)
        return { ...item, url, offline: !url }
      }))
      const missing = loadedMedia.filter((item) => item.offline)
      setProjectName(data.name || 'Untitled Project'); setTracks(data.tracks || blankTracks()); setMedia(loadedMedia); setSelected(null)
      pendingProject.current = missing.length ? { ...data, relinked: loadedMedia.filter((item) => !item.offline).map((item) => item.id) } : null
      setNotice(missing.length ? `${missing.length} media file${missing.length === 1 ? '' : 's'} missing. Import them to relink this project.` : 'Project opened. Source media reconnected.')
    }
  }
  const newProject = () => {
    if ((media.length || allClips.length) && !window.confirm('Start a new project? The current editing session will be cleared.')) return
    setProjectName('Untitled Project'); setMedia([]); setTracks(blankTracks()); setSelected(null); setPlayhead(0); setHistory([]); pendingProject.current = null
    setNotice('New project ready')
  }
  useEffect(() => {
    if (!selectedClip) return
    const item = media.find((entry) => entry.id === selectedClip.mediaId)
    if (videoRef.current && item?.type === 'video' && item.url) { videoRef.current.crossOrigin = 'anonymous'; videoRef.current.src = item.url; videoRef.current.currentTime = selectedClip.sourceIn || 0 }
  }, [selectedClip?.id, media])
  useEffect(() => { if (playing) videoRef.current?.play().catch(() => setPlaying(false)); else videoRef.current?.pause() }, [playing, activeMedia?.id])
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setPlayhead((time) => { if (time + .1 >= totalDuration) { setPlaying(false); return 0 } return time + .1 }), 100)
    return () => clearInterval(timer)
  }, [playing, totalDuration])
  const onTimelineClick = (event) => { if (!event.target.closest('.timeline-clip')) seek((event.clientX - timelineRef.current.getBoundingClientRect().left - 120) / px) }
  const dropClip = (event, track) => {
    event.preventDefault()
    const x = event.clientX - timelineRef.current.getBoundingClientRect().left - 120
    const at = Math.max(0, x / px)
    const mediaId = event.dataTransfer.getData('media-id')
    if (mediaId) { const item = media.find((entry) => entry.id === mediaId); if (item) addClip(item, track.id, at); return }
    const clipId = event.dataTransfer.getData('clip-id')
    const clip = allClips.find((entry) => entry.id === clipId)
    if (!clip) return
    remember()
    const cleanClip = (({ trackId, kind, ...rest }) => rest)(clip)
    setTracks((rows) => rows.map((row) => ({ ...row, clips: row.clips.filter((entry) => entry.id !== clipId) })).map((row) => row.id === track.id ? { ...row, clips: [...row.clips, { ...cleanClip, start: at }].sort((a, b) => a.start - b.start) } : row))
  }
  const exportWebm = async () => {
    const row = tracks.find((track) => track.kind === 'video' && track.clips.length)
    if (!row) { setNotice('Add a video clip to the timeline before exporting'); return }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { setNotice('This system does not support WebM export'); return }
    setExporting(true); setNotice('Exporting WebM…')
    try {
      const canvas = document.createElement('canvas'); [canvas.width, canvas.height] = EXPORTS[exportPreset]
      const fps = EXPORTS[exportPreset][2]
      const ctx = canvas.getContext('2d'); const stream = canvas.captureStream(fps)
      const audioContext = new AudioContext(); await audioContext.resume(); const audioOut = audioContext.createMediaStreamDestination()
      stream.addTrack(audioOut.stream.getAudioTracks()[0])
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' })
      const chunks = []; recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      const ended = new Promise((resolve) => { recorder.onstop = resolve }); recorder.start()
      for (const clip of row.clips.slice().sort((a, b) => a.start - b.start)) {
        const item = media.find((entry) => entry.id === clip.mediaId); if (!item || item.type !== 'video') continue
        const source = document.createElement('video'); source.crossOrigin = 'anonymous'; source.src = item.url; source.muted = false; source.volume = Math.max(0, Math.min(1, clip.volume / 100)); source.playsInline = true
        const audioNode = audioContext.createMediaElementSource(source); audioNode.connect(audioOut)
        await new Promise((resolve) => { source.onloadedmetadata = resolve; source.onerror = resolve })
        source.currentTime = clip.sourceIn || 0
        await new Promise((resolve) => { source.onseeked = resolve; setTimeout(resolve, 800) })
        await source.play().catch(() => {})
        const endAt = (clip.sourceIn || 0) + clip.duration
        while (!source.ended && source.currentTime < endAt && !source.error) {
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height)
          const localTime = source.currentTime - (clip.sourceIn || 0)
          let alpha = 1
          if (clip.transition === 'Fade in' || clip.transition === 'Fade in + out') alpha = Math.min(alpha, localTime / 0.7)
          if (clip.transition === 'Fade out' || clip.transition === 'Fade in + out') alpha = Math.min(alpha, (clip.duration - localTime) / 0.7)
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
          if (source.readyState >= 2) {
            const scale = Math.min(canvas.width / source.videoWidth, canvas.height / source.videoHeight)
            ctx.filter = `brightness(${clip.brightness}%) contrast(${clip.contrast}%) saturate(${clip.saturation}%) ${EFFECTS[clip.effect] || ''}`
            ctx.drawImage(source, (canvas.width - source.videoWidth * scale) / 2, (canvas.height - source.videoHeight * scale) / 2, source.videoWidth * scale, source.videoHeight * scale); ctx.filter = 'none'
          }
          ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 8
          if (clip.title) { ctx.font = 'bold 66px Arial'; ctx.fillText(clip.title, 960, 150) }
          if (clip.caption) { ctx.font = '42px Arial'; ctx.fillText(clip.caption, 960, 970) }
          ctx.shadowBlur = 0; ctx.globalAlpha = 1
          await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        source.pause(); audioNode.disconnect()
      }
      recorder.stop(); await ended; stream.getTracks().forEach((track) => track.stop()); await audioContext.close()
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); const a = document.createElement('a'); a.href = url; a.download = `${projectName || 'video'}.webm`; a.click(); URL.revokeObjectURL(url)
      setNotice('WebM export complete')
    } catch (error) { setNotice(`Export failed: ${error.message}`) }
    setExporting(false)
  }
  const filter = selectedClip ? `brightness(${selectedClip.brightness}%) contrast(${selectedClip.contrast}%) saturate(${selectedClip.saturation}%) ${EFFECTS[selectedClip.effect] || ''}` : 'none'
  const applyKeybind = (action, shortcut) => {
    const next = keybindsRef.current.map((entry) => entry.action === action ? { ...entry, shortcut } : entry)
    keybindsRef.current = next; setKeybinds(next)
    try { localStorage.setItem('vided-keybinds', JSON.stringify(next)) } catch { setKeybindNotice('Could not save shortcuts on this device.') }
  }
  const resetKeybinds = () => {
    keybindsRef.current = DEFAULT_KEYBINDS; setKeybinds(DEFAULT_KEYBINDS); setRecordingKey(null)
    try { localStorage.removeItem('vided-keybinds') } catch { /* Keep defaults for this session. */ }
    setKeybindNotice('Default shortcuts restored.')
  }
  menuActionRef.current = {
    'new-project': newProject,
    'open-project': openProject,
    'save-project': saveProject,
    'export-video': exportWebm,
    'open-keybinds': () => { setKeybindOpen(true); setRecordingKey(null); setKeybindNotice('Click a shortcut, then press the new key combination.') },
    'play-pause': () => setPlaying((value) => !value),
    'split-clip': split,
    'delete-clip': remove,
  }
  useEffect(() => {
    const unsubscribe = window.vided?.onMenuAction?.((action) => menuActionRef.current[action]?.())
    const onKeyDown = (event) => {
      const target = event.target
      const editingText = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (recordingKeyRef.current) {
        if (event.key === 'Escape') { event.preventDefault(); setRecordingKey(null); setKeybindNotice('Shortcut change cancelled.'); return }
        const shortcut = keyLabel(event)
        if (!shortcut) { event.preventDefault(); return }
        event.preventDefault(); event.stopPropagation()
        const conflict = keybindsRef.current.find((entry) => entry.action !== recordingKeyRef.current && entry.shortcut === shortcut)
        if (conflict) { setKeybindNotice(`${shortcut} is already assigned to ${conflict.label}. Choose another shortcut.`); return }
        const action = recordingKeyRef.current
        applyKeybind(action, shortcut); setRecordingKey(null)
        setKeybindNotice(`${DEFAULT_KEYBINDS.find((entry) => entry.action === action)?.label} is now ${shortcut}.`)
        return
      }
      if (keybindOpenRef.current && event.key === 'Escape') { setKeybindOpen(false); return }
      if (keybindOpenRef.current || editingText || event.repeat) return
      const shortcut = keyLabel(event)
      const binding = keybindsRef.current.find((entry) => entry.shortcut === shortcut)
      if (binding) { event.preventDefault(); menuActionRef.current[binding.action]?.() }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => { unsubscribe?.(); window.removeEventListener('keydown', onKeyDown, true) }
  }, [])
  let previewOpacity = 1
  if (selectedClip) {
    const localTime = playhead - selectedClip.start
    if (selectedClip.transition === 'Fade in' || selectedClip.transition === 'Fade in + out') previewOpacity = Math.min(previewOpacity, localTime / .7)
    if (selectedClip.transition === 'Fade out' || selectedClip.transition === 'Fade in + out') previewOpacity = Math.min(previewOpacity, (selectedClip.duration - localTime) / .7)
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark">V</div><div className="brand-title">VidEd <span>STUDIO</span></div><div className="top-divider"/><input className="project-name" aria-label="Project name" value={projectName} onChange={(e) => setProjectName(e.target.value)}/><span className="save-status"><i/>Local editing session</span><div className="top-actions"><button className="icon-button" title="Undo" onClick={undo}><Icon name="undo"/></button><button className="top-button" onClick={openProject}><Icon name="folder"/> Open</button><button className="top-button" onClick={saveProject}><Icon name="save"/> Save project</button><select className="export-preset" aria-label="Export resolution and frame rate" value={exportPreset} onChange={(e) => setExportPreset(e.target.value)}>{Object.keys(EXPORTS).map((key) => <option key={key} value={key}>{key.slice(0, -2)} · {key.slice(-2)} fps</option>)}</select><button className="export-button" disabled={exporting} onClick={exportWebm}>{exporting ? 'Exporting…' : 'Export video'} <span>↗</span></button></div></header>
    <div className="workspace">
      <aside className="media-panel panel"><div className="panel-heading"><div><span className="eyebrow">WORKSPACE</span><h2>Project</h2></div><button className="small-icon" onClick={() => fileRef.current?.click()} title="Import media"><Icon name="plus"/></button></div>
        <div className="project-card"><div className="folder-glyph"><Icon name="folder" size={19}/></div><div><b>{projectName}</b><small>{media.length} media files · 1080p project</small></div><Icon name="chevron" size={15}/></div>
        <div className="tabs">{['Media','Effects','Titles'].map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>
        {tab === 'Media' ? <><div className="bin-heading"><span>MEDIA BIN</span><span>{media.length} items</span></div><div className="media-list">
          {!media.length && <button className="empty-import" onClick={() => fileRef.current?.click()}><span className="upload-icon"><Icon name="plus" size={23}/></span><b>Import your footage</b><small>Drag video or audio here, or browse files</small><em>MP4 · MOV · MKV · WAV · MP3</em></button>}
          {media.map((item) => <div className={`media-item ${item.offline ? 'offline' : ''}`} key={item.id} draggable={!item.offline} onDragStart={(e) => e.dataTransfer.setData('media-id', item.id)} onDoubleClick={() => !item.offline && addClip(item)}><div className="media-thumb">{item.type === 'video' && item.url ? <video src={item.url} muted/> : <div className="audio-wave">{item.offline ? '!' : '▥'}</div>}<span className="media-type">{item.offline ? '!' : item.type === 'video' ? '▶' : '♫'}</span></div><div className="media-meta"><b title={item.name}>{item.name}</b><small>{item.offline ? 'Missing · relink source' : `${item.type === 'video' ? 'Video' : 'Audio'} · ${item.duration ? fmt(item.duration) : '…'}`}</small></div>{item.offline ? <button className="relink-button" onClick={() => fileRef.current?.click()} title="Choose the missing source file">Relink</button> : <button className="add-media" onClick={() => addClip(item)} title="Add to timeline"><Icon name="plus" size={14}/></button>}</div>)}
        </div><div className="storage-note"><span className="green-dot"/>Files stay on this computer</div></> : <div className="feature-list">{(tab === 'Effects' ? ['Transitions','Video effects','Color correction','Audio effects'] : ['Text title','Caption','Lower third','Credits']).map((item) => <button key={item} onClick={() => setNotice(`${item} tools are being built into VidEd Studio`)}><span>{item}</span><Icon name="chevron" size={14}/></button>)}</div>}
        <input ref={fileRef} type="file" accept="video/*,audio/*" multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = '' }}/>
      </aside>
      <section className="main-column"><div className="monitor-panel panel"><div className="monitor-head"><div><span className="eyebrow">PROGRAM MONITOR</span><span className="live-dot"/></div><div className="monitor-options"><span>Fit</span><span>⌗</span><span>⋯</span></div></div><div className="preview-stage"><div className="preview-frame">
        {activeMedia?.type === 'video' ? <><video crossOrigin="anonymous" ref={videoRef} style={{ filter, opacity: Math.max(0, Math.min(1, previewOpacity)) }} onTimeUpdate={(e) => { if (selectedClip) setPlayhead(selectedClip.start + e.currentTarget.currentTime - selectedClip.sourceIn) }} onEnded={() => setPlaying(false)}/><div className="preview-overlay"><strong>{selectedClip?.title}</strong><span>{selectedClip?.caption}</span></div></> : activeMedia?.type === 'audio' ? <div className="audio-preview"><div className="audio-disc">♫</div><strong>{activeMedia.name}</strong><audio crossOrigin="anonymous" controls src={activeMedia.url}/></div> : <div className="preview-empty"><div className="play-outline"><Icon name="play" size={25}/></div><b>Your story starts here</b><span>Import a clip, then drag it onto the timeline</span><button onClick={() => fileRef.current?.click()}><Icon name="plus" size={14}/> Import media</button></div>}
      </div></div><div className="monitor-controls"><span className="timecode">{fmt(playhead)}<i> / </i>{fmt(totalDuration)}</span><div className="transport"><button onClick={() => seek(0)} title="Beginning">◀|</button><button className="play-button" onClick={() => setPlaying((value) => !value)}><Icon name={playing ? 'pause' : 'play'} size={15}/></button><button onClick={() => seek(totalDuration)} title="End">▶|</button></div><span className="resolution-badge">1920 × 1080</span></div></div>
      <div className="timeline-panel panel"><div className="timeline-toolbar"><div className="timeline-title"><span className="eyebrow">SEQUENCE</span><b>Game Highlights <span className="sequence-dot"/></b></div><div className="tool-buttons"><button className="tool-button" onClick={split} title="Split at playhead"><Icon name="cut" size={15}/><span>Split</span></button><button className="tool-button" onClick={remove} title="Delete selected clip"><Icon name="trash" size={15}/></button><div className="tool-separator"/><button className="tool-button" onClick={() => addTrack('video')} title="Add video track"><span>V</span><Icon name="plus" size={12}/></button><button className="tool-button" onClick={() => addTrack('audio')} title="Add audio track"><span>A</span><Icon name="plus" size={12}/></button><div className="tool-separator"/><button className="tool-button zoom-control" onClick={() => setZoom((n) => Math.max(22, n - 8))}>−</button><input type="range" min="22" max="90" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Timeline zoom"/><button className="tool-button zoom-control" onClick={() => setZoom((n) => Math.min(90, n + 8))}><Icon name="zoom" size={15}/></button></div></div>
        <div className="timeline-scroll" ref={timelineRef} onClick={onTimelineClick}><div className="timeline-inner" style={{ width: 120 + timelineDuration * px }}><div className="ruler-row"><div className="ruler-gutter">00:00</div><div className="ruler-track" style={{ '--scale': `${px}px` }}>{marks.map((n) => <span key={n} style={{ left: n * px }}>{fmt(n)}</span>)}</div></div>
          <div className="track-rows">{tracks.map((track) => <div className="track-row" key={track.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropClip(e, track)}><div className="track-label"><span className={`track-icon ${track.kind}`}>{track.kind === 'video' ? 'V' : 'A'}</span><span>{track.name}</span><button title="Track options">···</button></div><div className={`track-lane ${track.kind}`}>
            {track.clips.map((clip) => { const item = media.find((entry) => entry.id === clip.mediaId); return <div key={clip.id} draggable className={`timeline-clip ${track.kind} ${selected === clip.id ? 'selected' : ''}`} style={{ left: clip.start * px, width: Math.max(48, clip.duration * px) }} onClick={(e) => { e.stopPropagation(); setSelected(clip.id); seek(clip.start) }} onDragStart={(e) => e.dataTransfer.setData('clip-id', clip.id)} title={`${item?.name || 'Offline media'} · ${fmt(clip.duration)}`}>
              <span className="trim-handle left" onPointerDown={(e) => startTrim(e, clip, 'left')} title="Drag to trim clip start"/><span className="trim-handle right" onPointerDown={(e) => startTrim(e, clip, 'right')} title="Drag to trim clip end"/>
              {track.kind === 'video' && <div className="clip-thumbnails">{Array.from({ length: Math.max(1, Math.floor(clip.duration / 4)) }, (_, i) => <div key={i} className="clip-thumb" style={{ background: `linear-gradient(${120 + i * 29}deg, ${i % 2 ? '#315d6f' : '#4c6574'}, #1c2532)`}}><span>✦</span></div>)}</div>}<div className="clip-caption"><b>{item?.name || clip.title || 'Offline clip'}</b>{track.kind === 'audio' && <div className="waveform">{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ height: `${12 + Math.abs(Math.sin(i * 2.3) * Math.cos(i * .6)) * 68}%`}}/>)}</div>}</div>
            </div> })}{!track.clips.length && <span className="drop-prompt">Drop {track.kind === 'video' ? 'video clips' : 'audio or music'} here</span>}</div></div>)}</div><div className="playhead" style={{ left: 120 + playhead * px }}><div className="playhead-cap"/><div className="playhead-line"/></div></div></div>
        <div className="timeline-footer"><span>Sequence: 1920 × 1080 · 30 fps</span><span>{allClips.length} clips <i>·</i> {fmt(totalDuration)} total</span></div>
      </div></section>
      <aside className="inspector-panel panel"><div className="inspector-heading"><div><span className="eyebrow">CONTROLS</span><h2>Inspector</h2></div><button className="small-icon"><Icon name="sliders" size={15}/></button></div>
        {selectedClip ? <><div className="inspector-clip"><div className="inspector-thumb"><span>▶</span></div><div><b>{media.find((item) => item.id === selectedClip.mediaId)?.name || 'Selected clip'}</b><small>{selectedTrack?.name} · {fmt(selectedClip.duration)}</small></div></div><div className="inspector-tabs"><button className="active">Video</button><button onClick={() => setNotice('Audio mixing controls are next on the roadmap')}>Audio</button><button onClick={() => setNotice('Motion controls are next on the roadmap')}>Motion</button></div>
          <div className="control-group"><div className="group-title">TRANSFORM <button onClick={() => setNotice('Transform controls are being built')}>Reset</button></div><div className="control-row"><label>Scale</label><input type="number" defaultValue="100"/><span>%</span></div><div className="control-row"><label>Position X</label><input type="number" defaultValue="0"/><label>Y</label><input type="number" defaultValue="0"/></div></div>
          <div className="control-group"><div className="group-title">COLOR <button onClick={() => updateClip({ brightness: 100, contrast: 100, saturation: 100 })}>Reset</button></div>{[['Brightness','brightness'],['Contrast','contrast'],['Saturation','saturation']].map(([label,key]) => <div className="slider-row" key={key}><label>{label}</label><input type="range" min="0" max="200" value={selectedClip[key]} onChange={(e) => updateClip({ [key]: Number(e.target.value) })}/><span>{selectedClip[key]}%</span></div>)}</div>
          <div className="control-group"><div className="group-title">TITLES & CAPTIONS</div><input className="text-field" value={selectedClip.title} placeholder="Add a title overlay" onChange={(e) => updateClip({ title: e.target.value })}/><input className="text-field" value={selectedClip.caption} placeholder="Add a caption" onChange={(e) => updateClip({ caption: e.target.value })}/></div>
          <div className="control-group"><div className="group-title">EFFECT</div><select className="select-field" value={selectedClip.effect || 'None'} onChange={(e) => updateClip({ effect: e.target.value })}>{Object.keys(EFFECTS).map((effect) => <option key={effect}>{effect}</option>)}</select></div>
          <div className="control-group"><div className="group-title">TRANSITION</div><select className="select-field" value={selectedClip.transition} onChange={(e) => updateClip({ transition: e.target.value })}><option>None</option><option>Fade in</option><option>Fade out</option><option>Fade in + out</option></select></div><div className="clip-timing"><span>IN <b>{fmt(selectedClip.sourceIn)}</b></span><span>DURATION <b>{fmt(selectedClip.duration)}</b></span></div>
        </> : <div className="inspector-empty"><div className="sliders-icon">☷</div><b>Nothing selected</b><span>Select a clip on the timeline to see its settings.</span></div>}
        <div className="inspector-tip"><span>✦</span><div><b>Free by design</b><small>Your projects and media stay on your computer.</small></div></div>
      </aside>
    </div>{keybindOpen && <div className="keybind-backdrop" onMouseDown={() => { setKeybindOpen(false); setRecordingKey(null) }}><section className="keybind-dialog" role="dialog" aria-modal="true" aria-labelledby="keybind-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">EDITOR SHORTCUTS</span><h2 id="keybind-title">Key bindings</h2></div><button className="keybind-close" onClick={() => { setKeybindOpen(false); setRecordingKey(null) }} aria-label="Close">×</button></header><p className="keybind-help">{keybindNotice}</p><div className="keybind-list">{keybinds.map((entry) => <div className="keybind-row" key={entry.action}><span>{entry.label}</span><button className={recordingKey === entry.action ? 'recording' : ''} onClick={() => { setRecordingKey(entry.action); setKeybindNotice(`Press a new shortcut for ${entry.label}. Press Escape to cancel.`) }}>{recordingKey === entry.action ? 'Press keys…' : entry.shortcut}</button></div>)}</div><footer><button className="keybind-reset" onClick={resetKeybinds}>Reset defaults</button><button className="keybind-done" onClick={() => { setKeybindOpen(false); setRecordingKey(null) }}>Done</button></footer></section></div>}<footer className="statusbar"><div><span className="green-dot"/>{notice}</div><div><span>VidEd Studio</span><i>·</i><span>Local project</span><i>·</i><button onClick={() => setNotice('Import media, drag clips onto tracks, then split, adjust color and export WebM.')}>Help</button></div></footer>
  </main>
}

export default App
