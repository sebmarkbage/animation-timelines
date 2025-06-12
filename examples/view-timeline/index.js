import ViewTimelinePolyfill from "animation-timelines/view-timeline";

const box = document.getElementById("box");

const timeline = new ViewTimelinePolyfill({ subject: box, axis: "y", inset: 50 });
const animation = box.animate({
  transform: ["scale(0)", "scale(1)", "scale(0)"],
}, {
  fill: 'both',
  duration: 100,
});
timeline.animate(animation);
