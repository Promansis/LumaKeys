// Silent audio capture for the sitting 1 listening drivers (sitting1-audio-desktop.mjs,
// ../browser/sitting1-audio-web.mjs). Copy next to them in $TMPDIR/pw.
// The app (Electron or Chromium) is launched with PULSE_SINK=<null sink>. Other programs on
// the machine may also play into that sink once it becomes the default sink, so each
// recording captures only the sink inputs whose process descends from this Node process
// (parec --monitor-stream). It falls back to the whole sink monitor, flagged in the JSON,
// when no own stream exists yet. Samples are float32 mono 48 kHz, so very quiet output
// keeps its full resolution.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ppid = (pid) => { try { return Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[1]); } catch { return 0; } };
function isOwn(pid, root = process.pid) {
  for (let p = pid, i = 0; p > 1 && i < 40; p = ppid(p), i += 1) if (p === root) return true;
  return false;
}
export function sinkStreams(sink) {
  const sinks = JSON.parse(execFileSync('pactl', ['-f', 'json', 'list', 'short', 'sinks']).toString());
  const sinkIndex = sinks.find((s) => s.name === sink)?.index;
  const inputs = JSON.parse(execFileSync('pactl', ['-f', 'json', 'list', 'sink-inputs']).toString());
  return inputs.filter((i) => i.sink === sinkIndex).map((i) => ({
    index: i.index,
    pid: Number(i.properties['application.process.id']),
    binary: i.properties['application.process.binary'],
    app: i.properties['application.name'],
    spec: i.sample_specification,
    corked: i.corked,
    own: isOwn(Number(i.properties['application.process.id'])),
  }));
}

export function makeRecorder({ out, sink }) {
  if (!out.startsWith('/tmp/claude-1000/')) throw new Error('recorder output must be under $TMPDIR');
  fs.mkdirSync(out, { recursive: true });
  return function startRec(name, meta = {}) {
    const streams = sinkStreams(sink);
    const own = streams.filter((s) => s.own && !s.corked);
    const common = ['--file-format=wav', '--rate=48000', '--channels=1', '--format=float32le', '--latency-msec=20'];
    const targets = own.length
      ? own.map((s, i) => ({ file: path.join(out, own.length === 1 ? `${name}.wav` : `${name}.s${i}.wav`), args: [`--monitor-stream=${s.index}`, '-d', sink] }))
      : [{ file: path.join(out, `${name}.wav`), args: ['-d', `${sink}.monitor`] }];
    const procs = targets.map((t) => spawn('parec', [...t.args, ...common, t.file], { stdio: 'ignore' }));
    const t0 = Date.now();
    const markers = [];
    return {
      mark: (what) => markers.push({ t: Date.now() - t0, what }),
      async stop(extra = {}) {
        for (const p of procs) p.kill('SIGINT');
        await Promise.all(procs.map((p) => new Promise((r) => (p.exitCode !== null || p.signalCode !== null ? r() : p.once('exit', r)))));
        const capture = own.length ? 'own app streams only (parec --monitor-stream)' : 'WHOLE SINK MONITOR (no own stream found): other programs may be mixed in';
        fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ name, files: targets.map((t) => path.basename(t.file)), capture, streamsAtStart: streams, markers, ...meta, ...extra }, null, 1));
        const others = streams.filter((s) => !s.own).map((s) => `${s.binary}#${s.index}`);
        console.log(`  rec ${name}: ${targets.map((t) => `${path.basename(t.file)} ${fs.existsSync(t.file) ? fs.statSync(t.file).size : 'MISSING'} B`).join(', ')}; ${own.length ? `own streams ${own.map((s) => `#${s.index}(${s.binary} ${s.spec})`).join(' ')}` : 'NO OWN STREAM, whole sink'}${others.length ? `; other programs on sink (excluded): ${others.join(' ')}` : ''}; markers ${JSON.stringify(markers.map((m) => `${m.t}:${m.what}`))}`);
      },
    };
  };
}
