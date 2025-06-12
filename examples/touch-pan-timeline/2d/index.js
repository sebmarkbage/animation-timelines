import TouchPanTimeline from "animation-timelines/touch-pan-timeline";

const container = document.getElementById("container");
const box = document.getElementById("box");

const timelineX = new TouchPanTimeline({
  source: container,
  axis: "x",
  range: [-100, 100],
  snap: [-100, 0, 100],
});

const timelineY = new TouchPanTimeline({
  source: container,
  axis: "y",
  range: [-100, 100],
  snap: [-100, 0, 100],
});

const animationX = box.animate(
  {
    "--x": ["-100px", "100px"],
  },
  {
    fill: "both",
    delay: 0,
    duration: 100,
  }
);
timelineX.animate(animationX);

const animationY = box.animate(
  {
    "--y": ["-100px", "100px"],
  },
  {
    fill: "both",
    delay: 0,
    duration: 100,
  }
);
timelineY.animate(animationY);

container.addEventListener(
  "touchstart",
  (event) => {
    // Prevent scrolling
    event.preventDefault();
  },
  { passive: false }
);
