const postText = document.getElementById('postText');
const counter = document.getElementById('counter');
const publishButton = document.getElementById('publishButton');
const manualStatus = document.getElementById('manualStatus');
const queueText = document.getElementById('queueText');
const addQueueButton = document.getElementById('addQueueButton');
const queueStatus = document.getElementById('queueStatus');
const intervalValue = document.getElementById('intervalValue');
const intervalUnit = document.getElementById('intervalUnit');
const saveSettingsButton = document.getElementById('saveSettingsButton');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const schedulerStatus = document.getElementById('schedulerStatus');
const clearHistoryButton = document.getElementById('clearHistoryButton');

function escapeHtml(value) {
    return String(value).replace(/[&<>\'"]/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[c]));
}

function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

function formatNext(value) {
    if (!value) return '—';
    const diff = new Date(value).getTime() - Date.now();
    if (diff <= 0) return 'Ahora';
    const minutes = Math.ceil(diff / 60000);
    if (minutes < 60) return `En ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `En ${hours}h ${rest}m` : `En ${hours}h`;
}

function setStatus(element, message, type = '') {
    element.textContent = message;
    element.className = `status ${type}`;
}

async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok || data.success === false) {
        throw new Error(data.error?.message || data.error || 'Ocurrió un error');
    }
    return data;
}

postText.addEventListener('input', () => counter.textContent = postText.value.length);

publishButton.addEventListener('click', async () => {
    const text = postText.value.trim();
    if (!text) return setStatus(manualStatus, 'Escribe una publicación primero.', 'error');
    publishButton.disabled = true;
    publishButton.textContent = 'Publicando...';
    setStatus(manualStatus, 'Enviando a Threads...');
    try {
        await api('/api/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        postText.value = '';
        counter.textContent = '0';
        setStatus(manualStatus, '✅ Publicación realizada correctamente.', 'success');
        loadState();
    } catch (error) {
        setStatus(manualStatus, `❌ ${error.message}`, 'error');
    } finally {
        publishButton.disabled = false;
        publishButton.textContent = '🧵 Publicar ahora';
    }
});

addQueueButton.addEventListener('click', async () => {
    const text = queueText.value.trim();
    if (!text) return setStatus(queueStatus, 'Agrega al menos una nota.', 'error');
    addQueueButton.disabled = true;
    try {
        const data = await api('/api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        queueText.value = '';
        setStatus(queueStatus, `✅ ${data.added} publicación(es) agregada(s) a la cola.`, 'success');
        loadState();
    } catch (error) {
        setStatus(queueStatus, `❌ ${error.message}`, 'error');
    } finally {
        addQueueButton.disabled = false;
    }
});

saveSettingsButton.addEventListener('click', async () => {
    try {
        await api('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: intervalValue.value, unit: intervalUnit.value })
        });
        setStatus(schedulerStatus, '✅ Intervalo guardado.', 'success');
        loadState();
    } catch (error) {
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    }
});

startButton.addEventListener('click', async () => {
    try {
        await api('/api/automation/start', { method: 'POST' });
        setStatus(schedulerStatus, '▶ Automatización iniciada. La primera publicación se enviará ahora.', 'success');
        loadState();
    } catch (error) {
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    }
});

pauseButton.addEventListener('click', async () => {
    try {
        await api('/api/automation/pause', { method: 'POST' });
        setStatus(schedulerStatus, '⏸ Automatización pausada. La cola se conserva.', 'success');
        loadState();
    } catch (error) {
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    }
});

clearHistoryButton.addEventListener('click', async () => {
    if (!confirm('¿Eliminar del historial las publicaciones publicadas y los errores?')) return;
    try {
        await api('/api/history', { method: 'DELETE' });
        loadState();
    } catch (error) {
        alert(error.message);
    }
});

async function deletePost(id) {
    if (!confirm('¿Eliminar esta publicación pendiente?')) return;
    try {
        await api(`/api/queue/${encodeURIComponent(id)}`, { method: 'DELETE' });
        loadState();
    } catch (error) {
        alert(error.message);
    }
}

function renderPosts(posts) {
    const table = document.getElementById('postsTable');
    if (!posts.length) {
        table.innerHTML = '<tr><td colspan="4" class="empty">No hay publicaciones todavía.</td></tr>';
        return;
    }
    const ordered = [...posts].reverse();
    table.innerHTML = ordered.map(post => {
        const labels = {
            pending: '<span class="pill pending">Pendiente</span>',
            publishing: '<span class="pill publishing">Publicando</span>',
            published: '<span class="pill published">Publicado</span>',
            error: '<span class="pill error">Error</span>'
        };
        const action = post.status === 'pending' ? `<button class="delete-button" data-id="${escapeHtml(post.id)}">Eliminar</button>` : '';
        const error = post.error ? `<small class="row-error">${escapeHtml(post.error)}</small>` : '';
        return `<tr><td><div class="post-text">${escapeHtml(post.text)}</div>${error}</td><td>${labels[post.status] || escapeHtml(post.status)}</td><td>${formatDate(post.publishedAt || post.scheduledAt || post.createdAt)}</td><td>${action}</td></tr>`;
    }).join('');

    table.querySelectorAll('.delete-button').forEach(button => {
        button.addEventListener('click', () => deletePost(button.dataset.id));
    });
}

async function loadState() {
    try {
        const data = await api('/api/state');
        document.getElementById('pendingCount').textContent = data.stats.pending;
        document.getElementById('publishedCount').textContent = data.stats.published;
        document.getElementById('errorCount').textContent = data.stats.errors;
        document.getElementById('nextPublish').textContent = formatNext(data.settings.nextPublishAt);

        const badge = document.getElementById('automationBadge');
        badge.textContent = data.settings.autoPublish ? '▶ Activo' : '⏸ Pausado';
        badge.className = `badge ${data.settings.autoPublish ? 'active' : 'paused'}`;

        const minutes = Number(data.settings.intervalMinutes || 60);
        if (minutes % 1440 === 0) {
            intervalValue.value = minutes / 1440;
            intervalUnit.value = 'days';
        } else if (minutes % 60 === 0) {
            intervalValue.value = minutes / 60;
            intervalUnit.value = 'hours';
        } else {
            intervalValue.value = minutes;
            intervalUnit.value = 'minutes';
        }
        renderPosts(data.posts);
    } catch (error) {
        console.error(error);
    }
}

loadState();
setInterval(loadState, 10000);
