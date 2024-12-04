<script setup>
  // import DRM_Template from './components/DRM_Template.vue'
  // import DRM_Template2 from './components/DRM_Template2.vue'
  // import STEREO from './components/STEREO.vue'
  // import PARTICLES_Template from './components/PARTICLES_Template.vue'
  import Force from './components/Force.vue'
</script>

<template>
  <div class='frame'>
    <!--<DRM_Template />-->
    <Force />
    <!--<STEREO />-->
    <!--<DRM_Template2 />-->
    <!--<PARTICLES_Template />-->
  </div>
</template>

<style scoped>

.frame {
  position: absolute;
  top:0;
  left:0;
  right:0;
  bottom:0;
  background-color: red;
}

</style>
