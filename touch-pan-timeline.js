const frameRate = 1000 / 60; // linear steps we take but they're interpolated at higher frame rates.
const minimumVelocity = 0.01; // pixels per millisecond

const IDLE = 0;
const PENDING_RESTART = 1;
const PANNING = 2;
const MOMENTUM = 3;

function touchStart(event) {
  if (this._status !== IDLE && this._status !== MOMENTUM) {
    // Did not expect to start again.
    return;
  }
  this._previousEvent = event;
  this._velocity = 0;
  this._pendingFinish = 0;
  this._status = PENDING_RESTART;
  const activeAnimations = this._activeAnimations;
  // Pause all running animations
  const allReady = [];
  for (let i = 0; i < activeAnimations.length; i++) {
    const animation = activeAnimations[i];
    animation.removeEventListener('finish', this._finishListener);
    animation.updatePlaybackRate(0);
    allReady.push(animation.ready);
  }
  Promise.all(allReady).then(this._readyListener);
}

function readyToStart() {
  if (this._status !== PENDING_RESTART) {
    return; // We lifted the finger before we were able to stabelize it.
  }
  this._status = PANNING;
  let inferredTime = 0;
  const activeAnimations = this._activeAnimations;
  const stashedEffects = this._stashedEffects;
  for (let i = 0; i < activeAnimations.length; i++) {
    const animation = activeAnimations[i];
    console.log(animation.currentTime);
    // Restore the original effect
    const stashedEffect = stashedEffects[i];
    stashedEffects[i] = null;
    if (stashedEffect) {
      animation.effect = stashedEffect;
    }
    animation.playbackRate = 0;
    animation.currentTime = this.currentTime;
  }
}

function touchMove(event) {
  const horizontal = this.axis === "x" || this.axis === "inline";
  const previousEvent = this._previousEvent;
  this._previousEvent = event;
  if (!previousEvent) {
    return;
  }
  if (this._status === IDLE) {
    this._status = PANNING;
  } else if (this._status !== PANNING) {
    // We are waiting to cancel the previous animation.
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
  if (this._status !== PANNING) {
    // Unexpected.
    return;
  }
  this._status = MOMENTUM;
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
  if (reverse ? velocity > 0 : velocity < 0) {
    // We're going the wrong way. TODO: Implement a spring.
    velocity = -velocity;
  }

  const activeAnimations = this._activeAnimations;
  const stashedEffects = this._stashedEffects;
  for (let i = 0; i < activeAnimations.length; i++) {
    const animation = activeAnimations[i];
    const effect = animation.effect;
    stashedEffects[i] = effect; // Stash so we can restore it later.
    const timing = effect.getTiming();
    const direction = timing.direction;
    const isReverseAnimation =
      direction === "reverse" || direction === "alternate-reverse";
    // Playing in reverse direction deopts Safari so instead we rearranged the keyframes in reverse.
    const flip = reverse ? !isReverseAnimation : isReverseAnimation;

    // delay and duration effectively work as rangeStart/End of the timeline. we clamp the destination.
    const minTime = timing.delay;
    const maxTime = timing.delay + timing.duration;
    let minOffset =
      (currentTime < minTime
        ? minTime
        : currentTime > maxTime
        ? maxTime
        : currentTime) / 100;
    let maxOffset =
      (destinationTime < minTime
        ? minTime
        : destinationTime > maxTime
        ? maxTime
        : destinationTime) / 100;
    if (reverse) {
      let temp = minOffset;
      minOffset = maxOffset;
      maxOffset = temp;
    }

    // Copy any intermediate keyframes between the currentTime and destinationTime with
    // offsets adjusted for the new coordinate space between those times.
    const keyframes = effect.getKeyframes();
    let animatedProperties = [];
    let innerStartIdx = -1;
    let innerEndIdx = -1;
    for (let j = 0; j < keyframes.length; j++) {
      const keyframe = keyframes[j];
      for (let prop in keyframe) {
        if (
          prop !== "offset" &&
          prop !== "computedOffset" &&
          prop !== "easing" &&
          prop !== "composite" &&
          keyframe.hasOwnProperty(prop)
        ) {
          // Collect the name of any animated properties.
          if (animatedProperties.indexOf(prop) === -1) {
            animatedProperties.push(prop);
          }
        }
      }
      let offset = keyframe.computedOffset;
      if (offset > minOffset && offset < maxOffset) {
        if (innerStartIdx === -1) {
          innerStartIdx = j;
        }
        innerEndIdx = j;
        offset = (offset - minOffset) / (maxOffset - minOffset);
        // Adjust the new offset. This is a copy so we can mutate it.
        keyframe.offset = reverse ? 1 - offset : offset;
        keyframe.computedOffset = undefined;
        // We'll override the easing.
        keyframe.easing = undefined;
      }
    }
    const newKeyframes =
      innerStartIdx > -1 ? keyframes.slice(innerStartIdx, innerEndIdx + 1) : [];
    if (flip) {
      newKeyframes.reverse();
    }

    // Compute the interpolated values of the keyframes at the start and stop keyframes
    // This is a live view of styles so we can reuse the same one for start and end.
    const computedStyle = getComputedStyle(effect.target, effect.pseudoElement);
    const startKeyframe = { offset: 0 };
    for (let k = 0; k < animatedProperties.length; k++) {
      const prop = animatedProperties[k];
      startKeyframe[prop] = computedStyle.getPropertyValue(prop);
    }
    animation.currentTime = destinationTime;
    const endKeyframe = { offset: 1 };
    for (let k = 0; k < animatedProperties.length; k++) {
      const prop = animatedProperties[k];
      endKeyframe[prop] = computedStyle.getPropertyValue(prop);
    }

    newKeyframes.unshift(startKeyframe);
    newKeyframes.push(endKeyframe);

    console.log(newKeyframes);

    let delay = 10;
    let duration = 500;
    let easing = "cubic-bezier(.25,.46,.45,1)";
    const momentumEffect = new KeyframeEffect(effect.target, newKeyframes, {
      delay: delay,
      duration: duration,
      fill: "both",
      easing: easing,
      composite: effect.composite,
      pseudoElement: effect.pseudoElement,
    });
    animation.effect = momentumEffect;
    animation.playbackRate = 1;
    animation.currentTime = 0;
    this._pendingFinish++;
    animation.addEventListener('finish', this._finishListener);
  }
  this.currentTime = destinationTime;
}

function finishAnimation() {
  if (--this._pendingFinish === 0) {
    console.log('settled');
    this._resolveSettled();
    this.settled = new Promise((resolve) => (this._resolveSettled = resolve));
  }
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
    this.snap =
      typeof snap === "number" ? [snap] : Array.isArray(snap) ? snap : null;
    this.decelerationRate =
      decelerationRate == null
        ? 0.998 // iOS-like decelaration rate. TODO: Detect OS and adjust.
        : decelerationRate;
    this.currentTime = (100 * -rangeStart) / (rangeEnd - rangeStart);
    this.settled = new Promise((resolve) => (this._resolveSettled = resolve));
    this._status = IDLE;
    this._activeAnimations = [];
    this._stashedEffects = [];
    this._previousEvent = touch;
    this._velocity = 0;
    this._startListener = touchStart.bind(this);
    this._moveListener = touchMove.bind(this);
    this._endListener = touchEnd.bind(this);
    this._readyListener = readyToStart.bind(this);
    this._pendingFinish = 0;
    this._finishListener = finishAnimation.bind(this);
  }
  animate(animation) {
    const activeAnimations = this._activeAnimations;
    if (activeAnimations.indexOf(animation) > -1) {
      // We're already driving this animation.
      // TODO: Should we ref count or error?
      return () => {};
    }
    const source = this.source;
    if (activeAnimations.length === 0) {
      source.addEventListener("touchstart", this._startListener);
      source.addEventListener("touchmove", this._moveListener);
      source.addEventListener("touchend", this._endListener);
      source.addEventListener("touchcancel", this._endListener);
    }
    activeAnimations.push(animation);
    this._stashedEffects.push(null);
    animation.playbackRate = 0;
    animation.currentTime = this.currentTime;
    return () => {
      const activeAnimations = this._activeAnimations;
      const stashedEffects = this._stashedEffects;
      const idx = activeAnimations.indexOf(animation);
      if (idx > -1) {
        activeAnimations.splice(idx, 1);
        stashedEffects.splice(idx, 1);
      }
      animation.removeEventListener('finish', this._finishListener);
      if (this._status === MOMENTUM && animation.playState !== 'finished') {
        this._pendingFinish--;
      }
      if (activeAnimations.length === 0) {
        source.removeEventListener("touchstart", this._startListener);
        source.removeEventListener("touchmove", this._moveListener);
        source.removeEventListener("touchend", this._endListener);
        source.removeEventListener("touchcancel", this._endListener);
      }
    };
  }
}
