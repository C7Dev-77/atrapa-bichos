# Atrapa Bichos — Developer Guidelines

> **Proyecto:** Atrapa Bichos
> **Autor:** [C7Dev_](https://github.com/C7Dev-77)
> **Stack:** React 19 + TypeScript + TanStack Start + Tailwind CSS + HTML5 Canvas + Vercel Postgres

### Guía para Agentes y Desarrolladores

- **Arquitectura de Juego**: Toda la lógica y renderizado de bichos, temas y efectos visuales de Canvas se ubica en `src/components/AntGame.tsx`.
- **Rutas y Servidor**: Las funciones del servidor para récords (`fetchGlobalScores`, `submitScore`) están en `src/server/leaderboard.ts` y utilizan `@tanstack/react-start` server functions.
- **Base de Datos**: El cliente PostgreSQL en `src/lib/db.ts` utiliza `@vercel/postgres` con degradación elegante si no hay credenciales configuradas en local.
- **Estilos**: Tailwind CSS con componentes Radix UI accesibles y tokens en `src/styles.css`.
- **Despliegue**: Compatible con Vercel a través de `vercel.json` con preset Nitro.
