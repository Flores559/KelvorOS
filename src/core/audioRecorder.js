class AudioRecorder {
  constructor({ onLevel } = {}) {
    this.onLevel = onLevel || (() => {});

    this.stream = null;
    this.context = null;
    this.source = null;
    this.processor = null;
    this.analyser = null;
    this.silentGain = null;

    this.chunks = [];
    this.sampleRate = 44100;
    this.animationFrame = null;
  }

  async start() {
    if (this.context) {
      return;
    }

    this.stream =
      await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

    this.context = new AudioContext();

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    this.sampleRate =
      this.context.sampleRate;

    console.log("Audio recorder started:", {
      inputSampleRate: this.sampleRate,
      whisperSampleRate: 16000,
      contextState: this.context.state,
      tracks: this.stream
        .getAudioTracks()
        .map((track) => ({
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
        })),
    });

    this.source =
      this.context.createMediaStreamSource(
        this.stream
      );

    this.analyser =
      this.context.createAnalyser();

    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant =
      0.7;

    this.processor =
      this.context.createScriptProcessor(
        4096,
        1,
        1
      );

    this.silentGain =
      this.context.createGain();

    this.silentGain.gain.value = 0;

    this.chunks = [];

    this.processor.onaudioprocess = (
      event
    ) => {
      const inputSamples =
        event.inputBuffer.getChannelData(0);

      this.chunks.push(
        new Float32Array(inputSamples)
      );
    };

    this.source.connect(this.analyser);
    this.source.connect(this.processor);

    /*
     * ScriptProcessor must remain connected
     * or Chromium can stop processing audio.
     */
    this.processor.connect(
      this.silentGain
    );

    this.silentGain.connect(
      this.context.destination
    );

    this.updateMeter();
  }

  updateMeter() {
    if (!this.analyser) {
      return;
    }

    const values = new Uint8Array(
      this.analyser.frequencyBinCount
    );

    this.analyser.getByteFrequencyData(
      values
    );

    const average =
      values.reduce(
        (sum, value) => sum + value,
        0
      ) / values.length;

    this.onLevel(
      Math.min(100, average * 2.5)
    );

    this.animationFrame =
      requestAnimationFrame(() => {
        this.updateMeter();
      });
  }

  async stop() {
    if (!this.context) {
      return null;
    }

    if (this.animationFrame) {
      cancelAnimationFrame(
        this.animationFrame
      );
    }

    if (this.processor) {
      this.processor.onaudioprocess =
        null;
    }

    this.processor?.disconnect();
    this.silentGain?.disconnect();
    this.analyser?.disconnect();
    this.source?.disconnect();

    this.stream
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    const originalSamples =
      this.mergeChunks(this.chunks);

    console.log(
      "Original audio recording:",
      {
        chunks: this.chunks.length,
        samples:
          originalSamples.length,
        sampleRate: this.sampleRate,
        durationSeconds:
          originalSamples.length /
          this.sampleRate,
        peakLevel:
          this.getPeakLevel(
            originalSamples
          ),
      }
    );

    /*
     * whisper.cpp works most reliably with:
     * - 16,000 Hz
     * - mono
     * - 16-bit PCM WAV
     */
    const whisperSampleRate = 16000;

    const resampledSamples =
      this.resampleAudio(
        originalSamples,
        this.sampleRate,
        whisperSampleRate
      );

    console.log(
      "Whisper-ready audio:",
      {
        samples:
          resampledSamples.length,
        sampleRate:
          whisperSampleRate,
        durationSeconds:
          resampledSamples.length /
          whisperSampleRate,
        peakLevel:
          this.getPeakLevel(
            resampledSamples
          ),
      }
    );

    const wav = this.encodeWav(
      resampledSamples,
      whisperSampleRate
    );

    await this.context.close();

    this.stream = null;
    this.context = null;
    this.source = null;
    this.processor = null;
    this.analyser = null;
    this.silentGain = null;
    this.chunks = [];

    this.onLevel(0);

    return wav;
  }

  mergeChunks(chunks) {
    const totalLength =
      chunks.reduce(
        (total, chunk) =>
          total + chunk.length,
        0
      );

    const output =
      new Float32Array(totalLength);

    let offset = 0;

    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }

    return output;
  }

  resampleAudio(
    samples,
    inputSampleRate,
    outputSampleRate
  ) {
    if (
      inputSampleRate ===
      outputSampleRate
    ) {
      return samples;
    }

    if (!samples.length) {
      return new Float32Array(0);
    }

    const sampleRateRatio =
      inputSampleRate /
      outputSampleRate;

    const outputLength = Math.round(
      samples.length /
        sampleRateRatio
    );

    const output =
      new Float32Array(outputLength);

    for (
      let outputIndex = 0;
      outputIndex < outputLength;
      outputIndex += 1
    ) {
      const inputPosition =
        outputIndex *
        sampleRateRatio;

      const lowerIndex =
        Math.floor(inputPosition);

      const upperIndex = Math.min(
        lowerIndex + 1,
        samples.length - 1
      );

      const interpolation =
        inputPosition -
        lowerIndex;

      const lowerSample =
        samples[lowerIndex] || 0;

      const upperSample =
        samples[upperIndex] || 0;

      output[outputIndex] =
        lowerSample +
        (upperSample -
          lowerSample) *
          interpolation;
    }

    return output;
  }

  getPeakLevel(samples) {
    let peak = 0;

    for (const sample of samples) {
      peak = Math.max(
        peak,
        Math.abs(sample)
      );
    }

    return peak;
  }

  encodeWav(samples, sampleRate) {
    const bytesPerSample = 2;
    const channelCount = 1;

    const dataLength =
      samples.length *
      bytesPerSample;

    const buffer =
      new ArrayBuffer(
        44 + dataLength
      );

    const view =
      new DataView(buffer);

    const writeText = (
      offset,
      text
    ) => {
      for (
        let index = 0;
        index < text.length;
        index += 1
      ) {
        view.setUint8(
          offset + index,
          text.charCodeAt(index)
        );
      }
    };

    // RIFF header
    writeText(0, "RIFF");

    view.setUint32(
      4,
      36 + dataLength,
      true
    );

    writeText(8, "WAVE");

    // Format section
    writeText(12, "fmt ");

    view.setUint32(
      16,
      16,
      true
    );

    // Audio format 1 means PCM
    view.setUint16(
      20,
      1,
      true
    );

    // Mono
    view.setUint16(
      22,
      channelCount,
      true
    );

    view.setUint32(
      24,
      sampleRate,
      true
    );

    view.setUint32(
      28,
      sampleRate *
        channelCount *
        bytesPerSample,
      true
    );

    view.setUint16(
      32,
      channelCount *
        bytesPerSample,
      true
    );

    // 16-bit audio
    view.setUint16(
      34,
      16,
      true
    );

    // Data section
    writeText(36, "data");

    view.setUint32(
      40,
      dataLength,
      true
    );

    let offset = 44;

    for (const sample of samples) {
      const clampedSample =
        Math.max(
          -1,
          Math.min(1, sample)
        );

      const pcmValue =
        clampedSample < 0
          ? clampedSample *
            0x8000
          : clampedSample *
            0x7fff;

      view.setInt16(
        offset,
        Math.round(pcmValue),
        true
      );

      offset += bytesPerSample;
    }

    return new Uint8Array(buffer);
  }
}

window.AudioRecorder =
  AudioRecorder;