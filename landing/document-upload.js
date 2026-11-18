const fileLimit = 5;
const sizeLimit = 10 * 1024 * 1024;
const supportedExtension = /\.(pdf|jpe?g|png|csv|xlsx?)$/i;

export function createDocumentForm(user) {
  const template = document.getElementById('document-upload-template');
  const form = template.content.firstElementChild.cloneNode(true);
  const input = form.querySelector('input[type="file"]');
  const drop = form.querySelector('.document-drop');
  const list = form.querySelector('.document-files');
  const status = form.querySelector('[role="status"]');
  const submit = form.querySelector('[type="submit"]');
  let files = [];

  function selectFiles(selection) {
    const incoming = Array.from(selection);
    files = [];
    list.replaceChildren();
    if (incoming.length > fileLimit) {
      status.textContent = 'Choose up to 5 files.';
      return;
    }
    if (incoming.some(file => file.size === 0 || file.size > sizeLimit || !supportedExtension.test(file.name))) {
      status.textContent = 'Choose supported, non-empty files up to 10 MB each.';
      return;
    }

    files = incoming;
    status.textContent = '';
    for (const file of files) {
      const item = document.createElement('li');
      item.textContent = file.name;
      list.append(item);
    }
  }

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    selectFiles(input.files);
    input.value = '';
  });
  drop.addEventListener('dragover', event => {
    event.preventDefault();
    if (!submit.disabled) drop.classList.add('dragging');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', event => {
    event.preventDefault();
    drop.classList.remove('dragging');
    if (!submit.disabled) selectFiles(event.dataTransfer.files);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!files.length) {
      status.textContent = 'Attach at least one file.';
      return;
    }
    const body = new FormData(form);
    for (const file of files) body.append('files', file);

    submit.disabled = true;
    drop.disabled = true;
    status.textContent = 'Uploading…';
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(result?.saved) || !result.saved.length) {
        throw new Error(result?.error || result?.message || 'Document upload service is unavailable.');
      }
      const failed = new Set(result.errors || []);
      selectFiles(files.filter(file => failed.has(file.name)));
      status.textContent = failed.size
        ? `${result.saved.length} uploaded. Retry the remaining files.`
        : `${result.saved.length} file(s) uploaded.`;
    } catch (error) {
      status.textContent = error.message || 'Upload failed. Try again.';
    } finally {
      submit.disabled = false;
      drop.disabled = false;
    }
  });

  return form;
}
