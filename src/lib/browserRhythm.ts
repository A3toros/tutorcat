/** Web Audio rhythm features for robotic-voice / delivery analysis (client-side). */

export const RHYTHM_SAMPLE_INTERVAL_MS = 100

export interface BrowserRhythmFeatures {
  speech_rate: number
  pause_variance: number
  pause_entropy: number
  pitch_variance: number
  energy_variance: number
  voiced_ratio: number
  /** Normalized autocorrelation of energy at lag 1 (0–1). High = metronically regular. */
  energy_autocorr_lag1: number
  energy_autocorr_lag3: number
}

type RhythmSample = { energy: number; silent: boolean; zeroCrossRate: number }

export function normalizedEnergyAutocorr(values: number[], lag: number): number {
  if (values.length <= lag || lag < 1) return 0
  const n = values.length - lag
  const sliceA = values.slice(0, n)
  const sliceB = values.slice(lag, lag + n)
  const meanA = sliceA.reduce((a, b) => a + b, 0) / n
  const meanB = sliceB.reduce((a, b) => a + b, 0) / n
  let num = 0
  let denA = 0
  let denB = 0
  for (let i = 0; i < n; i++) {
    const da = sliceA[i] - meanA
    const db = sliceB[i] - meanB
    num += da * db
    denA += da * da
    denB += db * db
  }
  const den = Math.sqrt(denA * denB)
  if (den <= 0) return 0
  return Math.max(0, Math.min(1, num / den))
}

export type BrowserRhythmSampler = {
  start: (stream: MediaStream) => void
  stop: () => void
  getFeatures: (recordingDurationMs: number) => BrowserRhythmFeatures | undefined
}

export function createBrowserRhythmSampler(): BrowserRhythmSampler {
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null
  const samples: RhythmSample[] = []

  const stop = () => {
    if (intervalId != null) {
      clearInterval(intervalId)
      intervalId = null
    }
    if (audioContext) {
      try {
        audioContext.close()
      } catch {
        // ignore
      }
      audioContext = null
      analyser = null
    }
  }

  const start = (stream: MediaStream) => {
    stop()
    samples.length = 0

    try {
      const AudioContextClass =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return

      audioContext = new AudioContextClass()
      const source = audioContext.createMediaStreamSource(stream)
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)

      const data = new Uint8Array(analyser.fftSize)
      const energyThreshold = 0.02

      intervalId = setInterval(() => {
        if (!analyser) return
        analyser.getByteTimeDomainData(data)
        let sumSquares = 0
        let zeroCrossings = 0
        let lastSign = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sumSquares += v * v
          const sign = v > 0 ? 1 : v < 0 ? -1 : 0
          if (sign !== 0 && lastSign !== 0 && sign !== lastSign) zeroCrossings += 1
          if (sign !== 0) lastSign = sign
        }
        const energy = Math.sqrt(sumSquares / data.length)
        samples.push({
          energy,
          silent: energy < energyThreshold,
          zeroCrossRate: zeroCrossings / data.length,
        })
      }, RHYTHM_SAMPLE_INTERVAL_MS)
    } catch {
      stop()
    }
  }

  const getFeatures = (recordingDurationMs: number): BrowserRhythmFeatures | undefined => {
    if (!samples.length || recordingDurationMs <= 0) return undefined

    const energies = samples.map((s) => s.energy)
    const zcrs = samples.map((s) => s.zeroCrossRate)
    const n = energies.length
    const meanEnergy = energies.reduce((sum, e) => sum + e, 0) / n
    const meanZcr = zcrs.reduce((sum, z) => sum + z, 0) / n
    const energyVariance =
      energies.reduce((sum, e) => {
        const diff = e - meanEnergy
        return sum + diff * diff
      }, 0) / n
    const pitchVariance =
      zcrs.reduce((sum, z) => {
        const diff = z - meanZcr
        return sum + diff * diff
      }, 0) / n

    let silentSamples = 0
    let currentRun = 0
    for (const s of samples) {
      if (s.silent) {
        silentSamples += 1
        currentRun += 1
      } else if (currentRun > 0) {
        currentRun = 0
      }
    }

    const pauseRatio = silentSamples / samples.length

    const pauseLengths: number[] = []
    currentRun = 0
    for (const s of samples) {
      if (s.silent) {
        currentRun += 1
      } else if (currentRun > 0) {
        pauseLengths.push(currentRun * (RHYTHM_SAMPLE_INTERVAL_MS / 1000))
        currentRun = 0
      }
    }
    if (currentRun > 0) {
      pauseLengths.push(currentRun * (RHYTHM_SAMPLE_INTERVAL_MS / 1000))
    }

    let pauseVariance = 0
    let pauseEntropy = 0
    if (pauseLengths.length > 0) {
      const meanPause = pauseLengths.reduce((sum, v) => sum + v, 0) / pauseLengths.length
      pauseVariance =
        pauseLengths.reduce((sum, v) => {
          const diff = v - meanPause
          return sum + diff * diff
        }, 0) / pauseLengths.length

      const bins = new Map<number, number>()
      for (const v of pauseLengths) {
        const key = Math.round(v * 10)
        bins.set(key, (bins.get(key) || 0) + 1)
      }
      const total = pauseLengths.length
      let h = 0
      bins.forEach((count) => {
        const p = count / total
        h += -p * Math.log2(p)
      })
      pauseEntropy = h
    }

    const speechFraction = 1 - pauseRatio
    const approxSpeechRate = speechFraction * (1000 / RHYTHM_SAMPLE_INTERVAL_MS)

    return {
      speech_rate: approxSpeechRate,
      pause_variance: pauseVariance,
      pause_entropy: pauseEntropy,
      pitch_variance: pitchVariance,
      energy_variance: energyVariance,
      voiced_ratio: speechFraction,
      energy_autocorr_lag1: normalizedEnergyAutocorr(energies, 1),
      energy_autocorr_lag3: normalizedEnergyAutocorr(energies, 3),
    }
  }

  return { start, stop, getFeatures }
}
