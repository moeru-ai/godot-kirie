import Framework7 from "framework7/lite/bundle";
import "framework7/css/bundle";
import Framework7Vue from "framework7-vue";
import { createApp } from "vue";

import "virtual:uno.css";
import App from "./App.vue";
import "./style.css";

Framework7.use(Framework7Vue);

createApp(App).mount("#app");
