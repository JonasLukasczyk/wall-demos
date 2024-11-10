import { createApp } from 'vue'
import App from './App.vue'
import { Quasar } from 'quasar'

import '@quasar/extras/material-icons/material-icons.css'
import '@quasar/extras/material-icons-outlined/material-icons-outlined.css'
import '@quasar/extras/material-icons-round/material-icons-round.css'
import '@quasar/extras/material-symbols-outlined/material-symbols-outlined.css'
import '@quasar/extras/material-symbols-rounded/material-symbols-rounded.css'

import 'quasar/dist/quasar.css'

const app = createApp(App)

// Use Quasar plugin
app.use(Quasar, {
  config: {
    // You can configure some global settings here
  }
})

app.mount('#app')
