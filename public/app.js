const $ = (selector) => document.querySelector(selector);

const postText = $('#postText');
const charCount = $('#charCount');
const publishNow = $('#publishNow');

const queueText = $('#queueText');
const addQueue = $('#addQueue');

const intervalValue = $('#intervalValue');
const intervalUnit = $('#intervalUnit');
const saveInterval = $('#saveInterval');

const startAutomation = $('#startAutomation');
const pauseAutomation = $('#pauseAutomation');

const queueBody = $('#queueBody');
const historyBody = $('#historyBody');

const pendingCount = $('#pendingCount');
const publishedCount = $('#publishedCount');
const errorCount = $('#errorCount');
const totalCount = $('#totalCount');

const automationStatus = $('#automationStatus');
const nextPublish = $('#nextPublish');

const manualStatus = $('#manualStatus');
const queueStatus = $('#queueStatus');


// ============================================================
// API
// ============================================================

async function api(url, options = {}) {

    console.log(`📡 ${options.method || 'GET'} ${url}`);

    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch (error) {

        console.error(
            '❌ Respuesta no JSON:',
            text
        );

        throw new Error(
            `El servidor respondió algo inesperado (${response.status})`
        );
    }

    if (!response.ok || data.success === false) {

        throw new Error(
            data.error ||
            `Error HTTP ${response.status}`
        );
    }

    return data;
}


// ============================================================
// CONTADOR
// ============================================================

function updateCounter() {

    if (!postText) return;

    charCount.textContent =
        `${postText.value.length}/500`;
}

postText?.addEventListener(
    'input',
    updateCounter
);


// ============================================================
// PUBLICACIÓN MANUAL
// ============================================================

publishNow?.addEventListener(
    'click',
    async () => {

        const text =
            postText.value.trim();

        if (!text) {

            manualStatus.textContent =
                'Escribe una publicación.';

            manualStatus.className =
                'status error';

            return;
        }

        if (text.length > 500) {

            manualStatus.textContent =
                'La publicación supera los 500 caracteres.';

            manualStatus.className =
                'status error';

            return;
        }

        publishNow.disabled = true;

        manualStatus.textContent =
            'Publicando...';

        manualStatus.className =
            'status';

        try {

            const data =
                await api(
                    '/api/publish',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            text
                        })
                    }
                );

            manualStatus.textContent =
                `Publicado correctamente. ID: ${data.postId}`;

            manualStatus.className =
                'status success';

            postText.value = '';

            updateCounter();

            await loadState();

        } catch (error) {

            console.error(error);

            manualStatus.textContent =
                `❌ ${error.message}`;

            manualStatus.className =
                'status error';

        } finally {

            publishNow.disabled = false;
        }
    }
);


// ============================================================
// AGREGAR A COLA
// ============================================================

addQueue?.addEventListener(
    'click',
    async () => {

        const text =
            queueText.value.trim();

        if (!text) {

            queueStatus.textContent =
                'Escribe al menos una nota.';

            queueStatus.className =
                'status error';

            return;
        }

        addQueue.disabled = true;

        queueStatus.textContent =
            'Agregando...';

        queueStatus.className =
            'status';

        try {

            const data =
                await api(
                    '/api/queue',
                    {
                        method: 'POST',

                        body: JSON.stringify({
                            text
                        })
                    }
                );

            queueStatus.textContent =
                `✅ ${data.added} publicación(es) agregada(s).`;

            queueStatus.className =
                'status success';

            queueText.value = '';

            await loadState();

        } catch (error) {

            console.error(error);

            queueStatus.textContent =
                `❌ ${error.message}`;

            queueStatus.className =
                'status error';

        } finally {

            addQueue.disabled = false;
        }
    }
);


// ============================================================
// GUARDAR INTERVALO
// ============================================================

saveInterval?.addEventListener(
    'click',
    async () => {

        try {

            const value =
                Number(intervalValue.value);

            const unit =
                intervalUnit.value;

            await api(
                '/api/settings',
                {
                    method: 'PUT',

                    body: JSON.stringify({
                        value,
                        unit
                    })
                }
            );

            queueStatus.textContent =
                '✅ Intervalo guardado.';

            queueStatus.className =
                'status success';

            await loadState();

        } catch (error) {

            queueStatus.textContent =
                `❌ ${error.message}`;

            queueStatus.className =
                'status error';
        }
    }
);


// ============================================================
// INICIAR AUTOMATIZACIÓN
// ============================================================

startAutomation?.addEventListener(
    'click',
    async (event) => {

        // Evita cualquier comportamiento accidental
        // de submit/navegación del botón.
        event.preventDefault();

        console.log(
            '🔥 BOTÓN INICIAR PRESIONADO'
        );

        startAutomation.disabled = true;

        try {

            const data =
                await api(
                    '/api/automation/start',
                    {
                        method: 'POST',

                        body: JSON.stringify({})
                    }
                );

            console.log(
                '✅ Automatización iniciada:',
                data
            );

            await loadState();

        } catch (error) {

            console.error(
                '❌ Error iniciando automatización:',
                error
            );

            queueStatus.textContent =
                `❌ ${error.message}`;

            queueStatus.className =
                'status error';

        } finally {

            startAutomation.disabled = false;
        }
    }
);


// ============================================================
// PAUSAR AUTOMATIZACIÓN
// ============================================================

pauseAutomation?.addEventListener(
    'click',
    async (event) => {

        event.preventDefault();

        try {

            await api(
                '/api/automation/pause',
                {
                    method: 'POST',

                    body: JSON.stringify({})
                }
            );

            await loadState();

        } catch (error) {

            console.error(error);

            queueStatus.textContent =
                `❌ ${error.message}`;

            queueStatus.className =
                'status error';
        }
    }
);


// ============================================================
// ELIMINAR PUBLICACIÓN
// ============================================================

async function deletePost(id) {

    if (
        !confirm(
            '¿Eliminar esta publicación de la cola?'
        )
    ) {
        return;
    }

    try {

        await api(
            `/api/queue/${encodeURIComponent(id)}`,
            {
                method: 'DELETE'
            }
        );

        await loadState();

    } catch (error) {

        alert(
            `No se pudo eliminar: ${error.message}`
        );
    }
}


// ============================================================
// RENDER COLA
// ============================================================

function renderQueue(posts) {

    const pending =
        posts.filter(
            post =>
                post.status === 'pending' ||
                post.status === 'publishing'
        );

    if (!pending.length) {

        queueBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty">
                    No hay publicaciones pendientes.
                </td>
            </tr>
        `;

        return;
    }

    queueBody.innerHTML =
        pending.map(
            post => `

            <tr>

                <td>
                    <span class="pill ${post.status}">
                        ${post.status}
                    </span>
                </td>

                <td>
                    <div class="post-text">
                        ${escapeHtml(post.text)}
                    </div>
                </td>

                <td>
                    ${formatDate(post.createdAt)}
                </td>

                <td>
                    ${
                        post.status === 'pending'
                            ? `
                                <button
                                    class="delete-button"
                                    onclick="deletePost('${post.id}')"
                                >
                                    Eliminar
                                </button>
                            `
                            : ''
                    }
                </td>

            </tr>
        `
        ).join('');
}


// ============================================================
// RENDER HISTORIAL
// ============================================================

function renderHistory(posts) {

    const history =
        posts.filter(
            post =>
                post.status === 'published' ||
                post.status === 'error'
        );

    if (!history.length) {

        historyBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty">
                    Todavía no hay publicaciones en el historial.
                </td>
            </tr>
        `;

        return;
    }

    historyBody.innerHTML =
        history
            .slice()
            .reverse()
            .map(
                post => `

                <tr>

                    <td>
                        <span class="pill ${post.status}">
                            ${post.status}
                        </span>
                    </td>

                    <td>
                        <div class="post-text">
                            ${escapeHtml(post.text)}
                        </div>

                        ${
                            post.error
                                ? `
                                    <span class="row-error">
                                        ${escapeHtml(post.error)}
                                    </span>
                                `
                                : ''
                        }
                    </td>

                    <td>
                        ${
                            post.publishedAt
                                ? formatDate(post.publishedAt)
                                : '-'
                        }
                    </td>

                    <td>
                        ${post.threadsPostId || '-'}
                    </td>

                </tr>
            `
            )
            .join('');
}


// ============================================================
// CARGAR ESTADO
// ============================================================

async function loadState() {

    try {

        const data =
            await api('/api/state');

        const {
            posts,
            settings,
            stats
        } = data;

        pendingCount.textContent =
            stats.pending;

        publishedCount.textContent =
            stats.published;

        errorCount.textContent =
            stats.errors;

        totalCount.textContent =
            stats.total;

        renderQueue(posts);

        renderHistory(posts);

        automationStatus.textContent =
            settings.autoPublish
                ? 'Activo'
                : 'Pausado';

        automationStatus.className =
            settings.autoPublish
                ? 'badge active'
                : 'badge paused';

        if (settings.nextPublishAt) {

            nextPublish.textContent =
                formatDate(
                    settings.nextPublishAt
                );

        } else {

            nextPublish.textContent =
                'No programada';
        }

        if (
            settings.intervalMinutes
        ) {

            const minutes =
                Number(
                    settings.intervalMinutes
                );

            if (minutes % 1440 === 0) {

                intervalValue.value =
                    minutes / 1440;

                intervalUnit.value =
                    'days';

            } else if (
                minutes % 60 === 0
            ) {

                intervalValue.value =
                    minutes / 60;

                intervalUnit.value =
                    'hours';

            } else {

                intervalValue.value =
                    minutes;

                intervalUnit.value =
                    'minutes';
            }
        }

    } catch (error) {

        console.error(
            '❌ Error cargando estado:',
            error
        );
    }
}


// ============================================================
// UTILIDADES
// ============================================================

function formatDate(date) {

    if (!date) return '-';

    const parsed =
        new Date(date);

    if (
        Number.isNaN(
            parsed.getTime()
        )
    ) {
        return '-';
    }

    return parsed.toLocaleString(
        'es-CL'
    );
}

function escapeHtml(value) {

    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}


// ============================================================
// INICIO
// ============================================================

window.deletePost =
    deletePost;

updateCounter();

loadState();

setInterval(
    loadState,
    5000
);