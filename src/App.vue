<script setup>
  import PARTICLES_Template from './components/PARTICLES_Template.vue'
</script>

<template>
  <div class='frame'>
    <DRM_Template />
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
