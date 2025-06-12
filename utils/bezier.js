export function cubicBezier(x1, y1, x2, y2) {
  return function (x) {
    if (x <= 0) {
      return 0;
    }
    if (x >= 1) {
      return 1;
    }

    // Newton-Raphson method for finding approximate t at x.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const u = 1 - t;
      const dx =
        3 * u * u * x1 -
        6 * u * t * x1 +
        6 * u * t * x2 -
        3 * t * t * x2 +
        3 * t * t;
      if (dx > -1e-6 && dx < 1e-6) break;
      t = t - (3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t - x) / dx;
      if (t > 1) {
        t = 1;
      }
      if (t < 0) {
        t = 0;
      }
    }

    // Compute y at t
    {
      const u = 1 - t;
      return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
    }
  };
}
