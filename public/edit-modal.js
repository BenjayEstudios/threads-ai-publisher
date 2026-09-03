(() => {
    let editingPostId = null;

    function getModalElements() {
        return {
            overlay: document.querySelector('#editModal'),
            form: document.querySelector('#editModalForm'),
            textarea: document.querySelector('#editModalText'),
            counter: document.querySelector('#editModalCounter'),
            error: document.querySelector('#editModalError'),
            saveButton: document.querySelector('#editModalSave')
        };
    }

    function setEditStatus(message, type = '') {
        const status = document.querySelector('#historyStatus') || document.querySelector('#schedulerStatus');
        if (!status) return;
        status.textContent = message;
        status.className = type ? `status ${type}` : 'status';
    }

    function closeEditModal() {
        const { overlay, form, textarea, error } = getModalElements();
        if (!overlay) return;
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        editingPostId = null;
        form?.reset();
        if (textarea) textarea.value = '';
        if (error) error.textContent = '';
    }

    function updateEditCounter() {
        const { textarea, counter } = getModalElements();
        if (textarea && counter) counter.textContent = textarea.value.length;
    }

    function openEditModal(id, currentText) {
        const { overlay, textarea, error } = getModalElements();
        if (!overlay || !textarea) return;

        editingPostId = id;
        textarea.value = String(currentText || '').trim();
        if (error) error.textContent = '';
        updateEditCounter();

        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');

        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        });
    }

    async function saveEditModal(event) {
        event.preventDefault();

        const { textarea, error, saveButton } = getModalElements();
        const text = textarea?.value.trim() || '';

        if (!text) {
            if (error) error.textContent = 'El texto no puede estar vacío.';
            textarea?.focus();
            return;
        }

        if (text.length > 500) {
            if (error) error.textContent = 'El texto supera los 500 caracteres.';
            textarea?.focus();
            return;
        }

        if (!editingPostId) return;

        if (saveButton) saveButton.disabled = true;
        if (error) error.textContent = '';

        try {
            await api(`/api/queue/${encodeURIComponent(editingPostId)}`, {
                method: 'PUT',
                body: JSON.stringify({ text })
            });

            closeEditModal();
            setEditStatus('✏️ Publicación editada correctamente.', 'success');
            await loadState();
        } catch (requestError) {
            if (error) error.textContent = `No se pudo guardar: ${requestError.message}`;
        } finally {
            if (saveButton) saveButton.disabled = false;
        }
    }

    function initEditModal() {
        const { overlay, form, textarea } = getModalElements();
        if (!overlay) return;

        textarea?.addEventListener('input', updateEditCounter);
        form?.addEventListener('submit', saveEditModal);

        overlay.querySelectorAll('[data-edit-close]').forEach(button => {
            button.addEventListener('click', closeEditModal);
        });
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeEditModal();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
                closeEditModal();
            }
        });
    }

    window.editPost = openEditModal;
    window.closeEditModal = closeEditModal;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEditModal);
    } else {
        initEditModal();
    }
})();
