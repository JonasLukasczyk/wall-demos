<script setup>

import { onMounted, onUnmounted, ref, reactive } from 'vue';
const canvas = ref(null);

import * as THREE from 'three/webgpu';

import { float, If, PI, color, cos, instancedArray, instanceIndex, Loop, mix, mod, sin, Fn, uint, uniform, uniformArray, hash, vec2, vec3, vec4, storage, storageObject, attributeArray, positionLocal, Discard, length, uv} from 'three/tsl';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { stereoPass } from '../../node_modules/three/examples/jsm/tsl/display/StereoPassNode.js';

import { io } from "socket.io-client";

let camera, scene, renderer, controls, updateCompute, iterateCompute;
let stereo, postProcessing;
const params = {
  eyeSep: 0.01,
};
let time_0 = performance.now();
const time_i = uniform(0);
const TIME_SCALE = uniform(0.01);
const lambda = uniform(0);

function init() {
  const socket = io('localhost:4444');
  socket.on('update',data=>{
    for(let key in data){
      switch (key) {
        case 'TIME_SCALE':
          TIME_SCALE.value=data[key];
          break;
        case 'eyeSep':
          params.eyeSep=data[key];
          break;
        case 'velocityDamping':
          velocityDamping.value=data[key];
          break;
        case 'scale':
          scale.value=data[key];
          break;
        case 'color':
          guiColorA.setValue(data[key][0]);
          guiColorB.setValue(data[key][1]);
          break;
      }
    }
  })
  console.log(socket)

  const [canvasWidth,canvasHeight] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));

				camera = new THREE.PerspectiveCamera( 25, window.innerWidth / window.innerHeight, 0.1, 100 );
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

				renderer = new THREE.WebGPURenderer( { antialias: true,canvas:canvas.value } );
				renderer.setPixelRatio( window.devicePixelRatio );
				renderer.setSize( window.innerWidth, window.innerHeight );
				renderer.setClearColor( '#000000' );

				controls = new OrbitControls( camera, renderer.domElement );
				controls.enableDamping = true;
				controls.minDistance = 0.1;
				controls.maxDistance = 50;

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
				const attractorsLength = uniform( attractorsPositions.array.length, 'uint' );


				// particles

				const count = Math.pow( 2, 21 );

				const attractorMass = uniform( Number( `1e${7}` ) );
				const particleGlobalMass = uniform( Number( `1e${4}` ) );
				const timeScale = uniform( 1 );
				const spinningStrength = uniform( 2.75 );
				const maxSpeed = uniform( 8 );
				const gravityConstant = 6.67e-11;
				const velocityDamping = uniform( 0.1 );
				const scale = uniform( 0.004 );
				const colorA = uniform( color( '#5900ff' ) );
				const colorB = uniform( color( '#ffa575' ) );

				const p0_ = instancedArray( count, 'vec3' );
				const p1_ = instancedArray( count, 'vec3' );
				const v0_ = instancedArray( count, 'vec3' );
				const v1_ = instancedArray( count, 'vec3' );

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
    //   If(pn.length().greaterThan(1), ()=>{
    //     pn.assign(vec3(
				// 	hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) ),
				// 	hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) ),
				// 	hash( instanceIndex.add( uint( Math.random() * 0xffffff ) ) )
				// ).sub( 0.5 ).mul( vec3( 5, 0.2, 5 ) ));
    //     // pn.divAssign(pn.length());
    //   });

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

				// nodes

        const material = new THREE.SpriteNodeMaterial( { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } );

        const update = Fn( () => {
          const p0 = p0_.element(instanceIndex);
          const p1 = p1_.element(instanceIndex);
          return p0.add(p1.sub(p0).mul(lambda));
        } );
        material.positionNode = update();

				material.colorNode = Fn( () => {
				  const l = length( vec2(-0.5).add(uv()) );
          If( l.greaterThan( 0.5 ), ()=>Discard());

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


				postProcessing = new THREE.PostProcessing( renderer );
        stereo = stereoPass( scene, camera );
        postProcessing.outputNode = stereo;

				// debug
        const getRandomHexColor = () => `#${((1<<24)*Math.random()|0).toString(16).padStart(6, '0')}`;
        const randomColor = ()=>{
          const a = getRandomHexColor();
          const b = getRandomHexColor();
          guiColorA.setValue(a);
          guiColorB.setValue(b);
          socket.emit('update',{'color':[a,b]});
        };

				const gui = new GUI();
				gui.add( params, 'eyeSep', 0.001, 0.03, 0.0001 ).name('Eye Distance').onChange( function ( value ) {
          stereo.stereo.eyeSep = value;
          socket.emit('update',{'eyeSep':value});
        } ).listen();
        gui.add( TIME_SCALE, 'value', 0.001, 0.05, 0.001 ).name( 'Time Scale' ).onChange( function ( value ) {
          socket.emit('update',{'TIME_SCALE':value});
        }).listen();
				// gui.add( { attractorMassExponent: attractorMass.value.toString().length - 1 }, 'attractorMassExponent', 1, 10, 1 ).onChange( value => attractorMass.value = Number( `1e${value}` ) );
				// gui.add( { particleGlobalMassExponent: particleGlobalMass.value.toString().length - 1 }, 'particleGlobalMassExponent', 1, 10, 1 ).onChange( value => particleGlobalMass.value = Number( `1e${value}` ) );
				// gui.add( maxSpeed, 'value', 0, 10, 0.01 ).name( 'maxSpeed' );
				gui.add( velocityDamping, 'value', 0, 0.1, 0.001 ).name( 'velocityDamping' ).onChange( function ( value ) {
          socket.emit('update',{'velocityDamping':value});
        }).listen();
				// gui.add( spinningStrength, 'value', 0, 10, 0.01 ).name( 'spinningStrength' );
				gui.add( scale, 'value', 0, 0.015, 0.001 ).name( 'scale' ).onChange( function ( value ) {
          socket.emit('update',{'scale':value});
        }).listen();
				const guiColorA = gui.addColor( {colorA: colorA.value.getHexString( THREE.SRGBColorSpace )}, 'colorA' ).onChange( value => colorA.value.set( value ) ).listen();
        const guiColorB = gui.addColor( {colorB: colorB.value.getHexString( THREE.SRGBColorSpace )}, 'colorB' ).onChange( value => colorB.value.set( value ) ).listen();

        gui.add( {'Random Color':randomColor}, 'Random Color' );
				gui.add( { reset }, 'reset' );

				if(!window.location.search)
				  renderer.setAnimationLoop( animate );
				// console.log(params)
				// if(params.includes())

			}

			function onWindowResize() {

				camera.aspect = window.innerWidth / window.innerHeight;
				camera.updateProjectionMatrix();

				renderer.setSize( window.innerWidth, window.innerHeight );

			}

      const time= performance.now();
			async function animate() {
				controls.update();

				time_i.value = performance.now();
        const delta = (time_i.value - time_0)*TIME_SCALE.value;
        time_0 = time_i.value;

        lambda.value = Math.min(1,lambda.value+delta);
        // lambda.value = Math.min(lambda.value+delta,1);
        if(lambda.value>=1){
          // console.log('iterate')
          // renderer.compute( iterateCompute );
  				renderer.compute( iterateCompute );
          lambda.value -= 1;
        }



				// if(performance.now()-time<2000)
  		// 	  renderer.compute( updateCompute );
				// renderer.render( scene, camera );
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
    width: 300px;
  }
</style>
