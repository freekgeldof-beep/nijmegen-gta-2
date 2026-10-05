export function createStepper(step = 1 / 60, maxSteps = 8) {
  let accumulator = 0;
  return {
    advance(elapsed, update) {
      accumulator += Math.max(0, Math.min(elapsed, step * maxSteps));
      let count = 0;
      while (accumulator + 1e-10 >= step && count < maxSteps) {
        update(step); accumulator = Math.max(0, accumulator - step); count++;
      }
      return count * step;
    },
    reset() { accumulator = 0; },
  };
}
