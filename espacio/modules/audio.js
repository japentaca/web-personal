
'use strict'
import mixer from "./mixer/mixer.js?v=20260523e"
console.log("mixer...", mixer)
import AudioSet from "./audioSet.js?v=20260523b"


export default {
    init: init,
    addAudioSet: addAudioSet,
    addBase: addBase,
    getReactiveLevel: getReactiveLevel,
    mixer: mixer
}

var myAudioSets = []
var basePlayers = [] // 
var baseMChannels = []
var lastDuckAt = 0
var reactiveMeter = null
var reactiveMeterTap = null
var reactiveMeterAnalyser = null

const DUCKING = {
    attackSec: 0.03,
    releaseSec: 0.25,
    amountDb: 8,
    cooldownSec: 0.09
}


function addBase(path) {
    var basePlayer = new Tone.Player(path);
    var baseMChannel = mixer.addChannel().connectInput(basePlayer)
    baseMChannel.baseLevelDb = -3
    if (baseMChannel.volume && baseMChannel.volume.volume) {
        baseMChannel.volume.volume.value = baseMChannel.baseLevelDb
    }
    basePlayer.loop = true
    basePlayer.autostart = true
    basePlayers.push(basePlayer)
    baseMChannels.push(baseMChannel)

}

function duckBase() {
    if (!baseMChannels.length) {
        return
    }

    var now = Tone.now()
    if ((now - lastDuckAt) < DUCKING.cooldownSec) {
        return
    }
    lastDuckAt = now

    baseMChannels.forEach((baseChannel) => {
        if (!baseChannel || !baseChannel.volume || !baseChannel.volume.volume) {
            return
        }

        var volumeParam = baseChannel.volume.volume
        var baseDb = (typeof baseChannel.baseLevelDb === 'number') ? baseChannel.baseLevelDb : -3
        var duckDb = baseDb - DUCKING.amountDb
        var currentValue = (typeof volumeParam.value === 'number') ? volumeParam.value : baseDb

        if (typeof volumeParam.cancelAndHoldAtTime === 'function') {
            volumeParam.cancelAndHoldAtTime(now)
        } else {
            volumeParam.cancelScheduledValues(now)
        }

        volumeParam.setValueAtTime(currentValue, now)
        volumeParam.linearRampToValueAtTime(duckDb, now + DUCKING.attackSec)
        volumeParam.linearRampToValueAtTime(baseDb, now + DUCKING.attackSec + DUCKING.releaseSec)
    })
}

function init() {
    var context = Tone.getContext ? Tone.getContext() : Tone.context
    if (context) {
        context.lookAhead = 0.03
        context.updateInterval = 0.01
    }


    mixer.init()
}

function attachReactiveMeter(channel) {
    if (!channel || !channel.volume || reactiveMeter) {
        return
    }

    reactiveMeterTap = new Tone.Compressor({
        threshold: -22,
        ratio: 3,
        attack: 0.02,
        release: 0.2
    })
    reactiveMeterAnalyser = new Tone.Analyser("waveform", 256)

    channel.volume.connect(reactiveMeterTap)
    reactiveMeterTap.connect(reactiveMeterAnalyser)

    reactiveMeter = {
        getValue: function () {
            var values = reactiveMeterAnalyser.getValue()
            var peak = 0

            for (var i = 0; i < values.length; i++) {
                var v = Math.abs(values[i])
                if (v > peak) peak = v
            }

            if (peak <= 0.000001) return -100
            return Tone.gainToDb(peak)
        }
    }
}

function getReactiveLevel() {
    if (reactiveMeter && typeof reactiveMeter.getValue === 'function') {
        return reactiveMeter.getValue()
    }

    return mixer.meter.getValue()
}

function addAudioSet(set, onText) {
    var audioSetMChannel = mixer.addChannel()

    if (set && set.reactiveSource === true) {
        attachReactiveMeter(audioSetMChannel)
    }

    var transient = function (text) {
        duckBase()
        if (typeof onText === 'function' && text) {
            onText(text)
        }
    }

    var audioSet = new AudioSet(set, audioSetMChannel, transient)
    audioSet.start()

    myAudioSets.push(audioSet)

}


