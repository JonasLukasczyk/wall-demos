<script setup>

import { onMounted, onUnmounted, ref, reactive } from 'vue';

const canvas = ref(null);

import * as THREE from 'three/webgpu';

import { length, select, float, If, PI, color, cos, instanceIndex, Loop, mix, mod, sin, storage, Fn, uint, uniform, uniformArray, hash, vec2, vec3, vec4, sqrt, log, normalize, modelViewMatrix, dot, positionLocal, Discard, positionViewDirection,modelWorldMatrix,positionWorldDirection,materialRotation,rotate,cameraProjectionMatrix,cameraProjectionMatrixInverse,diffuseColor, modelViewProjection, positionWorld,positionView,ViewportDepthNode,texture,cross,mat2,mat3,mat4,abs,storageObject,floor,fract,mul,pow,atan2,cameraNormalMatrix,cameraPosition,exp,uvec2,textureStore } from 'three/tsl';
import Stats from 'three/addons/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


const perlin_map = Fn( ( [ value, old_lo, old_hi, new_lo, new_hi ] ) => {

    return value.sub( old_lo ).mul( new_hi.sub( new_lo ) ).div( old_hi.sub( old_lo ) ).add( new_lo );

  } );

  const perlin_hash = Fn( ( [ x ] ) => {
    return fract( sin( x ).mul( 43758.5453123 ) );
  } );

  const perlin_gradient = Fn( ( [ cell ] ) => {

    const h_i = float( perlin_hash( cell.x ) );
    const h_j = float( perlin_hash( cell.y.add( pow( h_i, 3.0 ) ) ) );
    const h_k = float( perlin_hash( cell.z.add( pow( h_j, 5.0 ) ) ) );
    const ii = float( perlin_map( fract( h_i.add( h_j ).add( h_k ) ), 0.0, 1.0, - 1.0, 1.0 ) );
    const jj = float( perlin_map( fract( h_j.add( h_k ) ), 0.0, 1.0, - 1.0, 1.0 ) );
    const kk = float( perlin_map( h_k, 0.0, 1.0, - 1.0, 1.0 ) );

    return normalize( vec3( ii, jj, kk ) );
  } );

  const perlin_fade = Fn( ( [ t ] ) => {

    const t3 = float( t.mul( t ).mul( t ) );
    const t4 = float( t3.mul( t ) );
    const t5 = float( t4.mul( t ) );

    return mul( 6.0, t5 ).sub( mul( 15.0, t4 ) ).add( mul( 10.0, t3 ) );
  } );

  const perlin_noise = Fn( ( [ coord ] ) => {
    const cell = vec3( floor( coord ) );
    const unit = vec3( fract( coord ) );
    const unit_000 = vec3( unit );
    const unit_100 = vec3( unit.sub( vec3( 1.0, 0.0, 0.0 ) ) );
    const unit_001 = vec3( unit.sub( vec3( 0.0, 0.0, 1.0 ) ) );
    const unit_101 = vec3( unit.sub( vec3( 1.0, 0.0, 1.0 ) ) );
    const unit_010 = vec3( unit.sub( vec3( 0.0, 1.0, 0.0 ) ) );
    const unit_110 = vec3( unit.sub( vec3( 1.0, 1.0, 0.0 ) ) );
    const unit_011 = vec3( unit.sub( vec3( 0.0, 1.0, 1.0 ) ) );
    const unit_111 = vec3( unit.sub( 1.0 ) );
    const c_000 = vec3( cell );
    const c_100 = vec3( cell.add( vec3( 1.0, 0.0, 0.0 ) ) );
    const c_001 = vec3( cell.add( vec3( 0.0, 0.0, 1.0 ) ) );
    const c_101 = vec3( cell.add( vec3( 1.0, 0.0, 1.0 ) ) );
    const c_010 = vec3( cell.add( vec3( 0.0, 1.0, 0.0 ) ) );
    const c_110 = vec3( cell.add( vec3( 1.0, 1.0, 0.0 ) ) );
    const c_011 = vec3( cell.add( vec3( 0.0, 1.0, 1.0 ) ) );
    const c_111 = vec3( cell.add( 1.0 ) );
    const wx = float( perlin_fade( unit.x ) );
    const wy = float( perlin_fade( unit.y ) );
    const wz = float( perlin_fade( unit.z ) );
    const x000 = float( dot( perlin_gradient( c_000 ), unit_000 ) );
    const x100 = float( dot( perlin_gradient( c_100 ), unit_100 ) );
    const x001 = float( dot( perlin_gradient( c_001 ), unit_001 ) );
    const x101 = float( dot( perlin_gradient( c_101 ), unit_101 ) );
    const x010 = float( dot( perlin_gradient( c_010 ), unit_010 ) );
    const x110 = float( dot( perlin_gradient( c_110 ), unit_110 ) );
    const x011 = float( dot( perlin_gradient( c_011 ), unit_011 ) );
    const x111 = float( dot( perlin_gradient( c_111 ), unit_111 ) );
    const y0 = float( mix( x000, x100, wx ) );
    const y1 = float( mix( x001, x101, wx ) );
    const y2 = float( mix( x010, x110, wx ) );
    const y3 = float( mix( x011, x111, wx ) );
    const z0 = float( mix( y0, y2, wy ) );
    const z1 = float( mix( y1, y3, wy ) );
    return mix( z0, z1, wz );
  } );

let time_0 = 0;
const time_i = uniform(0);

let camera, scene, renderer, controls, updateCompute, stats;

const lightPosX = 2;
const lightPosY = 2;
const lightPosZ = 2;

let lightCamera;

let renderTarget, quad;

const MaterialFactory = {

  uniforms: {
    vortex_rotation_radius: uniform(4)
  },

  computeHeight: null,

  positionNode: Fn( () => {


    // compute random sample on unit disk (accepted bias towards center)
    // const randX = fract( sin( dot( vec2(instanceIndex,instanceIndex), vec2( 12.9898, 78.233 ) ) ).mul( 43758.5453 ) );
    // const randY = fract( sin( dot( vec2(instanceIndex,instanceIndex+1), vec2( 12.9898, 78.233 ) ) ).mul( 43758.5453 ) );
    const randX = hash( instanceIndex );
    const randY = hash( instanceIndex.add( 1 ) );
    const r = randX.mul(2*3.1415);
    const uv = vec2(
      randY.mul(cos(r)),
      randY.mul(sin(r))
    );
    const uvn = uv.mul(0.5).add(0.5);

    const h = texture(MaterialFactory.shadowTexture,uvn).x;
    return vec3(uv.x,h.mul(-1),uv.y);

    // // compute inverted distance to center
    // const d = length(uv);
    // const di = float(1).sub(d);

    // // compute rotation (faster closer to center)
    // const phi = time_i.mul(0.1).mul(di.pow(MaterialFactory.uniforms.vortex_rotation_radius));
    // // const phi = time_i.mul(0.99).mul(d.pow(MaterialFactory.uniforms.vortex_rotation_radius));

    // const RM = mat3(
    //   cos(phi), 0, sin(phi),
    //   0, 1, 0,
    //   sin(phi).mul(-1), 0, cos(phi)
    // );
    // const RM2 = mat2(
    //   cos(phi), sin(phi),
    //   sin(phi).mul(-1), cos(phi)
    // );

    // return pos_funnel;

    // // compute rotated uv
    // const uvr = RM2.mul(uv);
    // // const y = float(-0.01).div(d);
    // const dr = d.mul(10);
    // const randZ = hash( instanceIndex.add( 2 ) );
    // const y = float(-0.1).mul(exp(pow(dr,2).mul(-1))).add(randZ.mul(0.01));

    // const pos_funnel = vec3(uvr.x,y,uvr.y);

    // return pos_funnel;

    // const d_pos_funnel = float(0.1).div(d.pow(2));
    // // const pos_tangent = vec3(
    // //   1,
    // //   d_pos_funnel,
    // //   0
    // // );
    // // const pos_normal = normalize((cross(vec3(0,0,1),pos_tangent)));
    // // const pos_normal_r = RM.mul(pos_normal);

    // // noise
    // const polar_uv = vec2(
    //   atan2(uvr.y,uvr.x).div(2*3.1415),
    //   length(uvr.xy)
    // );
    // polar_uv.y.mulAssign(4);
    // const n = perlin_noise(vec3(polar_uv,0.0).mul(20)).mul(0.5).add(0.5).mul(d);


    // return vec3(pos_funnel.add(vec3(0,1,0).mul(n).mul(0.1)));
    // return pos_funnel.add(pos_normal_r.mul(0.15));
    // return vec4(pos_funnel,phi);

    // create position
    // return pos_funnel.add(pos_normal.mul(0.1));
    // return vec3(polar_uv.x,0,polar_uv.y);
  } ),

  depthNode: Fn( () => {
    const l = length( positionLocal.xy );
    If( l.greaterThan( 1 ), ()=>Discard());

    const pos = MaterialFactory.positionNode();
    return vec4(pos.mul(vec3(0.5,-0.5,0.5)).add(0.5),1);
  } ),

  colorNode: Fn( () => {
    const l = length( positionLocal.xy );
    If( l.greaterThan( 1 ), ()=>Discard());

    const randX = hash( instanceIndex );
    const randY = hash( instanceIndex.add( 1 ) );
    const r = randX.mul(2*3.1415);
    const uv = vec2(
      randY.mul(cos(r)),
      randY.mul(sin(r))
    );
    const uvn = uv.mul(0.5).add(0.5);

    const h = texture(MaterialFactory.shadowTexture,uvn).y;
    return vec4(1,h,0,1);

    // const pos = MaterialFactory.positionNode();

    // // const randX = hash( instanceIndex.add( 1 ) );
    // const randX = fract( sin( dot( vec2(instanceIndex,instanceIndex), vec2( 12.9898, 78.233 ) ) ).mul( 43758.5453 ) );

    // const diffuse = vec3(
    //   randX.mul(0.3).add(0.3)
    // );

    // const z = sqrt(
    //   float(1)
    //     .sub(
    //       positionLocal.x.mul(positionLocal.x)
    //     ).sub(
    //       positionLocal.y.mul(positionLocal.y)
    //     )
    // );
    // const normal_view = vec4(positionLocal.x,positionLocal.y,z,1);


    // const f = normalize(cameraPosition.sub(pos));
    // const u = vec3(0,1,0);
    // const r = normalize(cross(f, u));

    // const RM = mat3(
    //   r,u,f
    // );

    // const normal_world = RM.mul(normal_view);

    // // return vec4(
    // //   normal_world.xxx,
    // //   1
    // // );
    // return vec4(
    //   vec3(dot(vec3(1,0,0),normal_world)).add(0.3),
    //   1
    // );
    // return vec4(
    //   normal_world,
    //   1
    // );
    // return vec4(
    //   dir,
    //   1
    // );
    // return vec4(
    //   vec3(dot(world_up.xyz,vec3(1,0,0))),
    //   1
    // );
    // return vec4(
    //   world_up.xyz.dot(normal_view.xyz),
    //   1
    // );
    // const d = length(pos.xz);

    // const d_pos_funnel = float(0.01).div(d.pow(2));

    // const pos_tangent = vec3(
    //   1,
    //   d_pos_funnel,
    //   0
    // );


    // const pos_normal = RM.mul(normalize(cross(vec3(0,0,1),pos_tangent)));
    // // const pos_normal = vec3(
    // //   float(-0.01).div(d.pow(2)),1,0
    // // );
    // // const pos_normal = normalize(vec3(
    // //   float(0.01).div(d.pow(2)),1,0
    // // ));

    // return vec4(pos_normal,1);
    // return vec4(pos_tangent,1);
    // return vec4(d_pos_funnel,0,0,1);

    // // dir light
    // const lightPos = vec3(lightPosX,lightPosY,lightPosZ);
    // const lightDir = normalize(lightPos.mul(-1));
    // const lightRight = normalize(cross(lightDir,vec3(0,1,0)));
    // const lightUp = normalize(cross(lightDir,lightRight));

    // const pos = MaterialFactory.positionNode();


    // const pos_light_plane = pos.sub(dot(pos.sub(lightPos),lightDir).mul(lightDir));

    // const uvl = vec2(
    //   dot(lightRight,pos),
    //   dot(lightUp,pos),
    // ).add(1).mul(0.5);

    // const lPos = texture( renderTarget.textures[ 0 ], uvl ).xyz.add(-0.5).mul(vec3(2,-2,2));
    // const d0 = length(lPos.xyz.sub(lightPos)).add(0.01)
    // const d1 = length(pos.xyz.sub(lightPos))

    // // const inShade =

    // return vec4(select(d0.lessThan(d1),1,0.2),0,0,1);
    // return vec4(lPos.rgb,1);
    // return vec4(pos.rgb,1);
    // return vec4(select(lPos.z.lessThan(0.2),1,0.2),0,0,1);
    // return vec4(select(lPos.x.lessThan(0.2),1,0.2),0,0,1);
    // return vec4(select(pos.x.lessThan(5).and(pos.z.lessThan(5)),1,0.2),0,0,1);
    // return vec4(0,select(length(lPos).lessThan(0.2),1,0.2),0,1);
    // return vec4(0,length(pos).mul(0.1),0,1);
    // return select(d1.greaterThan(d0),vec4(0,1,0,1),vec4(1,0,0,1))
    // return vec4(d1.div(100),0,0,1);
    // return vec4(length(pos.xyz.sub(lPos.xyz)).div(10),0,0,1);
    // return vec4(pos.rgb,1);
    // return vec4(uvl,0,1);
    // return vec4(1,0,0,1);
    // return vec4(select(lPos.x.lessThan(0.1),1,0.2),0,0,1);
    // return vec4(select(d1.lessThan(10),1,0.2),0,0,1);
    // return vec4(select(d0.lessThan(10),1,0.2),0,0,1);
    // // return vec4(select(lPos.x.lessThan(5).and(lPos.z.lessThan(5)),1,0.2),0,0,1);
    // return vec4(d1.div(100),0,0,1);
    // return vec4(ddd,0,0,1);
    // return vec4(uvl,0,1);

    // return vec4(uvl.add(2).add(1).div(200),0,1);
    // return vec4(pos_light_plane.xxx.div(100),1);






    // const col = texture( renderTarget.textures[ 0 ], positionLocal.xy  );

    // return vec4(positionLocal.xy,0,1);

    // return vec4(col.xyz,1);



  //   return vec4(vec3(1,0,0),1);
  //   const randX = hash( instanceIndex );
  //   const randY = hash( instanceIndex.add( 2 ) );
  //   const randZ = hash( instanceIndex.add( 3 ) );

  //   const uv = vec2(randX.mul(2.0).add(-1),randY.mul(2.0).add(-1));

  //   const d = float(1.).div(sqrt(length(uv)));
  //   d.mulAssign(d.mul(d));
  //   // const d = log(length(uv).add(0.5).mul(5));
  //   let r = time_i.mul(0.001).mul(d.add(-1.0));


  //   const uvr = vec2(
  //     cos(r).mul(uv.x).add(sin(r).mul(uv.y).mul(-1)),
  //     sin(r).mul(uv.x).add(cos(r).mul(uv.y))
  //   );

  //   const pos = vec3(uvr.x.mul(50),d.mul(-0.5),uvr.y.mul(50));

  //   const res = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(pos,1)));

  //   // return vec4( vec3(0.3),1 );

  //   // return vec4( vec3(modelViewProjection.w.add(1)),1 );
  //   // return vec4( vec3(cameraLogDepth),1 );
  // // return vec4(pos.x,0,0,1);
  //   return vec4(res.z.div(res.w).div(10),0,0,1);

  //   const z = sqrt(
  //     float(1)
  //       .sub(
  //         uv.x.mul(uv.x)
  //       ).sub(
  //         uv.y.mul(uv.y)
  //       )
  //   );

  //   const normal = modelViewMatrix.mul(vec4(uv.x,uv.y,z,1));

  //   // const light_dir = vec4(0,1,0,1);
  // //   const alpha = select( l.lessThan( 1.0 ), 1, 0 );

  // //   // return select( l.lessThan( 1.0 ), vec4( 1,0,0,1 ), vec4( 0,0,0,0 ) );
  // //   // return vec4( dot(vec3(1,0,0),normal),0,0,1 );
  //   return vec4( normal.xyz,1 );
  //   // return vec4( dot(normal.xyz,light_dir.xyz),0,0,1 );
  //   // return vec4( 1,0,0,1 );
  //   // return select( l.lessThan( 1.0 ), vec4( 1,0,0,1 ), vec4( 0,0,0,0 ) );

  } ),

  createDepthMaterial: ()=>{
    const material = new THREE.SpriteNodeMaterial( {  } );

    // 1024 1024
    const depthArray = new Float32Array( 1024 * 1024 );
    const depthBufferAttribute = new THREE.StorageBufferAttribute( depthArray, 1 );
    MaterialFactory.depthStorage = storageObject( depthBufferAttribute, 'float', depthBufferAttribute.count ).label( 'DEPTH' );

    material.positionNode = MaterialFactory.positionNode();
    material.colorNode = MaterialFactory.depthNode();
    material.scaleNode = float(0.008);

    return material;
  },

  createColorMaterial: ()=>{
    const material = new THREE.SpriteNodeMaterial( {  } );

    material.positionNode = MaterialFactory.positionNode();
    material.colorNode = MaterialFactory.colorNode();
    material.scaleNode = float(0.0004);

    return material;
  },

};


function init() {
  time_0 = Date.now()*0.001;

  stats = new Stats();
  canvas.value.parentNode.appendChild( stats.dom );

  const [canvasWidth,canvasHeight] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));

  camera = new THREE.PerspectiveCamera( 25, canvasWidth / canvasHeight, 0.01, 10 );
  camera.position.set(1,1,0);

  const cwidth = 2;
  const cheight = 2;
  lightCamera = new THREE.OrthographicCamera( cwidth / - 2, cwidth / 2, cheight / 2, cheight / - 2, 1, 20 );
  lightCamera.position.x = lightPosX;
  lightCamera.position.y = lightPosY;
  lightCamera.position.z = lightPosZ;
  // lightCamera.position.y = 10;
  lightCamera.lookAt(new THREE.Vector3(0,0,0));

  scene = new THREE.Scene();
  scene.overrideMaterial_ = MaterialFactory.createDepthMaterial();

  renderer = new THREE.WebGPURenderer( { antialias: true, canvas: canvas.value } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( canvasWidth, canvasHeight );
  renderer.setAnimationLoop( animate );
  renderer.setClearColor( '#000000' );


  controls = new OrbitControls( camera, renderer.domElement );
  controls.minDistance = 0.001;
  controls.maxDistance = 3;
  // controls = new OrbitControls( camera, renderer.domElement );
//   controls.target = new THREE.Vector3(50,0,50);
//   controls.enableDamping = true;

  window.addEventListener( 'resize', onWindowResize );

  // height field
  const heightRes = 1024;
  const heightCount = heightRes*heightRes;

  const heightTexture = new THREE.StorageTexture( heightRes, heightRes );
  heightTexture.type = THREE.FloatType;
  MaterialFactory.shadowTexture = new THREE.StorageTexture( heightRes, heightRes );
  MaterialFactory.shadowTexture.type = THREE.FloatType;
  MaterialFactory.computeHeight = Fn( () => {
    const posX = instanceIndex.modInt( heightRes );
    const posY = instanceIndex.div( heightRes );
    const indexUV = uvec2( posX, posY );
    const uvn = vec2(posX,posY).div(heightRes);
    const uv = uvn.mul(2).sub(1);

    // compute inverted distance to center
    const d = length(uv);
    const di = float(1).sub(d);

    // compute rotation (faster closer to center)
    const phi = time_i.mul(0.1).mul(di.pow(MaterialFactory.uniforms.vortex_rotation_radius));

    const RM = mat3(
      cos(phi), 0, sin(phi),
      0, 1, 0,
      sin(phi).mul(-1), 0, cos(phi)
    );
    const RM2 = mat2(
      cos(phi), sin(phi),
      sin(phi).mul(-1), cos(phi)
    );

    // compute rotated uv
    const uvr = RM2.mul(uv);
    // const y = float(-0.01).div(d);
    const dr = d.mul(3);
    // const randZ = hash( instanceIndex.add( 2 ) );
    const y = float(1).mul(exp(pow(dr,2).mul(-1)))
    // const h = float(-0.1).mul(exp(pow(dr,2).mul(-1)))
    // .add(randZ.mul(0.01));

    // const pos_funnel = vec3(uvr.x,y,uvr.y);

    const n = perlin_noise(vec3(uv,0.0).mul(10)).mul(0.5).add(0.5);

    // const h = -2.0;
    // const h = n;
    const h = y.add(n.mul(0.2));
    textureStore( heightTexture, indexUV, vec4( vec3(h), 1 ) ).toWriteOnly();
    // textureStore( heightTexture, indexUV, vec4( vec3(uvr,0), 1 ) ).toWriteOnly();
  } )().compute( heightCount );

  MaterialFactory.computeShadow = Fn( () => {
    const posX = instanceIndex.modInt( heightRes );
    const posY = instanceIndex.div( heightRes );
    const indexUV = uvec2( posX, posY );
    const uvn = vec2(posX,posY).div(heightRes);
    const uv = uvn.mul(2).sub(1);


    const h = texture(heightTexture,uvn).x;

    const p0 = vec3(uvn,h);
    const p_delta = vec3(0.0,0.05,0.1);
    const shadow = float(0).toVar();

    Loop( { start: float( 1 ), end: float( 4 ) }, ( { i } ) => {
      const sp = p0.add(p_delta.mul(i));
      const sh = texture(heightTexture,sp.xy).x;
      If( sp.z.lessThan( sh ), () => {
      // If( sh.lessThan( sp.z ), () => {
        shadow.addAssign(1);
      } );
    } );


    // const h0 = texture(heightTexture,(p0.add(p_delta).mul(1).).x;

    textureStore( MaterialFactory.shadowTexture, indexUV, vec4(h,select(shadow.lessThan(0.5),1,0),0,1) ).toWriteOnly();
    // textureStore( MaterialFactory.shadowTexture, indexUV, vec4(h,select(h.lessThan(0.5),1,0.2),0,1) ).toWriteOnly();
    // textureStore( shadowTexture, indexUV, vec4(h,select(shadow.greaterThan(0.5),1,0),0,1) ).toWriteOnly();
    // textureStore( heightTexture, indexUV, vec4( vec3(uvr,0), 1 ) ).toWriteOnly();
  } )().compute( heightCount );

  // const heightBufferAttribute = new THREE.StorageBufferAttribute( new Float32Array(heightCount), 1 );
  // const heightStorage = storage( heightBufferAttribute, 'float', heightBufferAttribute.count ).label( 'heightStorage' );
  // const heightRead = storageObject( heightBufferAttribute, 'float', heightBufferAttribute.count ).toReadOnly();
  // MaterialFactory.computeHeight = Fn( () => {
  //   const posX = instanceIndex.modInt( heightRes );
  //   const posY = instanceIndex.div( heightRes );
  //   heightStorage.element( instanceIndex ).assign( posX );
  // } )().compute( heightRes*heightRes );

  // particles
  const count = 2000000;
  // const count = 0 ? 20000000 : 500000;
//   const count = 1 ? 8000000 : 200000;
//   const material = new THREE.MeshBasicNodeMaterial( {  } );
  const material = MaterialFactory.createColorMaterial();

  // create single triangle
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [-1,-1,0,3,-1,0,-1,3,0] ), 3 ) );
  const mesh = new THREE.InstancedMesh( geometry, material, count );
  mesh.frustumCulled = false;
  scene.add( mesh );

  {
    const mesh = new THREE.Mesh( new THREE.IcosahedronGeometry(0.1,1), new THREE.MeshBasicMaterial({color:'#00ff00'}) );
    mesh.frustumCulled = false;
    mesh.position.x = lightPosX;
    mesh.position.y = lightPosY;
    mesh.position.z = lightPosZ;
    scene.add( mesh );
  }


  renderTarget = new THREE.RenderTarget(
    2048,
    2048,
    {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter
    }
  );

  // const size = 1024*1024;
  // const data = new Float32Array( 4 * size );
  // renderTarget.textures[0] = new THREE.DataTexture( data, 1024, 1024, THREE.RGBAFormat, THREE.FloatType);



  const materialFX = new THREE.MeshBasicNodeMaterial();
  // materialFX.colorNode = texture( heightTexture );
  materialFX.colorNode = Fn( ()=>{

    const uv = positionLocal.xy.add(1).mul(0.5);
    const test = texture(MaterialFactory.shadowTexture,uv).rgb;
    return vec4(test,1);
    return vec4(select(test.lessThan(-1),1,0.3),0,0,1);

    return vec4(test,0,0,1);
    const angle = atan2(positionLocal.y,positionLocal.x).div(2*3.1415);
    const d = length(positionLocal.xy);
    const polar_uv = vec2(angle.mul(1),d.mul(d));



    const n = perlin_noise(vec3(polar_uv,0.0).mul(20)).mul(0.5).add(0.5);

  // return vec4(vec3(n),1);
    return vec4(vec3(n.mul(0.5).add(0.5)),1);
    return vec4(select(n.lessThan(0.7),1,0),0,0,1);
    return vec4(uv,0,1);
  })();


  quad = new THREE.QuadMesh( materialFX );


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

  await renderer.compute( MaterialFactory.computeHeight );
  await renderer.compute( MaterialFactory.computeShadow );
  await renderer.render( scene, camera );
  // quad.render( renderer );

  // quad.render( renderer );

  // scene.overrideMaterial = scene.overrideMaterial_;
  // renderer.setRenderTarget( renderTarget );
  // await renderer.render( scene, camera );

  // renderer.setRenderTarget( null );
  // scene.overrideMaterial = null;
  // await renderer.render( scene, camera );

  // quad.render( renderer );

  // renderer.setRenderTarget( null );
  // scene.overrideMaterial = null;
  // await renderer.render( scene, camera );

  // renderer.setRenderTarget( null );
  // await renderer.render( scene, camera );
  // quad.render( renderer );

}



/////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////

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
// //     return vec3( 0,1,0 );
// //   } )().compute(particleCount);
//   particleMaterial.positionNode = positionBuffer.toAttribute();
//   particleMaterial.colorNode = Fn( () => {
//     return vec4( 0,1,0,1 );
//   } );
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
