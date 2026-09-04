# 🐜 Atrapa Bichos — Videojuego Infantil Web Interactivo

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TanStack](https://img.shields.io/badge/TanStack_Start-FF4154?style=flat-square&logo=react-query&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

> **Desarrollado con dedicación por [C7Dev_](https://github.com/C7Dev-77)** 🎮✨

---

## 📖 Descripción del Proyecto

**Atrapa Bichos** es un videojuego web arcade intuitivo y estimulante diseñado especialmente para niños. El juego combina reflejos rápidos, coordinación ojo-mano y diversión sin frustración, retando al jugador a atrapar diferentes tipos de insectos interactivos antes de que termine el tiempo, mientras esquiva bombas y persigue al gran jefe insecto.

Cuenta con un sistema completo de **Leaderboard Global en tiempo real** respaldado por bases de datos PostgreSQL serverless y almacenamiento local sin necesidad de registros engorrosos ni recopilación de datos privados (completamente seguro para menores).

---

## 🌟 Características Principales

### 🌿 5 Biomas Dinámicos con Efectos Ambientales
- **Prado Soleado**: Césped vibrante, briznas de hierba mecidas por el viento y flores silvestres.
- **Playa Tropical**: Arena suave y oleaje espumoso continuo.
- **Noche Mágica**: Cielo estrellado con luciérnagas flotantes iluminando el escenario.
- **Ártico Polar**: Suelo helado, copos de nieve cayendo y una aurora boreal con gradiente animado.
- **Cráter Volcánico**: Roca ígnea agrietada con ríos de lava brillante y partículas de brasas flotantes.

### 🐞 6 Tipos de Bichos con Mecánicas y Comportamientos Únicos
1. 🐜 **Hormiga Obrera**: Movimiento lineal estándar, ideal para practicar puntería.
2. 🐞 **Mariquita Traviesa**: Rápida, pequeña y ágil; requiere toques precisos.
3. 🦋 **Mariposa Espectral**: Vuelo oscilante en zigzag con alas dinámicas renderizadas en Canvas.
4. 🐝 **Abeja Zumbadora**: Vuelo circular en espiral con aguijón animado y velocidad angular variable.
5. 🕷️ **Araña Saltarina**: Camina despacio, se detiene al acecho y realiza sprints repentinos.
6. 🪲 **Escarabajo Blindado (Raro)**: Grande, pesado y escurridizo; otorga triple puntuación al ser capturado.
7. 👑 **Jefe Insecto**: Aparece al final de los niveles clave; requiere múltiples impactos y otorga grandes bonificaciones.
8. 💣 **Bomba Sorpresa**: Penaliza 5 segundos de tiempo y reinicia el multiplicador de combos al tocarse por error.

### 🏆 Progresión y Competitividad
- **Multiplicador de Combos**: Concatena capturas exitosas seguidas para multiplicar tu puntuación hasta x5.
- **Misiones Diarias**: Objetivos diarios aleatorios que recompensan la constancia de juego.
- **Sistema de Logros**: Medallas desbloqueables (cazador de mariposas, maestro del combo, héroe del tiempo).
- **Marcador Local y Global**:
  - Pestaña **Local**: Los 10 mejores puntajes guardados en el navegador.
  - Pestaña **Global**: Clasificación mundial en vivo conectada con base de datos PostgreSQL en la nube mediante UUID de dispositivo anónimo.
- **Audio Sintetizado**: Motor de sonido nativo (Web Audio API) con música melódica relajante y efectos especiales de alta fidelidad sin tiempos de carga.

---

## 🛠️ Stack Tecnológico

| Componente | Tecnología |
| :--- | :--- |
| **Framework Fullstack** | [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) |
| **UI & Lenguaje** | [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/) |
| **Gráficos & Render** | HTML5 Canvas API (renderizado a 60 FPS con partículas dinámicas) |
| **Estilos & Componentes**| [Tailwind CSS v4](https://tailwindcss.com/), Radix UI Primitives, Lucide Icons |
| **Persistencia & DB** | PostgreSQL Serverless ([@vercel/postgres](https://vercel.com/docs/storage/vercel-postgres) / Neon) + LocalStorage |
| **Infraestructura** | [Vercel](https://vercel.com) (Edge & Serverless Functions con preset Nitro) |

---

## 🚀 Instalación y Desarrollo Local

### Prerrequisitos
- Node.js 18+ o superior
- npm, pnpm o bun

### Pasos:

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/C7Dev-77/atrapa-bichos.git
   cd atrapa-bichos
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Variables de entorno (Opcional para DB local):**
   Crea un archivo `.env` tomando como base `.env.example`:
   ```env
   POSTGRES_URL="postgres://..."
   POSTGRES_URL_NON_POOLING="postgres://..."
   ```
   *(Si no se define la variable de base de datos, el juego funciona perfectamente en modo Local degradándose de forma segura).*

4. **Iniciar servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador para jugar.

5. **Compilar para producción:**
   ```bash
   npm run build
   ```

---

## ☁️ Despliegue en Vercel

1. Haz un fork o importa este repositorio en [Vercel](https://vercel.com).
2. En la pestaña **Storage** de Vercel, crea una base de datos **Postgres (Neon)** y vincúlala al proyecto (se inyectará `POSTGRES_URL` automáticamente).
3. Haz clic en **Deploy**. ¡El despliegue creará la estructura de base de datos de manera automática en la primera solicitud!

---

## 👤 Autor

**Desarrollado por C7Dev_**
- GitHub: [@C7Dev-77](https://github.com/C7Dev-77)
- Proyecto: [Atrapa Bichos](https://github.com/C7Dev-77/atrapa-bichos)

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Siéntete libre de utilizarlo, aprender y compartir.
