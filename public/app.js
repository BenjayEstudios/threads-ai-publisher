const $ = (selector) => document.querySelector(selector);

const postText = $('#postText');
const counter = $('#counter');
const publishButton = $('#publishButton');
const queueText = $('#queueText');
const addQueueButton = $('#addQueueButton');
const saveScheduleButton = $('#saveScheduleButton');
const addCustomTimeButton = $('#addCustomTimeButton');
const customTime = $('#customTime');
const startButton = $('#startButton');
const pauseButton = $('#pauseButton');
const postsTable = $('#postsTable');
const clearHistoryButton = $('#clearHistoryButton');
const pendingCount = $('#pendingCount');
const publishedCount = $('#publishedCount');
const errorCount = $('#errorCount');
const nextPublish = $('#nextPublish');
const automationBadge = $('#automationBadge');
const manualStatus = $('#manualStatus');
const queueStatus = $('#queueStatus');
const schedulerStatus = $('#schedulerStatus');
const scheduleSummary = $('#scheduleSummary');

async function api(url, options = {}) {
    const method = options.method || 'GET';
    console.log(`📡 ${method} ${url}`);

    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        }
    });

    const text = await response.text();
    let data;

    try {
        data = JSON.parse(text);
    } catch {
        console.error('❌ Respuesta no JSON:', text);
        throw new Error(`El servidor respondió algo inesperado (${response.status})`);
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.error || `Error HTTP ${response.status}`);
    }

    return data;
}

function setStatus(element, message, type = '') {
    if (!element) return;
    element.textContent = message;
    element.className = type ? `status ${type}` : 'status';
}

function updateCounter() {
    if (postText && counter) counter.textContent = postText.value.length;
}

postText?.addEventListener('input', updateCounter);

publishButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    const text = postText.value.trim();

    if (!text) return setStatus(manualStatus, 'Escribe una publicación.', 'error');
    if (text.length > 500) return setStatus(manualStatus, 'La publicación supera los 500 caracteres.', 'error');

    publishButton.disabled = true;
    setStatus(manualStatus, 'Publicando...');

    try {
        const data = await api('/api/publish', {
            method: 'POST',
            body: JSON.stringify({ text })
        });
        setStatus(manualStatus, `✅ Publicado correctamente. ID: ${data.postId}`, 'success');
        postText.value = '';
        updateCounter();
        await loadState();
    } catch (error) {
        setStatus(manualStatus, `❌ ${error.message}`, 'error');
    } finally {
        publishButton.disabled = false;
    }
});

addQueueButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    const text = queueText.value.trim();

    if (!text) return setStatus(queueStatus, 'Escribe al menos una publicación.', 'error');

    addQueueButton.disabled = true;
    setStatus(queueStatus, 'Agregando a la cola...');

    try {
        const data = await api('/api/queue', {
            method: 'POST',
            body: JSON.stringify({ text })
        });
        setStatus(queueStatus, `✅ ${data.added} publicación(es) agregada(s).`, 'success');
        queueText.value = '';
        await loadState();
    } catch (error) {
        setStatus(queueStatus, `❌ ${error.message}`, 'error');
    } finally {
        addQueueButton.disabled = false;
    }
});

function getSelectedTimes() {
    return [...document.querySelectorAll('.schedule-time:checked')]
        .map(input => input.value)
        .sort();
}

function updateScheduleSummary() {
    const times = getSelectedTimes();
    if (scheduleSummary) {
        scheduleSummary.textContent = times.length
            ? `${times.length} horario(s): ${times.join(' · ')}`
            : '0 horarios seleccionados';
    }
}

document.querySelectorAll('.schedule-time').forEach(input => {
    input.addEventListener('change', updateScheduleSummary);
});

addCustomTimeButton?.addEventListener('click', () => {
    const value = customTime.value;
    if (!value) {
        setStatus(schedulerStatus, 'Selecciona una hora para agregarla.', 'error');
        return;
    }

    const exists = [...document.querySelectorAll('.schedule-time')].some(input => input.value === value);
    if (exists) {
        setStatus(schedulerStatus, 'Ese horario ya está disponible.', 'error');
        return;
    }

    const label = document.createElement('label');
    label.className = 'time-option custom-time-option';
    label.innerHTML = `<input type="checkbox" class="schedule-time" value="${escapeHtml(value)}" checked><span>${escapeHtml(value)}</span>`;
    document.querySelector('.schedule-slots').appendChild(label);

    const checkbox = label.querySelector('input');
    checkbox.addEventListener('change', updateScheduleSummary);
    customTime.value = '';
    updateScheduleSummary();
});

saveScheduleButton?.addEventListener('click', async () => {
    const times = getSelectedTimes();
    if (!times.length) {
        setStatus(schedulerStatus, 'Selecciona al menos un horario.', 'error');
        return;
    }

    saveScheduleButton.disabled = true;
    try {
        const data = await api('/api/schedule', {
            method: 'PUT',
            body: JSON.stringify({ times })
        });
        setStatus(schedulerStatus, `✅ Horarios guardados: ${data.settings.dailyTimes.join(', ')}`, 'success');
        await loadState();
    } catch (error) {
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    } finally {
        saveScheduleButton.disabled = false;
    }
});

startButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    const times = getSelectedTimes();

    if (!times.length) {
        setStatus(schedulerStatus, 'Selecciona al menos un horario.', 'error');
        return;
    }

    startButton.disabled = true;
    setStatus(schedulerStatus, 'Programando automatización...');

    try {
        const data = await api('/api/automation/start', {
            method: 'POST',
            body: JSON.stringify({ times })
        });

        setStatus(schedulerStatus, `▶ Automatización iniciada. Primera publicación: ${formatDate(data.settings.nextPublishAt)}`, 'success');
        await loadState();
    } catch (error) {
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    } finally {
        startButton.disabled = false;
    }
});

pauseButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    pauseButton.disabled = true;

    try {
        await api('/api/automation/pause', { method: 'POST', body: JSON.stringify({}) });
        setStatus(schedulerStatus, '⏸ Automatización pausada.', 'success');
        await loadState();
    } catch (error) {
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    } finally {
        pauseButton.disabled = false;
    }
});

async function deletePost(id) {
    if (!confirm('¿Eliminar esta publicación?')) return;
    try {
        await api(`/api/queue/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await loadState();
    } catch (error) {
        alert(`No se pudo eliminar: ${error.message}`);
    }
}

async function retryPost(id) {
    if (!confirm('¿Volver a poner esta publicación en la cola?')) return;
    try {
        await api(`/api/queue/${encodeURIComponent(id)}/retry`, {
            method: 'POST',
            body: JSON.stringify({})
        });
        setStatus(schedulerStatus, '🔄 Publicación devuelta a la cola.', 'success');
        await loadState();
    } catch (error) {
        alert(`No se pudo reintentar: ${error.message}`);
    }
}

window.deletePost = deletePost;
window.retryPost = retryPost;

clearHistoryButton?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar todo el historial de publicaciones y errores?')) return;

    try {
        await api('/api/history', { method: 'DELETE' });
        setStatus(schedulerStatus, '✅ Historial limpiado.', 'success');
        await loadState();
    } catch (error) {
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    }
});

function renderPosts(posts, settings) {
    if (!postsTable) return;

    const ordered = [...posts].reverse();
    const schedule = buildScheduleMap(posts, settings);

    if (!ordered.length) {
        postsTable.innerHTML = `<tr><td colspan="5" class="empty">No hay publicaciones todavía.</td></tr>`;
        return;
    }

    postsTable.innerHTML = ordered.map(post => {
        const isError = post.status === 'error';
        const isPublished = post.status === 'published';
        const statusText = {
            pending: 'Pendiente',
            publishing: 'Publicando',
            published: 'Publicado',
            error: 'Error'
        }[post.status] || post.status;

        let action = '';
        if (post.status === 'pending') {
            action = `<button class="delete-button" onclick="deletePost('${escapeJs(post.id)}')">Eliminar</button>`;
        } else if (isError) {
            action = `<div class="row-actions"><button class="retry-button" onclick="retryPost('${escapeJs(post.id)}')">↻ Reintentar</button><button class="delete-button" onclick="deletePost('${escapeJs(post.id)}')">Eliminar</button></div>`;
        }

        const scheduledAt = post.scheduledAt || schedule.get(post.id) || null;
        const publishedAt = isPublished ? post.publishedAt : null;

        return `
            <tr class="${isError ? 'error-row' : ''}">
                <td><div class="post-text">${escapeHtml(post.text)}</div>${post.error ? `<div class="row-error">⚠ ${escapeHtml(post.error)}</div>` : ''}</td>
                <td><span class="pill ${escapeHtml(post.status)}">${statusText}</span></td>
                <td><div class="date-cell"><span class="date-label">${scheduledAt ? '📅' : '—'}</span><span>${scheduledAt ? formatDate(scheduledAt) : 'Sin programar'}</span></div></td>
                <td><div class="date-cell"><span class="date-label">${publishedAt ? '✅' : '—'}</span><span>${publishedAt ? formatDate(publishedAt) : '—'}</span></div></td>
                <td>${action}</td>
            </tr>`;
    }).join('');
}

function buildScheduleMap(posts, settings) {
    const schedule = new Map();
    const times = Array.isArray(settings?.dailyTimes) ? [...settings.dailyTimes].sort() : [];
    if (!settings?.autoPublish || !times.length) return schedule;

    let cursor = settings.nextPublishAt ? new Date(settings.nextPublishAt) : null;
    if (!cursor || Number.isNaN(cursor.getTime())) return schedule;

    const pendingPosts = posts
        .filter(post => post.status === 'pending')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    pendingPosts.forEach(post => {
        schedule.set(post.id, cursor.toISOString());
        cursor = nextDailyDate(cursor, times);
    });

    return schedule;
}

function nextDailyDate(fromDate, times) {
    const base = new Date(fromDate);
    base.setSeconds(0, 0);

    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
        const day = new Date(base);
        day.setDate(base.getDate() + dayOffset);

        for (const time of times) {
            const [hours, minutes] = String(time).split(':').map(Number);
            const candidate = new Date(day);
            candidate.setHours(hours, minutes, 0, 0);
            if (candidate.getTime() > fromDate.getTime()) return candidate;
        }
    }

    return null;
}

async function loadState() {
    try {
        const data = await api('/api/state');
        const { posts, settings, stats } = data;

        pendingCount.textContent = stats.pending;
        publishedCount.textContent = stats.published;
        errorCount.textContent = stats.errors;
        renderPosts(posts, settings);

        if (settings.autoPublish) {
            automationBadge.textContent = '▶ Activo';
            automationBadge.className = 'badge active';
        } else {
            automationBadge.textContent = stats.errors > 0 ? '⚠️ Pausado por error' : '⏸ Pausado';
            automationBadge.className = stats.errors > 0 ? 'badge error-badge' : 'badge paused';
        }

        nextPublish.textContent = settings.autoPublish && settings.nextPublishAt
            ? formatDate(settings.nextPublishAt)
            : '—';

        syncScheduleInputs(settings.dailyTimes || []);
    } catch (error) {
        console.error('❌ Error cargando estado:', error);
    }
}

function syncScheduleInputs(times) {
    const normalized = new Set(times);
    document.querySelectorAll('.schedule-time').forEach(input => {
        input.checked = normalized.has(input.value);
    });
    updateScheduleSummary();
}

function formatDate(date) {
    if (!date) return '—';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '—';

    return parsed.toLocaleString('es-CL', {
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: false
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeJs(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

updateCounter();
updateScheduleSummary();
loadState();
setInterval(loadState, 5000);
