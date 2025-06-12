import TouchPanTimeline from "animation-timelines/touch-pan-timeline";

const container = document.getElementById("container");
const scroll = document.getElementById("scroll");

const range = container.scrollHeight - container.clientHeight;

const timeline = new TouchPanTimeline({
  source: container,
  axis: "y",
  range: [0, -range],
});
const animation = scroll.animate(
  {
    transform: ["translateY(0)", "translateY(" + (-range) + "px)"],
//    'marginTop': ["0", (-range) + "px"],
  },
  {
    fill: "both",
    delay: 0,
    duration: 100,
  }
);
timeline.animate(animation);

container.addEventListener(
  "touchstart",
  (event) => {
    // Prevent scrolling
    event.preventDefault();
  },
  { passive: false }
);
