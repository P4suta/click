/* @refresh reload */
import { render } from "solid-js/web";
import { App } from "./App";
import { createAppStore } from "./state/app-store";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

const store = createAppStore();
store.enablePersistence();

render(() => <App store={store} />, root);
