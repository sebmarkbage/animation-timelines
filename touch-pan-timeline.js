import { cubicBezier } from "./utils/bezier.js";

const minimumVelocity = 0.01; // pixels per millisecond

// This easing function is an approximation of multiplying the velocity with the decelerationRate
// every millisecond. Regardless of initial velocity and the deceleration rate, for the ranges
// that matter, it ends up with a curve very similar to this one.
const DECELERATION_CURVE = "cubic-bezier(.15,.69,.21,1)";
// The next function is used to compute where along the curve we ended up if we stop early.
const decelerationCurve = cubicBezier(0.15, 0.69, 0.21, 1);

const IDLE = 0;
const PENDING_RESTART = 1;
const PANNING = 2;
const MOMENTUM = 3;

let tempElement;
let tempAnimation;
function makeInterpolationAnimation(animation) {
  if (!animation.effect.pseudoElement) {
    // We don't need a separate one if there's no pseudoElement.
    return animation;
  }
  // In Safari, you cannot read the interpolated result of an Animation using getComputedStyle.
  // To work around this bug, we apply the animation to a temporary DOM node to read back its
  // interpolated result. It's not perfect since it won't have the same committed styles as
  // the original element but animated properties tend to get filled in for all getKeyframes.
  if (!tempElement) {
    tempElement = document.createElement("div");
    tempElement.style.position = "absolute";
    tempAnimation = tempElement.animate([]);
    tempAnimation.playbackRate = 0;
  }
  if (!tempElement.parentNode) {
    document.body.appendChild(tempElement);
  }
  const effect = animation.effect;
  const tempEffect = tempAnimation.effect;
  tempEffect.setKeyframes(effect.getKeyframes());
  tempEffect.updateTiming(effect.getTiming());
  tempAnimation.currentTime = animation.currentTime;
  return tempAnimation;
}

function cleanUpInterpolationTarget() {
  if (tempElement) {
    tempElement.remove();
  }
}

function touchStart(event) {
  if (this._status !== IDLE && this._status !== MOMENTUM) {
    // Did not expect to start again.
    return;
  }
  this._previousEvent = event;
  this._prevVelocity = 0;
  this._velocity = 0;
  this._pendingFinish = 0;
  if (this._status === IDLE) {
    this._status = PENDING_RESTART;
    this._readyListener();
  } else {
    // We stopped during momentum scrolling.
    // For animations running on another thread we can't stop them immediately so it might
    // have already progressed further which would cause us to snap back. We also can't async
    // pause it in Safari. However, we can animate it to a specific time. 100ms is typically
    // enough time to send the instruction to the other thread without way too high latency.
    const overshoot = 100;
    const progressInTime =
      (performance.now() + overshoot - this._momentumStart) /
      this._momentumDuration;
    const progress = decelerationCurve(progressInTime);

    this._status = PENDING_RESTART;
    if (progress < 1) {
      // Adjust the currentTime to where we'll stop.
      this.currentTime =
        this._releaseTime + (this.currentTime - this._releaseTime) * progress;

      const activeAnimations = this._activeAnimations;
      const stashedEffects = this._stashedEffects;
      for (let i = 0; i < activeAnimations.length; i++) {
        const animation = activeAnimations[i];
        const animatedProperties = stashedEffects[i].animatedProperties;
        const effect = animation.effect;
        const timing = effect.getTiming();
        // Shift forward to compute the keyframe where we'll stop.
        const originalTime = animation.currentTime;
        const overshootTime = timing.delay + timing.duration * progressInTime;
        const interpolationAnimation = makeInterpolationAnimation(animation);
        interpolationAnimation.currentTime = overshootTime;
        const computedStyle = getComputedStyle(
          interpolationAnimation.effect.target
        );
        const stopKeyframe = { offset: progress };
        const fillKeyframe = { offset: 1 };
        for (let k = 0; k < animatedProperties.length; k++) {
          const prop = animatedProperties[k];
          fillKeyframe[prop] = stopKeyframe[prop] =
            computedStyle.getPropertyValue(prop) || computedStyle[prop];
        }
        // Then shift back to continue from where we left off.
        animation.currentTime = originalTime;
        // Rewrite the keyframes to end at our new stop keyframe and repeat that
        // frame until the end in case we don't stop exactly at the right time.
        const keyframes = effect.getKeyframes();
        let lastKeyframeIdx = keyframes.length;
        for (let i = 0; i < keyframes.length; i++) {
          if (keyframes[i].computedOffset >= progress) {
            lastKeyframeIdx = i;
            break;
          }
        }
        keyframes.splice(
          lastKeyframeIdx,
          keyframes.length - lastKeyframeIdx,
          stopKeyframe,
          fillKeyframe
        );
        effect.setKeyframes(keyframes);
      }
      // Next, let's wait until we reach the new stop point.
      setTimeout(this._readyListener, overshoot);
    } else {
      // We're close enough to the end that we'll just snap to the end.
      this._readyListener();
    }
  }
}

let first = true;

function readyToStart() {
  if (this._status !== PENDING_RESTART) {
    return; // We lifted the finger before we were able to stabelize it.
  }
  this._status = PANNING;
  const activeAnimations = this._activeAnimations;
  const stashedEffects = this._stashedEffects;
  for (let i = 0; i < activeAnimations.length; i++) {
    const animation = activeAnimations[i];
    const effect = animation.effect;
    const stashedEffect = stashedEffects[i];
    stashedEffects[i] = null;
    // Restore the original effect
    if (stashedEffect) {
      effect.setKeyframes(stashedEffect.keyframes);
      effect.updateTiming(stashedEffect.timing);
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
    if (this._status === PANNING) {
      const timeDelta = (100 * delta) / (this.rangeEnd - this.rangeStart);
      const currentTime = (this.currentTime += timeDelta);
      const activeAnimations = this._activeAnimations;
      for (let i = 0; i < activeAnimations.length; i++) {
        const animation = activeAnimations[i];
        animation.currentTime = currentTime;
      }
    }
  } else {
    this._velocity = 0;
  }
}

function touchEnd(event) {
  if (this._status === PENDING_RESTART) {
    // We were about to restart but we released before the raf.
    // We're now back in momentum scrolling.
    // TODO: Give it a boost in this case given the new velocity.
    this._readyListener();
  }
  if (this._status !== PANNING) {
    return;
  }
  this._status = MOMENTUM;
  // Compute the distance we'll travel given the velocity upon release.
  let velocity = this._velocity;
  const decelerationRate = this.decelerationRate;
  let distance = 0;
  let duration = 1;
  if (velocity > minimumVelocity || velocity < -minimumVelocity) {
    // Inspired by: https://medium.com/@esskeetit/how-uiscrollview-works-e418adc47060
    distance = (velocity * decelerationRate) / (1 - decelerationRate);
    const k = 1000 * Math.log(decelerationRate);
    duration =
      (Math.log((-k * (minimumVelocity * 0.5)) / Math.abs(velocity)) / k) *
      1000;
  } else if (velocity < 0) {
    velocity = -minimumVelocity;
  } else {
    velocity = minimumVelocity;
  }

  let currentTime = this.currentTime;

  // Snap the destination in pixel coordinate space.
  const rangeStart = this.rangeStart;
  const rangeEnd = this.rangeEnd;
  const range = rangeEnd - rangeStart;
  let currentPosition = rangeStart + (currentTime * range) / 100;
  // If we started outside the range, clamp it to the beginning of the range.
  // Which is what we expect the visuals to be clamped to.
  if (rangeEnd > rangeStart) {
    if (currentPosition < rangeStart) {
      currentTime = 0;
      currentPosition = rangeStart;
    } else if (currentPosition > rangeEnd) {
      currentTime = 100;
      currentPosition = rangeEnd;
    }
  } else {
    if (currentPosition > rangeStart) {
      currentTime = 0;
      currentPosition = rangeStart;
    } else if (currentPosition < rangeEnd) {
      currentTime = 100;
      currentPosition = rangeEnd;
    }
  }
  const targetDestination = currentPosition + distance;
  let destination = targetDestination;
  // Clamp the destination to end of the range.
  if (rangeEnd > rangeStart) {
    if (destination < rangeStart) {
      destination = rangeStart;
    } else if (destination > rangeEnd) {
      destination = rangeEnd;
    }
  } else {
    if (destination > rangeStart) {
      destination = rangeStart;
    } else if (destination < rangeEnd) {
      destination = rangeEnd;
    }
  }
  // Track how much we've overshot the bounds.
  let overscrollFactor =
    destination === currentPosition
      ? 1
      : Math.abs(distance / (destination - currentPosition));
  if (overscrollFactor < 1) {
    overscrollFactor = 1; // Float precision bug
  }

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
    const timing = effect.getTiming();
    const direction = timing.direction;
    const isReverseAnimation =
      direction === "reverse" || direction === "alternate-reverse";
    // Playing in reverse direction deopts Safari so instead we rearranged the keyframes in reverse.
    const flip = reverse ? !isReverseAnimation : isReverseAnimation;

    // delay and duration effectively work as rangeStart/End of the timeline. we clamp the destination.
    const minTime = timing.delay;
    const maxTime = minTime + timing.duration;
    const startOffset =
      (currentTime < minTime
        ? minTime
        : currentTime > maxTime
        ? maxTime
        : currentTime) / 100;
    const endOffset =
      (destinationTime < minTime
        ? minTime
        : destinationTime > maxTime
        ? maxTime
        : destinationTime) / 100;
    const minOffset = reverse ? endOffset : startOffset;
    const maxOffset = reverse ? startOffset : endOffset;

    // Copy any intermediate keyframes between the currentTime and destinationTime with
    // offsets adjusted for the new coordinate space between those times.
    const keyframes = effect.getKeyframes();
    let newKeyframes = [];
    let animatedProperties = [];
    for (let j = 0; j < keyframes.length; j++) {
      const keyframe = keyframes[j];
      let offset = keyframe.computedOffset;
      if (offset > minOffset && offset < maxOffset) {
        offset = (offset - minOffset) / (maxOffset - minOffset);
        offset = (reverse ? 1 - offset : offset) / overscrollFactor;
        const clone = { offset: offset };
        newKeyframes.push(clone);
        for (let prop in keyframe) {
          if (
            prop !== "offset" &&
            prop !== "computedOffset" &&
            prop !== "easing" &&
            prop !== "composite" &&
            keyframe.hasOwnProperty(prop)
          ) {
            clone[prop] = keyframe[prop];
            // Collect the name of any animated properties.
            if (animatedProperties.indexOf(prop) === -1) {
              animatedProperties.push(prop);
            }
          }
        }
      } else {
        for (let prop in keyframe) {
          if (
            prop !== "offset" &&
            prop !== "computedOffset" &&
            prop !== "easing" &&
            prop !== "composite" &&
            keyframe.hasOwnProperty(prop)
          ) {
            // Collect the name of any animated properties even if they're outside the range.
            if (animatedProperties.indexOf(prop) === -1) {
              animatedProperties.push(prop);
            }
          }
        }
      }
    }
    if (flip) {
      newKeyframes.reverse();
    }

    // Compute the interpolated values of the keyframes at the start and stop keyframes
    // This is a live view of styles so we can reuse the same one for start and end.
    const interpolationAnimation = makeInterpolationAnimation(animation);
    const computedStyle = getComputedStyle(
      interpolationAnimation.effect.target
    );
    const startKeyframe = { offset: 0 };
    for (let k = 0; k < animatedProperties.length; k++) {
      const prop = animatedProperties[k];
      startKeyframe[prop] =
        computedStyle.getPropertyValue(prop) || computedStyle[prop];
    }
    interpolationAnimation.currentTime = destinationTime;
    const stopKeyframe = { offset: 1 / overscrollFactor };
    const fillKeyframe = { offset: 1 };
    for (let k = 0; k < animatedProperties.length; k++) {
      const prop = animatedProperties[k];
      fillKeyframe[prop] = stopKeyframe[prop] =
        computedStyle.getPropertyValue(prop) || computedStyle[prop];
    }

    newKeyframes.unshift(startKeyframe);
    newKeyframes.push(stopKeyframe);
    if (overscrollFactor > 1) {
      newKeyframes.push(fillKeyframe);
    }

    // Stash the old timing and keyframes so we can restore it later.
    stashedEffects[i] = {
      keyframes,
      timing,
      animatedProperties,
    };

    effect.updateTiming({
      delay: 0, // Setting to non zero deopts Safari. We adjust keyframes instead.
      duration: duration,
      fill: "both",
      easing: DECELERATION_CURVE,
    });
    effect.setKeyframes(newKeyframes);
    animation.currentTime = 0;
    animation.playbackRate = 1;
    this._pendingFinish++;
    animation.addEventListener("finish", this._finishListener);
  }
  cleanUpInterpolationTarget();

  this._momentumStart = performance.now();
  this._momentumDuration = duration;
  this._releaseTime = currentTime;

  this.currentTime = destinationTime;
}

function finishAnimation() {
  if (--this._pendingFinish === 0 && this._status === MOMENTUM) {
    this._status = IDLE;
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
    this._momentumStart = 0;
    this._momentumDuration = 0;
    this._releaseTime = 0;
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
      if (this._status === MOMENTUM && animation.playState !== "finished") {
        this._pendingFinish--;
      }
      animation.removeEventListener("finish", this._finishListener);
      if (activeAnimations.length === 0) {
        source.removeEventListener("touchstart", this._startListener);
        source.removeEventListener("touchmove", this._moveListener);
        source.removeEventListener("touchend", this._endListener);
        source.removeEventListener("touchcancel", this._endListener);
      }
    };
  }
}
