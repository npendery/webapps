const tabsEl = document.getElementById('tabs');
document.getElementById('new').addEventListener('click', () => window.tabs.newTab());
window.tabs.onState(render);

function render(tabs) {
  tabsEl.replaceChildren(...tabs.map(tabElement));
}

function tabElement(tab) {
  const el = document.createElement('div');
  el.className = `tab${tab.active ? ' active' : ''}${tab.loading ? ' loading' : ''}`;
  el.title = tab.url;
  if (tab.favicon) {
    const img = document.createElement('img');
    img.src = tab.favicon;
    img.alt = '';
    el.appendChild(img);
  }
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = tab.title || tab.url;
  el.appendChild(title);
  const close = document.createElement('button');
  close.className = 'close';
  close.title = 'Close Tab (⌘W)';
  close.textContent = '×';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    window.tabs.close(tab.id);
  });
  el.appendChild(close);
  el.addEventListener('click', () => window.tabs.activate(tab.id));
  el.addEventListener('auxclick', (e) => {
    if (e.button === 1) window.tabs.close(tab.id);
  });
  return el;
}
