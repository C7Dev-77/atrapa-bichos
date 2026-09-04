# Plan: Actualización de "Atrapa Bichos"

Convertir el juego actual en una versión mucho más rica, con sonido, niveles, bichos especiales, misiones, logros, partículas, fondos temáticos y tabla de récords local.

## Lo que se va a construir

### 1. Sonidos y música (Web Audio API, sin archivos)
- `src/lib/sound.ts`: motor de audio sintetizado (osciladores) — sin archivos externos ni costes.
- Efectos: pop al atrapar (tono según combo), fallo, power-up, cuenta atrás, fin de partida, aplauso al batir récord.
- Música de fondo: bucle alegre generado con Web Audio, con botón 🔊/🔇 en el HUD.
- Preferencia de silencio guardada en localStorage.

### 2. Niveles y jefes
- Estructura por niveles: cada 20 segundos (o por puntos) se sube de nivel con aviso animado ("¡Nivel 2!").
- Cada nivel aumenta velocidad y cantidad de bichos.
- En niveles 3, 6, 9... aparece un **bicho jefe** grande con "vidas" (3 toques para atraparlo) que da +25 puntos.
- La puntuación final muestra el nivel alcanzado.

### 3. Bichos especiales
- 🌟 Bicho dorado: raro, vale +10 puntos.
- 💣 Bomba: quita 5 puntos y rompe el combo (¡hay que esquivarla!).
- Mantener los bichos normales (1–3 puntos) y los power-ups existentes.

### 4. Misiones y logros
- Misión diaria (ej. "Atrapa 30 bichos hoy") con progreso visible, guardada en localStorage por fecha.
- Logros desbloqueables: primer combo x5, 100 puntos, atrapar un jefe, etc., con notificación animada "🏆 ¡Logro desbloqueado!".
- Panel de logros accesible desde el menú.

### 5. Animaciones y partículas
- Explosión de partículas de colores al atrapar cada bicho.
- Confeti en pantalla al batir el récord o completar la misión diaria.
- Transiciones suaves entre menú / juego / fin.

### 6. Fondos temáticos
- 3 temas que rotan por nivel o al gusto: 🌿 Prado (actual), 🏖️ Playa, 🌙 Noche con luciérnagas.
- Fondo dibujado en canvas (cielo degradado, decoraciones simples) sin imágenes pesadas.

### 7. Tabla de récords local
- Top 10 puntuaciones con nombre (3 letras, estilo arcade) guardadas en localStorage.
- Se muestra al final de la partida y desde el menú.

## Detalles técnicos
- Todo sigue siendo frontend puro: canvas + React + localStorage. No requiere base de datos.
- Audio: `AudioContext` creado tras el primer toque (requisito de los navegadores), con función `playTone(frecuencia, duración, tipo)` para cada efecto y un secuenciador simple para la música.
- `AntGame.tsx` se amplía con tipos de bicho (`normal | dorado | bomba | jefe`), sistema de partículas, dibujo de fondos temáticos y eventos hacia `index.tsx` (nivel, logro, misión).
- `index.tsx` gana: pantalla de logros, tabla de récords, indicador de nivel, misión diaria y botón de sonido.
- Verificación: typecheck con `tsc` y prueba del flujo completo con Playwright (jugar, pausar, subir de nivel, fin de partida, récords).
