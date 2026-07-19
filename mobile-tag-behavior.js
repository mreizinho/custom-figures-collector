const mobileTagView = window.matchMedia('(max-width: 600px)');

function showAvailableTagSuggestions() {
  const input = document.querySelector('#detailTagInput');
  const list = document.querySelector('#detailTagSuggestions');
  if (!input || !list) return;
  const query = input.value.trim().toLowerCase();
  let visible = 0;
  list.querySelectorAll('[data-tag-suggestion]').forEach(button => {
    const matches = !query || button.dataset.tagSuggestion.toLowerCase().includes(query);
    button.hidden = !matches;
    if (matches) visible += 1;
  });
  list.hidden = visible === 0;
}

function installDesktopTagSearch() {
  const input = document.querySelector('#detailTagInput');
  const addButton = document.querySelector('#detailTagAdd');
  const suggestions = document.querySelector('#detailTagSuggestions');
  if (input && suggestions && !document.querySelector('#detailTagSuggestionsClose')) {
    const closeButton = document.createElement('button');
    closeButton.id = 'detailTagSuggestionsClose';
    closeButton.className = 'detail-tag-suggestions-close';
    closeButton.type = 'button';
    closeButton.title = 'Close suggestions';
    closeButton.setAttribute('aria-label', 'Close suggestions');
    closeButton.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">close</span>';
    closeButton.addEventListener('click', event => {
      event.stopPropagation();
      suggestions.hidden = true;
      input.focus({ preventScroll: true });
    });
    suggestions.prepend(closeButton);
  }
  if (!input || !addButton || document.querySelector('#detailTagSearch')) return;
  const searchButton = document.createElement('button');
  searchButton.id = 'detailTagSearch';
  searchButton.className = 'detail-tag-search';
  searchButton.type = 'button';
  searchButton.title = 'Show tag suggestions';
  searchButton.setAttribute('aria-label', 'Show tag suggestions');
  searchButton.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">search</span>';
  searchButton.addEventListener('click', event => {
    event.stopPropagation();
    showAvailableTagSuggestions();
  });
  addButton.before(searchButton);
}

new MutationObserver(installDesktopTagSearch).observe(document.querySelector('#detailContent'), {
  childList: true,
  subtree: true
});

document.addEventListener('click', event => {
  if (!mobileTagView.matches) return;

  const toggle = event.target.closest('#detailTagToggle');
  if (toggle) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const editor = document.querySelector('#detailTagEditor');
    const input = document.querySelector('#detailTagInput');
    const opening = editor.hidden;
    editor.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
    input?.blur();
    if (opening) showAvailableTagSuggestions();
    return;
  }

  const suggestion = event.target.closest('[data-tag-suggestion]');
  if (suggestion) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = document.querySelector('#detailTagInput');
    const list = document.querySelector('#detailTagSuggestions');
    if (input) input.value = suggestion.dataset.tagSuggestion;
    if (list) list.hidden = true;
    input?.blur();
  }
}, true);
