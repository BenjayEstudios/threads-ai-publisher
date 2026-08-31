require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const THREADS_API = 'https://graph.threads.net/v1.0';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

function defaultStore() {
    return {
        posts: [],
        settings: {
            autoPublish: false,
            intervalMinutes: 60,
            nextPublishAt: null
        }
    };
}

function ensureStore() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify(defaultStore(), null, 2));
    }
}

function readStore() {
    ensureStore();
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        return {
            ...defaultStore(),
            ...data,
            settings: { ...defaultStore().settings, ...(data.settings || {}) },
            posts: Array.isArray(data.posts) ? data.posts : []
        };
    } catch (error) {
        console.error('No se pudo leer store.json:', error);
        return defaultStore();
    }
}

function writeStore(store) {
    ensureStore();
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(store, null, 2));
    fs.renameSync(tempFile, DB_FILE);
}

function normalizeText(text) {
    return typeof text === 'string' ? text.trim() : '';
}

function intervalToMinutes(value, unit) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;

    const multipliers = {
        minutes: 1,
        hours: 60,
        days: 1440
    };

    return Math.round(number * (multipliers[unit] || 60));
}

function createQueuePost(text) {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        status: 'pending',
        createdAt: new Date().toISOString(),
        scheduledAt: null,
        publishedAt: null,
        threadsPostId: null,
        error: null
    };
}

async function publishToThreads(text) {
    if (!process.env.THREADS_ACCESS_TOKEN || !process.env.THREADS_USER_ID) {
        throw new Error('Faltan THREADS_ACCESS_TOKEN o THREADS_USER_ID en .env');
    }

    const createResponse = await fetch(
        `${THREADS_API}/${process.env.THREADS_USER_ID}/threads`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                media_type: 'TEXT',
                text,
                access_token: process.env.THREADS_ACCESS_TOKEN
            })
        }
    );

    const createData = await createResponse.json();
    if (!createResponse.ok) {
        throw new Error(createData?.error?.message || JSON.stringify(createData));
    }

    const publishResponse = await fetch(
        `${THREADS_API}/${process.env.THREADS_USER_ID}/threads_publish`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                creation_id: createData.id,
                access_token: process.env.THREADS_ACCESS_TOKEN
            })
        }
    );

    const publishData = await publishResponse.json();
    if (!publishResponse.ok) {
        throw new Error(publishData?.error?.message || JSON.stringify(publishData));
    }

    return {
        creationId: createData.id,
        postId: publishData.id
    };
}

async function publishQueuePost(postId) {
    const store = readStore();
    const post = store.posts.find(item => item.id === postId);

    if (!post || post.status !== 'pending') return null;

    post.status = 'publishing';
    post.error = null;
    writeStore(store);

    try {
        const result = await publishToThreads(post.text);
        const updated = readStore();
        const current = updated.posts.find(item => item.id === postId);

        if (current) {
            current.status = 'published';
            current.publishedAt = new Date().toISOString();
            current.threadsPostId = result.postId;
            current.error = null;
        }

        writeStore(updated);
        console.log(`✅ Publicado: ${postId}`);
        return result;
    } catch (error) {
        const updated = readStore();
        const current = updated.posts.find(item => item.id === postId);

        if (current) {
            current.status = 'error';
            current.error = error.message;
        }

        writeStore(updated);
        console.error(`❌ Error publicando ${postId}:`, error.message);
        return null;
    }
}

async function schedulerTick() {
    const store = readStore();
    const settings = store.settings;

    if (!settings.autoPublish || !settings.nextPublishAt) return;

    const due = Date.now() >= new Date(settings.nextPublishAt).getTime();
    if (!due) return;

    const nextPost = store.posts.find(item => item.status === 'pending');

    if (!nextPost) {
        settings.nextPublishAt = null;
        settings.autoPublish = false;
        writeStore(store);
        console.log('📭 Cola vacía. Publicación automática detenida.');
        return;
    }

    const intervalMs = Math.max(1, Number(settings.intervalMinutes)) * 60 * 1000;
    nextPost.scheduledAt = new Date().toISOString();
    settings.nextPublishAt = new Date(Date.now() + intervalMs).toISOString();
    writeStore(store);

    await publishQueuePost(nextPost.id);

    const after = readStore();
    const hasPending = after.posts.some(item => item.status === 'pending');
    if (!hasPending) {
        after.settings.nextPublishAt = null;
        after.settings.autoPublish = false;
        writeStore(after);
        console.log('📭 Última publicación enviada. Cola finalizada.');
    }
}

// Publicar inmediatamente una nota, sin pasar por la cola.
app.post('/api/publish', async (req, res) => {
    try {
        const text = normalizeText(req.body.text);
        if (!text) return res.status(400).json({ success: false, error: 'El texto está vacío' });
        if (text.length > 500) return res.status(400).json({ success: false, error: 'El texto supera los 500 caracteres' });

        const result = await publishToThreads(text);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener estado, cola, configuración e historial.
app.get('/api/state', (req, res) => {
    const store = readStore();
    const pending = store.posts.filter(post => post.status === 'pending' || post.status === 'publishing');
    const published = store.posts.filter(post => post.status === 'published');
    const errors = store.posts.filter(post => post.status === 'error');

    res.json({
        success: true,
        settings: store.settings,
        posts: store.posts,
        stats: {
            pending: pending.length,
            published: published.length,
            errors: errors.length,
            total: store.posts.length
        }
    });
});

// Agregar una o varias notas. Los bloques separados por una línea vacía son notas distintas.
app.post('/api/queue', (req, res) => {
    try {
        const rawTexts = Array.isArray(req.body.texts)
            ? req.body.texts
            : String(req.body.text || '').split(/\n\s*\n/);

        const texts = rawTexts
            .map(normalizeText)
            .filter(Boolean)
            .map(text => text.slice(0, 500));

        if (!texts.length) return res.status(400).json({ success: false, error: 'No hay notas para agregar' });

        const store = readStore();
        const newPosts = texts.map(createQueuePost);
        store.posts.push(...newPosts);
        writeStore(store);

        res.json({ success: true, added: newPosts.length, posts: newPosts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Eliminar una nota pendiente.
app.delete('/api/queue/:id', (req, res) => {
    const store = readStore();
    const index = store.posts.findIndex(post => post.id === req.params.id);

    if (index === -1) return res.status(404).json({ success: false, error: 'Publicación no encontrada' });
    if (store.posts[index].status !== 'pending') {
        return res.status(400).json({ success: false, error: 'Solo se pueden eliminar publicaciones pendientes' });
    }

    store.posts.splice(index, 1);
    writeStore(store);
    res.json({ success: true });
});

// Configurar intervalo. No inicia la cola por sí solo.
app.put('/api/settings', (req, res) => {
    const minutes = intervalToMinutes(req.body.value, req.body.unit);
    if (!minutes) {
        return res.status(400).json({ success: false, error: 'Intervalo inválido' });
    }

    const store = readStore();
    store.settings.intervalMinutes = minutes;
    writeStore(store);
    res.json({ success: true, settings: store.settings });
});

// Activar la publicación automática.
app.post('/api/automation/start', (req, res) => {
    const store = readStore();
    const hasPending = store.posts.some(post => post.status === 'pending');

    if (!hasPending) {
        return res.status(400).json({ success: false, error: 'No hay publicaciones pendientes en la cola' });
    }

    const startAt = req.body.startAt ? new Date(req.body.startAt) : new Date();
    if (Number.isNaN(startAt.getTime())) {
        return res.status(400).json({ success: false, error: 'Fecha de inicio inválida' });
    }

    store.settings.autoPublish = true;
    store.settings.nextPublishAt = startAt.toISOString();
    writeStore(store);

    res.json({ success: true, settings: store.settings });
});

// Pausar sin perder la cola.
app.post('/api/automation/pause', (req, res) => {
    const store = readStore();
    store.settings.autoPublish = false;
    writeStore(store);
    res.json({ success: true, settings: store.settings });
});

// Eliminar todo el historial y mantener solo las publicaciones pendientes.
app.delete('/api/history', (req, res) => {
    const store = readStore();
    store.posts = store.posts.filter(post => post.status !== 'published' && post.status !== 'error');
    writeStore(store);
    res.json({ success: true });
});

ensureStore();
setInterval(() => {
    schedulerTick().catch(error => console.error('Scheduler:', error));
}, 15 * 1000);

app.listen(PORT, () => {
    console.log(`🚀 Threads AI Publisher V2 funcionando en http://localhost:${PORT}`);
});
