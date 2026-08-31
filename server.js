require('dotenv').config();

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const THREADS_API = 'https://graph.threads.net/v1.0';

app.post('/api/publish', async (req, res) => {

    try {

        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                success: false,
                error: 'El texto está vacío'
            });
        }

        // 1. Crear contenedor
        const createResponse = await fetch(
            `${THREADS_API}/${process.env.THREADS_USER_ID}/threads`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    media_type: 'TEXT',
                    text: text.trim(),
                    access_token: process.env.THREADS_ACCESS_TOKEN
                })
            }
        );

        const createData = await createResponse.json();

        if (!createResponse.ok) {
            console.error(createData);

            return res.status(500).json({
                success: false,
                error: createData
            });
        }

        const creationId = createData.id;

        // 2. Publicar
        const publishResponse = await fetch(
            `${THREADS_API}/${process.env.THREADS_USER_ID}/threads_publish`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    creation_id: creationId,
                    access_token: process.env.THREADS_ACCESS_TOKEN
                })
            }
        );

        const publishData = await publishResponse.json();

        if (!publishResponse.ok) {
            console.error(publishData);

            return res.status(500).json({
                success: false,
                error: publishData
            });
        }

        res.json({
            success: true,
            creation_id: creationId,
            post_id: publishData.id
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Threads AI Publisher funcionando en http://localhost:${PORT}`);
});