# WebAR — La cumbre de las brujas

Prototipo web para reconocer la portada del libro sin QR y reproducir el video vertical de YouTube trackeado sobre la tapa.

## Qué incluye hoy

- reconocimiento de la portada desde cámara;
- modo demo sin cámara;
- interfaz visual inspirada en la portada;
- capa aumentada que sigue el movimiento y la perspectiva del libro;
- video de YouTube `oMnK9Viihg8` ya integrado;
- reproducción silenciada al reconocer la portada;
- botón **Activar sonido**;
- el reproductor permanece cargado durante pérdidas breves del seguimiento.

## Cómo probarlo localmente

1. Abrí una terminal dentro de esta carpeta.
2. Ejecutá:

```bash
python3 -m http.server 8080
```

3. Entrá a `http://localhost:8080`.
4. Si querés simular sin cámara, usá `http://localhost:8080/?demo=1`.

## Cómo subirlo a GitHub Pages

Subí el contenido de esta carpeta a la raíz del repositorio y activá:

- **Settings → Pages**
- **Deploy from a branch**
- **main / root**

Después probalo desde el celular en HTTPS.

## Cambiar el video de YouTube

En `app.js`, buscá:

```js
youtubeVideoId: 'oMnK9Viihg8'
```

Y reemplazalo por el ID del video no listado. Ejemplo, si tu URL es:

```text
https://www.youtube.com/watch?v=ABC123XYZ
```

Entonces el ID es:

```text
ABC123XYZ
```

El reproductor se prepara al iniciar la experiencia y comienza a reproducirse cuando detecta la portada. Esto evita que los pequeños saltos normales del seguimiento cancelen continuamente la carga de YouTube.

## Laboratorio de dioramas interiores

La ruta `diorama.html` incorpora la primera arquitectura para ilustraciones interiores:

- módulo de escenas Three.js cargado bajo demanda;
- escena 2.5D de seis mujeres tomadas de las manos alrededor de una fogata;
- cuatro planos transparentes para paralaje, llama, resplandor y figuras;
- página real escaneada como piso en el laboratorio;
- plano transparente que recibe sombras cuando se usa la cámara;
- máscara oscura exterior para aislar visualmente el libro;
- aparición tipo libro pop-up;
- humo, fuego y brasas animados;
- movimiento táctil limitado a un arco seguro para la ilusión 2.5D;
- perfiles 3D completo, 3D liviano y fallback 2.5D;
- adaptador MindAR preparado para `assets/targets/interiores.mind`;
- liberación de geometrías, materiales y texturas al cerrar una escena.

Prueba directa sin cámara:

```text
diorama.html?scene=women-circle-25d&quality=high
```

Para activar el escaneo de la página hay que compilar
`assets/diorama/women-circle-25d/book-page-reference-v1.jpg` con el compilador
de imágenes de MindAR y guardar el resultado como
`assets/targets/interiores.mind`.

La lista de materiales pendientes está en `docs/asset-checklist.md`.

## Nota práctica

Para una versión final más controlada, seguramente convendrá comparar:

- **YouTube no listado**: rápido y cómodo para prototipar.
- **MP4 propio**: más limpio visualmente y con mayor control de reproducción.
