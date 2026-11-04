/*
 * rain-music.js
 * "Rain on Fourth Street" - synthesized noir background music (Web Audio, no audio files).
 *
 * Usage:
 *   <script src="rain-music.js"></script>
 *   RainMusic.start();         // begin playing (loops until stopped)
 *   RainMusic.stop();          // fade out and stop
 *   RainMusic.setVolume(0.5);  // 0 to 1 (default 0.7)
 *   RainMusic.isPlaying();     // true or false
 *
 * Browsers block audio until the user interacts with the page, so the first
 * call to start() must happen inside a click or key handler.
 */
(function () {
  'use strict';

  var BPM = 66;
  var LOOP_BEATS = 32;

  var ctx = null, master = null, fxIn = null, noiseBuf = null, current = null;
  var volume = 0.7;

  /* ---------- Helpers ---------- */

  var NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function N(name) {
    var m = name.match(/^([A-G])([#b]?)(-?\d)$/);
    var semis = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return semis + (parseInt(m[3], 10) + 1) * 12;
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function jit() { return (Math.random() - 0.5) * 0.03; }
  function chance(p) { return Math.random() < p; }

  function makeIR(sec, decay) {
    var len = Math.floor(ctx.sampleRate * sec);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function ensureAudio() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = volume;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 20;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    master.connect(comp);
    comp.connect(ctx.destination);

    fxIn = ctx.createGain();
    var dry = ctx.createGain();
    dry.gain.value = 0.85;
    fxIn.connect(dry);
    dry.connect(master);
    var conv = ctx.createConvolver();
    conv.buffer = makeIR(2.6, 2.2);
    var wet = ctx.createGain();
    wet.gain.value = 0.4;
    fxIn.connect(conv);
    conv.connect(wet);
    wet.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  function mkOsc(type, freq, t, stopT, out, gain) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(stopT);
    if (out) {
      if (gain != null) {
        var gn = ctx.createGain();
        gn.gain.value = gain;
        o.connect(gn);
        gn.connect(out);
      } else {
        o.connect(out);
      }
    }
    return o;
  }

  /* ---------- Instruments ---------- */

  // Muted horn: filtered saw+square with delayed vibrato
  function horn(out, t, midi, dur, vel) {
    vel = vel == null ? 0.8 : vel;
    var f = mtof(midi), a = 0.16, hold = Math.max(dur, a), end = t + hold + 0.4;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * vel, t + a);
    g.gain.setValueAtTime(0.11 * vel, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(out);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1;
    lp.frequency.setValueAtTime(450, t);
    lp.frequency.linearRampToValueAtTime(1250, t + 0.3);
    lp.frequency.linearRampToValueAtTime(800, t + Math.max(dur, 0.4));
    lp.connect(g);
    var o1 = mkOsc('sawtooth', f, t, end + 0.05, lp);
    var o2 = mkOsc('square', f, t, end + 0.05, lp, 0.45);
    o2.detune.value = 4;
    var lfo = mkOsc('sine', 5.3, t, end + 0.05);
    var lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(14, t + 0.6);
    lfo.connect(lg);
    lg.connect(o1.detune);
    lg.connect(o2.detune);
  }

  // Vibraphone: sine + fast-decaying 4th partial, gentle tremolo
  function vibes(out, t, midi, dur, vel) {
    vel = vel == null ? 0.8 : vel;
    var f = mtof(midi), len = Math.min(3.5, 1.4 + dur * 0.6), end = t + len;
    var trem = ctx.createGain();
    trem.gain.value = 0.82;
    trem.connect(out);
    var lfo = mkOsc('sine', 4.6, t, end + 0.05);
    var lg = ctx.createGain();
    lg.gain.value = 0.18;
    lfo.connect(lg);
    lg.connect(trem.gain);
    [[1, 0.14, len], [4, 0.035, 0.5]].forEach(function (p) {
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p[1] * vel, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
      g.connect(trem);
      mkOsc('sine', f * p[0], t, t + p[2] + 0.05, g);
    });
  }

  // Soft felt-style piano
  function piano(out, t, midi, dur, vel) {
    vel = vel == null ? 0.6 : vel;
    var f = mtof(midi), end = t + Math.max(dur, 1.0) + 0.5, peak = 0.1 * vel;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(out);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(3500, f * 5);
    lp.Q.value = 0.5;
    lp.connect(g);
    var a = mkOsc('triangle', f, t, end + 0.05, lp, 0.5);
    var b = mkOsc('triangle', f, t, end + 0.05, lp, 0.5);
    a.detune.value = -3;
    b.detune.value = 3;
    mkOsc('sine', f * 2, t, end + 0.05, lp, 0.25);
  }

  // Upright bass (plucked)
  function bass(out, t, midi, dur, vel) {
    vel = vel == null ? 0.8 : vel;
    var f = mtof(midi), end = t + dur;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * vel, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.3 * vel * 0.4, t + Math.min(dur * 0.6, 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(out);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650;
    lp.connect(g);
    mkOsc('triangle', f, t, end + 0.05, lp);
    mkOsc('sine', f * 2, t, end + 0.05, lp, 0.3);
  }

  // Brushes
  function noiseHit(out, t, o) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var bq = ctx.createBiquadFilter();
    bq.type = o.type;
    bq.frequency.value = o.freq;
    bq.Q.value = o.q || 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.peak, t + o.a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.a + o.d);
    src.connect(bq);
    bq.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 1.5, o.a + o.d + 0.05);
  }
  function swish(out, t, v) {
    noiseHit(out, t, { type: 'highpass', freq: 4500, peak: 0.05 * v, a: 0.03, d: 0.16 });
  }
  function brushSnare(out, t, v) {
    noiseHit(out, t, { type: 'bandpass', freq: 2800, q: 0.6, peak: 0.09 * v, a: 0.02, d: 0.2 });
  }

  /* ---------- The composition ---------- */
  // Builds the list of {beat, fn} events for one pass through the 32-beat loop.
  // fn(t, secondsPerBeat, outputNode) plays that event at audio time t.

  function buildLoop(cycle) {
    var ev = [];
    function add(beat, fn) { ev.push({ beat: beat, fn: fn }); }
    var bassL = [
      ['D2', 'F2', 'A2', 'C3'], ['B1', 'D2', 'F2', 'A2'],
      ['G2', 'Bb2', 'D3', 'C#3'], ['A2', 'E3', 'C#3', 'Bb2'],
      ['D2', 'A2', 'C3', 'F2'], ['Bb1', 'D2', 'F2', 'A2'],
      ['E2', 'G2', 'Bb2', 'D3'], ['A2', 'C#3', 'E3', 'Bb2']
    ];
    var chords = [
      ['F3', 'A3', 'C4', 'E4'], ['A3', 'D4', 'F4', 'B3'],
      ['Bb3', 'D4', 'F4', 'A3'], ['C#4', 'E4', 'G4', 'Bb4'],
      ['F3', 'A3', 'C4', 'E4'], ['D4', 'F4', 'A4', 'Bb3'],
      ['G3', 'Bb3', 'D4'], ['C#4', 'E4', 'G4', 'Bb4']
    ];
    for (var b = 0; b < 8; b++) {
      (function (b) {
        var base = b * 4;
        bassL[b].forEach(function (n, k) {
          add(base + k, function (t, spb, o) {
            bass(o, t + jit(), N(n), spb * 0.92, k === 0 ? 0.9 : 0.7);
          });
        });
        add(base, function (t, spb, o) {
          chords[b].forEach(function (n, k) {
            piano(o, t + k * 0.025 + jit(), N(n), spb * 3.5, 0.5);
          });
        });
        if (chance(0.5)) {
          add(base + 2.5, function (t, spb, o) {
            chords[b].slice(1).forEach(function (n, k) {
              piano(o, t + k * 0.02, N(n), spb * 1.2, 0.3);
            });
          });
        }
        [0, 1, 2, 3].forEach(function (k) {
          add(base + k, function (t, spb, o) { swish(o, t + jit(), k % 2 === 1 ? 0.9 : 0.5); });
        });
        [1, 3].forEach(function (k) {
          add(base + k, function (t, spb, o) { brushSnare(o, t + jit(), 0.6); });
        });
      })(b);
    }
    var melody = [
      [1, 'A4', 3], [4, 'F4', 2], [6, 'E4', 2], [9, 'G4', 2], [11, 'F4', 1],
      [12, 'E4', 1], [13, 'C#4', 3], [17, 'D4', 2], [19, 'F4', 1], [20, 'A4', 3],
      [25, 'G4', 2], [27, 'Bb4', 2], [29, 'A4', 3]
    ];
    var useHorn = cycle % 2 === 0;
    melody.forEach(function (m) {
      add(m[0], function (t, spb, o) {
        if (useHorn) horn(o, t, N(m[1]), m[2] * spb, 0.8);
        else vibes(o, t, N(m[1]), m[2] * spb, 0.7);
      });
    });
    ev.sort(function (x, y) { return x.beat - y.beat; });
    return ev;
  }

  /* ---------- Playback control ---------- */

  function start() {
    if (current) return;
    ensureAudio();
    var spb = 60 / BPM;
    var bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    bus.connect(fxIn);
    var s = { bus: bus, alive: true, timer: null };
    var cycle = 0;
    var cycleStart = ctx.currentTime + 0.4;
    var events = buildLoop(cycle);
    var idx = 0;

    function tick() {
      if (!s.alive) return;
      var horizon = ctx.currentTime + 2.5;
      for (;;) {
        if (idx >= events.length) {
          var next = cycleStart + LOOP_BEATS * spb;
          if (next <= horizon) {
            cycle++;
            cycleStart = next;
            events = buildLoop(cycle);
            idx = 0;
            continue;
          }
          break;
        }
        var e = events[idx];
        var t = cycleStart + e.beat * spb;
        if (t > horizon) break;
        e.fn(Math.max(t, ctx.currentTime), spb, bus);
        idx++;
      }
    }
    tick();
    s.timer = setInterval(tick, 200);
    current = s;
  }

  function stop() {
    if (!current) return;
    var s = current;
    current = null;
    s.alive = false;
    clearInterval(s.timer);
    var now = ctx.currentTime;
    s.bus.gain.cancelScheduledValues(now);
    s.bus.gain.setValueAtTime(Math.max(s.bus.gain.value, 0.0001), now);
    s.bus.gain.linearRampToValueAtTime(0.0001, now + 0.6);
    setTimeout(function () { s.bus.disconnect(); }, 800);
  }

  function setVolume(v) {
    volume = Math.min(1, Math.max(0, Number(v) || 0));
    if (master) master.gain.value = volume;
  }

  function isPlaying() { return !!current; }

  window.RainMusic = {
    start: start,
    stop: stop,
    setVolume: setVolume,
    isPlaying: isPlaying
  };
})();
