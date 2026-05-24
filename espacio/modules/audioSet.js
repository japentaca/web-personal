'use strict'
export default class {

  constructor(set, MChannel, onTransient) {
    console.log("comienza", set.parms.name)

    this.listNextStepTime = 0
    this.listCurrStep = 0
    this.lastStepAt = performance.now()
    this.activeClipEndsAt = 0
    this.onTransient = typeof onTransient === 'function' ? onTransient : null
    this.myAudioSet = { ...set }
    this.currInterval = _.random(set.parms.interval.min, set.parms.interval.max)
    this.playMode = this.resolvePlayMode(set)
    this.playbackTailMs = (set && set.parms && typeof set.parms.playbackTailMs === 'number')
      ? set.parms.playbackTailMs
      : 90
    console.log(this.myAudioSet)
    var volNode = new Tone.Volume()
    if (set.effects.volume) volNode.volume.value = set.effects.volume
    MChannel.connectInput(volNode)
    this.myAudioSet.files.forEach(audioFile => {
      //console.log(audioFile)
      audioFile.player = new Tone.Player("./audio/" + audioFile.path)
      //set.player.connect(volumeNode)
      //if (set.effects.playbackRate) audioFile.player.playbackRate = set.effects.playbackRate
      //if (set.effects.grainSize) audioFile.player.grainSize = set.effects.grainSize

      audioFile.player.volume.value = 0
      //audioFile.player.mixerChannel = mixer.addChannel()
      //MChannel.connectInput(audioFile.player)
      audioFile.player.connect(volNode)



      //audioFile.player.connect(outputNode)
    })

    if (set.effects.delay) MChannel.sendDelay(set.effects.delay)
    if (set.effects.reverb) MChannel.sendReverb(set.effects.reverb)
    if (set.effects.eq) MChannel.setEq(set.effects.eq)

    this.shuffled = _.shuffle(Object.keys(this.myAudioSet.files))
    //setInterval(this.advance, 1000)

    return

  }

  start() {

    setInterval(() => {
      this.advance()
    }, 120)
  }

  resolvePlayMode(set) {
    const rawMode = (set && set.parms && typeof set.parms.playMode === 'string')
      ? set.parms.playMode.toLowerCase()
      : 'auto'

    if (rawMode === 'wait' || rawMode === 'cut' || rawMode === 'overlap') {
      return rawMode
    }

    const files = (set && Array.isArray(set.files)) ? set.files : []
    const durations = files
      .map(file => Number(file.durationSec))
      .filter(value => Number.isFinite(value) && value > 0)

    if (!durations.length) {
      return 'wait'
    }

    const avgDuration = durations.reduce((acc, value) => acc + value, 0) / durations.length
    const sortedDurations = [...durations].sort((a, b) => a - b)
    const p85Index = Math.min(
      sortedDurations.length - 1,
      Math.max(0, Math.floor((sortedDurations.length - 1) * 0.85))
    )
    const p85Duration = sortedDurations[p85Index]
    const hasInterval = set && set.parms && set.parms.interval
      && typeof set.parms.interval.min === 'number'
      && typeof set.parms.interval.max === 'number'

    if (!hasInterval) {
      return 'wait'
    }

    const minInterval = set.parms.interval.min
    const avgInterval = (set.parms.interval.min + set.parms.interval.max) * 0.5
    const avgDenseRatio = avgDuration / avgInterval
    const tailDenseRatio = p85Duration / minInterval

    // Auto prefers phrase integrity, but switches to rhythm when clips are dense.
    if (avgDenseRatio >= 0.95 || tailDenseRatio >= 1.08) {
      return 'cut'
    }

    return 'wait'
  }

  isPlaybackActive() {
    for (let i = 0; i < this.myAudioSet.files.length; i++) {
      const player = this.myAudioSet.files[i].player
      if (player && player.state === 'started') {
        return true
      }
    }

    return false
  }

  isDurationWindowActive(nowMs) {
    return nowMs < this.activeClipEndsAt
  }

  shouldHoldForActivePlayback(nowMs) {
    if (this.playMode !== 'wait') {
      return false
    }

    if (this.isDurationWindowActive(nowMs)) {
      return true
    }

    return this.isPlaybackActive()
  }

  stopActivePlayers() {
    for (let i = 0; i < this.myAudioSet.files.length; i++) {
      const player = this.myAudioSet.files[i].player
      if (player && player.state === 'started') {
        player.stop()
      }
    }
    this.activeClipEndsAt = 0
  }

  estimateDurationMs(elem, playbackRate) {
    const durationSec = Number(elem.durationSec)
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      return 0
    }

    const safeRate = (typeof playbackRate === 'number' && playbackRate > 0) ? playbackRate : 1
    return (durationSec * 1000) / safeRate
  }

  advance() {

    const now = performance.now()
    const dt = (now - this.lastStepAt) / 1000
    this.lastStepAt = now
    this.listNextStepTime += dt

    if (this.listNextStepTime < this.currInterval) return
    if (this.shouldHoldForActivePlayback(now)) return

    if (this.playMode === 'cut') {
      this.stopActivePlayers()
    }

    this.currInterval = _.random(this.myAudioSet.parms.interval.min, this.myAudioSet.parms.interval.max)
    this.listNextStepTime = 0

    var elem = this.myAudioSet.files[this.shuffled[this.listCurrStep]]
    console.log()
    var pbr = 1
    if (this.myAudioSet.parms.playBackRate) {
      pbr = _.random(this.myAudioSet.parms.playBackRate.min, this.myAudioSet.parms.playBackRate.max, true)

      //console.log("pbr", pbr)
      elem.player.playbackRate = pbr
    }
    //var pbr = (Math.random() / 3) + .7


    if (elem.player.loaded) {
      if (this.onTransient) {
        this.onTransient(elem.text || null)
      }
      elem.player.start()

      const estimatedMs = this.estimateDurationMs(elem, pbr)
      this.activeClipEndsAt = now + estimatedMs + this.playbackTailMs
    }

    this.listCurrStep++
    if (this.listCurrStep == this.myAudioSet.files.length) {
      this.shuffled = _.shuffle(Object.keys(this.myAudioSet.files))
      this.listCurrStep = 0
    }
    //console.log("elem", elem)


  }

}

//var audioNode = new Tone