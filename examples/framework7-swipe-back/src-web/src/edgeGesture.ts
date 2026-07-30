export const ACTIVE_AREA_PX = 30;

export interface EdgeGestureState {
  phase: "idle" | "tracking" | "framework7-moving" | "changed" | "reset";
  startX: number | null;
  currentX: number | null;
  deltaX: number;
  startedInActiveArea: boolean;
  framework7Progress: number;
  lastResult: string;
}

export type EdgeGestureAction =
  | { type: "contact-start"; x: number }
  | { type: "contact-move"; x: number }
  | { type: "contact-end" }
  | { type: "swipeback-move"; progress: number }
  | { type: "swipeback-change" }
  | { type: "swipeback-reset" };

export const initialEdgeGestureState: EdgeGestureState = {
  phase: "idle",
  startX: null,
  currentX: null,
  deltaX: 0,
  startedInActiveArea: false,
  framework7Progress: 0,
  lastResult: "Navigate to Detail, then drag right from the absolute left edge.",
};

export function reduceEdgeGesture(
  state: EdgeGestureState,
  action: EdgeGestureAction,
): EdgeGestureState {
  switch (action.type) {
    case "contact-start":
      return {
        ...state,
        phase: "tracking",
        startX: action.x,
        currentX: action.x,
        deltaX: 0,
        startedInActiveArea: action.x <= ACTIVE_AREA_PX,
        framework7Progress: 0,
        lastResult:
          action.x <= ACTIVE_AREA_PX
            ? "Raw contact began inside the 30 px active area."
            : "Raw contact began outside the active area; Framework7 should ignore it.",
      };
    case "contact-move":
      return {
        ...state,
        currentX: action.x,
        deltaX: state.startX === null ? 0 : Math.max(0, action.x - state.startX),
      };
    case "contact-end":
      return {
        ...state,
        phase: "idle",
      };
    case "swipeback-move":
      return {
        ...state,
        phase: "framework7-moving",
        framework7Progress: action.progress,
        lastResult: "Framework7 accepted the gesture and is moving both pages.",
      };
    case "swipeback-change":
      return {
        ...state,
        phase: "changed",
        framework7Progress: 1,
        lastResult: "Framework7 committed navigation to the previous page.",
      };
    case "swipeback-reset":
      return {
        ...state,
        phase: "reset",
        framework7Progress: 0,
        lastResult: "Framework7 accepted the drag but reset the current page.",
      };
  }
}
