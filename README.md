# Animation Timelines

This is a collection of custom timelines to drive Web Animations similarly to the built-in [AnimationTimeline](https://developer.mozilla.org/en-US/docs/Web/API/AnimationTimeline).

## Protocol

The protocol for a custom timeline is:

```ts
interface CustomTimeline {
  currentTime: number;
  animate(animation: Animation): () => void;
}
```

With `AnimationTimeline` built-in to the browser, you would pass them as arguments to an [Animation](https://developer.mozilla.org/en-US/docs/Web/API/Animation) like this:

```js
const animation = new Animation(..., timeline);
// or
const animation = element.animate(..., { timeline });
```

That doesn't work with a custom timeline like the ones in this package. Instead, you pass the `Animation` to the `animate(...)` function like so:

```js
const animation = new Animation(...);
timeline.animate(animation);
// or
const animation = element.animate(...);
timeline.animate(animation);
```

The `delay` and `duration` of the `Animation` can be used to configure the equivalent of [`rangeStart`](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate#rangestart) and [`rangeEnd`](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate#rangeend).

```js
const animation = element.animate(..., {
  delay: 25, // start at 25%
  duration: 75, // end at 75%
});
timeline.animate(animation);
```

The `animate()` function returns a clean up function which removes any internal listeners that the timeline might have registered while running the animation. This lets you free that memory after you no longer need the animation. This should be called when the target element of the animation is no longer used - not the source element of the events to the timeline.

```js
const cleanup = timeline.animate();
...
cleanup();
```

This protocol is also [supported by React](https://github.com/facebook/react/pull/33501) with the [`startGestureTransition` API](https://github.com/facebook/react/pull/32785).

```js
startGestureTransition(timeline, ...);
```

## ScrollTimeline

This is a "ponyfill" for the [`ScrollTimeline`](https://developer.mozilla.org/en-US/docs/Web/API/ScrollTimeline) API. It can be used to drive an animation based on the current scroll position of an element, when the native one is not available.

```ts

interface ScrollTimeline extends CustomTimeline {
  new(options: {
    source: Element,
    axis?: 'block' | 'inline' | 'x' | 'y',
  }): ScrollTimeline;
  source: Element;
  axis: 'block' | 'inline' | 'x' | 'y';
}
```

```js
import ScrollTimelinePolyfill from 'animation-timelines/scroll-timeline';

const timeline = new ScrollTimelinePolyfill({ source: element, axis: 'x' })
timeline.animate(animation);
```

The `currentTime` of the `Animation` spans `0` - `100` where `0` is when the scroll is at the beginning and `100` is when the scroll is at the end. Use `delay` and `duration` of the `Animation` to customize the start and end range.

## ViewTimeline

This is a "ponyfill" for the [`ViewTimeline`](https://developer.mozilla.org/en-US/docs/Web/API/ViewTimeline) API. It can be used to drive an animation based on the current visibility of an element, when the native one is not available.

```ts
interface ViewTimeline extends ScrollTimeline {
  new(options: {
    subject: Element,
    axis?: 'block' | 'inline' | 'x' | 'y',
    inset?: 'auto' | number | ['auto' | number] | ['auto' | number, 'auto' | number],
  }): ViewTimeline;
  subject: Element;
  startOffset: number;
  endOffset: number;
}
```

```js
import ViewTimelinePolyfill from 'animation-timelines/view-timeline';

const timeline = new ViewTimelinePolyfill({ subject: element, axis: 'x' })
timeline.animate(animation);
```

The `currentTime` of the `Animation` spans `0` - `100` where `0` is when the subject is about to enter the visible range and `100` is when the subject is about the exit the visible range. Use `delay` and `duration` of the `Animation` to customize the start and end range.
