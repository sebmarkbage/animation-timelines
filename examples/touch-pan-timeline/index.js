import TouchPanTimeline from "animation-timelines/touch-pan-timeline";

const container = document.getElementById("container");
const box = document.getElementById("box");

const timeline = new TouchPanTimeline({
  source: container,
  axis: "x",
  range: [-100, 100],
  snap: [-100, 0, 100],
});
const animation = box.animate({
    transform: ["translateX(-100px)", "translateX(0)", "translateX(100px)"],
    //marginLeft: ['-100px', '0', '100px'],
    // border: ['0px solid #000', '100px solid #000']
  },
  {
    fill: "both",
    delay: 0,
    duration: 100,
  }
);
timeline.animate(animation);

container.addEventListener("touchstart", (event) => {
  // Prevent scrolling
  event.preventDefault();
}, { passive: false});

/*
setInterval(() => {
  const end = performance.now() + 100;
  while (performance.now() < end);
}, 150);
*/
