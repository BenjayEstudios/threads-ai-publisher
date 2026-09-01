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

app.use((req, res, next) => {
    console.log(`➡️ ${req.method} ${req.url}`);
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

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
        console.error('❌ Error leyendo store.json:', error);
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
    const multipliers = { minutes: 1, hours: 60, days: 1440 };
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

function isAuthError(errorMessage) {
    const message = String(errorMessage || '').toLowerCase();
    return (
        message.includes('session has expired') ||
        message.includes('session key invalid') ||
        message.includes('token de acceso no válido') ||
        message.includes('invalid access token') ||
        message.includes('error validating access token') ||
        message.includes('oauth') && (message.includes('token') || message.includes('session'))
    );
}

async function publishToThreads(text) {
    if (!process.env.THREADS_ACCESS_TOKEN || !process.env.THREADS_USER_ID) {
        throw new Error('Faltan THREADS_ACCESS_TOKEN o THREADS_USER_ID en .env');
    }

    console.log('🧵 Creando publicación en Threads...');

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

    console.log('✅ Creation ID:', createData.id);
    console.log('🧵 Publicando en Threads...');

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

    console.log('✅ Threads Post ID:', publishData.id);
    return { creationId: createData.id, postId: publishData.id };
}

async function publishQueuePost(postId) {
    const store = readStore();
    const post = store.posts.find(item => item.id === postId);
    if (!post || post.status !== 'pending') return null;

    console.log(`🚀 Publicando nota ${postId}`);
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
        console.log(`🎉 Publicación completada: ${postId}`);
        return { success: true, ...result };
    } catch (error) {
        const updated = readStore();
        const current = updated.posts.find(item => item.id === postId);

        if (current) {
            current.status = 'error';
            current.error = error.message;
        }

        writeStore(updated);
        console.error(`❌ Error publicando ${postId}:`, error.message);

        return {
            success: false,
            authError: isAuthError(error.message),
            error: error.message
        };
    }
}

let schedulerRunning = false;

async function schedulerTick() {
    if (schedulerRunning) return;

    const store = readStore();
    const settings = store.settings;

    if (!settings.autoPublish || !settings.nextPublishAt) return;

    const now = Date.now();
    const nextTime = new Date(settings.nextPublishAt).getTime();

    if (Number.isNaN(nextTime)) {
        settings.autoPublish = false;
        settings.nextPublishAt = null;
        writeStore(store);
        console.error('❌ nextPublishAt inválido. Automatización pausada.');
        return;
    }

    if (now < nextTime) return;

    const nextPost = store.posts.find(post => post.status === 'pending');

    if (!nextPost) {
        settings.autoPublish = false;
        settings.nextPublishAt = null;
        writeStore(store);
        console.log('📭 Cola vacía. Automatización detenida.');
        return;
    }

    schedulerRunning = true;

    try {
        nextPost.scheduledAt = new Date().toISOString();
        writeStore(store);

        console.log(`⏰ Ejecutando publicación automática: ${nextPost.id}`);
        const result = await publishQueuePost(nextPost.id);

        const after = readStore();

        if (result && result.success === false) {
            after.settings.autoPublish = false;
            after.settings.nextPublishAt = null;
            writeStore(after);

            if (result.authError) {
                console.error('🔐 Error de autenticación de Threads. Automatización pausada para proteger la cola.');
            } else {
                console.error('⛔ Error de publicación. Automatización pausada para evitar consumir la cola.');
            }
            return;
        }

        const hasPending = after.posts.some(post => post.status === 'pending');

        if (hasPending) {
            const intervalMs = Math.max(1, Number(after.settings.intervalMinutes)) * 60 * 1000;
            after.settings.nextPublishAt = new Date(Date.now() + intervalMs).toISOString();
            writeStore(after);
            console.log(`⏰ Próxima publicación: ${after.settings.nextPublishAt}`);
        } else {
            after.settings.autoPublish = false;
            after.settings.nextPublishAt = null;
            writeStore(after);
            console.log('📭 Todas las publicaciones fueron procesadas.');
        }
    } finally {
        schedulerRunning = false;
    }
}

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        application: 'Threads AI Publisher',
        version: '2.0.2',
        server: 'V2',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/state', (req, res) => {
    const store = readStore();

    if (!store.settings.autoPublish && store.settings.nextPublishAt) {
        store.settings.nextPublishAt = null;
        writeStore(store);
    }

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

app.post('/api/publish', async (req, res) => {
    try {
        const text = normalizeText(req.body.text);
        if (!text) return res.status(400).json({ success: false, error: 'El texto está vacío' });
        if (text.length > 500) return res.status(400).json({ success: false, error: 'El texto supera los 500 caracteres' });

        const result = await publishToThreads(text);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('❌ Publicación manual:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/queue', (req, res) => {
    try {
        const rawTexts = Array.isArray(req.body.texts)
            ? req.body.texts
            : String(req.body.text || '').split(/\n\s*\n/);

        const texts = rawTexts.map(normalizeText).filter(Boolean).map(text => text.slice(0, 500));
        if (!texts.length) return res.status(400).json({ success: false, error: 'No hay notas para agregar' });

        const store = readStore();
        const newPosts = texts.map(createQueuePost);
        store.posts.push(...newPosts);
        writeStore(store);

        console.log(`📥 ${newPosts.length} publicación(es) agregadas a la cola.`);
        res.json({ success: true, added: newPosts.length, posts: newPosts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/queue/:id', (req, res) => {
    const store = readStore();
    const index = store.posts.findIndex(post => post.id === req.params.id);

    if (index === -1) return res.status(404).json({ success: false, error: 'Publicación no encontrada' });

    const status = store.posts[index].status;
    if (status !== 'pending' && status !== 'error') {
        return res.status(400).json({ success: false, error: 'Solo se pueden eliminar publicaciones pendientes o con error' });
    }

    store.posts.splice(index, 1);
    writeStore(store);
    res.json({ success: true });
});

app.post('/api/queue/:id/retry', (req, res) => {
    const store = readStore();
    const post = store.posts.find(item => item.id === req.params.id);

    if (!post) return res.status(404).json({ success: false, error: 'Publicación no encontrada' });
    if (post.status !== 'error') return res.status(400).json({ success: false, error: 'Solo se pueden reintentar publicaciones con error' });

    post.status = 'pending';
    post.error = null;
    post.scheduledAt = null;
    writeStore(store);

    res.json({ success: true, post });
});

app.put('/api/settings', (req, res) => {
    const minutes = intervalToMinutes(req.body.value, req.body.unit);
    if (!minutes) return res.status(400).json({ success: false, error: 'Intervalo inválido' });

    const store = readStore();
    store.settings.intervalMinutes = minutes;
    writeStore(store);

    console.log(`⚙️ Intervalo configurado: ${minutes} minutos`);
    res.json({ success: true, settings: store.settings });
});

app.post('/api/automation/start', async (req, res) => {
    console.log('🔥 POST /api/automation/start RECIBIDO');

    try {
        const store = readStore();
        const hasPending = store.posts.some(post => post.status === 'pending');

        if (!hasPending) {
            return res.status(400).json({ success: false, error: 'No hay publicaciones pendientes en la cola' });
        }

        const startAt = req.body && req.body.startAt ? new Date(req.body.startAt) : new Date();
        if (Number.isNaN(startAt.getTime())) {
            return res.status(400).json({ success: false, error: 'Fecha de inicio inválida' });
        }

        store.settings.autoPublish = true;
        store.settings.nextPublishAt = startAt.toISOString();
        writeStore(store);

        console.log('▶ AUTOMATIZACIÓN INICIADA');
        console.log('⏰ Primera publicación:', store.settings.nextPublishAt);

        res.json({ success: true, message: 'Automatización iniciada', settings: store.settings });
    } catch (error) {
        console.error('❌ Error iniciando automatización:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/automation/pause', (req, res) => {
    console.log('⏸ PAUSANDO AUTOMATIZACIÓN');
    const store = readStore();
    store.settings.autoPublish = false;
    store.settings.nextPublishAt = null;
    writeStore(store);
    res.json({ success: true, settings: store.settings });
});

app.delete('/api/history', (req, res) => {
    const store = readStore();
    store.posts = store.posts.filter(post => post.status !== 'published' && post.status !== 'error');
    writeStore(store);
    res.json({ success: true });
});

app.use('/api', (req, res) => {
    console.error(`❌ API NO ENCONTRADA: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: `Ruta API no encontrada: ${req.method} ${req.originalUrl}`,
        serverVersion: '2.0.2'
    });
});

ensureStore();
setInterval(() => {
    schedulerTick().catch(error => console.error('❌ Scheduler:', error));
}, 5000);

app.listen(PORT, () => {
    console.log('');
    console.log('==========================================');
    console.log('🚀 THREADS AI PUBLISHER V2.0.2');
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`🩺 http://localhost:${PORT}/api/health`);
    console.log('==========================================');
    console.log('');
});