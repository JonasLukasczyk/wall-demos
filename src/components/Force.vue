<script setup>

import { onMounted, onUnmounted, ref, reactive } from 'vue';
const canvas = ref(null);

import * as THREE from 'three/webgpu';

import { float, If, PI, color, cos, instanceIndex, Loop, mix, mod, sin, Fn, uint, uniform, uniformArray, hash, vec3, vec4, storage, storageObject, attributeArray, positionLocal, Discard, length} from 'three/tsl';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { stereoPass } from '../../node_modules/three/examples/jsm/tsl/display/StereoPassNode.js';

import Stats from 'three/addons/libs/stats.module.js';
let stats = new Stats();

let camera, scene, renderer, controls, updateCompute, iterateCompute;
let stereo, postProcessing;
const params = {
  eyeSep: 0.064,
};
let time_0 = performance.now();
const time_i = uniform(0);
const TIME_SCALE = uniform(0.1);
const lambda = uniform(0);

function init() {
  canvas.value.parentNode.appendChild( stats.dom );

  const [canvasWidth,canvasHeight] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));

  camera = new THREE.PerspectiveCamera( 25, canvasWidth / canvasHeight, 0.1, 100 );
  camera.position.set( 3, 5, 8 );

  scene = new THREE.Scene();

  // ambient light

  const ambientLight = new THREE.AmbientLight( '#ffffff', 0.5 );
  scene.add( ambientLight );

  // directional light

  const directionalLight = new THREE.DirectionalLight( '#ffffff', 1.5 );
  directionalLight.position.set( 4, 2, 0 );
  scene.add( directionalLight );

  // renderer

  renderer = new THREE.WebGPURenderer( { antialias: true, canvas:canvas.value } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( canvasWidth, canvasHeight );
  renderer.setAnimationLoop( animate );
  renderer.setClearColor( '#000000' );

  controls = new OrbitControls( camera, renderer.domElement );
  controls.enableDamping = true;
  controls.minDistance = 0.1;
  controls.maxDistance = 50;

  postProcessing = new THREE.PostProcessing( renderer );
  stereo = stereoPass( scene, camera );
  postProcessing.outputNode = stereo;


  window.addEventListener( 'resize', onWindowResize );

  // attractors

  const attractorsPositions = uniformArray( [
    new THREE.Vector3( - 1, 0, 0 ),
    new THREE.Vector3( 1, 0, - 0.5 ),
    new THREE.Vector3( 0, 0.5, 1 )
  ] );
  const attractorsRotationAxes = uniformArray( [
    new THREE.Vector3( 0, 1, 0 ),
    new THREE.Vector3( 0, 1, 0 ),
    new THREE.Vector3( 1, 0, - 0.5 ).normalize()
  ] );

  // particles

  const count = Math.pow( 2, 18 );
  // const count = Math.pow( 2, 22 );
  // const count = Math.pow( 2, 19 );
  const material = new THREE.SpriteNodeMaterial( { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } );

  const attractorMass = uniform( Number( `1e${7}` ) );
  const particleGlobalMass = uniform( Number( `1e${4}` ) );
  const timeScale = uniform( 1 );
  const spinningStrength = uniform( 2.75 );
  const maxSpeed = uniform( 8 );
  const gravityConstant = 6.67e-11;
  const velocityDamping = uniform( 0.1 );
  const scale = uniform( 0.008 );
  const boundHalfExtent = uniform( 8 );
  const getRandomHexColor = () => `#${((1<<24)*Math.random()|0).toString(16).padStart(6, '0')}`;

  const colorA = uniform( color( getRandomHexColor() ) );
  const colorB = uniform( color( getRandomHexColor() ) );

  const createBuffer = n => storage( new THREE.StorageInstancedBufferAttribute( n, 3 ), 'vec3', n );

  const p0_ = createBuffer( count );
  const p1_ = createBuffer( count );
  const v0_ = createBuffer( count );
  const v1_ = createBuffer( count );


  const sphericalToVec3 = Fn( ( [ phi, theta ] ) => {
    const sinPhiRadius = sin( phi );
    return vec3(
      sinPhiRadius.mul( sin( theta ) ),
      cos( phi ),
      sinPhiRadius.mul( cos( theta ) )
    );
  } );

  // init compute
  const init = Fn( () => {
    const basePosition = vec3(
      hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) ),
      hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) ),
      hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) )
    ).sub( 0.5 ).mul( vec3( 5, 0.2, 5 ) );
    p0_.element( instanceIndex ).assign( basePosition );
    p1_.element( instanceIndex ).assign( basePosition );

    const phi = hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) ).mul( PI ).mul( 2 );
    const theta = hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) ).mul( PI );
    const baseVelocity = sphericalToVec3( phi, theta ).mul( 0.05 );
    v0_.element( instanceIndex ).assign( baseVelocity );
    v1_.element( instanceIndex ).assign( baseVelocity );
  } );

  const initCompute = init().compute( count );
  const reset = () => {
    renderer.computeAsync( initCompute );
  };
  reset();

  // update compute
  const particleMassMultiplier = hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) ).remap( 0.25, 1 ).toVar();
  const particleMass = particleMassMultiplier.mul( particleGlobalMass ).toVar();

  const computeForce = Fn( ( [ p ] ) => {
      const delta = float( 1 / 60 ).mul( timeScale ).toVar(); // uses fixed delta to consistant result
      // force
      const force = vec3( 0 ).toVar();
      Loop( { start: uint( 0 ), end: uint( 3 ) }, ( { i } ) => {
          const attractorPosition = attractorsPositions.element( i );
          const attractorRotationAxis = attractorsRotationAxes.element( i );
          const toAttractor = attractorPosition.sub( p );
          const distance = toAttractor.length();
          const direction = toAttractor.normalize();

          // gravity
          const gravityStrength = attractorMass.mul( particleMass ).mul( gravityConstant ).div( distance.pow( 2 ) ).toVar();
          // gravityStrength.mulAssign(gravityStrength_);
          const gravityForce = direction.mul( gravityStrength );
          force.addAssign( gravityForce );

          // spinning
          const spinningForce = attractorRotationAxis.mul( gravityStrength ).mul( spinningStrength );
          const spinningVelocity = spinningForce.cross( toAttractor );
          force.addAssign( spinningVelocity );
      } );
      return force;
  });

  const computeVelocity = Fn( ( [ v0, force ] ) => {
      const delta = float( 1 / 60 ).mul( timeScale ).toVar(); // uses fixed delta to consistant result
      const v1 = v0.add(force.mul( delta ));
      const speed = v1.length();
      If( speed.greaterThan( maxSpeed ), () => {
        v1.assign( v1.normalize().mul( maxSpeed ) );
      } );
      v1.mulAssign( velocityDamping.oneMinus() );
      return v1;
  });

  const computePosition = Fn( ( [ p, v ] ) => {
      const delta = float( 1 / 60 ).mul( timeScale ).toVar(); // uses fixed delta to consistant result
      const pn = vec3(0).toVar();
      pn.addAssign( p.add(v.mul( delta )) );
      If(pn.length().greaterThan(6), ()=>{
        pn.divAssign(pn.length());
      });

      return pn;
  });

  const iterate = Fn(()=>{
    const p0 = p0_.element(instanceIndex);
    const p1 = p1_.element(instanceIndex);
    const v0 = v0_.element(instanceIndex);
    const v1 = v1_.element(instanceIndex);

    p0.assign(p1);
    v0.assign(v1);

    const force = computeForce(p0);
    v1.assign(computeVelocity(v0,force));
    p1.assign(computePosition(p0,v1));
  });
  iterateCompute = iterate().compute( count );

  const update = Fn( () => {
    const p0 = p0_.element(instanceIndex);
    const p1 = p1_.element(instanceIndex);
    return p0.add(p1.sub(p0).mul(lambda));
  } );

  material.positionNode = update();
  material.colorNode = Fn( () => {
    const l = length( positionLocal );
    If( l.greaterThan( 0.5 ), ()=>Discard());
    // return vec4(1,0,0,1);
    const velocity = v1_.toAttribute();
    const speed = velocity.length();
    const colorMix = speed.div( maxSpeed ).smoothstep( 0, 0.5 );
    const finalColor = mix( colorA, colorB, colorMix );

    return vec4( finalColor, 1 );
  } )();

  material.scaleNode = particleMassMultiplier.mul( scale );

  // mesh
  const geometry = new THREE.PlaneGeometry( 1, 1 );
  const mesh = new THREE.InstancedMesh( geometry, material, count );
  mesh.frustumCulled = false;
  scene.add( mesh );

  // debug
  const gui = new GUI();
  gui.add( params, 'eyeSep', 0.001, 2, 0.001 ).name('Eye Distance').onChange( function ( value ) {
    stereo.stereo.eyeSep = value;
  } );

  gui.add( TIME_SCALE, 'value', 0.00001, 0.1, 0.001 ).name( 'Time Scale' );
  gui.add( { v: attractorMass.value.toString().length - 1 }, 'v', 1, 10, 1 ).name('Attractor Mass').onChange( value => attractorMass.value = Number( `1e${value}` ) );
  gui.add( { v: particleGlobalMass.value.toString().length - 1 }, 'v', 1, 10, 1 ).name('Particle Mass').onChange( value => particleGlobalMass.value = Number( `1e${value}` ) );
  // gui.add( maxSpeed, 'value', 0, 10, 0.01 ).name( 'maxSpeed' );
  // gui.add( velocityDamping, 'value', 0, 0.1, 0.001 ).name( 'velocityDamping' );
  gui.add( spinningStrength, 'value', 0, 10, 0.01 ).name( 'Rotational Force' );
  gui.add( scale, 'value', 0.001, 0.02, 0.001 ).name( 'Particle Size' );
  // gui.add( boundHalfExtent, 'value', 0, 20, 0.01 ).name( 'boundHalfExtent' );

  const guiColorA = gui.addColor( {colorA: colorA.value.getHexString( THREE.SRGBColorSpace )}, 'colorA' ).onChange( value => colorA.value.set( value ) );
  const guiColorB = gui.addColor( {colorB: colorB.value.getHexString( THREE.SRGBColorSpace )}, 'colorB' ).onChange( value => colorB.value.set( value ) );

  const randomColor = ()=>{
    guiColorA.setValue(getRandomHexColor());
    guiColorB.setValue(getRandomHexColor());
  };

  gui.add( {'Random Color':randomColor}, 'Random Color' );
  gui.add( { reset }, 'reset' );

}

function onWindowResize() {
  const [canvasWidth,canvasHeight] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));
  camera.aspect = canvasWidth / canvasHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( canvasWidth, canvasHeight );
}

let ti = 0;

async function animate() {
  stats.update();
  time_i.value = performance.now();
  const delta = (time_i.value - time_0)*TIME_SCALE.value;
  time_0 = time_i.value;

  lambda.value = lambda.value+delta;
  // lambda.value = Math.min(lambda.value+delta,1);
  if(lambda.value>=1){
    // console.log('iterate')
    // renderer.compute( iterateCompute );
    lambda.value = 0.001;
  }
  // lambda.value = Math.min(lambda.value+delta,1);

  // controls.update();
  // renderer.computeAsync( updateCompute );
  renderer.render( scene, camera );
  // postProcessing.render();

  // console.log(lambda.value)


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
    width: 300px;
  }
</style>
