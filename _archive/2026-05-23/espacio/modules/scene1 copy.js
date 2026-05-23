'use strict'
//import * as THREE from '../lib/three.module.js';



import audio from "./audio.js"

export default {
    init: sceneInit,
    audio: audio,
    toggleAudio: toggleAudio,
    addBase: addBase,
    addAudioSet: addAudioSet
}
var myPlanets = []
var myParticles = []
var sceneEnabled = true



function toggleAudio() {
    Tone.start()
    sceneEnabled = !sceneEnabled
}
function addBase(path) {
    audio.addBase(path)
}
function addAudioSet(set) {
    audio.addAudioSet(set)
}
function sceneInit() {
    audio.init()

    var camera, scene, renderer;
    var sunObj, skyObj

    console.log("mapr range", map_range(-5, -10, 0, 0, 1))
    init();
    animate();
    var particleSystem, mars, jupiter, venus
    function init() {



        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 5000);
        camera.position.z = 800;
        //camera.far = 5000
        camera.updateProjectionMatrix()

        scene = new THREE.Scene();
        window.scene = scene

        var sunTexture = new THREE.TextureLoader().load('./img/2k_sun.jpg');
        var sunGeometry = new THREE.SphereBufferGeometry(100, 100, 100);
        var sunMaterial = new THREE.MeshBasicMaterial({ map: sunTexture });
        sunObj = new THREE.Mesh(sunGeometry, sunMaterial);
        sunObj.name = "Sol"
        scene.add(sunObj);

        var skyTexture = new THREE.TextureLoader().load('./img/2k_stars_milky_way.jpg');
        var skyGeometry = new THREE.SphereBufferGeometry(2000, 2000, 2000);
        var skyMaterial = new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide });
        skyObj = new THREE.Mesh(skyGeometry, skyMaterial);
        skyObj.name = "Sky"
        scene.add(skyObj);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        mars = addPlanet(sunObj, 18, 200, .003, [0.009, .009, .008], "./img/2k_mars.jpg")

        venus = addPlanet(sunObj, 15, 150, .006, [0.007, .007, 1], "./img/2k_venus_surface.jpg")
        jupiter = addPlanet(sunObj, 28, 300, .003, [0.006, .006, -.5], "./img/2k_jupiter.jpg")


        //var moon = addPlanet(mars, 4, 1, .003, [0.002, .002, 1], "./img/2k_moon.jpg")
        addParticles(jupiter)



        //

        window.addEventListener('resize', onWindowResize, false);

    }

    function onWindowResize() {

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);

    }

    var planetsIterator
    var particlesIterator

    var levelPeak = -9999
    var currPlanet
    var axysElem
    function animate() {

        requestAnimationFrame(animate);


        for (planetsIterator = 0; planetsIterator < myPlanets.length; planetsIterator++) {

            currPlanet = myPlanets[planetsIterator]
            currPlanet.mesh.rotation.y += currPlanet.rotationSpeed
            for (axysElem = 0; axysElem < 3; axysElem++) {
                currPlanet.theta[axysElem] += currPlanet.dTheta[axysElem]
            }
            //currPlanet.mesh.position.x = (currPlanet.radio * 20) * Math.cos(currPlanet.theta)
            //currPlanet.mesh.position.x = (currPlanet.radio * 20) * Math.sin(currPlanet.theta[0])
            //currPlanet.mesh.position.y = (currPlanet.radio * 20) * Math.cos(currPlanet.theta[1])
            //currPlanet.mesh.position.z = (currPlanet.radio * 20) * Math.cos(currPlanet.theta[2])


        }
        for (particlesIterator = 0; particlesIterator < myParticles.length; particlesIterator++) {
            myParticles[particlesIterator].update()
        }
        sunObj.rotation.y += 0.0007;

        skyObj.rotation.y += 0.0006;
        skyObj.rotation.y += 0.0005;
        skyObj.rotation.y -= 0.0004;
        var level = audio.mixer.meter.getValue()
        //levelPeak -= .1
        //console.log(level)
        //if (level > levelPeak) {
        //jupiter.scale()
        //levelPeak = level
        var mapped = map_range(level, -35, -5, 1.5, 2)
        //mapped = 2
        jupiter.scale.set(mapped, mapped, mapped)
        //console.log(mapped)
        //}


        renderer.render(scene, camera);


    }


}

function addPlanet(parent, radio, distance, rotationSpeed, traslationSpeed, texturePath) {

    var pivot = new THREE.Mesh()

    var texture = new THREE.TextureLoader().load(texturePath);
    var geometry = new THREE.SphereGeometry(radio, radio, radio);
    var material = new THREE.MeshBasicMaterial({ map: texture });
    var mesh = new THREE.Mesh(geometry, material);
    pivot.add(mesh)
    pivot.name = "Pivot " + (myPlanets.length + 1)
    pivot.position.set(parent.position)


    scene.add(pivot)
    mesh.name = "Planet " + (myPlanets.length + 1)
    mesh.position.set(distance, 0, 0)
    var planetData = { mesh, pivot, parent, radio, distance, rotationSpeed, traslationSpeed, texture }

    planetData.theta = [0, 0, 0]
    planetData.dTheta = [0, 0, 0]
    planetData.dTheta[0] = 2 * Math.PI / (traslationSpeed[0] * 100000);
    planetData.dTheta[1] = 2 * Math.PI / (traslationSpeed[1] * 100000);
    planetData.dTheta[2] = 2 * Math.PI / (traslationSpeed[2] * 100000);
    myPlanets.push(planetData)

    console.log("planets", myPlanets)
    //parent.add(mesh)
    //scene.add(mesh)

    return mesh

}
function addParticles(parent) {

    var particleSystem = new Partykals.ParticlesSystem({
        container: parent,
        particles: {
            globalSize: 5,
            //worldPosition: true,
            ttl: 10,
            velocity: new Partykals.Randomizers.SphereRandomizer(12.5),
            //velocityBonus: new THREE.Vector3(0, 25, 0),
            //gravity: -10,
            startColor: new Partykals.Randomizers.ColorsRandomizer(),
            endColor: new Partykals.Randomizers.ColorsRandomizer(),
        },
        system: {
            particlesCount: 1000,
            emitters: new Partykals.Emitter({
                onInterval: new Partykals.Randomizers.MinMaxRandomizer(0, 5),
                interval: new Partykals.Randomizers.MinMaxRandomizer(0, 0.25),
            }),
            speed: 1,
        }
    });
    myParticles.push(particleSystem)
    return particleSystem

}

function map_range(value, istart, istop, ostart, ostop) {
    return ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
}