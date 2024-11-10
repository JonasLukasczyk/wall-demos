<script setup>
  import DRM_Template from './components/DRM_Template.vue'
</script>

<template>
  <div class='frame'>
    <DRM_Template />
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
