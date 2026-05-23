'use strict'
export default class {

  constructor(parms) {


    this.volume = new Tone.Volume().connect(parms.masterOutput)
    this.eq = new Tone.EQ3(0, 0, 0).connect(this.volume)
    this.input = new Tone.Volume().connect(this.eq)



    this.reverbSend = new Tone.Volume({ volume: -34 }).connect(parms.reverbSend)
    this.delaySend = new Tone.Volume({ volume: -128 }).connect(parms.delaySend)
    this.eq.fan(this.reverbSend, this.delaySend)

    return
  }
  connectInput(input) {
    input.connect(this.input)

    return this
  }
  sendDelay(value) {
    this.delaySend.volume.value = value
    return this
  }
  setEq(values) {
    //console.log("eq ", values)
    this.eq.high.value = values.high
    this.eq.mid.value = values.mid
    this.eq.low.value = values.low
  }
  sendReverb(value) {
    this.reverbSend.volume.value = value
    return this
  }
  setVolume(value) {
    this.volume.volume.value = value
    return this
  }


}


