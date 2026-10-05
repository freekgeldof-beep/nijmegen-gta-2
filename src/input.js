// Keep browser input separate from simulation so focus and repeat behavior are testable.
export function bindInput(target, document, sim, zoom) {
  const pressed = new Set();
  function clearKeys() {
    for (const key of pressed) sim.setKey(key, false);
    pressed.clear();
  }
  target.addEventListener('keydown', e => {
    pressed.add(e.key);
    sim.setKey(e.key, true);
    const space = e.key === ' ' || e.code === 'Space';
    if (space || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (e.key === 'q' || e.key === 'Q') sim.placeMine();
    if (e.key === 'w' || e.key === 'W') sim.shoot();
    if (e.repeat) return;
    if (e.key === 'Escape') sim.resetGame();
    if (space) sim.toggleEnterExit();
    if (e.key === 'o' || e.key === 'O') zoom(0.82);
    if (e.key === 'p' || e.key === 'P') zoom(1 / 0.82);
  });
  target.addEventListener('keyup', e => {
    pressed.delete(e.key);
    sim.setKey(e.key, false);
  });
  target.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearKeys();
  });
}
