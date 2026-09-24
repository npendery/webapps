const query = document.getElementById('query');
const count = document.getElementById('count');

window.findBar.onFocus(() => {
  query.focus();
  query.select();
});
window.findBar.onResult((label) => {
  count.textContent = label;
});

query.addEventListener('input', () => window.findBar.search(query.value));
query.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    window.findBar.step(!e.shiftKey);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    window.findBar.close();
  }
});
document.getElementById('prev').addEventListener('click', () => window.findBar.step(false));
document.getElementById('next').addEventListener('click', () => window.findBar.step(true));
document.getElementById('close').addEventListener('click', () => window.findBar.close());
