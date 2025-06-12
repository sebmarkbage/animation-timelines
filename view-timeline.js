function findSource(node, horizontal) {
  // This algorithm is not exactly right but close enough.
  if (!node || node.nodeType !== 1) {
    return null;
  }
  const styles = getComputedStyle(node);
  if (horizontal) {
    const overflowX = styles.overflowX;
    if (overflowX === "auto" || overflowX === "scroll") {
      if (node.scrollWidth > node.clientWidth) {
        return node;
      }
    }
  } else {
    const overflowY = styles.overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      if (node.scrollHeight > node.clientHeight) {
        return node;
      }
    }
  }
  if (styles.position === "fixed") {
    return null;
  }
  return findSource(node.parentNode, horizontal);
}

function computeSubjectPositionWithinSource(subject, source, horizontal) {
  // Compute the offset relatively to the source.
  let position = horizontal ? -source.offsetLeft : -source.offsetTop;
  let node = subject;
  const sharedAncestor = source.offsetParent;
  while (node && node !== sharedAncestor) {
    position += horizontal ? node.offsetLeft : node.offsetTop;
    node = node.offsetParent;
  }
  return position;
}

export default class ViewTimeline {
  constructor({ subject, axis, inset }) {
    const horizontal = axis === "block" || axis === "x";
    const source =
      findSource(subject.parentNode, horizontal) ||
      subject.ownerDocument.scrollingElement;
    const sourceSize = horizontal ? source.clientWidth : source.clientHeight;
    const subjectSize = horizontal ? subject.offsetWidth : subject.offsetHeight;
    const subjectPosition = computeSubjectPositionWithinSource(
      subject,
      source,
      horizontal
    );
    let insetStart = 0;
    let insetEnd = 0;
    if (typeof inset === "number") {
      insetStart = insetEnd = inset;
    } else if (Array.isArray(inset)) {
      if (typeof inset[0] === "number") {
        insetStart = insetEnd = inset[0];
      }
      if (typeof inset[1] === "number") {
        insetEnd = inset[1];
      }
    }
    this.source = source;
    this.axis = axis;
    this.subject = subject;
    this.startOffset = subjectPosition - sourceSize + insetEnd;
    this.endOffset = subjectPosition + subjectSize - insetStart;
  }
  get currentTime() {
    const source = this.source;
    const axis = this.axis;
    const startOffset = this.startOffset;
    const endOffset = this.endOffset;
    const range = endOffset - startOffset;
    if (axis === "block" || axis === "x") {
      return (100 * (source.scrollLeft - startOffset)) / range;
    } else {
      return (100 * (source.scrollTop - startOffset)) / range;
    }
  }
  animate(animation) {
    animation.playbackRate = 0;
    const source = this.source;
    const update = () => {
      animation.currentTime = this.currentTime;
    };
    update();
    source.addEventListener("scroll", update);
    return () => {
      source.removeEventListener("scroll", update);
    };
  }
}
