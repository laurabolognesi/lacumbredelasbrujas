# Prueba local de seis páginas — 5 de septiembre de 2026

La pantalla de inicio se conserva. El detector JSFeat/ORB busca los seis targets; una vez reconocido uno, prioriza su seguimiento. Exige dos reconocimientos antes de cambiar de contenido. El plano usa la perspectiva de la página completa.

| Target | Archivo en assets/targets | Contenido |
| --- | --- | --- |
| portada | portada.png | Vimeo 1223490602 |
| coro | coro.jpg | Vimeo 1223490223 |
| foto | foto.jpg | Vimeo 1223489715 |
| diario | diario.jpg | Vimeo 1223488404 |
| post | post.jpg | Botón a https://www.instagram.com/sofiariveraperiodista/ |
| epilogo | epilogo.jpg | Vimeo 1223479370 |

Para probar sin cámara: `/?demo=1&target=post` (reemplazar post por el target de la tabla). La imagen simulada pasa por el detector real: no se fuerza el resultado. Esta prueba no demuestra rendimiento ni seguimiento con cámara física.

Solo se monta un reproductor. Al perder la página se retira el contenido; al cambiar de target o cerrar se destruye el reproductor anterior. Vimeo comienza silenciado, con botón para activar sonido. El botón de Instagram requiere un toque y abre otra pestaña; nunca redirige automáticamente.

Comprobaciones pendientes antes de publicar como experiencia terminada:

- Probar cada página impresa en Android y iPhone con buena luz, luego con inclinación y luz baja.
- Alternar páginas sin cerrar la cámara; verificar que no se superponen audios.
- Retirar el libro: el contenido debe desaparecer y el audio detenerse.
- Probar sonido, cierre, reapertura y rotación del celular.
- Verificar permisos de inserción de Vimeo en el dominio público definitivo.
- La marca de Vimeo sigue visible en la prueba de portada: no se promete reproducción sin marca.
- Revisar encuadre: actualmente el video ocupa la página completa, no un recorte de la ilustración.
- Publicación en GitHub y verificación HTTPS pendientes.

Integración Vimeo basada en https://github.com/vimeo/player.js.
