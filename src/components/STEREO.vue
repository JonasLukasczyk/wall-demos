<script setup>

import { onMounted, onUnmounted, ref, reactive } from 'vue';

import px from '../assets/px.jpg';
import py from '../assets/py.jpg';
import pz from '../assets/pz.jpg';
import nx from '../assets/nx.jpg';
import ny from '../assets/ny.jpg';
import nz from '../assets/nz.jpg';

import * as THREE from 'three/webgpu';

import { stereoPass } from '../../node_modules/three/examples/jsm/tsl/display/StereoPassNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Timer } from 'three/addons/misc/Timer.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';


const canvas = ref(null);

let camera, scene, renderer, postProcessing;

let stereo, anaglyph, parallaxBarrier;

let mesh, dummy, timer;

const position = new THREE.Vector3();

const params = {
	effect: 'stereo',
	eyeSep: 0.064,
};

function init() {

  const [canvasWidth,canvasHeight] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));

	camera = new THREE.PerspectiveCamera( 60, canvasWidth / canvasHeight, 0.1, 100 );
	camera.position.z = 3;

	scene = new THREE.Scene();

  const ct = new THREE.CubeTextureLoader()
		.load( [ px,nx,py,ny,pz,nz ] );

	scene.background = ct;

// 	scene.background = new THREE.TextureLoader().load( px );

	timer = new Timer();

	const geometry = new THREE.SphereGeometry( 0.1, 32, 16 );

	const textureCube = ct;
// 	const textureCube = new THREE.CubeTextureLoader()
// 		.setPath( 'assets/' )
// 		.load( [ 'px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg' ] );

	const material = new THREE.MeshBasicMaterial( { color: 0xffffff, envMap: textureCube } );

	mesh = new THREE.InstancedMesh( geometry, material, 500 );
	mesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );

	dummy = new THREE.Mesh();

	for ( let i = 0; i < 500; i ++ ) {

		dummy.position.x = Math.random() * 10 - 5;
		dummy.position.y = Math.random() * 10 - 5;
		dummy.position.z = Math.random() * 10 - 5;
		dummy.scale.x = dummy.scale.y = dummy.scale.z = Math.random() * 3 + 1;

		dummy.updateMatrix();

		mesh.setMatrixAt( i, dummy.matrix );

	}

	scene.add( mesh );

	//
	renderer = new THREE.WebGPURenderer({canvas:canvas.value});
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( canvasWidth, canvasHeight );
	renderer.setAnimationLoop( animate );

	postProcessing = new THREE.PostProcessing( renderer );
	stereo = stereoPass( scene, camera );

	postProcessing.outputNode = stereo;

	const gui = new GUI();
	gui.add( params, 'eyeSep', 0.001, 2, 0.001 ).onChange( function ( value ) {
		stereo.stereo.eyeSep = value;
	} );

	window.addEventListener( 'resize', onWindowResize );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.minDistance = 1;
	controls.maxDistance = 25;

}

function onWindowResize() {
  const [canvasWidth,canvasHeight] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));

	camera.aspect = canvasWidth / canvasHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( canvasWidth, canvasHeight );

}

function extractPosition( matrix, position ) {

	position.x = matrix.elements[ 12 ];
	position.y = matrix.elements[ 13 ];
	position.z = matrix.elements[ 14 ];

}

function animate() {

	timer.update();

	const elapsedTime = timer.getElapsed() * 0.1;

	for ( let i = 0; i < mesh.count; i ++ ) {

		mesh.getMatrixAt( i, dummy.matrix );

		extractPosition( dummy.matrix, position );

		position.x = 5 * Math.cos( elapsedTime + i );
		position.y = 5 * Math.sin( elapsedTime + i * 1.1 );

		dummy.matrix.setPosition( position );

		mesh.setMatrixAt( i, dummy.matrix );

		mesh.instanceMatrix.needsUpdate = true;

	}

	postProcessing.render();
}


onMounted(init);

</script>

<template>
  <canvas ref="canvas" class='canvas' />
</template>

<style scoped>
  .canvas {
    display: block;
    width:100%;
    height:100%;
  }

  .menu {
    position: absolute;
    top:1em;
    right:10px;
    max-width: 300px;
    text-align: right;
  }
</style>
