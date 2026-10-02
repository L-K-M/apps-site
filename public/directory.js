(() => {
  const form = document.querySelector('.filters');
  const rows = [...document.querySelectorAll('[data-app]')];
  const categoryLinks = [...document.querySelectorAll('[data-category-link]')];
  const result = document.querySelector('[data-result-count]');
  const empty = document.querySelector('[data-empty]');
  const fields = ['q', 'platform', 'maturity', 'category'];

  const normalise = (value) => value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en');
  const indexedRows = rows.map((row) => ({ row, search: normalise(row.dataset.search) }));

  function restore() {
    const query = new URLSearchParams(location.search);
    for (const name of fields) form.elements[name].value = query.get(name) ?? '';
  }

  function filter() {
    const values = Object.fromEntries(fields.map((name) => [name, form.elements[name].value]));
    const words = normalise(values.q).trim().split(/\s+/).filter(Boolean);
    let count = 0;

    for (const { row, search } of indexedRows) {
      const visible = words.every((word) => search.includes(word))
        && (!values.category || row.dataset.category === values.category)
        && (!values.platform || row.dataset.platforms.split(' ').includes(values.platform))
        && (!values.maturity || row.dataset.maturity === values.maturity);
      row.hidden = !visible;
      if (visible) count += 1;
    }

    for (const link of categoryLinks) {
      if (link.dataset.categoryLink === values.category) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    result.textContent = `${count} ${count === 1 ? 'app' : 'apps'}`;
    empty.hidden = count !== 0 || rows.length === 0;

    const url = new URL(location.href);
    for (const name of fields) {
      if (values[name]) url.searchParams.set(name, values[name]);
      else url.searchParams.delete(name);
    }
    history.replaceState(null, '', url);
  }

  function clear() {
    for (const name of fields) form.elements[name].value = '';
    filter();
    form.elements.q.focus();
  }

  form.addEventListener('input', filter);
  form.addEventListener('change', filter);
  form.addEventListener('submit', (event) => { event.preventDefault(); filter(); });
  form.addEventListener('reset', (event) => { event.preventDefault(); clear(); });
  document.querySelector('[data-clear]').addEventListener('click', clear);

  for (const link of categoryLinks) {
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      form.elements.category.value = link.dataset.categoryLink;
      filter();
    });
  }

  window.addEventListener('popstate', () => { restore(); filter(); });
  restore();
  filter();
  for (const element of document.querySelectorAll('[data-enhanced]')) element.hidden = false;
})();
