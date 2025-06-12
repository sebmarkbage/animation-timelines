const frameRate = 1000 / 60; // linear steps we take but they're interpolated at higher frame rates.
const minimumVelocity = 0.01; // pixels per millisecond

const linearTiming = {
  easing: "linear",
};

const easeOutTiming = {
  easing: "cubic-bezier(.25,.46,.45,1)",
};

const easeInTiming = {
  easing: "cubic-bezier(.55,0,.75,.54)",
};

function touchStart(event) {
  this._previousEvent = event;
  this._velocity = 0;
  const activeAnimations = this._activeAnimations;
  for (let i = 0; i < activeAnimations.length; i++) {
    const animation = activeAnimations[i];
    animation.playbackRate = 0;
    // TODO: Restore keyframes and direction.
    animation.effect.updateTiming(linearTiming);
    this.currentTime = animation.currentTime;
  }
}

function touchMove(event) {
  const horizontal = this.axis === "x" || this.axis === "inline";
  const previousEvent = this._previousEvent;
  this._previousEvent = event;
  if (!previousEvent) {
    return;
  }
  const prevTouches = previousEvent.touches;
  const nextTouches = event.touches;
  let prevIdx = 0;
  let nextIdx = 0;
  let delta = 0;
  let touchesMoved = 0;
  while (prevIdx < prevTouches.length && nextIdx < nextTouches.length) {
    const prev = prevTouches[prevIdx];
    const next = nextTouches[nextIdx];
    if (prev.identifier === next.identifier) {
      delta += horizontal
        ? next.clientX - prev.clientX
        : next.clientY - prev.clientY;
      touchesMoved++;
      nextIdx++;
    }
    prevIdx++;
  }
  // We take the average delta of all the touches moved.
  if (touchesMoved > 0) {
    delta /= touchesMoved;
    // velocity is stored as pixels moved per millisecond
    this._velocity = delta / (event.timeStamp - previousEvent.timeStamp);
    const timeDelta = (100 * delta) / (this.rangeEnd - this.rangeStart);
    const currentTime = (this.currentTime += timeDelta);
    const activeAnimations = this._activeAnimations;
    for (let i = 0; i < activeAnimations.length; i++) {
      const animation = activeAnimations[i];
      animation.currentTime = currentTime;
    }
  } else {
    this._velocity = 0;
  }
}

function touchEnd(event) {
  // Compute the distance we'll travel given the velocity upon release.
  let velocity = this._velocity;
  const decelerationRate = this.decelerationRate;
  let distance = 0;
  if (velocity > minimumVelocity || velocity < -minimumVelocity) {
    distance = (velocity * decelerationRate) / (1 - decelerationRate);
  } else if (velocity < 0) {
    velocity = -minimumVelocity;
  } else {
    velocity = minimumVelocity;
  }

  // Snap the destination in pixel coordinate space.
  const rangeStart = this.rangeStart;
  const rangeEnd = this.rangeEnd;
  const range = rangeEnd - rangeStart;
  const currentTime = this.currentTime;
  const currentPosition = rangeStart + (currentTime * range) / 100;
  const destination = currentPosition + distance;
  let snappedDestination = destination;
  const snap = this.snap;
  if (snap) {
    // Snap the destination to the nearest snap point.
    let bestDelta = Infinity;
    for (let i = 0; i < snap.length; i++) {
      const snapPoint = snap[i];
      const snapDelta = Math.abs(destination - snapPoint);
      if (snapDelta < bestDelta) {
        snappedDestination = snapPoint;
        bestDelta = snapDelta;
      }
    }
  } else {
    // Otherwise, clamp the destination to end of the range.
    if (rangeEnd > rangeStart) {
      if (snappedDestination < rangeStart) {
        snappedDestination = rangeStart;
      } else if (snappedDestination > rangeEnd) {
        snappedDestination = rangeEnd;
      }
    } else {
      if (snappedDestination > rangeStart) {
        snappedDestination = rangeStart;
      } else if (snappedDestination < rangeEnd) {
        snappedDestination = rangeEnd;
      }
    }
  }

  // Convert to the time coordinate space.
  const destinationTime = (100 * (snappedDestination - rangeStart)) / range;

  const reverse = destinationTime < currentTime;
  const activeAnimations = this._activeAnimations;

  if (reverse ? (velocity > 0) : (velocity < 0)) {
    // We're going the wrong way. TODO: Implement a spring.
    velocity = -velocity;
  }

  const decelerationRatePerFrame = Math.pow(decelerationRate, frameRate);

  for (let i = 0; i < activeAnimations.length; i++) {
    const animation = activeAnimations[i];
    const effect = animation.effect;
    const timing = effect.getTiming();
    // delay and duration effectively work as rangeStart/End of the timeline. we clamp the destination.
    const minTime = timing.delay;
    const maxTime = timing.delay + timing.duration;
    const clampedDestination =
      destinationTime < minTime
        ? minTime
        : destinationTime > maxTime
        ? maxTime
        : destinationTime;
    const direction = timing.direction;
    const isReverseAnimation =
      direction === "reverse" || direction === "alternate-reverse";
    // Playing in reverse direction deopts Safari so instead we play the easing function in reverse.
    const flip = reverse ? !isReverseAnimation : isReverseAnimation;
    // Next we're going to generate an easing function that plays each frame and eventually stops
    // at the clamped destination time.
    let duration = frameRate;
    let r = (maxTime - minTime) / range;
    console.log('r', r);
    let v = velocity;
    let t = currentTime / 100;
    let e = clampedDestination / 100;
    console.log('current', t, 'destination', e, 'velocity', v, reverse ? 'reversed' : '');
    let easing = "linear(" + t;
    while (reverse ? (t > e) : (t < e)) {
      t += v / 10;
      if (v > minimumVelocity) {
        v *= decelerationRatePerFrame;
      }
      duration += frameRate;
      easing += ',' + t;
      console.log(t);
    }
    t = e;
    easing += "," + t;
    easing += ")";
    console.log("duration", duration, "easing", easing);
    effect.updateTiming({
      delay: 0, // TODO: Apply a delay if we started outside the clamped range
      duration: duration,
      direction: "normal",
      easing: easing,
    });
    animation.playbackRate = 1;
    animation.currentTime = 0;
  }
  this.currentTime = snappedDestination;
}

function finishAnimation() {
  console.log("finish");
}

export default class TouchPanTimeline {
  constructor({ source, axis, touch, range, snap, decelerationRate }) {
    let rangeStart = 0;
    let rangeEnd = 100;
    if (typeof range === "number") {
      rangeEnd = range;
    } else if (Array.isArray(range) && range.length > 1) {
      rangeStart = range[0];
      rangeEnd = range[1];
    }
    this.source = source;
    this.axis = axis;
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
    this.snap = Array.isArray(snap) ? snap : null;
    this.decelerationRate =
      decelerationRate == null
        ? 0.998 // iOS-like decelaration rate. TODO: Detect OS and adjust.
        : decelerationRate;
    let resolve;
    this.settled = new Promise((r) => (resolve = r));
    this.currentTime = (100 * -rangeStart) / (rangeEnd - rangeStart);
    this._activeAnimations = [];
    this._previousEvent = touch;
    this._velocity = 0;
    this._startListener = touchStart.bind(this);
    this._moveListener = touchMove.bind(this);
    this._endListener = touchEnd.bind(this);
    this._finishListener = finishAnimation.bind(this);
    this._resolveSettled = resolve;
  }
  animate(animation) {
    const activeAnimations = this._activeAnimations;
    if (activeAnimations.indexOf(animation) > -1) {
      // We're already driving this animation.
      return () => {};
    }
    const source = this.source;
    if (activeAnimations.length === 0) {
      source.addEventListener("touchstart", this._startListener);
      source.addEventListener("touchmove", this._moveListener);
      source.addEventListener("touchend", this._endListener);
    }
    activeAnimations.push(animation);
    animation.playbackRate = 0;
    animation.currentTime = this.currentTime;
    animation.addEventListener("finish", this._finishListener);
    return () => {
      animation.removeEventListener("finish", this._finishListener);
      const activeAnimations = this._activeAnimations;
      const idx = activeAnimations.indexOf(animation);
      if (idx > -1) {
        activeAnimations.splice(idx, 1);
      }
      if (activeAnimations.length === 0) {
        source.removeEventListener("touchstart", this._startListener);
        source.removeEventListener("touchmove", this._moveListener);
        source.removeEventListener("touchend", this._endListener);
      }
    };
  }
}
