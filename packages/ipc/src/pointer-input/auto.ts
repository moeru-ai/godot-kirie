import { createPointerEventsHandler } from "./index";

const pointerEventsHandler = createPointerEventsHandler();

document.addEventListener("pointerdown", pointerEventsHandler.bubble);
document.addEventListener("pointermove", pointerEventsHandler.capture, true);
document.addEventListener("pointerup", pointerEventsHandler.capture, true);
document.addEventListener("pointercancel", pointerEventsHandler.capture, true);
document.addEventListener("pointermove", pointerEventsHandler.bubble);
