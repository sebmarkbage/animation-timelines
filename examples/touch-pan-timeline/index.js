import TouchPanTimeline from "animation-timelines/touch-pan-timeline";

const container = document.getElementById("container");
const box = document.getElementById("box");
const box2 = document.getElementById("box2");

const timeline = new TouchPanTimeline({
  source: container,
  axis: "x",
  range: [-100, 100],
  snap: [-100, 0, 100],
});
const animation = box.animate(
  {
    transform: ["translateX(-100px)", "translateX(0)", "translateX(100px)"],
  },
  {
    fill: "both",
    delay: 0,
    duration: 100,
  }
);
timeline.animate(animation);

const animation2 = box2.animate(
  {
    transform: ["translateX(-60px)", "translateX(0)", "translateX(60px)"],
  },
  {
    fill: "both",
    delay: 20,
    duration: 60,
  }
);
timeline.animate(animation2);

container.addEventListener(
  "touchstart",
  (event) => {
    // Prevent scrolling
    event.preventDefault();
  },
  { passive: false }
);
