<script setup>

import { onMounted, onUnmounted, ref, reactive } from 'vue';
import * as THREE from 'three';
import {io} from "socket.io-client";

const iProps = reactive({
  eye: {type:'f',value:0.01, left:-0.01, right:0.01},
  connected: false,
  socket: null
});

const vertexShader = `
precision highp float;

in vec3 position;

out vec3 vPos;

void main(){
    vPos = position;
    gl_Position = vec4( position, 1.0 );
}

`;
const fragmentShader = `

precision highp float;

in vec3 vPos;

out vec4 fragColor;

#define TMAX 40.0
#define DOF_STEPS 4
#define DOF_STEPSF float(DOF_STEPS)

uniform vec2 uResolution;
uniform vec3 uRayOrigin;
uniform vec3 uRayTarget;

uniform float uFocusDistance;
uniform float uMaxAAaDOF;
uniform float uAperatureSize;

uniform float uEye;

//------------------------------------------------------------------
float dot2( in vec2 v ) { return dot(v,v); }
float dot2( in vec3 v ) { return dot(v,v); }
float ndot( in vec2 a, in vec2 b ) { return a.x*b.x - a.y*b.y; }

float sdPlane( vec3 p ){
	return p.y;
}

float sdSphere( vec3 p, float r ){
    return (length(p)-r);
}

float repeated( vec3 p, float s, float r ){
    vec3 t = p - s*round(p/s);
    return sdSphere(t,r);
}

float sdMandelbulb( vec3 p ){
  vec3 w = p;
  float m = dot(w,w);

  // vec4 trap = vec4(abs(w),m);
  float dz = 1.0;

  for( int i=0; i<4; i++ ){
    dz = 8.*pow(m,3.5)*dz + 1.0;
    float r = length(w);
    float b = 8.0*acos( w.y/r);
    float a = 8.0*atan( w.x, w.z );
    w = p + pow(r,8.0) * vec3( sin(b)*sin(a), cos(b), sin(b)*cos(a) );

    // trap = min( trap, vec4(abs(w),m) );

    m = dot(w,w);
		if( m > 2.0 )break;
  }

  // distance estimation (through the Hubbard-Douady potential)
  return 0.25*log(m)*sqrt(m)/dz;
}

//------------------------------------------------------------------

vec2 opU( vec2 d1, vec2 d2 ){
  return (d1.x<d2.x) ? d1 : d2;
}

//------------------------------------------------------------------

#define ZERO 0

//------------------------------------------------------------------

vec2 map( in vec3 pos ){
    vec2 res = vec2( pos.y, 0.0 );
    // res = opU( res, vec2( sdMandelbulb(pos), 1.0 ));
    res = opU( res, vec2( sdPlane(pos), 1.0 ));
    res = opU( res, vec2( repeated(pos-vec3(0,0.6,0), 1.0, 0.25 ), 2.0 ) );
    // res = opU( res, vec2( sdSphere(pos-uRayTarget, 0.4 ), 2.0 ) );
    return res;
}

vec2 raycast( in vec3 ro, in vec3 rd ){
    float eps = 0.001;
    float t = 0.01;
    float m = -1.0;
    float d = 100.0;
    for(int i=0; i<100; i++ ){
        vec2 res = map( ro+rd*t );
        d = min(d,res.x);
        t += res.x;
        m = res.y;
        if( res.x<eps || t>TMAX ){
            break;
        }
    }

    if(t>TMAX)
      return vec2(t,-1.0);
    else
      return vec2(t,m);
}

// Use the Distance to Objects for Penumbra
float softshadow( in vec3 ro, in vec3 rd, in float mint, in float maxt ){
    float res = 1.0;
    float t = mint;
    for( int i=0; i<16; i++ ){
        float h = map( ro + rd*t ).x;
        if( h<0.001 )
            return 0.0;
        res = min( res, 8.0*h/t );
        t += clamp( h, 0.02, 0.10 );
        if( h<0.001 || t>maxt ) break;
    }
    return clamp( res, 0.0, 1.0 );
}

// Calcualte Normal with Finite Differences
vec3 calcNormal( in vec3 pos ){
    // vec3 eps = vec3( 0.001, 0.0, 0.0 );
    // vec3 nor = vec3(
    //     map(pos+eps.xyy).x - map(pos-eps.xyy).x,
    //     map(pos+eps.yxy).x - map(pos-eps.yxy).x,
    //     map(pos+eps.yyx).x - map(pos-eps.yyx).x );
    // return normalize(nor);

    vec3 n = vec3(0.0);
    for( int i=ZERO; i<4; i++ ){
        vec3 e = 0.5773*(2.0*vec3((((i+3)>>1)&1),((i>>1)&1),(i&1))-1.0);
        n += e*map(pos+0.0005*e).x;
      //if( n.x+n.y+n.z>100.0 ) break;
    }
    return normalize(n);
}

float calcAO( in vec3 pos, in vec3 nor ){
    float occ = 0.0;
    float sca = 1.0;
    for( int i=0; i<5; i++ ){
        float hr = 0.01 + 0.12*float(i)/4.0;
        vec3 aopos =  nor * hr + pos;
        float dd = map( aopos ).x;
        occ += -(dd-hr)*sca;
        sca *= 0.95;
    }
    return clamp( 1.0 - 3.0*occ, 0.0, 1.0 );
}

vec3 render( in vec3 ro, in vec3 rd ){

    // raycast scene
    vec2 res = raycast(ro,rd);
    float t = res.x;
    float m = res.y;

    vec3 pos = ro + t*rd;
    vec3 nor = calcNormal( pos );
    vec3 ref = reflect( rd, nor );

    vec3 col;
    if(m<0.5) {
      col = vec3(1,0,0);
    } else if(m<1.5) {
      float f = mod( floor(6.0*pos.z) * floor(6.0*pos.x), 4.0);
      col = 0.4 + 0.1*f*vec3(0.3,1,1);
    }
    else
      col = vec3(1,0,0);
      // col = uEye > 0 ? vec3(0,1,0) : vec3(1,0,0);

    // float occ = calcAO( pos, nor );

    // float occ = calcAO( pos, nor );
    // float occ = 1.0;
    float occ = calcAO( pos, nor );
    vec3  lig = normalize( vec3(-0.6, 0.7, -0.5) );
    float amb = clamp( 0.5+0.5*nor.y, 0.0, 1.0 );
    float dif = clamp( dot( nor, lig ), 0.0, 1.0 );
    float bac = clamp( dot( nor, normalize(vec3(-lig.x,0.0,-lig.z))), 0.0, 1.0 )*clamp( 1.0-pos.y,0.0,1.0);
    float dom = smoothstep( -0.1, 0.1, ref.y );
    float fre = pow( clamp(1.0+dot(nor,rd),0.0,1.0), 2.0 );
    float spe = pow(clamp( dot( ref, lig ), 0.0, 1.0 ),16.0);

    dif *= softshadow( pos, lig, 0.02, 2.5 );
    dom *= softshadow( pos, ref, 0.02, 10. );

    vec3 lin = vec3(0.0);
    vec3 temp = vec3(0.50,0.70,1.00)*occ;
    vec3 temp2 = 1.20*dif*vec3(1.00,0.85,0.85);
    lin += temp2;
    lin += spe*temp2;
    lin += 0.20*amb*temp;
    lin += 0.30*dom*temp;
    lin += 0.30*bac*vec3(0.25,0.25,0.25)*occ;
    lin += 0.40*fre*vec3(1.00,1.00,1.00)*occ;
    col = col*lin*exp( -t/TMAX*5. );

    return col;

    // return nor;
    // vec3 ref = reflect( rd, nor );

    // material
    // col = 0.2 + 0.2*sin( m*2.0 + vec3(0.0,1.0,2.0) );
    // float ks = 1.0;

    // if( m<1.5 ){
    //     // project pixel footprint into the plane
    //     vec3 dpdx = ro.y*(rd/rd.y-rdx/rdx.y);
    //     vec3 dpdy = ro.y*(rd/rd.y-rdy/rdy.y);

    //     float f = checkersGradBox( 3.0*pos.xz, 3.0*dpdx.xz, 3.0*dpdy.xz );
    //     col = 0.15 + f*vec3(0.05);
    //     ks = 0.4;
    // }

    // lighting
    // float occ = calcAO( pos, nor );

    // vec3 lin = vec3(0.0);

    // col = lin;

    // col = mix( col, vec3(0.7,0.7,0.9), 1.0-exp( -0.0001*t*t*t ) );
  //   }

	return vec3( clamp(col,0.0,1.0) );
}

float random(vec2 co){
    return 1.-2.*fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

mat3 setCamera( in vec3 ro, in vec3 ta, float cr ){
  vec3 cw = normalize(ta-ro);
  vec3 cp = vec3(sin(cr), cos(cr),0.0);
  vec3 cu = normalize( cross(cw,cp) );
  vec3 cv =          ( cross(cu,cw) );
  return mat3( cu, cv, cw );
}

void main(){
    vec2 mo = vec2(0,0);
    float iTime = 0.0;
    float time = 32.0 + iTime*1.5;

    vec2 uv = vPos.xy*0.5+0.5;
    vec2 fragCoord = uv*uResolution;

    // ray
    const float fl = 2.5; // focal length

    vec3 right = normalize(cross(vec3(0,1,0),uRayTarget-uRayOrigin));
    vec3 delta = uEye*right;

    vec3 ro = uRayOrigin+delta;
    vec3 ta = uRayTarget+delta;
    mat3 ca = setCamera( ro, ta, 0.0 );
    vec2 p = (2.0*fragCoord-uResolution.xy)/uResolution.y;
    vec3 rd = ca * normalize( vec3(p,fl) );

    // vec3 col = render(
    //     ro,
    //     rd
    // );

    // float centerFocusDistance = raycast(ro, normalize(uRayTarget-uRayOrigin)).x;
    // vec3 focalPoint = uRayOrigin + centerFocusDistance * (rd);

    float apertureSize = uAperatureSize / 1000.;
    vec3 focalPoint = ro + uFocusDistance * rd;
    vec3 col;
    for(int i=0; i<DOF_STEPS; i++){
        vec3 aperturePoint = ro + apertureSize*(
            vec3(ca[0]*random( exp(float(i)/20.)*uv))
            +
            vec3(ca[1]*random( exp(float(i)/100.)*uv))
        );
        col += render(
            aperturePoint,
            normalize( focalPoint - aperturePoint )
        );
    }
    col /= DOF_STEPSF;
    fragColor = vec4(col,1);
}

`;


// Reference to the container where Three.js will attach the canvas
const canvas = ref(null);

function OrbitControls(element, rayOrigin, rayTarget) {

    const temp = {
      mouseStartX: 0,
      mouseStartY: 0,
      ro: [0,0,0],
      rt: [0,0,0],
      mode: -1,
      isDragging: false
    };

    function pos2LatLon([x, y, z]) {
        const radius = Math.sqrt(x * x + y * y + z * z);
        const lat = Math.acos(y / radius);
        const lon = Math.atan2(z, x);
        return [ lat, lon, radius ];
    }

    function LatLon2Pos(lat, lon, r) {
        const x = r * Math.sin(lat) * Math.cos(lon);
        const z = r * Math.sin(lat) * Math.sin(lon);
        const y = r * Math.cos(lat);
        return [x, y, z];
    }

    const vcross = ([a1,a2,a3],[b1,b2,b3]) => {
       return [ a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1 ];
    }
    const vadd = ([a1,a2,a3],[b1,b2,b3]) => {
       return [ a1+b1, a2+b2, a3+b3 ];
    }
    const vsm = ([a1,a2,a3],s) => {
       return [ a1*s, a2*s, a3*s ];
    }

    // Function to handle mouse down events (start dragging)
    function mouseDown(e) {
        e.preventDefault();
        temp.mouseStartX = e.clientX;
        temp.mouseStartY = e.clientY;

        // Left mouse button for rotate, right for pan
        // temp.mode = e.button === 0 ? 0 : -1;
        temp.mode = e.button === 0 ? 0 : (e.button === 2 ? 1 : -1);

        if (temp.mode === -1) return;

        const dir = rayOrigin.map((item, index) => item - rayTarget[index]);

        temp.rayOrigin = rayOrigin.map(x=>x);
        temp.rayTarget = rayTarget.map(x=>x);
        temp.dir = dir;
        temp.right = vcross([0,1,0],temp.dir);
        temp.up = vcross(temp.dir,temp.right);
        temp.latLon0 = pos2LatLon(
          dir
        );

        temp.isDragging = true;
        element.addEventListener('mousemove', mouseMove);
        element.addEventListener('mouseup', mouseUp);
        element.addEventListener('mouseout', mouseUp);
    }

    // Function to handle mouse move events (while dragging)
    function mouseMove(e) {
        if (!temp.isDragging) return;

        const dx = e.clientX - temp.mouseStartX;
        const dy = e.clientY - temp.mouseStartY;

        if (temp.mode === 0) {
            // Rotate: Adjust latitude (up/down) and longitude (left/right)
            const sensitivity = 0.002;
            const latChange = dy * sensitivity;
            const lonChange = -dx * sensitivity;

            let lat = temp.latLon0[0] - latChange;
            let lon = temp.latLon0[1] + lonChange;
            // let lat = temp.latLon0[0];
            // let lon = temp.latLon0[1];
            // console.log(temp.latLon0[0],lat)

            // Clamp latitude between 0 and Pi (no upside-down camera)
            if (lat < 0.1) lat = 0.1;
            if (lat > Math.PI/2 - 0.1) lat = Math.PI/2 - 0.1;

            rayOrigin = LatLon2Pos(lat,lon,temp.latLon0[2]).map((item, index) => rayTarget[index] + item);

            // rayOrigin[0] = Math.sin(lat) * Math.cos(lon) * distance;
            // rayOrigin[1] = Math.cos(lat) * distance;
            // rayOrigin[2] = Math.sin(lat) * Math.sin(lon) * distance;

        } else if (temp.mode === 1) {
            // // Pan: Move both the ray origin and target in screen space
            const panSpeed = 0.001;
            const panX = dx * panSpeed;
            const panY = -dy * panSpeed;

            const delta = vadd(vsm(temp.up,panY),vsm(temp.right,panX));
            const rayTarget_ = vadd(temp.rayTarget,delta);
            // if(temp.rayTarget[1]+delta[1]<0.01){
            //   delta[1] = 0;
            // }

            rayOrigin = vadd(temp.rayOrigin,delta);
            rayTarget = vadd(temp.rayTarget,delta);
        }

        // Dispatch event with updated ray origin and target
        element.dispatchEvent(new CustomEvent('update', { detail: [rayOrigin, rayTarget] }));
    }

    // Function to handle mouse up (stop dragging)
    function mouseUp() {
        temp.isDragging = false;
        element.removeEventListener('mousemove', mouseMove);
        element.removeEventListener('mouseup', mouseUp);
        element.removeEventListener('mouseout', mouseUp);
    }

    const mouseWheel = e=>{
      const delta = (e.deltaY > 0 ? 1 : -1)*0.1;
      const dir = rayOrigin.map((item, index) => (item - rayTarget[index])*delta);

      rayOrigin = vadd(rayOrigin,dir);
      // rayTarget = vadd(rayTarget,dir);
      element.dispatchEvent(new CustomEvent('update', { detail: [rayOrigin, rayTarget] }));
    };

    // Attach the mouse down event to start dragging
    element.addEventListener('mousedown', mouseDown);
    element.addEventListener('mousewheel', mouseWheel);
    element.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent right-click menu
}

const init = ()=>{
  // Set up scene, camera, and renderer

  const fullscreenQuadCamera = new THREE.OrthographicCamera( -1, 1, 1, -1, 1, 1000 );
  fullscreenQuadCamera.position.set(0,0,1);

  const fullscreenQuadScene = new THREE.Scene();

  // add quad
  const geometry = new THREE.PlaneGeometry(2,2);

  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vertexShader,
    fragmentShader:fragmentShader,
    uniforms: {
      uResolution: {type:'f2', value:[0,0]},
      uRayOrigin: {type:'f3', value:[2,2,2]},
      uRayTarget: {type:'f3', value:[0,0,0]},
      uEye: iProps.eye,

      // General Uniforms
      uMinT: {type:'f',value:0.1},
      uMaxT: {type:'f',value:40},
      uEps: {type:'f',value:4},
      uShowStepLength: {type:'f',value:1},
      uMaxSteps: {type:'i',value:100},
      uMaxAAaDOF: {type:'f',value:20},
      uFocusDistance: {type:'f',value:2.5},
      uAperatureSize: {type:'f',value:10},
    }
  });

  fullscreenQuadScene.add(
      new THREE.Mesh(geometry,material)
  );

  const renderer = new THREE.WebGLRenderer({canvas:canvas.value});
  // renderer.setSize(window.innerWidth, window.innerHeight);

  var controls = new OrbitControls(canvas.value, material.uniforms.uRayOrigin.value, material.uniforms.uRayTarget.value);
  var updateCamera = (e,suppress_io) => {
    material.uniforms.uRayOrigin.value = e.detail[0];
    material.uniforms.uRayTarget.value = e.detail[1];
    if(!suppress_io)
      iProps.socket.emit('update_camera', e.detail);
  };
  canvas.value.addEventListener('update', updateCamera);

  // Animation loop
  const animate = () => {
    requestAnimationFrame(animate);
    renderer.render(fullscreenQuadScene, fullscreenQuadCamera);
  };

  animate();

  // Handle window resizing
  const onResize = () => {
    // console.log(canvas.value.parentNode)
    const [w,h] = [canvas.value.parentNode.clientWidth, canvas.value.parentNode.clientHeight].map(x=>parseInt(x));
    // console.log(w,h)
    renderer.setSize(w,h);
    fullscreenQuadCamera.aspect = w/h;
    fullscreenQuadCamera.updateProjectionMatrix();
    material.uniforms.uResolution.value = [w,h];
  };
  window.addEventListener('resize', onResize);
  onResize();

  // Cleanup on unmount
  onUnmounted(() => {
    window.removeEventListener('resize', onResize);
    renderer.dispose();
  });

  iProps.socket = new io('http://localhost:4444');
  iProps.socket.on('connect', ()=>{
    iProps.connected = true;
  });
  iProps.socket.on('disconnect', ()=>{
    iProps.connected = false;
  });
  iProps.socket.on('update_camera', cam=>updateCamera({detail:cam},true));
  iProps.socket.on('update_display', display=>{
    iProps.eye.value = display ? iProps.eye.left : iProps.eye.right;
  });
};

onMounted(init);

</script>

<template>
  <canvas ref="canvas" class='canvas' />
  <div class='menu'>
    <q-list padding class="rounded-borders text-white bg-grey-10" style="border-radius: 20px">
      <q-item>
        <q-checkbox
          v-model="iProps.connected"
          label="Connected"
          disable
        />
      </q-item>
      <q-item>
        <q-toggle v-model="iProps.eye.value" label="Eye" :true-value="iProps.eye.left" :false-value="iProps.eye.right" />
      </q-item>
    </q-list>
  </div>

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
