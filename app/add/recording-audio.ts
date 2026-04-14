import { Directory, File, Paths } from 'expo-file-system';
import {
  AudioBuffer,
  AudioContext,
  AudioNode,
  BaseAudioContext,
  OfflineAudioContext,
} from '@/lib/audio-api-core';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const dbToGain = (value: number) => 10 ** (value / 20);
const gainToDb = (value: number) => 20 * Math.log10(Math.max(value, 1e-8));
const getPeak = (buffer: AudioBuffer) => {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i += 1) {
      peak = Math.max(peak, Math.abs(channelData[i]));
    }
  }
  return peak;
};

const createBufferWithGain = (
  context: BaseAudioContext,
  buffer: AudioBuffer,
  gain: number,
  ceiling = 1
) => {
  const next = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const src = buffer.getChannelData(ch);
    const dst = next.getChannelData(ch);
    for (let i = 0; i < src.length; i += 1) {
      dst[i] = clamp(src[i] * gain, -ceiling, ceiling);
    }
  }
  return next;
};

const estimateActiveVoiceLevelDb = (buffer: AudioBuffer) => {
  if (buffer.length === 0 || buffer.numberOfChannels === 0) {
    return null;
  }

  const windowSize = clamp(Math.round(buffer.sampleRate * 0.05), 512, 4096);
  const hopSize = Math.max(256, Math.floor(windowSize / 2));
  const levels: number[] = [];

  for (let start = 0; start < buffer.length; start += hopSize) {
    const end = Math.min(buffer.length, start + windowSize);
    const frameLength = end - start;
    if (frameLength <= 0) {
      continue;
    }

    let energy = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
      const channelData = buffer.getChannelData(ch);
      for (let i = start; i < end; i += 1) {
        const sample = channelData[i];
        energy += sample * sample;
      }
    }

    const rms = Math.sqrt(energy / (frameLength * buffer.numberOfChannels));
    levels.push(rms);
  }

  if (levels.length === 0) {
    return null;
  }

  const loudestWindow = Math.max(...levels);
  if (loudestWindow < 1e-4) {
    return null;
  }

  const absoluteGateDb = -45;
  const relativeGateDb = gainToDb(loudestWindow) - 18;
  const gateDb = Math.max(absoluteGateDb, relativeGateDb);
  const active = levels.filter((level) => gainToDb(level) >= gateDb);
  const candidates = active.length > 0 ? active : levels;
  const sorted = [...candidates].sort((a, b) => a - b);
  const percentileIndex = clamp(Math.floor(sorted.length * 0.65), 0, sorted.length - 1);

  return gainToDb(sorted[percentileIndex]);
};

const applyTransparentLimiter = (
  context: BaseAudioContext,
  input: AudioBuffer,
  {
    thresholdDb = -7,
    ratio = 10,
    attackMs = 2,
    releaseMs = 70,
  }: {
    thresholdDb?: number;
    ratio?: number;
    attackMs?: number;
    releaseMs?: number;
  } = {}
) => {
  const output = context.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  const sources = Array.from({ length: input.numberOfChannels }, (_, ch) => input.getChannelData(ch));
  const destinations = Array.from(
    { length: output.numberOfChannels },
    (_, ch) => output.getChannelData(ch)
  );
  const attackCoeff = Math.exp(-1 / (Math.max(attackMs, 1) * 0.001 * input.sampleRate));
  const releaseCoeff = Math.exp(-1 / (Math.max(releaseMs, 1) * 0.001 * input.sampleRate));
  let currentGain = 1;

  for (let i = 0; i < input.length; i += 1) {
    let linkedLevel = 0;
    for (let ch = 0; ch < sources.length; ch += 1) {
      linkedLevel = Math.max(linkedLevel, Math.abs(sources[ch][i]));
    }

    let targetGain = 1;
    if (linkedLevel > 1e-5) {
      const inputDb = gainToDb(linkedLevel);
      if (inputDb > thresholdDb) {
        const limitedDb = thresholdDb + (inputDb - thresholdDb) / ratio;
        targetGain = dbToGain(limitedDb - inputDb);
      }
    }

    const smoothing = targetGain < currentGain ? attackCoeff : releaseCoeff;
    currentGain = targetGain + smoothing * (currentGain - targetGain);

    for (let ch = 0; ch < destinations.length; ch += 1) {
      destinations[ch][i] = clamp(sources[ch][i] * currentGain, -1, 1);
    }
  }

  return output;
};

const ENHANCE_FFT_SIZE = 1024;
const ENHANCE_HOP_SIZE = 256;
const ENHANCE_NOISE_FLOOR = 0.005;
const ENHANCE_SUBTRACTION = 1.75;
const ENHANCE_DRY_MIX = 0;
const ENHANCE_MIN_NOISE_FRAMES = 8;
const ENHANCE_NOISE_UPDATE_ALPHA = 0.992;
const ENHANCE_GAIN_RELEASE = 0.86;
const ENHANCE_GATE_FLOOR = 0.00005;
const ENHANCE_GATE_RATIO = 8;
const ENHANCE_GATE_ATTACK_MS = 10;
const ENHANCE_GATE_RELEASE_MS = 180;

const applyResidualNoiseGate = (source: Float32Array, sampleRate: number) => {
  const gated = new Float32Array(source.length);
  const attackCoeff = Math.exp(-1 / (Math.max(ENHANCE_GATE_ATTACK_MS, 1) * 0.001 * sampleRate));
  const releaseCoeff = Math.exp(-1 / (Math.max(ENHANCE_GATE_RELEASE_MS, 1) * 0.001 * sampleRate));
  let envelope = 0;
  let noiseFloor = 0.0035;
  let gain = 1;

  for (let i = 0; i < source.length; i += 1) {
    const sample = source[i];
    const level = Math.abs(sample);
    const envCoeff = level > envelope ? attackCoeff : releaseCoeff;
    envelope = level + envCoeff * (envelope - level);

    if (envelope < noiseFloor * 1.6) {
      noiseFloor = noiseFloor * 0.9995 + envelope * 0.0005;
    }

    const threshold = noiseFloor * ENHANCE_GATE_RATIO + 0.0012;
    let targetGain = 1;

    if (envelope < threshold) {
      const normalized = clamp(envelope / Math.max(threshold, 1e-6), 0, 1);
      targetGain = ENHANCE_GATE_FLOOR + (1 - ENHANCE_GATE_FLOOR) * normalized * normalized;
    }

    const gainCoeff = targetGain > gain ? attackCoeff : releaseCoeff;
    gain = targetGain + gainCoeff * (gain - targetGain);
    gated[i] = clamp(sample * gain, -1, 1);
  }

  return gated;
};

const bitReverse = (index: number, bits: number) => {
  let reversed = 0;
  for (let i = 0; i < bits; i += 1) {
    reversed = (reversed << 1) | ((index >> i) & 1);
  }
  return reversed;
};

const createHannWindow = (size: number) => {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
};

const fft = (real: Float32Array, imag: Float32Array) => {
  const size = real.length;
  const levels = Math.log2(size);

  for (let i = 0; i < size; i += 1) {
    const j = bitReverse(i, levels);
    if (j <= i) {
      continue;
    }
    const realValue = real[i];
    real[i] = real[j];
    real[j] = realValue;
    const imagValue = imag[i];
    imag[i] = imag[j];
    imag[j] = imagValue;
  }

  for (let blockSize = 2; blockSize <= size; blockSize <<= 1) {
    const halfSize = blockSize >> 1;
    const step = (Math.PI * 2) / blockSize;
    for (let start = 0; start < size; start += blockSize) {
      for (let offset = 0; offset < halfSize; offset += 1) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + halfSize;
        const angle = offset * step;
        const twiddleReal = Math.cos(angle);
        const twiddleImag = -Math.sin(angle);
        const oddReal = twiddleReal * real[oddIndex] - twiddleImag * imag[oddIndex];
        const oddImag = twiddleReal * imag[oddIndex] + twiddleImag * real[oddIndex];
        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;
      }
    }
  }
};

const ifft = (real: Float32Array, imag: Float32Array) => {
  for (let i = 0; i < real.length; i += 1) {
    imag[i] = -imag[i];
  }

  fft(real, imag);

  for (let i = 0; i < real.length; i += 1) {
    real[i] /= real.length;
    imag[i] = -imag[i] / real.length;
  }
};

const spectralDenoiseChannel = (
  source: Float32Array,
  length: number,
  sampleRate: number,
  analysisWindow: Float32Array
) => {
  const paddedLength = length + ENHANCE_FFT_SIZE;
  const output = new Float32Array(paddedLength);
  const normalization = new Float32Array(paddedLength);
  const frame = new Float32Array(ENHANCE_FFT_SIZE);
  const real = new Float32Array(ENHANCE_FFT_SIZE);
  const imag = new Float32Array(ENHANCE_FFT_SIZE);
  const noiseProfile = new Float32Array(ENHANCE_FFT_SIZE);
  const previousGain = new Float32Array(ENHANCE_FFT_SIZE);
  previousGain.fill(1);

  const totalFrames = Math.max(1, Math.ceil(Math.max(length - ENHANCE_FFT_SIZE, 0) / ENHANCE_HOP_SIZE) + 1);
  const estimatedNoiseFrames = Math.min(
    Math.max(ENHANCE_MIN_NOISE_FRAMES, Math.round(sampleRate * 0.12 / ENHANCE_HOP_SIZE)),
    totalFrames
  );

  for (let frameIndex = 0, offset = 0; frameIndex < totalFrames; frameIndex += 1, offset += ENHANCE_HOP_SIZE) {
    frame.fill(0);
    for (let i = 0; i < ENHANCE_FFT_SIZE; i += 1) {
      const sampleIndex = offset + i;
      const sample = sampleIndex < length ? source[sampleIndex] : 0;
      frame[i] = sample * analysisWindow[i];
      real[i] = frame[i];
      imag[i] = 0;
    }

    fft(real, imag);

    for (let i = 0; i < ENHANCE_FFT_SIZE; i += 1) {
      const magnitude = Math.hypot(real[i], imag[i]);

      if (frameIndex < estimatedNoiseFrames) {
        noiseProfile[i] += magnitude / estimatedNoiseFrames;
        continue;
      }

      if (magnitude < noiseProfile[i] * 1.5) {
        noiseProfile[i] =
          noiseProfile[i] * ENHANCE_NOISE_UPDATE_ALPHA + magnitude * (1 - ENHANCE_NOISE_UPDATE_ALPHA);
      }

      const reducedMagnitude = Math.max(
        magnitude - noiseProfile[i] * ENHANCE_SUBTRACTION,
        noiseProfile[i] * ENHANCE_NOISE_FLOOR
      );
      const rawGain = clamp(reducedMagnitude / (magnitude + 1e-6), ENHANCE_NOISE_FLOOR, 1);
      const smoothedGain = Math.max(rawGain, previousGain[i] * ENHANCE_GAIN_RELEASE);
      previousGain[i] = smoothedGain;
      real[i] *= smoothedGain;
      imag[i] *= smoothedGain;
    }

    ifft(real, imag);

    for (let i = 0; i < ENHANCE_FFT_SIZE; i += 1) {
      const targetIndex = offset + i;
      const weighted = real[i] * analysisWindow[i];
      output[targetIndex] += weighted;
      normalization[targetIndex] += analysisWindow[i] * analysisWindow[i];
    }
  }

  const denoised = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const wet = normalization[i] > 1e-6 ? output[i] / normalization[i] : source[i];
    denoised[i] = clamp(wet * (1 - ENHANCE_DRY_MIX) + source[i] * ENHANCE_DRY_MIX, -1, 1);
  }

  return applyResidualNoiseGate(denoised, sampleRate);
};

const createReverbImpulse = (context: BaseAudioContext) => {
  const duration = 1.1;
  const decay = 3.5;
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, decay);
      channelData[i] = (Math.random() * 2 - 1) * envelope * 0.15;
    }
  }
  return impulse;
};

const createEchoImpulse = (context: BaseAudioContext) => {
  const duration = 0.9;
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  const taps = [
    { time: 0.11, gain: 0.34 },
    { time: 0.23, gain: 0.22 },
    { time: 0.38, gain: 0.14 },
    { time: 0.54, gain: 0.1 },
  ];
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel);
    taps.forEach((tap) => {
      const index = Math.floor(tap.time * context.sampleRate);
      if (index < channelData.length) {
        channelData[index] = tap.gain;
      }
    });
  }
  return impulse;
};

export const runOfflineEnhance = (context: AudioContext, input: AudioBuffer) => {
  const output = context.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  const analysisWindow = createHannWindow(ENHANCE_FFT_SIZE);

  for (let ch = 0; ch < input.numberOfChannels; ch += 1) {
    const src = input.getChannelData(ch);
    const dst = output.getChannelData(ch);
    dst.set(spectralDenoiseChannel(src, input.length, input.sampleRate, analysisWindow));
  }

  return output;
};

export const normalizeAndCompressVoice = (
  context: AudioContext,
  input: AudioBuffer,
  {
    thresholdDb = -20,
    ratio = 3.5,
    attackMs = 10,
    releaseMs = 140,
    targetVoiceLevelDb = -19,
    targetPeak = 0.94,
    maxLoudnessGainDb = 14,
    maxNormalizeGainDb = 10,
  }: {
    thresholdDb?: number;
    ratio?: number;
    attackMs?: number;
    releaseMs?: number;
    targetVoiceLevelDb?: number;
    targetPeak?: number;
    maxLoudnessGainDb?: number;
    maxNormalizeGainDb?: number;
  } = {}
) => {
  const output = context.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  if (input.length === 0) {
    return output;
  }

  const attackCoeff = Math.exp(-1 / (Math.max(attackMs, 1) * 0.001 * input.sampleRate));
  const releaseCoeff = Math.exp(-1 / (Math.max(releaseMs, 1) * 0.001 * input.sampleRate));
  const sources = Array.from({ length: input.numberOfChannels }, (_, ch) => input.getChannelData(ch));
  const destinations = Array.from(
    { length: output.numberOfChannels },
    (_, ch) => output.getChannelData(ch)
  );
  let currentGain = 1;
  let peak = 0;

  for (let i = 0; i < input.length; i += 1) {
    let linkedLevel = 0;
    for (let ch = 0; ch < sources.length; ch += 1) {
      linkedLevel = Math.max(linkedLevel, Math.abs(sources[ch][i]));
    }

    let targetGain = 1;
    if (linkedLevel > 1e-5) {
      const inputDb = gainToDb(linkedLevel);
      if (inputDb > thresholdDb) {
        const compressedDb = thresholdDb + (inputDb - thresholdDb) / ratio;
        targetGain = dbToGain(compressedDb - inputDb);
      }
    }

    const smoothing = targetGain < currentGain ? attackCoeff : releaseCoeff;
    currentGain = targetGain + smoothing * (currentGain - targetGain);

    for (let ch = 0; ch < destinations.length; ch += 1) {
      const sample = clamp(sources[ch][i] * currentGain, -1, 1);
      destinations[ch][i] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
  }

  if (peak < 1e-4) {
    return output;
  }

  let leveledBuffer = output;
  const detectedVoiceLevelDb = estimateActiveVoiceLevelDb(output);

  if (detectedVoiceLevelDb !== null) {
    const loudnessGain = clamp(
      dbToGain(targetVoiceLevelDb - detectedVoiceLevelDb),
      dbToGain(-6),
      dbToGain(maxLoudnessGainDb)
    );

    if (Math.abs(loudnessGain - 1) >= 0.01) {
      leveledBuffer = createBufferWithGain(context, output, loudnessGain);
    }
  }

  const limitedBuffer = applyTransparentLimiter(context, leveledBuffer);
  const limitedPeak = getPeak(limitedBuffer);
  if (limitedPeak < 1e-4) {
    return limitedBuffer;
  }

  const normalizeGain = clamp(targetPeak / limitedPeak, 0, dbToGain(maxNormalizeGainDb));
  if (Math.abs(normalizeGain - 1) < 0.01) {
    return limitedBuffer;
  }

  return createBufferWithGain(context, limitedBuffer, normalizeGain);
};

const encodeBufferAsWav = (buffer: AudioBuffer) => {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const totalSamples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalSamples * blockAlign;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < totalSamples; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Uint8Array(wav);
};

const applyMakeupGain = (
  context: BaseAudioContext,
  buffer: AudioBuffer,
  gain: number,
  ceiling = 0.98
) => {
  if (gain <= 1) {
    return buffer;
  }

  const peak = getPeak(buffer);

  const safeGain = peak > 0 ? Math.min(gain, ceiling / peak) : gain;
  if (safeGain <= 1) {
    return buffer;
  }

  return createBufferWithGain(context, buffer, safeGain);
};

export const trimBuffer = ({
  buffer,
  context,
  enabled,
  startTime,
  endTime,
}: {
  buffer: AudioBuffer;
  context: AudioContext | null;
  enabled: boolean;
  startTime: number;
  endTime: number;
}) => {
  if (!enabled || !context) {
    return buffer;
  }

  const startFrame = clamp(Math.floor(startTime * buffer.sampleRate), 0, buffer.length);
  const endFrame = clamp(Math.ceil(endTime * buffer.sampleRate), startFrame + 1, buffer.length);
  const nextLength = Math.max(1, endFrame - startFrame);
  const trimmed = context.createBuffer(buffer.numberOfChannels, nextLength, buffer.sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const source = buffer.getChannelData(ch);
    trimmed.getChannelData(ch).set(source.subarray(startFrame, endFrame));
  }

  return trimmed;
};

export const renderBufferToFileWithEffects = async ({
  buffer,
  withEcho,
  withReverb,
  reverbGain = 1,
}: {
  buffer: AudioBuffer;
  withEcho: boolean;
  withReverb: boolean;
  reverbGain?: number;
}) => {
  const tailPadding = withEcho || withReverb ? Math.floor(buffer.sampleRate * 1.2) : 0;
  const renderContext = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length + tailPadding,
    buffer.sampleRate
  );
  const source = renderContext.createBufferSource();
  source.buffer = buffer;

  if (!withEcho && !withReverb) {
    source.connect(renderContext.destination);
  } else {
    const dryGain = renderContext.createGain();
    dryGain.gain.value = 0.85;
    source.connect(dryGain);
    dryGain.connect(renderContext.destination);

    if (withEcho) {
      const echoWet = renderContext.createGain();
      echoWet.gain.value = 0.25;
      const echo = renderContext.createConvolver();
      echo.buffer = createEchoImpulse(renderContext);
      source.connect(echo);
      echo.connect(echoWet);
      echoWet.connect(renderContext.destination);
    }

    if (withReverb) {
      const reverbWet = renderContext.createGain();
      reverbWet.gain.value = 0.22;
      const reverb = renderContext.createConvolver();
      reverb.buffer = createReverbImpulse(renderContext);
      source.connect(reverb);
      reverb.connect(reverbWet);
      reverbWet.connect(renderContext.destination);
    }
  }

  source.start();
  const rendered = await renderContext.startRendering();
  const renderedWithGain = rendered;
  const wavBytes = encodeBufferAsWav(renderedWithGain);
  const processedDir = new Directory(Paths.cache, 'processed-recordings');
  if (!processedDir.exists) {
    processedDir.create({ intermediates: true, idempotent: true });
  }
  const output = new File(processedDir, `processed-${Date.now()}.wav`);
  output.create({ intermediates: true, overwrite: true });
  output.write(wavBytes);
  return output.uri;
};

export default function RecordingAudioUtilityRoute() {
  return null;
}
