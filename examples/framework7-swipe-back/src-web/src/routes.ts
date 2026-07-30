import DetailPage from "./pages/DetailPage.vue";
import HomePage from "./pages/HomePage.vue";

export const routes = [
  {
    path: "/",
    component: HomePage,
  },
  {
    path: "/detail/",
    component: DetailPage,
  },
];
