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
var scene



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

    var camera, renderer;
    var sunObj, skyObj
    var group
    console.log("mapr range", map_range(-5, -10, 0, 0, 1))
    init();
    animate();
    var mars, jupiter, venus
    async function init() {

        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 3000);
        camera.position.z = 800;
        //camera.far = 5000
        //camera.updateProjectionMatrix()

        scene = new THREE.Scene();
        window.scene = scene

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);



        //

        window.addEventListener('resize', onWindowResize, false);

        var skyTexture = new THREE.TextureLoader().load('./img/2k_stars_milky_way.jpg');
        var skyGeometry = new THREE.SphereBufferGeometry(2000, 2000, 2000);
        var skyMaterial = new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide });
        skyObj = new THREE.Mesh(skyGeometry, skyMaterial);
        skyObj.name = "Sky"
        //scene.add(skyObj);


        var geometry = new THREE.SphereBufferGeometry(69, 69, 69);
        var texture = new THREE.TextureLoader().load("./img/1k_moon.jpg")
        var material = new THREE.MeshBasicMaterial({ map: texture });


        var cubeA = new THREE.Mesh(geometry, material);
        cubeA.position.set(100, 0, 0);

        var cubeB = new THREE.Mesh(geometry, material);
        cubeB.position.set(-100, -100, 0);

        //create a group and add the two cubes
        //These cubes can now be rotated / scaled etc as a group
        group = new THREE.Group();
        scene.add(group);
        group.add(cubeA);
        group.add(cubeB);



        var sunTexture = new THREE.TextureLoader().load('./img/1k_sun.jpg');
        var sunGeometry = new THREE.SphereBufferGeometry(100, 100, 100);
        var sunMaterial = new THREE.MeshBasicMaterial({ map: sunTexture });
        sunObj = new THREE.Mesh(sunGeometry, sunMaterial);
        sunObj.name = "Sol"
        //scene.add(sunObj);


        scene.add(addPlanet(sunObj, 18, 200, .003, [0.009, .009, .008], "./img/2k_mars.jpg"))

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


        group.rotation.y += .01



        renderer.render(scene, camera);


    }


}

function addPlanet(parent, radio, distance, rotationSpeed, traslationSpeed, texturePath) {

    var texture = new THREE.TextureLoader().load(texturePath);
    var geometry = new THREE.SphereBufferGeometry(radio, radio, radio);
    var material = new THREE.MeshBasicMaterial({ map: texture });
    var mesh = new THREE.Mesh(geometry, material);

    mesh.name = "Planet " + (myPlanets.length + 1)
    mesh.position.set(distance, 0, 0)

    var pivot = new THREE.Group()
    //scene.add(mesh)
    pivot.add(mesh)
    //mesh.attach(pivot)
    pivot.name = "Pivot " + (myPlanets.length + 1)
    //pivot.position.set(parent.position)

    var planetData = { mesh, pivot, parent, radio, distance, rotationSpeed, traslationSpeed, texture }

    myPlanets.push(planetData)

    //console.log("planets", myPlanets)
    //parent.add(mesh)
    //scene.add(mesh)

    return pivot

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