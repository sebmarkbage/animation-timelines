import ScrollTimelinePolyfill from "animation-timelines/scroll-timeline";

const container = document.getElementById("container");
const scroll = document.getElementById("scroll");

const range = container.scrollHeight - container.clientHeight;

const Timeline =
  typeof ScrollTimeline === "function"
    ? ScrollTimeline
    : ScrollTimelinePolyfill;

const timeline = new Timeline({
  source: container,
  axis: "y",
});
const animation = scroll.animate(
  {
    transform: ["translateY(0)", "translateY(" + -range + "px)"],
  },
  {
    fill: "both",
  }
);

if (typeof ScrollTimeline === "function") {
  animation.timeline = timeline;
} else {
  timeline.animate(animation);
}
