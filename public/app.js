const postText = document.getElementById('postText');
const counter = document.getElementById('counter');
const publishButton = document.getElementById('publishButton');
const status = document.getElementById('status');

postText.addEventListener('input', () => {

    counter.textContent = postText.value.length;

});

publishButton.addEventListener('click', async () => {

    const text = postText.value.trim();

    if (!text) {

        status.textContent = 'Escribe una publicación primero.';
        return;

    }

    publishButton.disabled = true;
    publishButton.textContent = 'Publicando...';

    status.textContent = '';

    try {

        const response = await fetch('/api/publish', {

            method: 'POST',

            headers: {
                'Content-Type': 'application/json'
            },

            body: JSON.stringify({
                text
            })

        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error?.message ||
                data.error ||
                'Error al publicar'
            );
        }

        status.textContent =
            '✅ ¡Publicación realizada correctamente!';

        postText.value = '';
        counter.textContent = '0';

    } catch (error) {

        console.error(error);

        status.textContent =
            '❌ Error: ' + error.message;

    } finally {

        publishButton.disabled = false;
        publishButton.textContent =
            'Publicar en Threads';

    }

});