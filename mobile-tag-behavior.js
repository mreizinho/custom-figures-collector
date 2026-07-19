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
