import ScrollTimelinePolyfill from "animation-timelines/scroll-timeline";

const scroll = document.getElementById("scroll");

const timeline = new ScrollTimelinePolyfill({ source: scroll, axis: "y" });

const box = document.getElementById("box");

const animation = box.animate(
  {
    transform: ["scale(1)", "scale(0)"],
  },
  {
    fill: "both",
    duration: 25,
  }
);
timeline.animate(animation);
