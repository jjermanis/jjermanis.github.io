let audioContext = null;
let musicGain = null;
let musicSources = [];
let musicLoopTimer = null;
let musicPlaying = false;


function stopMusic(){

    musicPlaying = false;

    if(musicLoopTimer !== null){
        clearTimeout(musicLoopTimer);
        musicLoopTimer = null;
    }

    for(const source of musicSources){

        try{
            source.stop();
        }
        catch(error){
            // Already stopped.
        }

    }

    musicSources = [];
}


function noteFrequency(note){

    const notes = {
        "C":0,
        "C#":1,
        "D":2,
        "D#":3,
        "E":4,
        "F":5,
        "F#":6,
        "G":7,
        "G#":8,
        "A":9,
        "A#":10,
        "B":11
    };

    const match = note.match(/^([A-G]#?)([0-9])$/);

    if(!match)
        return 0;

    const noteName = match[1];
    const octave = Number(match[2]);

    const midi =
        (octave + 1) * 12 +
        notes[noteName];

    return 440 * Math.pow(
        2,
        (midi - 69) / 12
    );
}


function playSquareNote(
    time,
    duration,
    frequency,
    volume
){

    if(!frequency)
        return;

    const oscillator =
        audioContext.createOscillator();

    const gain =
        audioContext.createGain();

    oscillator.type = "square";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(
        0.0001,
        time
    );

    gain.gain.linearRampToValueAtTime(
        volume,
        time + 0.005
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        time + duration - 0.005
    );

    oscillator.connect(gain);
    gain.connect(musicGain);

    oscillator.start(time);
    oscillator.stop(time + duration);

    musicSources.push(oscillator);
}

function playTriangleNote(
    time,
    duration,
    frequency,
    volume
){

    if(!frequency)
        return;

    const oscillator =
        audioContext.createOscillator();

    const gain =
        audioContext.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(
        0.0001,
        time
    );

    gain.gain.linearRampToValueAtTime(
        volume,
        time + 0.005
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        time + duration - 0.005
    );

    oscillator.connect(gain);
    gain.connect(musicGain);

    oscillator.start(time);
    oscillator.stop(time + duration);

    musicSources.push(oscillator);
}

function playNoise(
    time,
    duration,
    volume
){

    const bufferSize =
        Math.floor(
            audioContext.sampleRate * duration
        );

    const buffer =
        audioContext.createBuffer(
            1,
            bufferSize,
            audioContext.sampleRate
        );

    const data =
        buffer.getChannelData(0);

    for(let i=0;i<bufferSize;i++){

        data[i] =
            Math.random() * 2 - 1;

    }

    const source =
        audioContext.createBufferSource();

    source.buffer = buffer;

    const gain =
        audioContext.createGain();

    gain.gain.setValueAtTime(
        volume,
        time
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        time + duration
    );

    source.connect(gain);
    gain.connect(musicGain);

    source.start(time);
    source.stop(time + duration);

    musicSources.push(source);
}

function startMusic(song){

    stopMusic();

    if(!audioContext){

        audioContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();

        musicGain =
            audioContext.createGain();

        musicGain.gain.value = 0.18;

        musicGain.connect(
            audioContext.destination
        );

    }

    if(audioContext.state === "suspended"){

        audioContext.resume();

    }

    const stepDuration =
        60 / song.bpm / 2;

    const startTime =
        audioContext.currentTime + 0.05;

    for(let i=0;i<song.melody.length;i++){

        const time =
            startTime +
            i * stepDuration;

        playSquareNote(
            time,
            stepDuration * 0.92,
            noteFrequency(song.melody[i]),
            0.045
        );

        playSquareNote(
            time,
            stepDuration * 0.88,
            noteFrequency(song.harmony[i]),
            0.030
        );

        playTriangleNote(
            time,
            stepDuration * 0.95,
            noteFrequency(song.bass[i]),
            0.065
        );

        if(song.drums[i] === "kick"){

            playNoise(
                time,
                0.045,
                0.055
            );

        }

        if(song.drums[i] === "snare"){

            playNoise(
                time,
                0.025,
                0.025
            );

        }

    }

    const songLength =
        song.melody.length *
        stepDuration;

    musicPlaying = true;

    musicLoopTimer = setTimeout(
        function(){

            if(musicPlaying){

                startMusic(song);

            }

        },
        songLength * 1000 - 50
    );
}

