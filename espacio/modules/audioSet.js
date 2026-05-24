'use strict'
export default class {

  constructor(set, MChannel, onTransient) {
    console.log("comienza", set.parms.name)

    this.listNextStepTime = 0
    this.listCurrStep = 0
    this.lastStepAt = performance.now()
    this.onTransient = typeof onTransient === 'function' ? onTransient : null
    this.myAudioSet = { ...set }
    this.currInterval = _.random(set.parms.interval.min, set.parms.interval.max)
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

  advance() {

    const now = performance.now()
    const dt = (now - this.lastStepAt) / 1000
    this.lastStepAt = now
    this.listNextStepTime += dt

    if (this.listNextStepTime < this.currInterval) return
    this.currInterval = _.random(this.myAudioSet.parms.interval.min, this.myAudioSet.parms.interval.max)
    this.listNextStepTime = 0

    var elem = this.myAudioSet.files[this.shuffled[this.listCurrStep]]
    console.log()
    if (this.myAudioSet.parms.playBackRate) {
      var pbr = _.random(this.myAudioSet.parms.playBackRate.min, this.myAudioSet.parms.playBackRate.max, true)

      //console.log("pbr", pbr)
      elem.player.playbackRate = pbr
    }
    //var pbr = (Math.random() / 3) + .7


    if (elem.player.loaded) {
      if (this.onTransient) {
        this.onTransient(elem.text || null)
      }
      elem.player.start()
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