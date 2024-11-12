<script setup>

import { onMounted, onUnmounted, ref, reactive } from 'vue';

const canvas = ref(null);



import * as THREE from 'three/webgpu';
import { length, select, float, If, PI, color, cos, instanceIndex, Loop, mix, mod, sin, storage, Fn, uint, uniform, uniformArray, hash, vec2, vec3, vec4, sqrt, log, normalize, cameraProjectionMatrix, dot, positionLocal, Discard } from 'three/tsl';
import Stats from 'three/addons/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let time_0 = 0;
const time_i = uniform(0);

let camera, scene, renderer, controls, updateCompute, stats;

function init() {
  time_0 = Date.now()*0.001;

  stats = new Stats();
  canvas.value.parentNode.appendChild( stats.dom );

    const [canvasWidth,canvasHeight] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));

	camera = new THREE.PerspectiveCamera( 25, canvasWidth / canvasHeight, 0.1, 100 );
	camera.position.set( 3, 5, 3 );

	scene = new THREE.Scene();
	// renderer

	renderer = new THREE.WebGPURenderer( { antialias: true, canvas: canvas.value } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( canvasWidth, canvasHeight );
	renderer.setAnimationLoop( animate );
	renderer.setClearColor( '#000000' );

	controls = new OrbitControls( camera, renderer.domElement );
// 	controls.target = new THREE.Vector3(50,0,50);
	controls.enableDamping = true;
	controls.minDistance = 0.1;
	controls.maxDistance = 50;

	window.addEventListener( 'resize', onWindowResize );

	// particles

	const count = 0 ? 20000000 : 200000;
// 	const count = 1 ? 8000000 : 200000;
	const material = new THREE.SpriteNodeMaterial( {  } );

	// update compute

	const update = Fn( () => {

	} );
	updateCompute = update().compute( count );

	// nodes

	// material.positionNode = positionBuffer.toAttribute();
	material.positionNode = Fn( () => {

    const randX = hash( instanceIndex );
    const randY = hash( instanceIndex.add( 2 ) );
    const randZ = hash( instanceIndex.add( 3 ) );

    const uv = vec2(randX.mul(2.0).add(-1),randY.mul(2.0).add(-1));

    const d = float(1.).div(sqrt(length(uv)));
    d.mulAssign(d.mul(d));
    // const d = log(length(uv).add(0.5).mul(5));
    let r = time_i.mul(0.0001).mul(d.add(-1.0));


    const uvr = vec2(
      cos(r).mul(uv.x).add(sin(r).mul(uv.y).mul(-1)),
      sin(r).mul(uv.x).add(cos(r).mul(uv.y))
    );

    const pos = vec3(uvr.x.mul(50),d.mul(-0.05),uvr.y.mul(50));

    return pos;

    // let theta = hash( instanceIndex ).mul(100);
    // let r = hash( instanceIndex.add( 2 ) ).mul(100);
    // const t = hash( instanceIndex.add( 3 ) );

    // r = select( t.greaterThan( r ), t, r );
    // theta.mulAssign(6.28318548);

    // return vec3(
    //     r.mul(cos(theta)),
    //     0,
    //     r.mul(sin(theta))
    // );

    // return pos;

    // return vec3(
    //   randX.mul( 100 ).add( - 50 ),
    //   0,
    //   randZ.mul( 100 ).add( - 50 )
    // );

		// return vec3( time_i.mul(0.1),float(instanceIndex).mul(0.1),0 );
	} )();

	material.colorNode = Fn( () => {

	 // const uv = uv(0).mul(2.0).add(-1.0);
	  const uv = positionLocal.xy;
	  const l = length( uv );
	  If( l.greaterThan( 1 ), ()=>Discard());


	 // return vec4(1,0,0,1);

	  const z = sqrt(
	    float(1)
  	    .sub(
  	      uv.x.mul(uv.x)
        ).sub(
          uv.y.mul(uv.y)
        )
    );

	  const normal = cameraProjectionMatrix.mul(vec4(uv.x,z,uv.y,1));
    // return vec4( normal,1 );

    const light_dir = cameraProjectionMatrix.mul(vec4(1,0,0,1));
  //   const alpha = select( l.lessThan( 1.0 ), 1, 0 );

  //   // return select( l.lessThan( 1.0 ), vec4( 1,0,0,1 ), vec4( 0,0,0,0 ) );
  //   // return vec4( dot(vec3(1,0,0),normal),0,0,1 );
    return vec4( dot(normal.xyz,light_dir.xyz),0,0,1 );
    // return vec4( 1,0,0,1 );
    // return select( l.lessThan( 1.0 ), vec4( 1,0,0,1 ), vec4( 0,0,0,0 ) );

	} )();
	material.scaleNode = Fn( () => {
		return 0.01;
	} )();


	// mesh

// 	const geometry = new THREE.OctahedronGeometry( 1, 1 );

  // create a simple square shape. We duplicate the top left and bottom right
  // vertices because each vertex needs to appear once per triangle.
  const geometry = new THREE.BufferGeometry();

  const vertices = new Float32Array( [
    -1,-1,0,
    3,-1,0,
    -1,3,0,
  ] );

  // const indices = [
  // 	0, 1, 2,
  // 	2, 3, 0,
  // ];

  // geometry.setIndex( indices );
  geometry.setAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
  // geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );

  // // itemSize = 3 because there are 3 values (components) per vertex
  // geometry.setAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
  // geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );

// 	const geometry = new THREE.PlaneGeometry( 1, 1 );
	const mesh = new THREE.InstancedMesh( geometry, material, count );
	mesh.frustumCulled = false;
	scene.add( mesh );

}

function onWindowResize() {
  const [canvasWidth,canvasHeight] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));
	camera.aspect = canvasWidth / canvasHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( canvasWidth, canvasHeight );

}

async function animate() {
  stats.update();
  time_i.value = Date.now()*0.001 - time_0;

	controls.update();

		renderer.compute( updateCompute );
	renderer.render( scene, camera );

}

// import Stats from 'three/addons/libs/stats.module.js';
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// import * as THREE from 'three/webgpu';
// import { Fn, uniform, texture, instanceIndex, float, hash, vec3, vec4, storage, If } from 'three/tsl';


// // Reference to the container where Three.js will attach the canvas
// const canvas = ref(null);

// // const particleCount = 134217728;
// const particleCount = 80000;

// let time_0 = 0;
// const time_i = uniform(0);
// const speed = uniform(0.1);

// const size = uniform( .4 );

// const clickPosition = uniform( new THREE.Vector3() );

// let camera, scene, renderer;
// let controls, stats;
// let computeParticles;

// const timestamps = document.getElementById( 'timestamps' );

// function init() {
//   time_0 = Date.now()*0.001;

//   const [canvasWidth,canvasHeight] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));

//   camera = new THREE.PerspectiveCamera( 50, canvasWidth / canvasHeight, .1, 1000 );
//   camera.position.set( 15, 30, 15 );

//   scene = new THREE.Scene();

//   const createBuffer = () => storage( new THREE.StorageInstancedBufferAttribute( particleCount, 3 ), 'vec3', particleCount );

//   const positionBuffer = createBuffer();
//   // const colorBuffer = createBuffer();

//   // compute

//   const computeInit = Fn( () => {

//     const position = positionBuffer.element( instanceIndex );

//     const randX = hash( instanceIndex );
//     const randY = hash( instanceIndex.add( 2 ) );
//     const randZ = hash( instanceIndex.add( 3 ) );

//     position.x = randX.mul( 100 ).add( - 50 );
//     position.y = 0; // randY.mul( 10 );
//     position.z = randZ.mul( 100 ).add( - 50 );

//     // const color = colorBuffer.element( instanceIndex );
//     // color.assign( vec3( randX, randY, randZ ) );

//   } )().compute( particleCount );

//   computeParticles = Fn( () => {
//     // return vec3(0,2.0,0);
//     const position = positionBuffer.element( instanceIndex );
//     position.y = time_i.mul(speed);
//   } )().compute( particleCount );



//   // create particles
//   const particleMaterial = new THREE.SpriteNodeMaterial();
// //   particleMaterial.positionNode = Fn( () => {
// // 		return vec3( 0,1,0 );
// // 	} )().compute(particleCount);
//   particleMaterial.positionNode = positionBuffer.toAttribute();
//   particleMaterial.colorNode = Fn( () => {
// 		return vec4( 0,1,0,1 );
// 	} );
//   particleMaterial.scaleNode = size;
//   particleMaterial.depthWrite = false;
//   particleMaterial.depthTest = true;
//   particleMaterial.transparent = true;

//   const particles = new THREE.InstancedMesh( new THREE.PlaneGeometry( 1, 1 ), particleMaterial, particleCount );
//   particles.count = particleCount;
//   particles.frustumCulled = false;
//   scene.add( particles );

//   const helper = new THREE.GridHelper( 60, 40, 0x303030, 0x303030 );
//   scene.add( helper );

//   const geometry = new THREE.PlaneGeometry( 1000, 1000 );
//   geometry.rotateX( - Math.PI / 2 );

//   const plane = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { visible: false } ) );
//   scene.add( plane );

//   const raycaster = new THREE.Raycaster();
//   const pointer = new THREE.Vector2();

//   //
//   renderer = new THREE.WebGPURenderer( {canvas:canvas.value, antialias: true, trackTimestamp: true } );
//   renderer.setPixelRatio( window.devicePixelRatio );
//   renderer.setSize( canvasWidth, canvasHeight );
//   renderer.setAnimationLoop( animate );

//   stats = new Stats();
//   canvas.value.parentNode.appendChild( stats.dom );

//   renderer.computeAsync( computeInit );

//   controls = new OrbitControls( camera, renderer.domElement );
//   controls.minDistance = 5;
//   controls.maxDistance = 200;
//   controls.target.set( 0, 0, 0 );
//   controls.update();

//   window.addEventListener( 'resize', onWindowResize );
// }

// function onWindowResize() {

//   const [canvasWidth,canvasHeight] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));

//   camera.aspect = canvasWidth / canvasHeight;
//   camera.updateProjectionMatrix();

//   renderer.setSize( canvasWidth, canvasHeight );

// }

// async function animate() {
//   stats.update();

//   time_i.value = Date.now()*0.001 - time_0;
//   // renderer.info.render.frame++;

//   await renderer.computeAsync( computeParticles );
//   await renderer.renderAsync( scene, camera );
// }

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
    width: 300px;
  }
</style>
