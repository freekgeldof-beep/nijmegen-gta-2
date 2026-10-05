export async function loadCity() {
  const response = await fetch('city.json');
  if (!response.ok) throw new Error('Stadsconfiguratie niet beschikbaar');
  return response.json();
}
export function applyCity(city) {
  document.title = `${city.name} GTA 2 · City Run`;
  for (const el of document.querySelectorAll('[data-city-name]')) el.textContent = city.name;
  for (const el of document.querySelectorAll('[data-city-code]')) el.textContent = city.areaCode || 'NL';
  for (const el of document.querySelectorAll('[data-club-label]')) el.textContent = city.club?.shirtLabel || 'CLUBSHIRT';
  document.documentElement.style.setProperty('--city-accent', city.club?.color || '#e53a42');
  document.querySelector('.brand img').alt = `${city.name} City Run`;
}
