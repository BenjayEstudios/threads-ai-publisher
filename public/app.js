const $ = (selector) => document.querySelector(selector);

// Elementos que existen realmente en public/index.html
const postText = $('#postText');
const counter = $('#counter');
const publishButton = $('#publishButton');

const queueText = $('#queueText');
const addQueueButton = $('#addQueueButton');

const intervalValue = $('#intervalValue');
const intervalUnit = $('#intervalUnit');
const saveSettingsButton = $('#saveSettingsButton');
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

// ============================================================
// API
// ============================================================

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
    } catch (error) {
        console.error('❌ Respuesta no JSON:', text);
        throw new Error(`El servidor respondió algo inesperado (${response.status})`);
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.error || `Error HTTP ${response.status}`);
    }

    return data;
}

// ============================================================
// CONTADOR
// ============================================================

function updateCounter() {
    if (!postText || !counter) return;
    counter.textContent = postText.value.length;
}

postText?.addEventListener('input', updateCounter);

// ============================================================
// PUBLICACIÓN MANUAL
// ============================================================

publishButton?.addEventListener('click', async (event) => {
    event.preventDefault();

    const text = postText.value.trim();

    if (!text) {
        setStatus(manualStatus, 'Escribe una publicación.', 'error');
        return;
    }

    if (text.length > 500) {
        setStatus(manualStatus, 'La publicación supera los 500 caracteres.', 'error');
        return;
    }

    publishButton.disabled = true;
    setStatus(manualStatus, 'Publicando...', '');

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
        console.error('❌ Publicación manual:', error);
        setStatus(manualStatus, `❌ ${error.message}`, 'error');
    } finally {
        publishButton.disabled = false;
    }
});

// ============================================================
// AGREGAR A COLA
// ============================================================

addQueueButton?.addEventListener('click', async (event) => {
    event.preventDefault();

    const text = queueText.value.trim();

    if (!text) {
        setStatus(queueStatus, 'Escribe al menos una publicación.', 'error');
        return;
    }

    addQueueButton.disabled = true;
    setStatus(queueStatus, 'Agregando a la cola...', '');

    try {
        const data = await api('/api/queue', {
            method: 'POST',
            body: JSON.stringify({ text })
        });

        setStatus(queueStatus, `✅ ${data.added} publicación(es) agregada(s).`, 'success');
        queueText.value = '';
        await loadState();
    } catch (error) {
        console.error('❌ Cola:', error);
        setStatus(queueStatus, `❌ ${error.message}`, 'error');
    } finally {
        addQueueButton.disabled = false;
    }
});

// ============================================================
// GUARDAR INTERVALO
// ============================================================

saveSettingsButton?.addEventListener('click', async (event) => {
    event.preventDefault();

    const value = Number(intervalValue.value);
    const unit = intervalUnit.value;

    if (!Number.isFinite(value) || value <= 0) {
        setStatus(schedulerStatus, 'El intervalo debe ser mayor que 0.', 'error');
        return;
    }

    saveSettingsButton.disabled = true;

    try {
        const data = await api('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ value, unit })
        });

        setStatus(schedulerStatus, `✅ Intervalo guardado: ${formatInterval(data.settings.intervalMinutes)}`, 'success');
        await loadState();
    } catch (error) {
        console.error('❌ Configuración:', error);
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    } finally {
        saveSettingsButton.disabled = false;
    }
});

// ============================================================
// INICIAR AUTOMATIZACIÓN
// ============================================================

startButton?.addEventListener('click', async (event) => {
    event.preventDefault();

    console.log('🔥 BOTÓN INICIAR PRESIONADO');
    console.log('📤 Enviando POST /api/automation/start');

    startButton.disabled = true;
    setStatus(schedulerStatus, 'Iniciando automatización...', '');

    try {
        const data = await api('/api/automation/start', {
            method: 'POST',
            body: JSON.stringify({})
        });

        console.log('✅ Automatización iniciada:', data);
        setStatus(schedulerStatus, '▶ Automatización iniciada correctamente.', 'success');
        await loadState();
    } catch (error) {
        console.error('❌ Error iniciando automatización:', error);
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    } finally {
        startButton.disabled = false;
    }
});

// ============================================================
// PAUSAR AUTOMATIZACIÓN
// ============================================================

pauseButton?.addEventListener('click', async (event) => {
    event.preventDefault();

    pauseButton.disabled = true;

    try {
        await api('/api/automation/pause', {
            method: 'POST',
            body: JSON.stringify({})
        });

        setStatus(schedulerStatus, '⏸ Automatización pausada.', 'success');
        await loadState();
    } catch (error) {
        console.error('❌ Pausa:', error);
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    } finally {
        pauseButton.disabled = false;
    }
});

// ============================================================
// ELIMINAR PUBLICACIÓN
// ============================================================

async function deletePost(id) {
    if (!confirm('¿Eliminar esta publicación?')) return;

    try {
        await api(`/api/queue/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });

        await loadState();
    } catch (error) {
        alert(`No se pudo eliminar: ${error.message}`);
    }
}

window.deletePost = deletePost;

// ============================================================
// LIMPIAR HISTORIAL
// ============================================================

clearHistoryButton?.addEventListener('click', async (event) => {
    event.preventDefault();

    if (!confirm('¿Eliminar todo el historial de publicaciones y errores?')) return;

    try {
        await api('/api/history', {
            method: 'DELETE'
        });

        setStatus(schedulerStatus, '✅ Historial limpiado.', 'success');
        await loadState();
    } catch (error) {
        setStatus(schedulerStatus, `❌ ${error.message}`, 'error');
    }
});

// ============================================================
// TABLA DE PUBLICACIONES
// ============================================================

function renderPosts(posts) {
    if (!postsTable) return;

    const ordered = [...posts].reverse();

    if (!ordered.length) {
        postsTable.innerHTML = `
            <tr>
                <td colspan="4" class="empty">No hay publicaciones todavía.</td>
            </tr>
        `;
        return;
    }

    postsTable.innerHTML = ordered.map(post => {
        const isPending = post.status === 'pending';
        const statusText = {
            pending: 'Pendiente',
            publishing: 'Publicando',
            published: 'Publicado',
            error: 'Error'
        }[post.status] || post.status;

        return `
            <tr>
                <td>
                    <div class="post-text">${escapeHtml(post.text)}</div>
                    ${post.error ? `<div class="row-error">${escapeHtml(post.error)}</div>` : ''}
                </td>
                <td>
                    <span class="pill ${escapeHtml(post.status)}">${statusText}</span>
                </td>
                <td>
                    ${formatDate(post.publishedAt || post.createdAt)}
                </td>
                <td>
                    ${isPending ? `<button class="delete-button" onclick="deletePost('${escapeJs(post.id)}')">Eliminar</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// ESTADO
// ============================================================

async function loadState() {
    try {
        const data = await api('/api/state');
        const { posts, settings, stats } = data;

        pendingCount.textContent = stats.pending;
        publishedCount.textContent = stats.published;
        errorCount.textContent = stats.errors;

        renderPosts(posts);

        if (settings.autoPublish) {
            automationBadge.textContent = '▶ Activo';
            automationBadge.className = 'badge active';
        } else {
            automationBadge.textContent = '⏸ Pausado';
            automationBadge.className = 'badge paused';
        }

        nextPublish.textContent = settings.nextPublishAt
            ? formatDate(settings.nextPublishAt)
            : '—';

        syncIntervalInputs(settings.intervalMinutes);
    } catch (error) {
        console.error('❌ Error cargando estado:', error);
    }
}

function syncIntervalInputs(minutes) {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return;

    if (value % 1440 === 0) {
        intervalValue.value = value / 1440;
        intervalUnit.value = 'days';
    } else if (value % 60 === 0) {
        intervalValue.value = value / 60;
        intervalUnit.value = 'hours';
    } else {
        intervalValue.value = value;
        intervalUnit.value = 'minutes';
    }
}

// ============================================================
// UTILIDADES
// ============================================================

function setStatus(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.className = type ? `status ${type}` : 'status';
}

function formatDate(date) {
    if (!date) return '—';

    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '—';

    return parsed.toLocaleString('es-CL');
}

function formatInterval(minutes) {
    const value = Number(minutes);

    if (value % 1440 === 0) return `${value / 1440} día(s)`;
    if (value % 60 === 0) return `${value / 60} hora(s)`;
    return `${value} minuto(s)`;
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

// ============================================================
// INICIO
// ============================================================

updateCounter();
loadState();
setInterval(loadState, 5000);
